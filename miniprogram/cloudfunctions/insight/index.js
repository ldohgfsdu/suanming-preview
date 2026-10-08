/**
 * cloudfunctions/insight/index.js — 历法文化解读云函数
 *
 * 安全边界：
 *   1) 只接受微信小程序上下文（必须取得 OPENID）。
 *   2) 服务端严格校验 facts；客户端缓存键不作为 docHash 信任。
 *   3) 服务端对规范化 facts 计算 SHA-256 文档指纹，并以 docHash+prompt+model 做缓存键。
 *   4) 每个 OPENID 做分钟/日级配额；单实例缓存仅作为第一层费用保护。
 *   5) Guard 失败带修复提示重试恰好 1 次，仍失败返回 fallback:true。
 *   6) AI 失败绝不阻断确定性历法主链路。
 */
'use strict';

const crypto = require('node:crypto');
const tcb = require('@cloudbase/node-sdk');
const cloud = require('wx-server-sdk');
const { extractJson, redactProviderError, runModelAttempts } = require('./model-policy');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const tcbApp = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const ai = tcbApp.ai();

const OUTPUT_VERSION = 'insight-1.1';
const PROMPT_VER = 'insight-prompt-v3';
const SCHEMA_VERSION = 'archive-document-v1';
const MODEL_GROUP = 'cloudbase';
const MODEL = process.env.INSIGHT_MODEL || 'deepseek-v4-flash';

