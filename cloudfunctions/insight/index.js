/**
 * cloudfunctions/insight/index.js — 历法文化解读云函数
 *
 * 铁律：
 *   1) 只解释已给出的结构化事实，不重排盘、不补算、不改四柱。
 *   2) 前端零密钥 —— 模型凭据由云开发环境托管。
 *   3) Guard 失败 → 带修复提示重试恰好 1 次 → 仍失败返回 fallback:true。
 *   4) AI 失败绝不抛给主链路。
 *
 * 数据流：ArchiveInput → ArchiveDocument → AIInsight（不跳 doc）。
 */
'use strict';

const tcb = require('@cloudbase/node-sdk');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 云函数侧调用大模型的正确入口：@cloudbase/node-sdk 的 ai.createModel(GroupName)
// GroupName 只有三种合法值：'cloudbase' | 'hunyuan-exp' | 'custom-<name>'
// 具体模型 id 放在 generateText 的 model 字段里。
const tcbApp = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 注意：ai 是方法app.ai()，不是属性
const ai = tcbApp.ai();

const OUTPUT_VERSION = 'insight-1.0';
const PROMPT_VER = 'insight-prompt-v1';
// GroupName：主托管分组（多模型池，TokenHub 支撑）
const MODEL_GROUP = 'cloudbase';
// 模型 id：须为 DescribeManagedAIModelList 返回的精确 id（区分大小写，勿凭印象写）
// 可选：deepseek-v4-flash / deepseek-v4-pro / hunyuan-t1-* / qwen3.5-* / glm-5.3-*
const MODEL = process.env.INSIGHT_MODEL || 'deepseek-v4-flash';

// 与客户端 insight.js 保持同一份口径（禁预测）
const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦',
  '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运',
  '合婚', '择日', '看日子', '八字算',
  '旺衰', '喜用', '用神', '忌神',
  '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];

const SYSTEM_PROMPT = [
  '你是中国传统历法文化的研究者与科普作者。你的唯一任务是把「已经计算好的客观历法事实」翻译成通俗易懂的文化背景说明。',
  '',
  '硬性约束（每一条都不可违反）：',
  '1. 只解释输入中已给出的事实，不得补算、不得改动四柱干支或节气数值。',
  '2. 只输出文化与历法知识。禁止任何预测、吉凶、运势、宜忌、行为建议。',
  '3. 禁止把五行的字面出现次数说成强弱、旺衰或吉凶。',
  '4. 禁止出现以下词语：' + BANNED_WORDS.join('、'),
  '5. 事实不足时输出「无法判定」，不得补全，也不得替用户选择流派。',
  '6. 禁止医疗、投资、法律、婚恋决策类结论。',
  '7. 每条 content 不超过 120 字，语气平实，避免宿命论措辞。',
  '',
  '输出严格的 JSON，不要任何多余文字或 markdown 代码块标记：',
  '{',
  '  "sections": [',
  '    { "id": "s1", "title": "小节标题", "contentType": "FACT", "content": "正文", "evidenceIds": ["e_term"] }',
  '  ],',
  '  "limitations": ["不含预测与判定"]',
  '}',
  '',
  'contentType 只能是 FACT 或 CULTURAL_CONTEXT。',
].join('\n');

function jsonReply(ok, payload) {
  return Object.assign({ ok: ok }, payload);
}

/** 从模型回复中稳健提取 JSON（容忍代码块包裹与前后缀）。 */
function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

/** Output Guard：机检部分 */
function guard(insight, facts) {
  const errors = [];
  if (!insight || typeof insight !== 'object') return ['not_object'];
  if (!Array.isArray(insight.sections) || !insight.sections.length) errors.push('sections_empty');
  if (!Array.isArray(insight.limitations) || !insight.limitations.length) errors.push('limitations_empty');

  const flat = (insight.sections || [])
    .map((s) => (s.title || '') + ' ' + (s.content || ''))
    .join(' ');
  BANNED_WORDS.forEach((w) => {
    if (flat.indexOf(w) >= 0) errors.push('banned:' + w);
  });
  if (flat.indexOf('旺') >= 0 || flat.indexOf('衰') >= 0) errors.push('wangshuai');

  (insight.sections || []).forEach((s) => {
    if (s.contentType !== 'FACT' && s.contentType !== 'CULTURAL_CONTEXT') {
      errors.push('contentType:' + s.contentType);
    }
    if (!s.content || String(s.content).length > 400) errors.push('content_too_long');
  });

  // 不得发明干支：出现的干支必须能在入参事实里找到
  const known = JSON.stringify(facts || {});
  const ganzhiRe = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;
  let m;
  while ((m = ganzhiRe.exec(flat)) !== null) {
    if (known.indexOf(m[0]) < 0) errors.push('invented_ganzhi:' + m[0]);
  }
  return Array.from(new Set(errors));
}

