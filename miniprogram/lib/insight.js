/**
 * miniprogram/lib/insight.js — 历法文化解读层（比赛轨）
 *
 * 分层：
 *   1) 本地规则降级：确定性模板，本机可跑、可复现。
 *   2) 云端 AI 覆盖：云函数成功时以 AI 文本覆盖降级文本。
 *
 * 铁律：AI 只解释确定性事实，不参与任何历法计算。
 */
'use strict';

import { ELEMENT_NAME } from './archive.js';

export const OUTPUT_VERSION = 'insight-1.1';
export const PROMPT_VER = 'insight-prompt-v3';
export const SCHEMA_VERSION = 'archive-document-v1';

export const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦',
  '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运',
  '合婚', '择日', '看日子', '八字算',
  '排盘', '预测',
  '旺衰', '喜用', '用神', '忌神',
  '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];
const EVIDENCE_IDS = new Set(['e_term', 'e_lunar', 'e_pillars', 'e_wuxing', 'e_solar']);

export function detectBanned(text) {
  if (!text) return [];
  return BANNED_WORDS.filter((w) => String(text).indexOf(w) >= 0);
}

/** 从结果页结构提取 AI 可见的 P0 客观事实。 */
export function buildFacts(r) {
  if (!r) return null;
  return {
    pillars: (r.pillars || []).map((p) => ({
      label: p.label ? String(p.label).replace(/柱$/, '') : null,
      gan_zhi: p.ganz && p.ganz !== '—' ? p.ganz : null,
      element: p.element ? (ELEMENT_NAME[p.element] || p.element) : null,
    })),
    solarTerm: {
      prev: r.prevTerm && r.prevTerm !== '—' ? r.prevTerm : null,
      next: r.nextTerm && r.nextTerm !== '—' ? r.nextTerm : null,
    },
    solarTime: {
      corrected: (r.trueSolar && r.trueSolar !== '未提供地点') ? r.trueSolar : null,
      day_changed: !!r.crossDay,
    },
    lunar: r.lunarText || null,
    wuxing: (r.tally || []).map((t) => ({ name: t.name, literal_count: t.n })),
  };
}

/**
 * 客户端本地缓存键。它不是服务端 docHash：docHash 由云函数对规范化 facts 做 SHA-256。
 * 本地键只用于同一客户端避免重复发起请求，并且必须随 schema/prompt/output 版本一起失效。
 */
export function insightCacheKey(facts) {
  const s = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    promptVer: PROMPT_VER,
    outputVersion: OUTPUT_VERSION,
    facts: facts || {},
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return [OUTPUT_VERSION, PROMPT_VER, h1.toString(16).padStart(8, '0'), h2.toString(16).padStart(8, '0')].join(':');
}

function countTally(facts) {
  const out = [];
  const arr = (facts && facts.wuxing) || [];
  arr.forEach((t) => {
    if (t && typeof t.literal_count === 'number') out.push(`${t.name}${t.literal_count}`);
  });
  return out.length ? out.join('·') : '—';
}

const ZHI_CULTURE = {
  子: { hours: '23:00–01:00', dir: '北（坎）', month: '十一月' },
  丑: { hours: '01:00–03:00', dir: '东北（艮）', month: '十二月' },
  寅: { hours: '03:00–05:00', dir: '东北（艮）', month: '正月' },
  卯: { hours: '05:00–07:00', dir: '东（震）', month: '二月' },
  辰: { hours: '07:00–09:00', dir: '东南（巽）', month: '三月' },
  巳: { hours: '09:00–11:00', dir: '东南（巽）', month: '四月' },
  午: { hours: '11:00–13:00', dir: '南（离）', month: '五月' },
  未: { hours: '13:00–15:00', dir: '西南（坤）', month: '六月' },
  申: { hours: '15:00–17:00', dir: '西南（坤）', month: '七月' },
  酉: { hours: '17:00–19:00', dir: '西（兑）', month: '八月' },
  戌: { hours: '19:00–21:00', dir: '西北（乾）', month: '九月' },
  亥: { hours: '21:00–23:00', dir: '西北（乾）', month: '十月' },
};

