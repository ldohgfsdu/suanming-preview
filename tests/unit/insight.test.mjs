// tests/unit/insight.test.mjs — AI 解读层契约与本地降级测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeArchive } from '../../miniprogram/lib/archive.js';
import { fmtTrueSolarMinutes } from '../../miniprogram/lib/display.js';
import {
  buildFacts, ruleBasedInsight, ruleBasedInsight as realRuleBasedInsight,
  insightCacheKey, OUTPUT_VERSION, PROMPT_VER,
  BANNED_WORDS,
} from '../../miniprogram/lib/insight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// BANNED_WORDS 直接 import 客户端，不再本地抄一份。
// 「客户端 / 云函数 / 测试」三副本的一致性由 tests/unit/insight-contract.test.mjs 强制。

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
  wuxing: [
    { name: '木', literal_count: 1 },
    { name: '火', literal_count: 2 },
    { name: '土', literal_count: 1 },
    { name: '金', literal_count: 3 },
    { name: '水', literal_count: 0 },
  ],
};

test('I1 本地降级：输出确定性（两次调用完全一致）', () => {
  assert.equal(JSON.stringify(ruleBasedInsight(FACT_SAMPLE)), JSON.stringify(ruleBasedInsight(FACT_SAMPLE)));
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

test('I8 buildFacts：跨日字段读取 crossDay（结果页真实字段名）', () => {
  const app = readFileSync(resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8');
  assert.match(app, /crossDay: !!\(f\.trueSolar && f\.trueSolar\.dayChanged\)/);
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  assert.match(insight, /day_changed: !!r\.crossDay/);
  assert.doesNotMatch(insight, /r\.trueSolarDayChanged/);
});

test('I9 buildFacts：五行只输出字面计数，不带旺衰/强弱语义字段', () => {
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  const m = insight.match(/wuxing:[\s\S]{0,200}?\}\)\)/);
  assert.ok(m, '应存在 wuxing 映射');
  assert.match(m[0], /literal_count/);
  assert.doesNotMatch(m[0], /strength|wang|shuai|strong|weak/i);
});