const FACTS_MAX_CHARS = 8000;
const RATE_MINUTE_MAX = Number(process.env.INSIGHT_RATE_MINUTE_MAX || 6);
const RATE_DAY_MAX = Number(process.env.INSIGHT_RATE_DAY_MAX || 40);
// 用户请求配额与「真实模型调用」配额分开记：重试一次会让 1 次用户请求产生 2 次模型调用，
// 只按用户请求计数会低估成本与限流压力。
const MODEL_RATE_MINUTE_MAX = Number(process.env.INSIGHT_MODEL_RATE_MINUTE_MAX || 8);
const MODEL_RATE_DAY_MAX = Number(process.env.INSIGHT_MODEL_RATE_DAY_MAX || 60);
const CACHE_TTL_MS = Number(process.env.INSIGHT_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const CACHE_MAX = Number(process.env.INSIGHT_CACHE_MAX || 128);

// 说明：云函数可横向扩容，以下 Map 是“单实例第一层”保护，不把它伪装成全局限流。
// 对公开大流量环境应再接 CloudBase 数据库/网关全局配额；比赛演示环境先 fail-closed OPENID + 单实例限流。
const RATE = new Map();
const CACHE = new Map();

const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦',
  '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运',
  '合婚', '择日', '看日子', '八字算',
  '排盘', '预测',
  '旺衰', '喜用', '用神', '忌神',
  '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];
const EVIDENCE_IDS = new Set(['e_term', 'e_lunar', 'e_pillars', 'e_wuxing', 'e_solar']);

const SYSTEM_PROMPT = [
  '你是中国传统历法文化的研究者与科普作者。你的唯一任务是把「已经计算好的客观历法事实」翻译成通俗易懂的文化背景说明。',
  '',
  '硬性约束（每一条都不可违反）：',
  '1. 只解释输入中已给出的事实，不得补算、不得改动四柱干支、节气、农历、五行计数或太阳时间数值。',
  '2. 只输出文化与历法知识。禁止任何未来推断、结果判定、宜忌或行为建议。',
  '3. 禁止把五行的字面出现次数说成强弱或个人结论。',
  '4. 禁止出现以下词语：' + BANNED_WORDS.join('、'),
  '5. 事实不足时输出「无法判定」，不得补全，也不得替用户选择流派。',
  '6. 禁止医疗、投资、法律、婚恋决策类结论。',
  '7. 禁止写性格、事业、财运、婚姻、健康之类的个人断言；只谈历法与文化。',
  '8. 输出 4-6 个小节：第 1 节固定标题「总论」；其余按 节气坐标 / 农历日期 / 四柱干支 / 十二时辰与地支 / 五行字面分布 / 太阳时间与钟表时间 选择输入里有事实的内容。',
  '9. 每节 content 120-320 字，分两段，段间用 \\n\\n；FACT 小节中凡引用输入事实，必须逐字保留输入里的值。单节不超过 400 字。',
  '10. evidenceIds 只能引用与该节事实直接对应的证据 ID。',
  '11. 语气平实，避免宿命论措辞。',
  '',
  '输出严格 JSON，不要 markdown：',
  '{',
  '  "sections": [',
  '    { "id": "s0", "title": "总论", "contentType": "CULTURAL_CONTEXT", "content": "第一段\\n\\n第二段", "evidenceIds": ["e_pillars", "e_term"] },',
  '    { "id": "s1", "title": "节气坐标", "contentType": "FACT", "content": "第一段\\n\\n第二段", "evidenceIds": ["e_term"] }',
  '  ],',
  '  "limitations": ["仅说明客观历法事实与文化背景"]',
  '}',
  '',
  'contentType 只能是 FACT 或 CULTURAL_CONTEXT。',
  'evidenceIds 只能取：e_term、e_lunar、e_pillars、e_wuxing、e_solar。',
].join('\n');

function jsonReply(ok, payload) {
  return Object.assign({ ok }, payload);
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function rejectUnknownKeys(obj, allowed, prefix, errors) {
  if (!isPlainObject(obj)) return;
  Object.keys(obj).forEach((k) => {
    if (!allowed.includes(k)) errors.push(`${prefix}_unknown_key:${k}`);
  });
}

const GANS = '甲乙丙丁戊己庚辛壬癸';
const ZHIS = '子丑寅卯辰巳午未申酉戌亥';
const WUXING = ['木', '火', '土', '金', '水'];
const PILLAR_LABELS = ['年', '月', '日', '时'];

function validateFacts(facts) {
  const errors = [];
  if (!isPlainObject(facts)) return ['facts_not_object'];
  if (JSON.stringify(facts).length > FACTS_MAX_CHARS) errors.push('facts_too_large');
  rejectUnknownKeys(facts, ['pillars', 'solarTerm', 'solarTime', 'lunar', 'wuxing'], 'facts', errors);

  if (!Array.isArray(facts.pillars) || facts.pillars.length < 1 || facts.pillars.length > 4) {
    errors.push('pillars_shape');
  } else {
    const labels = new Set();
    facts.pillars.forEach((p, i) => {
      if (!isPlainObject(p)) { errors.push('pillar_' + i + '_not_object'); return; }
      rejectUnknownKeys(p, ['label', 'gan_zhi', 'element'], `pillar_${i}`, errors);
      if (p.label != null && !PILLAR_LABELS.includes(p.label)) errors.push('pillar_label:' + p.label);
      if (p.label != null) {
        if (labels.has(p.label)) errors.push('pillar_label_duplicate:' + p.label);
        labels.add(p.label);
      }
      if (p.element != null && !WUXING.includes(p.element)) errors.push('pillar_element:' + p.element);
      if (p.gan_zhi != null) {
        if (typeof p.gan_zhi !== 'string' || p.gan_zhi.length !== 2) {
          errors.push('ganzhi_shape:' + p.gan_zhi);
        } else if (!GANS.includes(p.gan_zhi[0]) || !ZHIS.includes(p.gan_zhi[1])) {
          errors.push('ganzhi_invalid:' + p.gan_zhi);
        }
      }
    });
  }

  if (!Array.isArray(facts.wuxing) || facts.wuxing.length !== 5) {
    errors.push('wuxing_shape');
  } else {
    const names = new Set();
    facts.wuxing.forEach((t, i) => {
      if (!isPlainObject(t)) { errors.push('wuxing_' + i + '_not_object'); return; }
      rejectUnknownKeys(t, ['name', 'literal_count'], `wuxing_${i}`, errors);
      if (!WUXING.includes(t.name)) errors.push('wuxing_name:' + t.name);
      if (names.has(t.name)) errors.push('wuxing_name_duplicate:' + t.name);
      names.add(t.name);
      if (!Number.isInteger(t.literal_count) || t.literal_count < 0 || t.literal_count > 8) {
        errors.push('wuxing_count:' + t.literal_count);
      }
    });
  }

  if (!isPlainObject(facts.solarTerm)) {
    errors.push('solarTerm_shape');
  } else {
    rejectUnknownKeys(facts.solarTerm, ['prev', 'next'], 'solarTerm', errors);
    ['prev', 'next'].forEach((k) => {
      const v = facts.solarTerm[k];
      if (v != null && (typeof v !== 'string' || v.length > 80)) errors.push(`solarTerm_${k}`);
    });
  }

  if (facts.lunar != null && (typeof facts.lunar !== 'string' || facts.lunar.length > 80)) {
    errors.push('lunar_shape');
  }

  if (!isPlainObject(facts.solarTime)) {
    errors.push('solarTime_shape');
  } else {
    rejectUnknownKeys(facts.solarTime, ['corrected', 'day_changed'], 'solarTime', errors);
    if (facts.solarTime.corrected != null
      && (typeof facts.solarTime.corrected !== 'string' || facts.solarTime.corrected.length > 80)) {
      errors.push('solarTime_corrected');
    }
    if (typeof facts.solarTime.day_changed !== 'boolean') errors.push('day_changed_shape');
  }

  return Array.from(new Set(errors));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.keys(value).sort().forEach((k) => { out[k] = stable(value[k]); });
  return out;
}

function serverDocHash(schemaVersion, facts) {
  const canonical = JSON.stringify(stable({ schemaVersion, facts }));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function cacheKey(docHash) {
  return [docHash, PROMPT_VER, MODEL, OUTPUT_VERSION].join(':');
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit.value;
}

function cachePut(key, value) {
  CACHE.set(key, { ts: Date.now(), value });
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
}

function checkRate(openid) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const prev = RATE.get(openid) || { minuteStart: now, minuteCount: 0, day, dayCount: 0 };
  if (now - prev.minuteStart >= 60 * 1000) {
    prev.minuteStart = now;
    prev.minuteCount = 0;
  }
  if (prev.day !== day) {
    prev.day = day;
    prev.dayCount = 0;
  }
  if (prev.minuteCount >= RATE_MINUTE_MAX) return { ok: false, reason: 'rate_minute' };
  if (prev.dayCount >= RATE_DAY_MAX) return { ok: false, reason: 'rate_day' };
  prev.minuteCount += 1;
  prev.dayCount += 1;
  RATE.set(openid, prev);
  return { ok: true };
}

// 模型调用次数配额：与用户请求配额分开记，重试一次 = 2 次模型调用。
const MODEL_RATE = new Map();

function checkModelRate(openid) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const prev = MODEL_RATE.get(openid) || { minuteStart: now, minuteCount: 0, day, dayCount: 0 };
  if (now - prev.minuteStart >= 60 * 1000) {
    prev.minuteStart = now;
    prev.minuteCount = 0;
  }
  if (prev.day !== day) {
    prev.day = day;
    prev.dayCount = 0;
  }
  if (prev.minuteCount >= MODEL_RATE_MINUTE_MAX) return { ok: false, reason: 'model_rate_minute' };
  if (prev.dayCount >= MODEL_RATE_DAY_MAX) return { ok: false, reason: 'model_rate_day' };
  prev.minuteCount += 1;
  prev.dayCount += 1;
  MODEL_RATE.set(openid, prev);
  return { ok: true };
}

function requireKnownFacts(section, facts, errors) {
  const title = String(section.title || '');
  const content = String(section.content || '');
  if (title.includes('节气')) {
    ['prev', 'next'].forEach((k) => {
      const v = facts.solarTerm && facts.solarTerm[k];
      if (v && !content.includes(v)) errors.push(`fact_mismatch:term_${k}`);
    });
  }
  if (title.includes('农历') && facts.lunar && !content.includes(facts.lunar)) {
    errors.push('fact_mismatch:lunar');
  }
  if (title.includes('四柱')) {
    (facts.pillars || []).filter((p) => p && p.gan_zhi).forEach((p) => {
      if (!content.includes(p.gan_zhi)) errors.push('fact_mismatch:pillar_' + p.label);
    });
  }
  if (title.includes('五行')) {
    const anyPair = (facts.wuxing || []).some((t) => content.includes(t.name) && content.includes(String(t.literal_count)));
    if (!anyPair) errors.push('fact_mismatch:wuxing');
  }
  if (title.includes('太阳时间') && facts.solarTime && facts.solarTime.corrected
    && !content.includes(facts.solarTime.corrected)) {
    errors.push('fact_mismatch:solar');
  }
}

function guard(insight, facts) {
  const errors = [];
  if (!isPlainObject(insight)) return ['not_object'];
  if (!Array.isArray(insight.sections) || insight.sections.length < 1 || insight.sections.length > 6) {
    errors.push('sections_shape');
  }
  if (!Array.isArray(insight.limitations) || !insight.limitations.length) errors.push('limitations_empty');

  const flat = (insight.sections || []).map((s) => `${s.title || ''} ${s.content || ''}`).join(' ');
  BANNED_WORDS.forEach((w) => { if (flat.includes(w)) errors.push('banned:' + w); });
  if (flat.includes('旺') || flat.includes('衰')) errors.push('wangshuai');

  const ids = new Set();
  (insight.sections || []).forEach((s, i) => {
    if (!isPlainObject(s)) { errors.push(`section_${i}_shape`); return; }
    if (typeof s.id !== 'string' || !/^s[0-9]+$/.test(s.id) || ids.has(s.id)) errors.push('section_id:' + s.id);
    ids.add(s.id);
    if (s.contentType !== 'FACT' && s.contentType !== 'CULTURAL_CONTEXT') errors.push('contentType:' + s.contentType);
    if (typeof s.content !== 'string' || !s.content || s.content.length > 400) errors.push('content_length:' + i);
    if (!Array.isArray(s.evidenceIds) || !s.evidenceIds.length) {
      errors.push('evidence_empty:' + i);
    } else {
      s.evidenceIds.forEach((id) => {
        if (!EVIDENCE_IDS.has(id)) errors.push('evidence_invalid:' + id);
      });
    }
    if (s.contentType === 'FACT') requireKnownFacts(s, facts, errors);
  });

  const known = JSON.stringify(facts || {});
  const ganzhiRe = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;
  let m;
  while ((m = ganzhiRe.exec(flat)) !== null) {
    if (!known.includes(m[0])) errors.push('invented_ganzhi:' + m[0]);
  }
  return Array.from(new Set(errors));
}

function buildMessages(facts, repairHint) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        '以下是确定性历法引擎已经算好的客观事实（JSON）。只能基于这些事实做文化科普解释。\n' +
        JSON.stringify(facts, null, 2) +
        (repairHint
          ? '\n\n[上一轮未通过机器校验：' + repairHint + '。修正后重新输出严格 JSON，不要额外文字。]'
          : '\n\n输出 4-6 个小节的严格 JSON，第 1 节标题为「总论」。'),
    },
  ];
}