/** 本地确定性降级文本。 */
export function ruleBasedInsight(facts) {
  if (!facts) return null;
  const f = facts;
  const sections = [];
  const pillars = (f.pillars || []).filter((p) => p && p.gan_zhi);
  const term = f.solarTerm || {};
  const hasSolar = !!(f.solarTime && f.solarTime.corrected);

  sections.push({
    id: 's0',
    title: '总论',
    contentType: 'CULTURAL_CONTEXT',
    content:
      '这份档案记录的是一组已经算好的客观坐标：四柱干支、前后节气、农历日期、五行字面计数，以及按出生地经度与均时差校正后的太阳时刻。它们并不出自同一种计时系统——公历以回归年定年月日，农历以朔望月定初一、以节气置闰，干支历以立春与十二「节」为界纪年月日时；三套系统各自记数，叠加起来就是这一时刻在历法中的位置。\n\n'
      + '下面各节逐项展开这些坐标，说明每一项出自哪套系统、如何确定、在传统文化中承担什么角色。全部内容为历法与文化背景的陈述，只引用上方已经算好的数值，不补算、不替换，也不对个人作任何推断。',
    evidenceIds: ['e_pillars', 'e_term'],
  });

  const termBits = [];
  if (term.prev) termBits.push('上一个节气是' + term.prev);
  if (term.next) termBits.push('下一个节气是' + term.next);
  sections.push({
    id: 's1',
    title: '节气坐标',
    contentType: 'FACT',
    content: termBits.length
      ? termBits.join('，') + '。节气按太阳在黄道上的视位置划分：自春分点起，太阳每运行 15 度为一个节气，二十四节气正好合 360 度。因此节气落在公历上的日期几乎固定，前后不过一两天，而农历日期会随朔望月逐年游移。\n\n'
        + '干支历以十二「节」（立春、惊蛰、清明、立夏、芒种、小暑、立秋、白露、寒露、立冬、大雪、小寒）划分月柱区间，十二「中气」（雨水、春分、谷雨、小满、夏至、大暑、处暑、秋分、霜降、小雪、冬至、大寒）排在两节之间、不换月。本档案的月柱由上一个「节」所在的区间定出，而不是按公历月份的 1 号定出。'
      : '无法判定：缺少节气数据。',
    evidenceIds: ['e_term'],
  });

  if (f.lunar) {
    sections.push({
      id: 's5',
      title: '农历日期',
      contentType: 'FACT',
      content:
        '本档案的农历日期为 ' + f.lunar + '。农历是阴阳合历：一个月以「朔」（新月隐没不见之日）为初一，月长 29 或 30 天，平均 29.53 天与一次朔望月相合；一年十二个月约 354 天，比回归年少约 11 天，所以要靠置闰把月份重新对回四季。\n\n'
        + '农历日期由朔日时刻与日界推算：若朔发生在临近子夜的时刻，不同地区对「初一」的判定可能相差一天，故农历日期允许有一天的出入（若页面在该行标注了「近似」，即指这一原因）。',
      evidenceIds: ['e_lunar'],
    });
  }

  const hourPillar = (f.pillars || []).find((p) => p && p.label === '时');
  const hourMissing = !!(hourPillar && !hourPillar.gan_zhi);
  sections.push({
    id: 's2',
    title: '四柱干支',
    contentType: 'CULTURAL_CONTEXT',
    content: pillars.length
      ? '四柱依次为 ' + pillars.map((p) => p.label + '柱' + p.gan_zhi).join('、')
        + (hourMissing ? '（时柱因未提供出生时间而未列）' : '')
        + '。每一柱由一个天干与一个地支组成：天干十位（甲乙丙丁戊己庚辛壬癸），地支十二位（子丑寅卯辰巳午未申酉戌亥），阴阳相间、两两相配，六十年循环一周。\n\n'
        + '四个层级各有各的起点：年柱以立春为界，月柱以十二「节」为界，日柱是连续不间断的纪日序列，时柱由日干按五鼠遁推得。四柱因此是干支历对年、月、日、时四个层级的并列标注，本档案原样列出，不对其中任何一位作进一步解读。'
      : '无法判定：缺少干支数据。',
    evidenceIds: ['e_pillars'],
  });

  if (hourPillar && hourPillar.gan_zhi) {
    const zhi = hourPillar.gan_zhi.charAt(1);
    const c = ZHI_CULTURE[zhi];
    if (c) {
      sections.push({
        id: 's6',
        title: '十二时辰与地支',
        contentType: 'CULTURAL_CONTEXT',
        content:
          '本档案时柱地支为' + zhi + '，对应的时辰是' + zhi + '时（' + c.hours + '），方位属' + c.dir + '，在十二月建中配' + c.month + '。\n\n'
          + '十二时辰把一天均分为十二段，每段两小时，以地支命名依次循环：子时 23:00–01:00、丑时 01:00–03:00，如此到亥时 21:00–23:00。同一套地支还被用来标方位（子北、午南、卯东、酉西）与标月份（自寅起为正月），时间、方位与月份因此共用一套编号方式。',
        evidenceIds: ['e_pillars'],
      });
    }
  }

  sections.push({
    id: 's3',
    title: '五行字面分布',
    contentType: 'FACT',
    content:
      '按天干地支逐一归属，本档案的字面计数为 ' + countTally(f) + '。五行（木、火、土、金、水）是中国传统里对事物分类的一套符号，先秦文献已见其说；在干支体系中，十干与十二支各有固定的五行归属，这里统计的是它们在四柱里出现的次数。\n\n'
      + '这只是符号出现次数的统计，本档案不对其作任何强弱评判。取法不同，计数也会不同：只计天干与兼计地支并不一致，故本节数值只在本档案所用的这一套归属规则下成立，不与其他算法比较。',
    evidenceIds: ['e_wuxing'],
  });

  if (hasSolar) {
    sections.push({
      id: 's4',
      title: '太阳时间与钟表时间',
      contentType: 'FACT',
      content:
        '按出生地经度与均时差换算，钟表时间与真太阳时相差 ' + f.solarTime.corrected
        + (f.solarTime.day_changed ? '，并因此改变了历日归属，日柱按校正后的时刻定出' : '')
        + '。差额来自两处：一是经度，钟表时间以时区中央经线为准，东八区取 120 度，出生地每偏东 1 度，地方平时约早 4 分钟；二是均时差，太阳视运动并不匀速，真太阳日长度全年约有正负 16 分钟的起伏，使真太阳时与钟表时间始终存在一个小差额。\n\n'
        + '传统历法以太阳位置定日，因此在接近换日的时刻，校正前后的历日可能不同；本档案的历日与日柱均按校正后的时刻确定。',
      evidenceIds: ['e_solar'],
    });
  }

  return {
    outputVersion: OUTPUT_VERSION,
    model: 'rule-based-fallback',
    promptVer: PROMPT_VER,
    sections,
    limitations: ['仅解释客观历法事实', '不作任何判断、建议或未来推断', '云端 AI 未启用时使用本地规则文本'],
    fallback: true,
  };
}