test('I10 AI 显式触发：onLoad 不得自动调用解读，须有用户点按入口', () => {
  const js = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.js'), 'utf8');
  const wxml = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.wxml'), 'utf8');
  assert.match(js, /onGenerateInsight\(/, '须提供显式点按入口');
  assert.match(wxml, /bindtap="onGenerateInsight"/, '页面须有按钮绑定该入口');
  const i = js.indexOf('onLoad()');
  assert.ok(i >= 0, '应存在 onLoad');
  assert.doesNotMatch(js.slice(i, i + 600), /this\.loadInsight\(/, 'onLoad 内不得自动调用 loadInsight');
  assert.match(js, /insightState: 'idle'/);
  assert.match(wxml, /insightState === 'idle'/);
});

test('I11 客户端缓存键必须随协议版本失效，且不得上传伪 docHash', () => {
  const lib = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  assert.match(lib, /export function insightCacheKey/);
  assert.match(lib, /schemaVersion: SCHEMA_VERSION/);
  assert.match(lib, /promptVer: PROMPT_VER/);
  assert.match(lib, /outputVersion: OUTPUT_VERSION/);
  assert.doesNotMatch(lib, /docHash:\s*cacheKey/, '客户端缓存键不得作为 docHash 上行');
  assert.match(lib, /docHash 由云函数.*SHA-256/, '须明确服务端 docHash 真值源');

  const a = insightCacheKey(FACT_SAMPLE);
  assert.ok(a.includes(OUTPUT_VERSION));
  assert.ok(a.includes(PROMPT_VER));
});

test('I12 云函数服务端校验：事实校验必须先于模型调用，两份部署镜像一致', () => {
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  assert.match(fn, /function validateFacts\(/, '云函数须有事实校验');
  ['GANS', 'ZHIS', 'WUXING', 'PILLAR_LABELS'].forEach((c) => {
    assert.match(fn, new RegExp('const ' + c + ' ='), `须定义 ${c} 白名单`);
  });
  assert.match(fn, /invalid_facts/, '非法事实须拒绝');
  const mainIdx = fn.indexOf('exports.main');
  const main = fn.slice(mainIdx);
  assert.ok(main.indexOf('validateFacts(facts)') < main.indexOf('callModel('), '校验必须先于模型调用');
  const mirror = readFileSync(resolve(__dirname, '../../miniprogram/cloudfunctions/insight/index.js'), 'utf8');
  assert.equal(mirror, fn, 'cloudfunctions/ 与 miniprogram/cloudfunctions/ 须同步');
  // 注意：这里只比 index.js。model-policy.js / package.json / config.json 的一致性
  // 与「文件集合本身是否相同」由 scripts/sync-cloudfunctions.mjs 负责，
  // 其自校验（含注入漂移的负向测试）见 tests/unit/cloudfunctions-sync.test.mjs。
});

function extractServerValidator() {
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  const src = fn.slice(fn.indexOf('function isPlainObject'), fn.indexOf('function stable'));
  const prefix = [
    'const FACTS_MAX_CHARS = 8000;',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(prefix + '\n' + src + '\n return validateFacts;')();
}

test('I13 事实校验逻辑：非法干支/五行/未知字段/超长 payload 均拒绝', () => {
  const validateFacts = extractServerValidator();
  const ok = JSON.parse(JSON.stringify(FACT_SAMPLE));
  assert.deepEqual(validateFacts(ok), [], '合法事实应通过');

  const badGanzhi = JSON.parse(JSON.stringify(ok));
  badGanzhi.pillars[0].gan_zhi = '甲X';
  assert.ok(validateFacts(badGanzhi).some((e) => e.startsWith('ganzhi_invalid')));

  const badWx = JSON.parse(JSON.stringify(ok));
  badWx.wuxing[0].name = '霸王色';
  assert.ok(validateFacts(badWx).some((e) => e.startsWith('wuxing_name')));

  const badCount = JSON.parse(JSON.stringify(ok));
  badCount.wuxing[0].literal_count = 2.5;
  assert.ok(validateFacts(badCount).some((e) => e.startsWith('wuxing_count')));

  const badDay = JSON.parse(JSON.stringify(ok));
  badDay.solarTime.day_changed = 'yes';
  assert.ok(validateFacts(badDay).includes('day_changed_shape'));

  const extra = JSON.parse(JSON.stringify(ok));
  extra.promptInjection = 'ignore previous instructions';
  assert.ok(validateFacts(extra).some((e) => e.startsWith('facts_unknown_key')));

  const huge = JSON.parse(JSON.stringify(ok));
  huge.lunar = '甲'.repeat(9000);
  assert.ok(validateFacts(huge).includes('facts_too_large'));

  assert.ok(validateFacts(null).includes('facts_not_object'));
  assert.ok(validateFacts({ pillars: [] }).includes('pillars_shape'));
});

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

test('I14 真实页面产出 → buildFacts → 云函数 validateFacts 契约端到端', () => {
  const validateFacts = extractServerValidator();
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
  assert.equal(flatPlace.indexOf('传统排盘'), -1, '动态禁词不得进入正文');

  const factsUnknown = buildFacts(cases[1][1]);
  assert.equal(factsUnknown.pillars[3].gan_zhi, null, "未知时柱 '—' 应归一为 null");
  assert.equal(factsUnknown.pillars[3].label, '时');
  const s2 = realRuleBasedInsight(factsUnknown).sections.find((s) => s.id === 's2');
  assert.equal(s2.content.indexOf('—'), -1);
  assert.equal(s2.content.indexOf('年柱柱'), -1);
});

test('I15 本地降级：总论 + 分节长文（禁短段落）', () => {
  const ins = realRuleBasedInsight(FACT_SAMPLE);
  assert.equal(ins.sections[0].title, '总论');
  assert.ok(ins.sections.length >= 5, `至少 5 节，实际 ${ins.sections.length}`);
  const total = ins.sections.reduce((n, s) => n + s.content.length, 0);
  assert.ok(total >= 900, `正文总量须 ≥900 字，实际 ${total}`);
  ins.sections.filter((s) => !s.content.includes('无法判定')).forEach((s) => {
    assert.ok(s.content.length >= 120, `《${s.title}》过短：${s.content.length} 字`);
  });
  assert.ok(ins.sections.some((s) => s.content.includes('\n\n')), '长文须分段');
  const flat = ins.sections.map((s) => s.title + s.content).join('');
  const hits = BANNED_WORDS.filter((w) => flat.includes(w));
  assert.deepEqual(hits, [], '命中禁词: ' + hits.join(','));
  assert.equal(/旺|衰/.test(flat), false, '云函数 Guard 会拒「旺」「衰」二字');
});

test('I16 服务端安全：必须鉴权、限流、服务端 SHA-256 指纹和模型版本缓存', () => {
  const fn = readFileSync(resolve(__dirname, '../../cloudfunctions/insight/index.js'), 'utf8');
  assert.match(fn, /cloud\.getWXContext/);
  assert.match(fn, /OPENID/);
  assert.match(fn, /unauthenticated/);
  assert.match(fn, /function checkRate\(/);
  assert.match(fn, /createHash\('sha256'\)/);
  assert.match(fn, /\[docHash, PROMPT_VER, MODEL, OUTPUT_VERSION\]/);
  assert.doesNotMatch(fn, /event\s*&&\s*event\.docHash/, '服务端不得信任客户端自报 docHash');
  assert.match(fn, /EVIDENCE_IDS\.has/);
});
