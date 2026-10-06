/**
 * miniprogram/lib/insight.js — 历法文化解读层（比赛轨）
 *
 * 分层（严格对齐 Preview 铁律「AI 失败不阻断主链路」）：
 *   1) 本地规则降级：确定性模板，本机可跑、可复现，默认可演示。
 *   2) 云端 AI 覆盖：云函数 insight 成功时以 AI 文本覆盖降级文本。
 *
 * 语义范围（红线，只解释不判定）：
 *   - 只解释已给出的确定性历法事实，不补算、不改四柱。
 *   - 禁预测 / 吉凶 / 运势 / 宜忌 / 大运流年 / 十神断语 / 合婚择日。
 *   - 不把五行字面计数等同旺衰。
 *   - 未知输出「无法判定」，不替用户选择流派。
 */
'use strict';

import { ELEMENT_NAME } from './archive.js';

export const OUTPUT_VERSION = 'insight-1.0';
export const PROMPT_VER = 'insight-prompt-v1';

/** Output Guard 禁词集合（与云函数侧共用同一份口径）。 */
export const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦',
  '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运',
  '合婚', '择日', '看日子', '八字算',
  '旺衰', '喜用', '用神', '忌神',
  '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];

/** 本地可机检：文本是否触碰禁词。 */
export function detectBanned(text) {
  if (!text) return [];
  return BANNED_WORDS.filter((w) => String(text).indexOf(w) >= 0);
}

/**
 * 从档案结果提取送入 AI / 模板的**结构化事实**。
 * 只含 P0 六类：时间 / 节气 / 干支 / 太阳时间 / 农历 / 五行字面计数。
 * 未知一律 null，不拼接展示串（H-1）。
 */
export function buildFacts(r) {
  if (!r) return null;
  return {
    pillars: (r.pillars || []).map((p) => ({
      label: p.label,
      gan_zhi: p.ganz || null,
      element: ELEMENT_NAME[p.element] || null,
    })),
    solarTerm: {
      prev: r.prevTerm || null,
      next: r.nextTerm || null,
    },
    solarTime: {
      corrected: r.trueSolar || null,
      // 字段名以结果页实际产出的 crossDay 为准（此前误用 trueSolarDayChanged，导致恒为 false）
      day_changed: !!(r.crossDay),
    },
    lunar: r.lunarText || null,
    wuxing: (r.tally || []).map((t) => ({
      name: t.name,
      literal_count: t.n,
    })),
  };
}

/**
 * 客户端缓存键（**不是** HASH_CONTRACT_V1 的 docHash，勿混用、勿当 docHash 上传）。
 *
 * - 冻结契约 docHash：位于 `shared/hash/`，RFC 8785 规范化 + SHA-256 + NFC + 白名单，
 *   用途是「档案指纹 / 跨端对拍」，唯一真值为 `resolvedEpochMilli(INT,UTC)` + `timezoneId(IANA)`。
 * - 本函数：仅需「同一份事实 → 同一个键」的稳定性，用于本地缓存与重复请求去重，
 *   故用轻量 FNV 变体即可，不依赖 crypto（小程序端无稳定 SHA-256 API）。
 */