export function validateInsight(insight, facts) {
  const errors = [];
  if (!insight || typeof insight !== 'object') return ['not_object'];
  if (insight.outputVersion !== OUTPUT_VERSION) errors.push('outputVersion');
  if (insight.promptVer !== PROMPT_VER) errors.push('promptVer');
  if (!/^[0-9a-f]{64}$/.test(String(insight.docHash || ''))) errors.push('docHash');
  if (!Array.isArray(insight.sections) || !insight.sections.length) errors.push('sections');
  if (!Array.isArray(insight.limitations) || !insight.limitations.length) errors.push('limitations');

  const text = (insight.sections || []).map((s) => `${s.title || ''}${s.content || ''}`).join('');
  const banned = detectBanned(text);
  if (banned.length) errors.push('banned:' + banned.join(','));

  (insight.sections || []).forEach((s, i) => {
    if (s.contentType !== 'FACT' && s.contentType !== 'CULTURAL_CONTEXT') errors.push('contentType:' + i);
    if (!Array.isArray(s.evidenceIds) || !s.evidenceIds.length) {
      errors.push('evidence_empty:' + i);
    } else {
      s.evidenceIds.forEach((id) => { if (!EVIDENCE_IDS.has(id)) errors.push('evidence:' + id); });
    }
  });

  if (facts) {
    const known = JSON.stringify(facts);
    const re = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!known.includes(m[0])) errors.push('invented_ganzhi:' + m[0]);
    }
  }
  return Array.from(new Set(errors));
}

/** 统一入口：本地降级优先，云端成功则覆盖。 */
export function resolveInsight(archiveResult, opts) {
  const facts = buildFacts(archiveResult);
  const local = ruleBasedInsight(facts);
  const cacheKey = insightCacheKey(facts);
  const fallback = { insight: local, facts, usedAI: false, reason: 'local_default', cacheKey };
  if (!opts || !opts.cloudAvailable) return fallback;

  return callCloudInsight(facts)
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
      reason: 'error:' + ((e && (e.errMsg || e.message)) || 'unknown'),
      cacheKey,
    }));
}

function callCloudInsight(facts) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.cloud) {
      reject(new Error('cloud_unavailable'));
      return;
    }
    wx.cloud.callFunction({
      name: 'insight',
      data: {
        action: 'interpret',
        schemaVersion: SCHEMA_VERSION,
        promptVer: PROMPT_VER,
        facts,
      },
      success: (res) => {
        const d = res && res.result;
        if (d && d.ok && d.insight && (d.insight.sections || []).length) {
          resolve(d.insight);
        } else if (d && d.ok && d.insight && d.insight.fallback) {
          reject(new Error('cloud_fallback:' + (d.insight.reason || 'unknown')));
        } else {
          reject(new Error((d && d.reason) || 'bad_result'));
        }
      },
      fail: (e) => reject(e || new Error('call_failed')),
    });
  });
}
