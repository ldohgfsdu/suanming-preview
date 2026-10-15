// tests/unit/today-culture.test.mjs — 今日天时页「就地科普」锚点测试。
//
// 该页与档案页共用 lib/culture-data.js 的 cultureToggle 开关语义（CD11 已测纯函数），
// 此处只测页面接线：锚点 event → setData 面板、面板内的深链跳转、以及
// wxml 里每个 data-id 都必须能解析到知识库条目（防死链，回归自 ganzhi 事故）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cultureEntryById } from '../../miniprogram/lib/culture-data.js';

// ── 微信运行时 mock（今日天时页定时器只在 onShow 启动，测试不触发） ──
const pageConfigs = [];
let wxCalls = [];

globalThis.wx = {
  navigateTo: (o) => wxCalls.push(['navigateTo', o]),
  navigateBack: (o) => wxCalls.push(['navigateBack', o]),
  stopPullDownRefresh: () => {},
  setStorageSync: () => {},
  getStorageSync: () => '',
};
globalThis.getCurrentPages = () => [];
globalThis.Page = (cfg) => { pageConfigs.push(cfg); };

await import('../../miniprogram/pages/today/today.js');

function todayPage() {
  const cfg = pageConfigs[0];
  assert.ok(cfg, 'today 页面配置未捕获');
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
const WXML = join(MINI, 'pages/today/today.wxml');

function infoAnchors(wxml) {
  const tags = [...wxml.matchAll(/<text[^>]*class="info"[^>]*>/g)].map((m) => m[0]);
  return tags
    .filter((t) => t.includes('bindtap="onCultureInfo"'))
    .map((t) => (t.match(/data-id="([^"]+)"/) || [])[1])
    .filter(Boolean);
}

test('TC1 ⓘ 展开 / 收起 / 切换，与档案页语义一致', () => {
  const p = todayPage();
  assert.equal(p.data.cultureOpenId, '', '初始应为收起态');

  p.onCultureInfo(tap('jieqi'));
  assert.equal(p.data.cultureOpenId, 'jieqi');
  assert.equal(p.data.cultureOpen.definition, cultureEntryById('jieqi').definition);

  p.onCultureInfo(tap('jieqi'));
  assert.equal(p.data.cultureOpenId, '', '重复点击应收起');
  assert.equal(p.data.cultureOpen, null);

  p.onCultureInfo(tap('ganzhi-nian'));
  p.onCultureInfo(tap('shichen'));
  assert.equal(p.data.cultureOpenId, 'shichen', '切换应替换为新条目');
  assert.equal(p.data.cultureOpen.name, '十二时辰');
});

test('TC2 脏事件与死链：静默忽略，不跳转', () => {
  const p = todayPage();
  wxCalls = [];
  p.onCultureInfo(tap(undefined));
  p.onCultureInfo({});
  p.onCultureInfo(tap('ganzhi'));
  p.onCultureInfo(tap('__nope__'));
  assert.equal(p.data.cultureOpenId, '');
  assert.equal(p.data.cultureOpen, null);
  assert.equal(wxCalls.length, 0);
});

test('TC3 面板深链：goCultureEntry 携带条目 id', () => {
  wxCalls = [];
  const p = todayPage();
  p.onCultureInfo(tap('shuowang-yue'));
  p.goCultureEntry(tap(p.data.cultureOpen.id));
  assert.deepEqual(wxCalls[0], [
    'navigateTo',
    { url: '/pages/culture-detail/culture-detail?id=shuowang-yue' },
  ]);
  wxCalls = [];
  p.goCultureEntry(tap(undefined));
  assert.equal(wxCalls.length, 0);
});

test('TC4 今日天时页所有 ⓘ 锚点可解析，且覆盖本页主展示概念', () => {
  const wxml = readFileSync(WXML, 'utf8');
  const ids = infoAnchors(wxml);
  assert.ok(ids.length >= 5, `今日天时页应有若干 ⓘ 锚点，实测 ${ids.length}`);
  for (const id of ids) assert.ok(cultureEntryById(id), `ⓘ 指向不存在的条目：${id}`);
  for (const must of ['ganzhi-nian', 'jieqi', 'shuowang-yue', 'shichen']) {
    assert.ok(ids.includes(must), `本页主展示概念缺少锚点：${must}`);
  }
});

test('TC5 锚点与面板一一对应，深链目标齐全', () => {
  const wxml = readFileSync(WXML, 'utf8');
  const anchors = infoAnchors(wxml);
  const guarded = [...wxml.matchAll(/wx:if="\{\{cultureOpenId === '([^']+)'\}\}"/g)].map((m) => m[1]);
  const more = [...wxml.matchAll(/catchtap="goCultureEntry"/g)];
  assert.ok(guarded.length > 0);
  for (const id of guarded) {
    assert.ok(anchors.includes(id), `面板 ${id} 没有对应 ⓘ 入口`);
    assert.ok(anchors.includes(id) && cultureEntryById(id), `面板 ${id} 无条目`);
  }
  for (const id of anchors) assert.ok(guarded.includes(id), `ⓘ ${id} 缺少面板`);
  assert.equal(new Set(guarded).size, guarded.length, '同一概念不应重复出现面板');
  assert.equal(more.length, guarded.length, '每个面板都应带「读完整科普」深链');
});