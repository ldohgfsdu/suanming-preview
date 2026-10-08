// tests/unit/insight.test.mjs — AI 解读层本地降级路径测试
// 验证：确定性、无禁词、Guard 生效、未知安全降级、真值源字段契约。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeArchive } from '../../miniprogram/lib/archive.js';
import { fmtTrueSolarMinutes } from '../../miniprogram/lib/display.js';
import { buildFacts, ruleBasedInsight, ruleBasedInsight as realRuleBasedInsight } from '../../miniprogram/lib/insight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦', '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运', '合婚', '择日', '看日子', '八字算',
  '排盘', '预测',
  '旺衰', '喜用', '用神', '忌神', '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];

const FACT_SAMPLE = {
  pillars: [
    { label: '年', gan_zhi: '庚午', element: '金' },
    { label: '月', gan_zhi: '辛巳', element: '金' },
    { label: '日', gan_zhi: '丙寅', element: '火' },
    { label: '时', gan_zhi: null, element: null },
  ],
  solarTerm: { prev: '芒种', next: '夏至' },
  solarTime: { corrected: '+18分钟', day_changed: false },
  lunar: '庚午年五月十七',
  wuxing: [{ name: '金', literal_count: 3 }, { name: '火', literal_count: 2 }],
};

test('I1 本地降级：输出确定性（两次调用完全一致）', () => {
  assert.equal(
    JSON.stringify(ruleBasedInsight(FACT_SAMPLE)),
    JSON.stringify(ruleBasedInsight(FACT_SAMPLE)),
  );
});

test('I2 本地降级：生成多个小节且均标注合法 contentType', () => {
  const ins = ruleBasedInsight(FACT_SAMPLE);
  assert.ok(ins.sections.length >= 3);
  ins.sections.forEach((s) => {
    assert.ok(s.contentType === 'FACT' || s.contentType === 'CULTURAL_CONTEXT');
    assert.ok(s.content && s.content.length > 0);
  });
});

test('I3 本地降级：全文本零禁词命中（含否定句式）', () => {
  const ins = ruleBasedInsight(FACT_SAMPLE);
  const flat = ins.sections.map((s) => s.title + s.content).join('');
  // 不设例外：微信内容安全按关键词命中，否定句式同样会被判违规。
  const hits = BANNED_WORDS.filter((w) => flat.indexOf(w) >= 0);
  assert.deepEqual(hits, [], '命中禁词: ' + hits.join(','));
});

test('I4 五行只作字面计数，明示不作强弱评判', () => {
  const s3 = ruleBasedInsight(FACT_SAMPLE).sections.find((s) => s.id === 's3');
  assert.match(s3.content, /只是符号出现次数的统计/);
  assert.match(s3.content, /不对其作任何强弱评判/);
});

test('I5 未知时辰（null）安全降级，不渲染 null/undefined', () => {
  const flat = ruleBasedInsight(FACT_SAMPLE).sections.map((s) => s.content).join('');
  assert.equal(flat.indexOf('null'), -1);
  assert.equal(flat.indexOf('undefined'), -1);
});

test('I6 空/缺失事实输入不抛异常', () => {
  const empty = { pillars: [], solarTerm: {}, solarTime: {}, lunar: null, wuxing: [] };
  const ins = ruleBasedInsight(empty);
  assert.ok(ins.sections.length >= 2);
});

test('I7 干支缺失时输出「无法判定」而非补全', () => {
  const noPillar = { pillars: [], solarTerm: { prev: null, next: null }, solarTime: {}, lunar: null, wuxing: [] };
  const flat = ruleBasedInsight(noPillar).sections.map((s) => s.content).join('');
  assert.match(flat, /无法判定/);
});

