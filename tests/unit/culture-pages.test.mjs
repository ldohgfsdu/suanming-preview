// tests/unit/culture-pages.test.mjs — 科普两页的页面逻辑测试。
//
// 背景：culture-data.test.mjs 只覆盖数据层；页面层（onLoad 装配、搜索输入、
// 分类切换、跳转参数、分享文案）此前无任何自动化覆盖——wxml 的 bindtap 绑错方法名、
// dataset 键名写错、setData 字段与模板不一致，都只能靠真机点出来。
// 本测试在 Node 里 mock 微信运行时（Page / wx / setTimeout），直接驱动页面
// 配置对象的事件处理函数，把页面逻辑纳入门禁。
//
// 覆盖范围之外（诚实声明）：真实渲染、滚动、触摸反馈仍需微信开发者工具真机确认。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CULTURE_ENTRIES,
  CULTURE_CATEGORIES,
} from '../../miniprogram/lib/culture-data.js';

// ── 微信运行时 mock ──
// 页面文件在模块顶层调用 Page({...})，必须在 import 之前把全局铺好。
const pageConfigs = [];
let wxCalls = [];
let timeouts = [];

globalThis.wx = {
  navigateTo: (o) => wxCalls.push(['navigateTo', o]),
  redirectTo: (o) => wxCalls.push(['redirectTo', o]),
  navigateBack: (o) => wxCalls.push(['navigateBack', o]),
  showToast: (o) => wxCalls.push(['showToast', o]),
  setNavigationBarTitle: (o) => wxCalls.push(['setNavigationBarTitle', o]),
};
globalThis.Page = (cfg) => { pageConfigs.push(cfg); };

// 动态 import：页面内的相对导入（../../lib/culture-data.js）按页面文件自身路径解析。
// import 顺序即注册顺序：culture 先、culture-detail 后。
await import('../../miniprogram/pages/culture/culture.js');
await import('../../miniprogram/pages/culture-detail/culture-detail.js');

function makePage(index) {
  const cfg = pageConfigs[index];
  assert.ok(cfg, `第 ${index} 个页面配置未捕获（共 ${pageConfigs.length} 个）`);
  // 深拷贝 data，且跳过 cfg.data 本身——否则 Object.assign 会把共享的原始
  // data 盖回来，多个测试实例互相污染（CP6/CP8 的假红就是这么来的）。
  const inst = {
    data: JSON.parse(JSON.stringify(cfg.data)),
    setData(patch) { Object.assign(this.data, patch); },
  };
  for (const k of Object.keys(cfg)) {
    if (k !== 'data') inst[k] = cfg[k];
  }
  return inst;
}

const culturePage = () => makePage(0);
const detailPage = () => makePage(1);

function reset() { wxCalls = []; timeouts = []; }

// 仅在对 onLoad 的调用周围临时替换 setTimeout，避免波及 node:test 内部计时器
function withTimeoutCaptured(fn) {
  const saved = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms) => { timeouts.push({ fn: cb, ms }); return 0; };
  try { fn(); } finally { globalThis.setTimeout = saved; }
}

// ── 浏览页 ──

test('CP1 onLoad 装配全部条目并带分类名', () => {
  const p = culturePage();
  p.onLoad({});
  assert.equal(p.data.list.length, p.data.total);
  // 条目数与分类数从知识库派生，不写死：新增条目不应让页面测试变红，
  // 但仍须守住「全量装配」与「每条带分类名」这两条真不变量。
  assert.equal(p.data.total, CULTURE_ENTRIES.length);
  assert.ok(p.data.total >= 16, '知识库不应被清空');
  assert.ok(p.data.list.every((x) => x.catName && x.catName.length > 0), '每条都应带分类名');
  assert.equal(p.data.list[0].id, CULTURE_ENTRIES[0].id, '默认按知识库声明序排列');
  assert.equal(p.data.cats.length, CULTURE_CATEGORIES.length + 1, '「全部」+ 每个分类');
  assert.equal(p.data.cats[0].id, 'all');
});

test('CP2 搜索输入：命中、清空、空态', () => {
  const p = culturePage();
  p.onLoad({});
  p.onKeywordInput({ detail: { value: '五行' } });
  assert.equal(p.data.keyword, '五行');
  assert.equal(p.data.list[0].id, 'wuxing', '名称完全匹配排首位');
  p.onKeywordInput({ detail: { value: '绝对不存在的词xyz' } });
  assert.equal(p.data.list.length, 0, '无效应为空列表');
  p.onClearKeyword();
  assert.equal(p.data.keyword, '');
  assert.equal(p.data.list.length, CULTURE_ENTRIES.length, '清空后恢复全部');
  p.onKeywordInput({ detail: { value: '' } });
  assert.equal(p.data.list.length, CULTURE_ENTRIES.length, '空串输入不报错');
});

test('CP3 分类切换：单选、可叠加搜索、重复点击无效', () => {
  const p = culturePage();
  p.onLoad({});
  p.onCatTap({ currentTarget: { dataset: { id: 'terms' } } });
  assert.equal(p.data.activeCat, 'terms');
  assert.equal(p.data.list.length, 4, '节气历法分类应 4 条');
  assert.ok(p.data.list.every((x) => x.category === 'terms'));

  // 分类 + 搜索叠加
  p.onKeywordInput({ detail: { value: '节气' } });
  assert.equal(p.data.list[0].id, 'jieqi');
  assert.ok(p.data.list.every((x) => x.category === 'terms'), '分类过滤应仍然生效');

  // 重复点击同一分类：直接 return，列表不变
  const before = p.data.list.length;
  p.onCatTap({ currentTarget: { dataset: { id: 'terms' } } });
  assert.equal(p.data.list.length, before);

  // 无 id 的脏事件不应炸
  p.onCatTap({ currentTarget: { dataset: {} } });
  assert.equal(p.data.activeCat, 'terms');
});