async function callModel(facts, repairHint) {
  const model = ai.createModel(MODEL_GROUP);
  const res = await model.generateText({
    model: MODEL,
    messages: buildMessages(facts, repairHint),
    temperature: 0.3,
    maxTokens: 1800,
  });
  return extractJson((res && res.content) || '');
}

exports.main = async (event) => {
  const action = event && event.action;
  const schemaVersion = event && event.schemaVersion;
  const promptVer = event && event.promptVer;
  const facts = event && event.facts;

  if (action !== 'interpret') return jsonReply(false, { reason: 'bad_action' });
  if (schemaVersion !== SCHEMA_VERSION || promptVer !== PROMPT_VER || !facts) {
    return jsonReply(false, { reason: 'bad_contract_version' });
  }

  const wxContext = cloud.getWXContext ? cloud.getWXContext() : null;
  const openid = wxContext && wxContext.OPENID;
  if (!openid) return jsonReply(false, { reason: 'unauthenticated' });

  const factErrors = validateFacts(facts);
  if (factErrors.length) {
    console.error('[insight] facts 校验未通过：', factErrors.join(','));
    return jsonReply(false, { reason: 'invalid_facts:' + factErrors.join(',') });
  }

  const docHash = serverDocHash(schemaVersion, facts);
  const key = cacheKey(docHash);
  const cached = cacheGet(key);
  if (cached) return jsonReply(true, { insight: Object.assign({}, cached, { cacheHit: true }) });

  const rate = checkRate(openid);
  if (!rate.ok) return jsonReply(false, { reason: rate.reason });

  // 重试状态机在 model-policy.runModelAttempts：只有「模型成功返回但没过 Guard」
  // 才带 repair hint 重试一次；429/配额/401/403 直接降级，不再立刻打第二次模型。
  const attempt = await runModelAttempts({
    callModel: (h) => callModel(facts, h),
    guard: (p) => guard(p, facts),
    quotaCheck: () => {
      const q = checkModelRate(openid);
      if (!q.ok) {
        console.error('[insight] 模型调用配额用尽：', q.reason,
          MODEL_RATE_MINUTE_MAX + '/min', MODEL_RATE_DAY_MAX + '/day');
      }
      return q;
    },
    // provider 原始报错只进服务端日志，且先脱敏：日志里同样不该出现 sk-/token/带 query 的 URL。
    onCallError: (cls, e) => {
      console.error('[insight] 模型调用失败：', cls.kind, cls.status || '-',
        redactProviderError(e));
    },
    onGuardFail: (errors, n) => {
      console.error('[insight] guard 未通过（第 ' + (n + 1) + ' 次）：', errors.join(','));
    },
  });

  if (!attempt.ok) {
    console.error('[insight] 降级兜底：reason=' + attempt.reason
      + '，本次模型调用次数=' + attempt.modelCalls);
    return jsonReply(true, {
      insight: {
        outputVersion: OUTPUT_VERSION,
        docHash,
        model: MODEL,
        promptVer: PROMPT_VER,
        sections: [],
        limitations: ['仅说明客观历法事实与文化背景'],
        fallback: true,
        reason: attempt.reason,
      },
    });
  }

  const parsed = attempt.insight;
  const insight = {
    outputVersion: OUTPUT_VERSION,
    docHash,
    model: MODEL,
    promptVer: PROMPT_VER,
    sections: parsed.sections,
    limitations: parsed.limitations,
    usedEvidenceIds: parsed.sections.flatMap((s) => s.evidenceIds || []),
    fallback: false,
    cacheHit: false,
  };
  cachePut(key, insight);
  return jsonReply(true, { insight });
};
