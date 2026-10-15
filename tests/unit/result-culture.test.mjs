// tests/unit/result-culture.test.mjs — 档案页「就地科普」锚点的逻辑与防死链测试。
//
// 背景：档案页在四柱、农历、真太阳时、修正量、五行、节气、月相旁放了 ⓘ，
// 点击后就地展开该概念的条目摘要。这是本产品「主打科普」的落点，风险有两条：
//   1. 死链——ⓘ 指向的 id 在知识库里不存在，用户点了只会白等；
//      （本测试在写这份代码之前就抓到了真 bug：底部 chips 的 `ganzhi` 就是死链）
//   2. 状态错乱——重复点击、空/脏事件、切换条目时面板残留旧内容或该关不关。
// 两者都是静默故障（真机点一下才发现），故在此拦截。
//
// 覆盖范围之外（诚实声明）：真实渲染、点击热区大小、面板动画仍需微信开发者工具真机确认。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cultureEntryById, CULTURE_ENTRIES } from '../../miniprogram/lib/culture-data.js';

// ── 微信运行时 mock ──
// result.js 在模块顶层调用 Page({...})，且 import 的 insight.js 引用了 wx.cloud，
// 故必须在 import 之前把全局铺好。
const pageConfigs = [];
let wxCalls = [];

globalThis.wx = {
  navigateTo: (o) => wxCalls.push(['navigateTo', o]),
  redirectTo: (o) => wxCalls.push(['redirectTo', o]),
  navigateBack: () => wxCalls.push(['navigateBack', {}]),
  showToast: (o) => wxCalls.push(['showToast', o]),
  showModal: (o) => wxCalls.push(['showModal', o]),
  setNavigationBarTitle: (o) => wxCalls.push(['setNavigationBarTitle', o]),
  cloud: undefined,
};
globalThis.getApp = () => ({ globalData: {} });
globalThis.Page = (cfg) => { pageConfigs.push(cfg); };

await import('../../miniprogram/pages/result/result.js');

function resultPage() {
  const cfg = pageConfigs[0];
  assert.ok(cfg, 'result 页面配置未捕获');
  const inst = {
    data: JSON.parse(JSON.stringify(cfg.data)),
    setData(patch) { Object.assign(this.data, patch); },
  };
  for (const k of Object.keys(cfg)) if (k !== 'data') inst[k] = cfg[k];
  return inst;
}

function tap(id) {
  return { currentTarget: { dataset: id === undefined ? {} : { id } } };
}

const MINI = join(dirname(fileURLToPath(import.meta.url)), '../../miniprogram');

// ── 就地展开 / 收起 ──

test('RC1 ⓘ 点击展开条目摘要：装配 id / 名称 / 定义', () => {
  const p = resultPage();
  assert.equal(p.data.cultureOpenId, '', '初始应为收起态');
  assert.equal(p.data.cultureOpen, null);

  p.onCultureInfo(tap('zhensunshi'));
  assert.equal(p.data.cultureOpenId, 'zhensunshi');
  assert.equal(p.data.cultureOpen.name, '真太阳时');
  assert.ok(p.data.cultureOpen.definition.length > 20, '面板应带条目定义正文');
  const src = cultureEntryById('zhensunshi');
  assert.equal(p.data.cultureOpen.definition, src.definition, '面板内容应与知识库同源，不可现编');
  assert.equal(p.data.cultureOpen.glyph, src.glyph);
});

test('RC2 再次点击同一条目：收起（面板与开关必须同步复位）', () => {
  const p = resultPage();
  p.onCultureInfo(tap('jieqi'));
  assert.equal(p.data.cultureOpenId, 'jieqi');
  p.onCultureInfo(tap('jieqi'));
  assert.equal(p.data.cultureOpenId, '', '重复点击应收起');
  assert.equal(p.data.cultureOpen, null, '收起时不得残留旧内容（否则会串台到下一个条目）');
});

test('RC3 切换条目：旧内容必须整体替换，不残留', () => {
  const p = resultPage();
  p.onCultureInfo(tap('wuxing'));
  const first = p.data.cultureOpen.definition;
  p.onCultureInfo(tap('nongli'));
  assert.equal(p.data.cultureOpenId, 'nongli');
  assert.equal(p.data.cultureOpen.name, '农历（阴阳合历）');
  assert.notEqual(p.data.cultureOpen.definition, first, '不应残留上一个条目的正文');
});

test('RC4 脏事件与死链：静默忽略，不开面板也不跳转', () => {
  const p = resultPage();
  wxCalls = [];

  p.onCultureInfo(tap(undefined));
  p.onCultureInfo({});
  p.onCultureInfo({ currentTarget: {} });
  p.onCultureInfo(tap('__nope__'));
  p.onCultureInfo(tap('ganzhi')); // 曾经存在的死链：知识库里无此 id
  assert.equal(p.data.cultureOpenId, '', '无效 id 不应打开面板');
  assert.equal(p.data.cultureOpen, null);
  assert.equal(wxCalls.length, 0, '就地科普不应触发任何页面跳转');
});

test('RC5 面板内「读完整科普」才跳转，且携带当前条目 id', () => {
  wxCalls = [];
  const p = resultPage();
  p.onCultureInfo(tap('junshicha'));
  p.goCultureEntry(tap(p.data.cultureOpen.id));
  assert.deepEqual(wxCalls[0], [
    'navigateTo',
    { url: '/pages/culture-detail/culture-detail?id=junshicha' },
  ]);
  wxCalls = [];
  p.goCultureEntry(tap(undefined));
  assert.equal(wxCalls.length, 0, '缺 id 不应跳转');
});