test('CP4 跳转参数与分享', () => {
  reset();
  const p = culturePage();
  p.onLoad({});
  p.goEntry({ currentTarget: { dataset: { id: 'wuxing' } } });
  assert.deepEqual(wxCalls[0], ['navigateTo', { url: '/pages/culture-detail/culture-detail?id=wuxing' }]);

  // 缺 id 的脏事件不跳转
  reset();
  p.goEntry({ currentTarget: { dataset: {} } });
  assert.equal(wxCalls.length, 0);

  const share = p.onShareAppMessage();
  assert.ok(share.title.includes('传统文化科普'));
  assert.equal(share.path, '/pages/culture/culture');
});

// ── 详情页 ──

test('CP5 onLoad 正常条目：装配、标题、关联解析', () => {
  reset();
  const p = detailPage();
  p.onLoad({ id: 'bagua' });
  assert.equal(p.data.entry.name, '八卦');
  assert.equal(p.data.entry.catName, '八卦易学');
  assert.ok(p.data.related.length >= 4, '八卦应有多条关联');
  assert.ok(p.data.related.some((r) => r.id === 'zhouyi' && r.name === '《周易》与卦爻'));
  assert.deepEqual(wxCalls[0], ['setNavigationBarTitle', { title: '八卦' }]);
});

test('CP6 onLoad 无效 id：toast + 延时返回', () => {
  reset();
  const p = detailPage();
  withTimeoutCaptured(() => p.onLoad({ id: '__nope__' }));
  assert.equal(p.data.entry, null, '无效 id 不装配条目');
  assert.ok(wxCalls.some((c) => c[0] === 'showToast'), '应弹 toast');
  assert.equal(timeouts.length, 1, '应注册一次延时返回');
  assert.equal(timeouts[0].ms, 600);
  timeouts[0].fn(); // 手动触发回调
  assert.ok(wxCalls.some((c) => c[0] === 'navigateBack'), '回调应执行返回');

  reset();
  withTimeoutCaptured(() => p.onLoad({})); // 完全无参
  assert.equal(p.data.entry, null);
  assert.ok(wxCalls.some((c) => c[0] === 'showToast'));
});

test('CP7 关联跳转：redirectTo、自指防护、脏 id 防护', () => {
  reset();
  const p = detailPage();
  p.onLoad({ id: 'bagua' });
  reset();
  p.goRelated({ currentTarget: { dataset: { id: 'yinyang' } } });
  assert.deepEqual(wxCalls[0], ['redirectTo', { url: '/pages/culture-detail/culture-detail?id=yinyang' }], '关联跳转用 redirectTo 避免返回栈堆叠');

  reset();
  p.goRelated({ currentTarget: { dataset: { id: 'bagua' } } }); // 自指
  assert.equal(wxCalls.length, 0, '自指关联不应跳转');

  reset();
  p.goRelated({ currentTarget: { dataset: {} } }); // 无 id
  assert.equal(wxCalls.length, 0, '脏事件不应跳转');
});

test('CP8 分享：带条目名与深链', () => {
  const p = detailPage();
  p.onLoad({ id: 'jieqi' });
  const share = p.onShareAppMessage();
  assert.equal(share.title, '二十四节气 · 传统文化科普');
  assert.equal(share.path, '/pages/culture-detail/culture-detail?id=jieqi');

  // 未装配时走默认分享
  const p2 = detailPage();
  const share2 = p2.onShareAppMessage();
  assert.equal(share2.path, '/pages/culture/culture');
});

// ── WXML 绑定与页面方法的一致性 ──
// import-contract 管 JS 导入名；这里管「wxml 里绑的方法页面里真实存在」，
// 防 bindtap 绑错方法名（真机点击无声）这类静默故障。
const MINI = join(dirname(fileURLToPath(import.meta.url)), '../../miniprogram');

test('CP9 wxml 的 bind 事件在页面 JS 中均有定义', () => {
  const pairs = [
    ['pages/culture/culture.wxml', 'pages/culture/culture.js'],
    ['pages/culture-detail/culture-detail.wxml', 'pages/culture-detail/culture-detail.js'],
  ];
  for (const [wxmlRel, jsRel] of pairs) {
    const wxml = readFileSync(join(MINI, wxmlRel), 'utf8');
    const js = readFileSync(join(MINI, jsRel), 'utf8');
    const bound = new Set();
    const re = /bind(?:tap|input|confirm|change)="([A-Za-z0-9_]+)"/g;
    let m;
    while ((m = re.exec(wxml))) bound.add(m[1]);
    assert.ok(bound.size > 0, `${wxmlRel} 应至少绑定一个事件`);
    for (const name of bound) {
      assert.ok(
        new RegExp(`\\b${name}\\s*[(:]`).test(js),
        `${wxmlRel} 绑定了 ${name}，但 ${jsRel} 未定义`,
      );
    }
  }
});
