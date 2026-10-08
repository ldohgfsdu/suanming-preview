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
const PROMPT_VER = 'insight-prompt-v2';
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
  '排盘', '预测',
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
  '7. 禁止写性格、事业、财运、婚姻、健康之类的个人断言；只谈历法与文化。',
  '8. 输出 4-6 个小节：第 1 节固定标题「总论」，先用两三句话说明这份档案由哪几套计时系统叠成；其余小节按 节气坐标 / 农历日期 / 四柱干支 / 十二时辰 / 五行字面分布 / 太阳时间 逐项展开，只挑输入里有事实的小节写。',
  '9. 每节 content 150-300 字，分两段，段间用 \\n\\n 换行：第一段是结论式陈述（把输入里的数值原样写进去），第二段说明它出自哪套历法体系、在传统文化里承担什么角色。单节不超过 400 字。',
  '10. 语气平实，避免宿命论措辞。',
  '',
  '输出严格的 JSON，不要任何多余文字或 markdown 代码块标记：',
  '{',
  '  "sections": [',
  '    { "id": "s0", "title": "总论", "contentType": "CULTURAL_CONTEXT", "content": "第一段\\n\\n第二段", "evidenceIds": ["e_pillars", "e_term"] },',
  '    { "id": "s1", "title": "节气坐标", "contentType": "FACT", "content": "第一段\\n\\n第二段", "evidenceIds": ["e_term"] }',
  '  ],',
  '  "limitations": ["不作判定与推断"]',
  '}',
  '',
  'contentType 只能是 FACT 或 CULTURAL_CONTEXT。',
  'evidenceIds 只能取：e_term、e_lunar、e_pillars、e_wuxing、e_solar。',
].join('\n');

function jsonReply(ok, payload) {
  return Object.assign({ ok: ok }, payload);
}

// ---------------- 入参事实校验（服务端不信任客户端） ----------------
//
// 背景：facts 由客户端构建后上行。若服务端照单全收，客户端可伪造事实喂给模型，
// Guard 的「不得发明干支」就退化成「只对自己声称的事实负责」。
// 本校验把入参约束在 P0 六类事实的合法取值域内，非法即拒绝（不进入模型）。
//
// 说明：彻底方案是服务端重算事实，但事实层（miniprogram/lib）为 ESM 且面向小程序环境，
// 云函数（CommonJS / Node16）无法直接复用，故此处为**结构 + 取值域**校验，是可落地的务实上限。

const GANS = '甲乙丙丁戊己庚辛壬癸';
const ZHIS = '子丑寅卯辰巳午未申酉戌亥';
const WUXING = ['木', '火', '土', '金', '水'];
const PILLAR_LABELS = ['年', '月', '日', '时'];
const FACTS_MAX_CHARS = 8000; // 防止超大 payload

function validateFacts(facts) {
  const errors = [];
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return ['facts_not_object'];

  if (JSON.stringify(facts).length > FACTS_MAX_CHARS) errors.push('facts_too_large');

  // 1) 四柱：柱名/五行名/干支取值域
  if (!Array.isArray(facts.pillars) || facts.pillars.length < 1 || facts.pillars.length > 4) {
    errors.push('pillars_shape');
  } else {
    facts.pillars.forEach((p, i) => {
      if (!p || typeof p !== 'object') { errors.push('pillar_' + i + '_not_object'); return; }
      if (p.label != null && PILLAR_LABELS.indexOf(p.label) < 0) errors.push('pillar_label:' + p.label);
      if (p.element != null && WUXING.indexOf(p.element) < 0) errors.push('pillar_element:' + p.element);
      if (p.gan_zhi != null) {
        if (typeof p.gan_zhi !== 'string' || p.gan_zhi.length !== 2) {
          errors.push('ganzhi_shape:' + p.gan_zhi);
        } else if (GANS.indexOf(p.gan_zhi[0]) < 0 || ZHIS.indexOf(p.gan_zhi[1]) < 0) {
          errors.push('ganzhi_invalid:' + p.gan_zhi);
        }
      }
    });
  }

  // 2) 五行字面计数：名称白名单 + 非负整数
  if (!Array.isArray(facts.wuxing)) {
    errors.push('wuxing_not_array');
  } else {
    facts.wuxing.forEach((t, i) => {
      if (!t || typeof t !== 'object') { errors.push('wuxing_' + i + '_not_object'); return; }
      if (WUXING.indexOf(t.name) < 0) errors.push('wuxing_name:' + t.name);
      if (typeof t.literal_count !== 'number'
        || !Number.isInteger(t.literal_count)
        || t.literal_count < 0) errors.push('wuxing_count:' + t.literal_count);
    });
  }

  // 3) 其余字段形态（允许为 null，但类型必须正确）
  if (facts.solarTerm != null && typeof facts.solarTerm !== 'object') errors.push('solarTerm_shape');
  if (facts.lunar != null && typeof facts.lunar !== 'string') errors.push('lunar_shape');
  if (facts.solarTime != null) {
    if (typeof facts.solarTime !== 'object') {
      errors.push('solarTime_shape');
    } else if (typeof facts.solarTime.day_changed !== 'boolean') {
      errors.push('day_changed_shape');
    }
  }

  return Array.from(new Set(errors));
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
          : '\n\n请输出 4-6 个小节的严格 JSON，第 1 节标题为「总论」。'),
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
    maxTokens: 1800,
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

  // 入参事实校验：非法事实一律拒绝，不进入模型（防客户端伪造）
  const factErrors = validateFacts(facts);
  if (factErrors.length) {
    console.error('[insight] facts 校验未通过：', factErrors.join(','));
    return jsonReply(false, { reason: 'invalid_facts:' + factErrors.join(',') });
  }

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
      limitations: ['不作判定与推断'],
      fallback: true,
      reason: lastError,
    },
  });
};