export function insightCacheKey(facts) {
  const s = JSON.stringify(facts || {});
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return 'ld-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

// ---------------- 本地规则降级模板 ----------------

function countTally(facts) {
  const out = [];
  const arr = (facts && facts.wuxing) || [];
  arr.forEach((t) => {
    if (t && typeof t.literal_count === 'number') out.push(`${t.name}${t.literal_count}`);
  });
  return out.length ? out.join('·') : '—';
}

/**
 * 规则降级：完全确定性、零模型、无网络。
 * 只做「事实 → 文化背景」的直白陈述，不含任何判断。
 */
export function ruleBasedInsight(facts) {
  if (!facts) return null;
  const f = facts;
  const sections = [];

  // 1. 节气与历法坐标
  const termBits = [];
  if (f.solarTerm && f.solarTerm.prev) termBits.push(`上一个节气是${f.solarTerm.prev}`);
  if (f.solarTerm && f.solarTerm.next) termBits.push(`下一个节气是${f.solarTerm.next}`);
  sections.push({
    id: 's1',
    title: '节气坐标',
    contentType: 'FACT',
    content: termBits.length
      ? termBits.join('，') + '。节气在传统历法中是太阳周年运动的刻度，本档案的月柱以「节」而非公历月为分界。'
      : '无法判定：缺少节气数据。',
    evidenceIds: ['e_term'],
  });

  // 2. 干支体系
  const pillars = (f.pillars || []).filter((p) => p && p.gan_zhi);
  sections.push({
    id: 's2',
    title: '干支纪时',
    contentType: 'CULTURAL_CONTEXT',
    content: pillars.length
      ? `四柱依次为 ${pillars.map((p) => `${p.label}柱${p.gan_zhi}`).join('、')}。天干十位循环纪年、纪月、纪日，地支十二位对应十二时辰与十二地支方位，这是中国古代记录时间的一套符号系统。`
      : '无法判定：缺少干支数据。',
    evidenceIds: ['e_pillars'],
  });

  // 3. 五行字面计数（严守「计数 ≠ 旺衰」）
  //    注意：文案避免出现「吉凶」二字本身——即便是否定句式，
  //    微信内容安全审核按关键词命中，会被判为违规。统一改为「不作强弱评判」。
  sections.push({
    id: 's3',
    title: '五行字面分布',
    contentType: 'FACT',
    content: `按天干地支逐一归属，本档案的字面计数为 ${countTally(f)}。这只是符号出现次数的统计，本档案不对其作任何强弱评判。`,
    evidenceIds: ['e_wuxing'],
  });

  // 4. 太阳时间校正
  if (f.solarTime && f.solarTime.corrected) {
    sections.push({
      id: 's4',
      title: '太阳时间',
      contentType: 'FACT',
      content: `按出生地经度与均时差换算，出生时刻的钟表时间与真太阳时相差 ${f.solarTime.corrected}${f.solarTime.day_changed ? '，并因此改变了历日归属' : ''}。传统排盘采用真太阳时，故与钟表时间可能不同。`,
      evidenceIds: ['e_solar'],
    });
  }

  return {
    outputVersion: OUTPUT_VERSION,
    model: 'rule-based-fallback',
    promptVer: PROMPT_VER,
    sections,
    limitations: ['仅解释客观历法事实', '不含预测、判定或建议', '云端 AI 未启用时使用本地规则文本'],
    fallback: true,
  };
}

/** 云函数返回结果的 Guard 校验（客户端侧二次防护）。 */
export function validateInsight(insight, facts) {
  const errors = [];
  if (!insight || typeof insight !== 'object') return ['not_object'];
  if (insight.outputVersion !== OUTPUT_VERSION) errors.push('outputVersion');
  if (!Array.isArray(insight.sections) || !insight.sections.length) errors.push('sections');
  if (!Array.isArray(insight.limitations) || !insight.limitations.length) errors.push('limitations');
  const text = (insight.sections || [])
    .map((s) => `${s.title || ''}${s.content || ''}`)
    .join('');
  const banned = detectBanned(text);
  if (banned.length) errors.push('banned:' + banned.join(','));
  if (facts) {
    const known = JSON.stringify(facts);
    (insight.sections || []).forEach((s) => {
      if (s.contentType && s.contentType !== 'FACT' && s.contentType !== 'CULTURAL_CONTEXT') {
        errors.push('contentType:' + s.contentType);
      }
      if (s.evidenceIds) {
        s.evidenceIds.forEach((id) => {
          if (known.indexOf(String(id)) < 0 && String(id).indexOf('e_') !== 0) {
            errors.push('evidence:' + id);
          }
        });
      }
    });
  }
  return errors;
}

/**
 * 统一入口：本地降级优先，云端成功则覆盖。
 * 任何异常都不抛出 —— AI 不可用时主链路照常。
 */
export function resolveInsight(archiveResult, opts) {
  const facts = buildFacts(archiveResult);
  const local = ruleBasedInsight(facts);
  const cacheKey = insightCacheKey(facts);
  const fallback = { insight: local, facts, usedAI: false, reason: 'local_default', cacheKey };
  if (!opts || !opts.cloudAvailable) return fallback;

  return callCloudInsight(facts, cacheKey)
    .then((res) => {
      const errors = validateInsight(res, facts);
      if (errors.length) {
        return { insight: local, facts, usedAI: false, reason: 'guard:' + errors.join('|'), cacheKey };
      }
      return {
        insight: Object.assign({}, res, { fallback: false }),
        facts, usedAI: true, reason: 'ok', cacheKey,
      };
    })
    .catch((e) => ({
      insight: local,
      facts,
      usedAI: false,
      reason: 'error:' + ((e && e.errMsg) || 'unknown'),
      cacheKey,
    }));
}

/**
 * 调用云函数 insight。
 *
 * 注意：上行字段名为 `docHash` 是**沿用已部署云函数的入参名**（改名需同步重新部署，
 * 否则会命中 missing_doc_fields 而全面降级）。其实际值是**客户端缓存键** cacheKey，
 * 仅用于云端日志排查与回显；**冻结契约的 docHash（SHA-256 + RFC 8785）不在客户端生成**，
 * 服务端不应把它当作档案指纹使用。
 */
function callCloudInsight(facts, cacheKey) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.cloud) {
      reject(new Error('cloud_unavailable'));
      return;
    }
    wx.cloud.callFunction({
      name: 'insight',
      data: {
        action: 'interpret',
        docHash: cacheKey,
        schemaVersion: 'archive-document-v1',
        promptVer: PROMPT_VER,
        facts,
        locale: 'zh-CN',
      },
      success: (res) => {
        const d = res && res.result;
        if (d && d.ok && d.insight && (d.insight.sections || []).length) {
          resolve(d.insight);
        } else if (d && d.ok && d.insight && d.insight.fallback) {
          // 云端已降级：把真实原因带回，便于定位（模型未开通/额度/超时等）
          reject(new Error('cloud_fallback:' + (d.insight.reason || 'unknown')));
        } else {
          reject(new Error((d && d.reason) || 'bad_result'));
        }
      },
      fail: (e) => reject(e || new Error('call_failed')),
    });
  });
}