// ── WXML 锚点与知识库的一致性（防死链的主防线）──

/** 取出所有 ⓘ 锚点的 data-id：<text class="info" ...> 内须同时带 data-id 与 onCultureInfo */
function infoAnchors(wxml) {
  const tags = [...wxml.matchAll(/<text[^>]*class="info"[^>]*>/g)].map((m) => m[0]);
  return tags
    .filter((t) => t.includes('bindtap="onCultureInfo"'))
    .map((t) => (t.match(/data-id="([^"]+)"/) || [])[1])
    .filter(Boolean);
}

/** 取出所有就地面板的守卫条件 cultureOpenId === 'x' */
function inlinePanels(wxml) {
  return [...wxml.matchAll(/wx:if="\{\{cultureOpenId === '([^']+)'\}\}"/g)].map((m) => m[1]);
}

test('RC6 档案页所有科普锚点的 data-id 都能解析到条目', () => {
  const wxml = readFileSync(join(MINI, 'pages/result/result.wxml'), 'utf8');
  const ids = infoAnchors(wxml);
  assert.ok(ids.length >= 5, `档案页应有若干 ⓘ 锚点，实测 ${ids.length} 个`);
  for (const id of ids) {
    assert.ok(cultureEntryById(id), `ⓘ 指向了不存在的条目：${id}`);
  }
  // 这些正是档案里「看得到却没解释」的数字/名词，锚点必须落在它们上面
  for (const must of ['zhensunshi', 'wuxing', 'jieqi', 'nongli']) {
    assert.ok(ids.includes(must), `档案主展示项缺少科普锚点：${must}`);
  }
});

test('RC7 底部 chips 全部可达（回归：曾有 ganzhi 死链）', () => {
  const p = resultPage();
  assert.ok(p.data.cultureLinks.length >= 8);
  for (const link of p.data.cultureLinks) {
    const entry = cultureEntryById(link.id);
    assert.ok(entry, `chip 指向了不存在的条目：${link.id}`);
    // chip 用短标签（如「农历」而条目名是「农历（阴阳合历）」），
    // 但短标签必须是该条目可被检索到的文本，否则科普页里搜不到它。
    assert.ok(link.name && link.name.length <= 8, `chip 名称应简短：${link.id} → ${link.name}`);
    const haystack = [entry.name, entry.summary, ...(entry.keywords || [])].join(' ');
    assert.ok(haystack.includes(link.name), `chip「${link.name}」与条目 ${link.id} 对不上`);
  }
});

test('RC8 面板开关与 wxml 的 wx:if 一一对应（改模板别忘了改逻辑）', () => {
  const wxml = readFileSync(join(MINI, 'pages/result/result.wxml'), 'utf8');
  const guarded = inlinePanels(wxml);
  const anchors = infoAnchors(wxml);
  assert.ok(guarded.length > 0, '应至少有一处就地面板');
  for (const id of guarded) {
    assert.ok(anchors.includes(id), `面板 ${id} 没有对应的 ⓘ 入口，用户永远打不开`);
    assert.ok(cultureEntryById(id), `面板 ${id} 没有对应条目`);
  }
  for (const id of anchors) {
    assert.ok(guarded.includes(id), `ⓘ ${id} 缺少就地面板，点了没反应`);
  }
  assert.equal(new Set(guarded).size, guarded.length, '同一概念不应出现重复面板');
});

test('RC9 新增时制条目内容与引擎口径一致（防知识库与算法各说各话）', () => {
  const zs = cultureEntryById('zhensunshi');
  const js = cultureEntryById('junshicha');

  // 换算式必须与 lib/archive.js 的 trueSolarToLocal 一致
  const src = readFileSync(join(MINI, 'lib/archive.js'), 'utf8');
  assert.match(src, /eotMinutes\(gregorianToJde\([a-z, ]+\)\) \+ 4 \* \(lonDeg - 120\)/,
    '引擎换算式已变，科普文案需同步复核');
  const formula = zs.attrs.find((a) => a.k === '换算公式').v;
  assert.ok(formula.includes('4 × (当地经度 − 120°)'), `换算式表述与引擎不符：${formula}`);
  assert.ok(formula.includes('均时差'), '换算式应显式包含均时差项');

  // 均时差极值不得与引擎实际计算结果脱节
  const eot = zs.attrs.find((a) => a.k === '均时差').v;
  assert.match(eot, /−14\.3 分/, `均时差量级表述应与引擎一致：${eot}`);
  assert.match(eot, /\+16\.4 分/, `均时差量级表述应与引擎一致：${eot}`);

  // 类别归属：时制条目应归到「时制与校时」
  const catIds = new Set(['zhensunshi', 'junshicha', 'xiading-shi']);
  const clockEntries = CULTURE_ENTRIES.filter((e) => catIds.has(e.id));
  assert.equal(clockEntries.length, 3);
  assert.ok(clockEntries.every((e) => e.category === 'clock'), '时制条目应统一归入 clock 分类');

  // 均时差条目必须说清它是什么：与平太阳时之差
  assert.ok(js.definition.includes('平太阳时'), '均时差定义应交代与平太阳时的关系');
  const min = js.attrs.find((a) => a.k === '最小值');
  const max = js.attrs.find((a) => a.k === '最大值');
  assert.ok(min && max, '均时差条目应给出最小/最大值');
  assert.ok(/−14\.3/.test(min.v) && /\+16\.4/.test(max.v), '极值表述应与引擎口径一致');
});