function buildMessages(facts, repairHint) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        '以下是已经由确定性历法引擎算好的客观事实（JSON）。请只基于这些事实做文化科普解释。\n' +
        JSON.stringify(facts, null, 2) +
        (repairHint
          ? '\n\n[上一轮输出未通过校验：' + repairHint + '。请修正后重新输出严格 JSON，不要任何额外文字。]'
          : '\n\n请输出 2-4 个小节的严格 JSON。'),
    },
  ];
}

/**
 * 调用云开发内置大模型。
 * 正确姿势：createModel(GroupName) → generateText({ model: <模型id>, messages })
 * 凭据由云环境托管，前端零密钥。
 * 前置条件（缺一即失败）：
 *   ① 环境套餐为标准版及以上（个人版不支持 AI）
 *   ② DescribeAIModels 中该模型 Status=1（已启用）
 *   ③ 已有 Token Credits 资源包
 * 失败时抛错，交由失败阶梯处理（重试 1 次 → fallback）。
 */
async function callModel(facts, repairHint) {
  const model = ai.createModel(MODEL_GROUP);
  const res = await model.generateText({
    model: MODEL,
    messages: buildMessages(facts, repairHint),
    temperature: 0.3,
    maxTokens: 1200,
  });
  // generateText 返回原始响应，文本在 content
  const text = (res && res.content) || '';
  return extractJson(text);
}

exports.main = async (event) => {
  const action = event && event.action;
  const docHash = event && event.docHash;
  const schemaVersion = event && event.schemaVersion;
  const promptVer = event && event.promptVer;
  const facts = event && event.facts;

  if (action !== 'interpret') return jsonReply(false, { reason: 'bad_action' });
  if (!docHash || !schemaVersion || !facts) return jsonReply(false, { reason: 'missing_doc_fields' });

  let hint = null;
  let lastError = 'unknown';
  // 失败阶梯第1 级：带修复提示重试恰好 1 次
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let parsed = null;
    try {
      parsed = await callModel(facts, hint);
    } catch (e) {
      parsed = null;
      // 记录真实原因（模型未开通 / 额度不足 / 超时等），便于控制台与客户端定位
      lastError = String((e && (e.message || e.errMsg)) || e || 'model_call_failed');
      console.error('[insight] 模型调用失败：', lastError);
      hint = 'model_call_failed';
    }
    const errors = guard(parsed, facts);
    if (!errors.length && parsed) {
      const usedEvidenceIds = (parsed.sections || []).map((s) => s.evidenceIds || [])
        .reduce((a, b) => a.concat(b), []);
      return jsonReply(true, {
        insight: {
          outputVersion: OUTPUT_VERSION,
          docHash: docHash,
          model: MODEL,
          promptVer: promptVer || PROMPT_VER,
          sections: parsed.sections,
          limitations: parsed.limitations,
          usedEvidenceIds: usedEvidenceIds,
          fallback: false,
        },
      });
    }
    if (attempt === 0) hint = errors.join(',');
  }

  // 第 2 级：降级，交回客户端本地规则文本
  // 说明：sections 为空 → 客户端会用本地规则模板填充，并展示此reason 便于排查
  return jsonReply(true, {
    insight: {
      outputVersion: OUTPUT_VERSION,
      docHash: docHash,
      model: MODEL,
      promptVer: promptVer || PROMPT_VER,
      sections: [],
      limitations: ['不含预测与判定'],
      fallback: true,
      reason: lastError,
    },
  });
};