// buildFacts 的真值源契约：字段名必须与结果页实际产出一致，
// 否则 AI 会收到恒为 false 的假事实（曾发生：跨日字段误用 trueSolarDayChanged）。
test('I8 buildFacts：跨日字段读取 crossDay（结果页真实字段名）', () => {
  const app = readFileSync(resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8');
  // 结果页确实产出 crossDay
  assert.match(app, /crossDay: !!\(f\.trueSolar && f\.trueSolar\.dayChanged\)/);
  // insight.js 必须读 crossDay，不得读不存在的 trueSolarDayChanged
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  assert.match(insight, /day_changed: !!\(r\.crossDay\)/);
  assert.doesNotMatch(insight, /r\.trueSolarDayChanged/);
});

test('I10 AI 显式触发：onLoad 不得自动调用解读，须有用户点按入口', () => {
  const js = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.js'), 'utf8');
  const wxml = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.wxml'), 'utf8');
  // 1) 必须提供显式点按入口，且页面有按钮绑定
  assert.match(js, /onGenerateInsight\(/, '须提供显式点按入口');
  assert.match(wxml, /bindtap="onGenerateInsight"/, '页面须有按钮绑定该入口');
  // 2) onLoad 内不得自动触发（PRD §7.4/§9 铁律）
  const i = js.indexOf('onLoad()');
  assert.ok(i >= 0, '应存在 onLoad');
  assert.doesNotMatch(js.slice(i, i + 600), /this\.loadInsight\(/, 'onLoad 内不得自动调用 loadInsight');
  // 3) 三态机须覆盖 idle / loading / done
  assert.match(js, /insightState: 'idle'/);
  assert.match(wxml, /insightState === 'idle'/);
});

test('I11 缓存键语义：轻量缓存键不得冒充冻结契约 docHash', () => {
  const lib = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  const page = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.js'), 'utf8');
  // 旧名 localDocHash 易被误认为契约 docHash，必须已重命名
  assert.doesNotMatch(lib, /localDocHash/, '须重命名为 insightCacheKey');
  assert.match(lib, /export function insightCacheKey/);
  // 注释须澄清与 HASH_CONTRACT_V1 的区别（防后人误当 docHash 上传）
  assert.match(lib, /HASH_CONTRACT_V1/, '须注明与冻结契约 docHash 的区别');
  // 仅缓存云端 AI 产出（本地规则零成本，不占缓存）
  assert.match(page, /payload\.usedAI && cacheKey/, '仅 AI 产出入缓存');
});

test('I12 云函数服务端校验：入参事实须过取值域校验后才进模型', () => {
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  // 1) 必须存在校验函数与白名单常量
  assert.match(fn, /function validateFacts\(/, '云函数须有事实校验');
  ['GANS', 'ZHIS', 'WUXING', 'PILLAR_LABELS'].forEach((c) => {
    assert.match(fn, new RegExp('const ' + c + ' ='), `须定义 ${c} 白名单`);
  });
  // 2) main 必须在调用模型前拦截非法事实
  assert.match(fn, /invalid_facts/, '非法事实须拒绝');
  const mainIdx = fn.indexOf('exports.main');
  assert.ok(mainIdx >= 0);
  const main = fn.slice(mainIdx);
  assert.ok(main.indexOf('validateFacts(facts)') < main.indexOf('callModel('),
    '校验必须先于模型调用');
  // 3) 两份副本须一致（部署读 miniprogram 那份）
  const mirror = readFileSync(resolve(__dirname, '../../miniprogram/cloudfunctions/insight/index.js'), 'utf8');
  assert.equal(mirror, fn, 'cloudfunctions/ 与 miniprogram/cloudfunctions/ 须同步');
});

test('I13 事实校验逻辑：非法干支/五行名/超长 payload 均被拒', () => {
  // 从云函数源码中抽出 validateFacts 与其常量，在本测试环境直接执行
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  const src = fn.slice(fn.indexOf('const GANS'), fn.indexOf('function buildMessages'));
  // eslint-disable-next-line no-new-func
  const factory = new Function(src + '\n return validateFacts;');
  const validateFacts = factory();

  const ok = {
    pillars: [{ label: '年', gan_zhi: '甲子', element: '木' }],
    solarTerm: { prev: '立春', next: '雨水' },
    solarTime: { corrected: '+14分', day_changed: false },
    lunar: '正月初一',
    wuxing: [{ name: '木', literal_count: 2 }],
  };
  assert.deepEqual(validateFacts(ok), [], '合法事实应通过');

  // 非法干支（伪造的「甲X」）
  const badGanzhi = JSON.parse(JSON.stringify(ok));
  badGanzhi.pillars[0].gan_zhi = '甲X';
  assert.ok(validateFacts(badGanzhi).some((e) => e.indexOf('ganzhi_invalid') === 0), '非法干支须拒绝');

  // 非法五行名
  const badWx = JSON.parse(JSON.stringify(ok));
  badWx.wuxing[0].name = '霸王色';
  assert.ok(validateFacts(badWx).some((e) => e.indexOf('wuxing_name') === 0), '非法五行名须拒绝');

  // 非整数计数
  const badCount = JSON.parse(JSON.stringify(ok));
  badCount.wuxing[0].literal_count = 2.5;
  assert.ok(validateFacts(badCount).some((e) => e.indexOf('wuxing_count') === 0), '非整数计数须拒绝');

  // day_changed 非布尔
  const badDay = JSON.parse(JSON.stringify(ok));
  badDay.solarTime.day_changed = 'yes';
  assert.ok(validateFacts(badDay).indexOf('day_changed_shape') >= 0, 'day_changed 须为布尔');

  // 非对象 / 空柱
  assert.ok(validateFacts(null).indexOf('facts_not_object') >= 0);
  assert.ok(validateFacts({ pillars: [] }).indexOf('pillars_shape') >= 0);
});

test('I9 buildFacts：五行只输出字面计数，不带旺衰/强弱语义字段', () => {
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  const m = insight.match(/wuxing:[\s\S]{0,200}?\}\)\)/);
  assert.ok(m, '应存在 wuxing 映射');
  assert.match(m[0], /literal_count/);
  // 不得出现强弱/旺衰类字段名
  assert.doesNotMatch(m[0], /strength|wang|shuai|strong|weak/i);
});

// ---- I14 facts 契约端到端（页面产出 → buildFacts → 云函数 validateFacts）----
//
// 回归背景：页面交 label='年柱'，服务端 PILLAR_LABELS 只收 '年'，导致每次 facts 校验
// 失败 → AI 永远走本地兜底、云函数形同虚设；占位串 '—' / '未提供地点' 同理。
// 这里用 computeArchive 真算一遍、按 index.js commitResult 的字段形状组装，锁死两层契约。
function pageShapedResult(y, m, d, hour, lon) {
  const f = computeArchive(y, m, d, hour, lon);
  const LABELS = ['年柱', '月柱', '日柱', '时柱'];
  const ELEMENT = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
  const pillars = ['year', 'month', 'day', 'hour'].map((k, i) => {
    const p = f.four[k];
    return { key: k, label: LABELS[i], ganz: p ? p.ganz : '—', element: p ? ELEMENT[p.element] : '' };
  });
  const tally = ['wood', 'fire', 'earth', 'metal', 'water']
    .map((k) => ({ key: k, name: ELEMENT[k], n: f.tally[k] || 0 }));
  return {
    pillars,
    prevTerm: f.term.prev ? f.term.prev.name : '—',
    nextTerm: f.term.next ? f.term.next.name : '—',
    trueSolar: f.trueSolar.degraded ? '未提供地点' : fmtTrueSolarMinutes(f.trueSolar.offsetMinutes),
    crossDay: !!(f.trueSolar && f.trueSolar.dayChanged),
    lunarText: f.lunar ? f.lunar.text : '',
    tally,
  };
}

test('I14 真实页面产出 → buildFacts → 云函数 validateFacts 必须全部通过', () => {
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  const src = fn.slice(fn.indexOf('const GANS'), fn.indexOf('function buildMessages'));
  // eslint-disable-next-line no-new-func
  const factory = new Function(src + '\n return validateFacts;');
  const validateFacts = factory();

  const cases = [
    ['正常', pageShapedResult(2024, 4, 14, 10, 116.4)],
    ['时辰未知', pageShapedResult(2024, 4, 14, -1, 116.4)],
    ['未提供地点', pageShapedResult(2024, 4, 14, 10, null)],
    ['立春边界', pageShapedResult(2024, 2, 4, 12, null)],
    ['真太阳时跨日', pageShapedResult(2024, 6, 15, 0, 116.4)],
  ];
  cases.forEach(([name, r]) => {
    const facts = buildFacts(r);
    assert.deepEqual(validateFacts(facts), [], `${name} 必须通过服务端校验: ` + JSON.stringify(facts));
  });

  const factsPlace = buildFacts(cases[2][1]);
  assert.equal(factsPlace.solarTime.corrected, null, '无地点时修正量应归一为 null');
  const flatPlace = realRuleBasedInsight(factsPlace).sections.map((s) => s.content).join('');
  assert.equal(flatPlace.indexOf('未提供地点'), -1, '占位串不得进入正文');
  assert.equal(flatPlace.indexOf('传统排盘'), -1, '「排盘」为内容安全动态禁词');

  const factsUnknown = buildFacts(cases[1][1]);
  assert.equal(factsUnknown.pillars[3].gan_zhi, null, "未知时柱 '—' 应归一为 null");
  assert.equal(factsUnknown.pillars[3].label, '时', 'label 应剥掉展示后缀「柱」');
  const s2 = realRuleBasedInsight(factsUnknown).sections.find((s) => s.id === 's2');
  assert.equal(s2.content.indexOf('—'), -1, '未知时柱不得以占位符进入正文');
  assert.equal(s2.content.indexOf('年柱柱'), -1, 'label 后缀重复拼接');
});

// ---- I15 本地降级须是「长文结构」：总论 + 分节 + 分段，杜绝只给三两句的空壳 ----
test('I15 本地降级：总论 + 分节长文（禁短段落）', () => {
  const ins = realRuleBasedInsight(FACT_SAMPLE);

  assert.equal(ins.sections[0].title, '总论', '首节须为总论');
  assert.ok(ins.sections.length >= 5, `至少 5 节，实际 ${ins.sections.length}`);

  const total = ins.sections.reduce((n, s) => n + s.content.length, 0);
  assert.ok(total >= 900, `正文总量须 ≥900 字，实际 ${total}`);

  ins.sections
    .filter((s) => s.content.indexOf('无法判定') < 0)
    .forEach((s) => {
      assert.ok(s.content.length >= 120, `《${s.title}》过短：${s.content.length} 字`);
    });

  // 长文必须分段渲染（渲染侧 white-space: pre-line）
  assert.ok(
    ins.sections.some((s) => s.content.indexOf('\n\n') >= 0),
    '长文须以 \\n\\n 分段',
  );

  // 全量禁词复检（本地与云函数共用同一份口径）
  const flat = ins.sections.map((s) => s.title + s.content).join('');
  const hits = BANNED_WORDS.filter((w) => flat.indexOf(w) >= 0);
  assert.deepEqual(hits, [], '命中禁词: ' + hits.join(','));
  assert.equal(/旺|衰/.test(flat), false, '云函数 Guard 会拒「旺」「衰」二字');
});