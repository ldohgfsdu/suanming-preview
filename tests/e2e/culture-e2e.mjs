// tests/e2e/culture-e2e.mjs — 传统文化科普两页的开发者工具真机终验（**不进门禁**）。
//
// 手动运行：
//   npm i -D miniprogram-automator
//   微信开发者工具先开着项目，且「安全设置 → 服务端口 / CLI 调用」已开启
//   node tests/e2e/culture-e2e.mjs
//
// 与 wechat-e2e.mjs 的分工：那个覆盖档案主线（夏令时/日界/真太阳时/AI/分享卡），
// 本文件只覆盖科普模块（culture / culture-detail），全部走真实渲染：
// 真实输入检索、真实点击卡片与分类、真实页面跳转与返回栈，不靠 setData 造假状态。
//
// 退出码：0 = 全 PASS；1 = 存在 FAIL；2 = 外部阻断（连不上开发者工具）。
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let automator;
try {
  automator = (await import('miniprogram-automator')).default;
} catch {
  const pkg = process.env.AUTOMATOR_PATH
    ? new URL(join(process.env.AUTOMATOR_PATH, 'miniprogram-automator', 'out', 'index.js').href).href
    : null;
  try {
    automator = (await import(pkg)).default;
  } catch {
    console.error('缺少依赖 miniprogram-automator：npm i -D miniprogram-automator');
    process.exit(2);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CLI = process.env.WX_CLI_PATH
  || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const PROJECT = process.env.WX_PROJECT_PATH
  || path.resolve(__dirname, '../../miniprogram');

// ws 端口发现：自动化 ws 端口由 `cli auto --auto-port <P>` 绑定（P 在启动时指定），
// automator 连 ws://127.0.0.1:P 即可驱动（2026-10-15 实证）。优先级：环境变量
// WX_WS_PORT > 桥接结果 .tmp-bridge-result.json（历史机制，bridge-ide.mjs 写入）> 默认 9420。
// 注意：P 不能与 IDE HTTP 端口（本机 9420）相同——同端口时 ws 升级会被 HTTP 服务 404 拒绝。
// 另：App.* 等应用层 RPC 需等 appservice 注入 WAAutoService.js 发出 App.initialized
// （页面真实渲染后才发），编译错误的页面会让自动化全体超时（如 once today.wxml 乱码事故）。
import fs from 'node:fs';
function resolveWsPort() {
  if (process.env.WX_WS_PORT) return String(process.env.WX_WS_PORT);
  try {
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp-bridge-result.json'), 'utf8'));
    if (r && r.wsPort) return String(r.wsPort);
  } catch { /* 无桥接结果则走默认端口 */ }
  return '9420';
}
const WS_PORT = resolveWsPort();

// 期望值从知识库数据源现算，避免手写条数随知识库扩张而陈旧（16→19 已踩过一次）。
import { pathToFileURL } from 'node:url';
const { CULTURE_ENTRIES, CULTURE_CATEGORIES, cultureSearch } = await import(
  pathToFileURL(path.join(ROOT, 'miniprogram/lib/culture-data.js')).href
);
const TOTAL = CULTURE_ENTRIES.length;
const HIT_CHUNFEN = cultureSearch('春分').length;
const TERMS = CULTURE_ENTRIES.filter((e) => e.category === 'terms').length;
const CAT_CHIPS = CULTURE_CATEGORIES.length + 1; // 「全部」+ 各分类

const results = [];
function rec(id, name, ok, detail) {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  :: ' + detail : ''}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function waitUntil(fn, ms = 10000, every = 200) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = undefined; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, every));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- connect ----
// 注意 1：Node 18.20.2+ 的 BatBadBut 修复（CVE-2024-27980）后，spawnSync 直接调
// .bat/.cmd 会 EINVAL 静默失败，必须 shell:true 走整条命令行（路径带空格需自加引号）。
// 注意 2：cli auto 在 IDE 未运行时会尝试拉起 IDE，其启动流程调用 reg.exe；
// 若本机安全策略把 reg.exe 列入 Program Blacklist（沙箱内外均生效），
// IDE 起不来、9420 端口不会开放，此处只能拿到 BLOCKED。解锁办法二选一：
//   a. 主人手动启动开发者工具并打开本项目，「设置 → 安全设置 → 服务端口」开启；
//   b. 在 Security Center → Command Security → Program Blacklist 移除 reg.exe。
let mp = null;
for (let i = 0; i < 3 && !mp; i++) {
  try {
    mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${WS_PORT}` });
  } catch {
    console.log(`[setup] connect ws://127.0.0.1:${WS_PORT} failed, enabling automation via cli ...`);
    const { spawnSync } = await import('node:child_process');
    const cmd = `"${CLI}" auto --project "${PROJECT}" --auto-port ${WS_PORT}`;
    spawnSync(cmd, { stdio: 'ignore', shell: true, timeout: 30000 });
    await sleep(8000);
  }
}
if (!mp) { console.log('FATAL: cannot connect'); process.exit(2); }
console.log('[setup] connected');

// ---- toast mock（记录弹窗，供无效 id 用例断言）----
for (const m of ['showToast', 'showModal', 'showActionSheet']) {
  try { await mp.restoreWxMethod(m); } catch { /* 可能从未 mock 过 */ }
}
await mp.evaluate(() => {
  globalThis.__e2e = { toasts: [] };
  return true;
});
await mp.mockWxMethod('showToast', function (opts) {
  const g = globalThis.__e2e || (globalThis.__e2e = {});
  g.toasts = (g.toasts || []).concat([opts && opts.title]);
  if (opts && opts.success) opts.success({ errMsg: 'showToast:ok' });
  return {};
});
async function toasts() { return ((await mp.evaluate(() => globalThis.__e2e)) || {}).toasts || []; }

// ================= T1 真实渲染：科普库首页 =================
try {
  const p = await mp.reLaunch('/pages/culture/culture');
  await sleep(800);
  assert(p && p.path === 'pages/culture/culture', 'path=' + (p && p.path));

  // 数据层
  const list = await p.data('list');
  assert(Array.isArray(list) && list.length === TOTAL, 'list.length=' + (list && list.length));
  assert(list[0].id === 'yinyang', '首条应为阴阳，实际 ' + (list[0] && list[0].id));
  assert(list.every((x) => x.catName), '每条都应带分类名');

  // 真实 DOM 渲染
  const names = await p.$$('.card-name');
  assert(names && names.length === TOTAL, 'DOM 卡片数=' + (names && names.length));
  const first = await names[0].text();
  assert(first.trim() === '阴阳', '首卡片名=' + first);
  const summaries = await p.$$('.card-summary');
  assert(summaries && summaries.length === TOTAL, '摘要数=' + (summaries && summaries.length));
  const intro = await p.$('.intro-sub');
  assert(intro && (await intro.text()).includes(TOTAL + ' 条'), '页首计数缺失');
  const cats = await p.$$('.cat');
  assert(cats && cats.length === CAT_CHIPS, '分类 chip 数=' + (cats && cats.length));
  const onCls = await cats[0].attribute('class');
  assert(onCls.includes('on'), '「全部」chip 应默认选中，class=' + onCls);

  rec('T1', `科普库首页真实渲染：${TOTAL} 卡片 + ${CAT_CHIPS} 分类 chips + 计数`, true);
} catch (e) { rec('T1', '科普库首页真实渲染', false, e.message); }

// ================= T2 真实输入检索 =================
try {
  const p = await mp.reLaunch('/pages/culture/culture');
  await sleep(800);

  // 真实键入（走 bindinput → onKeywordInput → cultureSearch 全链路）
  const input = await p.$('input');
  assert(input && typeof input.input === 'function', '未拿到可输入元素');
  await input.input('春分');
  await waitUntil(async () => (await p.data('list')).length === HIT_CHUNFEN, 5000);
  let list = await p.data('list');
  assert(list[0].id === 'jieqi', '「春分」首条应为二十四节气，实际 ' + list[0].id);
  const cnt = await p.$('.count');
  assert((await cnt.text()).includes(String(HIT_CHUNFEN)), `结果计数应显示 ${HIT_CHUNFEN} 条`);

  // 清空按钮（真实点击）
  const clear = await p.$('.search-clear');
  assert(clear, '清空按钮应出现');
  await clear.tap();
  await waitUntil(async () => (await p.data('list')).length === TOTAL, 5000);

  // 无结果空态
  await (await p.$('input')).input('绝对不存在的词xyz');
  await waitUntil(async () => (await p.data('list')).length === 0, 5000);
  const empty = await p.$('.empty-text');
  assert(empty && (await empty.text()).includes('没有找到'), '空态文案缺失');

  rec('T2', '真实输入检索：命中/计数/清空/空态', true);
} catch (e) { rec('T2', '真实输入检索', false, e.message); }

// ================= T3 真实点击分类筛选 =================
try {
  const p = await mp.reLaunch('/pages/culture/culture');
  await sleep(800);
  const cats = await p.$$('.cat');
  // 按文案找 chip，避免分类增减导致的下标漂移
  let termsChip = null;
  for (const c of cats) { if ((await c.text()).trim() === '节气历法') { termsChip = c; break; } }
  assert(termsChip, '应存在「节气历法」chip');
  await termsChip.tap();
  await waitUntil(async () => (await p.data('activeCat')) === 'terms', 5000);
  const list = await p.data('list');
  assert(list.length === TERMS, `节气历法应 ${TERMS} 条，实际 ` + list.length);
  assert(list.every((x) => x.category === 'terms'), '筛选后仍有异类条目');
  const active = await p.$$('.cat.on');
  assert(active && active.length === 1, '选中 chip 应唯一，实际 ' + (active && active.length));
  const names = await p.$$('.card-name');
  assert(names && names.length === TERMS, `DOM 应同步为 ${TERMS} 张卡片`);

  rec('T3', '真实点击分类筛选：数据与 DOM 同步、选中态唯一', true);
} catch (e) { rec('T3', '真实点击分类筛选', false, e.message); }

// ================= T4 真实点击进入详情 =================
try {
  const p = await mp.reLaunch('/pages/culture/culture');
  await sleep(800);
  const cards = await p.$$('.card');
  await cards[0].tap(); // 阴阳
  const d = await waitUntil(async () => {
    const cur = await mp.currentPage();
    return cur && cur.path === 'pages/culture-detail/culture-detail' ? cur : null;
  }, 8000, 200);

  const entry = await d.data('entry');
  assert(entry && entry.name === '阴阳', 'entry.name=' + (entry && entry.name));
  assert(entry.catName === '基础概念', 'entry.catName=' + entry.catName);
  assert(entry.definition && entry.definition.length > 20, '定义缺失');
  const related = await d.data('related');
  assert(related && related.length >= 4, '关联数=' + (related && related.length));

  // 详情页真实 DOM
  const hero = await d.$('.hero-name');
  assert(hero && (await hero.text()).trim() === '阴阳', 'hero 名=' + (hero && await hero.text()));
  const titles = await d.$$('.card-title');
  assert(titles && titles.length >= 2, '卡片标题数=' + (titles && titles.length));
  const firstTitle = await titles[0].text();
  assert(firstTitle.trim() === '概念定义', '首个卡片应为概念定义，实际 ' + firstTitle);
  const rels = await d.$$('.rel');
  assert(rels && rels.length === related.length, '关联 DOM 数与数据不一致');

  // 分享回调（真实运行时调用）
  const share = await d.callMethod('onShareAppMessage');
  assert(share && share.title.includes('阴阳') && share.path.includes('id=yinyang'), '分享回调异常');

  rec('T4', '真实点击进入详情：装配/DOM/关联/分享', true);
} catch (e) { rec('T4', '真实点击进入详情', false, e.message); }

// ================= T5 关联概念跳转与返回栈 =================
try {
  const p = await mp.reLaunch('/pages/culture/culture');
  await sleep(800);
  await (await p.$$('.card'))[0].tap(); // 阴阳
  const d = await waitUntil(async () => {
    const cur = await mp.currentPage();
    return cur && cur.path === 'pages/culture-detail/culture-detail' ? cur : null;
  }, 8000, 200);

  const stackBefore = (await mp.pageStack()).length;
  const rels = await d.$$('.rel');
  await rels[0].tap(); // 阴阳 → 太极（redirectTo）
  // redirectTo 会销毁并重建页面实例：旧 Page 对象的 data() 停留在旧条目，
  // 必须重新通过 currentPage() 取新实例再断言（此处踩过 waitUntil 超时）。
  const d2 = await waitUntil(async () => {
    const cur = await mp.currentPage();
    if (!cur || cur.path !== 'pages/culture-detail/culture-detail') return null;
    const e = await cur.data('entry');
    return e && e.name === '太极' ? cur : null;
  }, 8000, 200);
  const stackAfter = (await mp.pageStack()).length;
  assert(stackAfter === stackBefore, `redirectTo 不应增长返回栈：${stackBefore} → ${stackAfter}`);
  const hero = await d2.$('.hero-name');
  assert((await hero.text()).trim() === '太极', '跳转后标题应为太极');

  // 返回到科普库
  await mp.navigateBack();
  await waitUntil(async () => (await mp.currentPage()).path === 'pages/culture/culture', 5000);
  const list = await (await mp.currentPage()).data('list');
  assert(list && list.length === TOTAL, `返回后列表应保持 ${TOTAL} 条`);

  rec('T5', '关联概念 redirectTo 跳转 + 返回栈不增长 + 返回列表', true);
} catch (e) { rec('T5', '关联概念跳转与返回栈', false, e.message); }

// ================= T6 无效 id 深链兜底 =================
try {
  const d = await mp.reLaunch('/pages/culture-detail/culture-detail?id=__nope__');
  await sleep(1500);
  const t = await toasts();
  assert(t.some((x) => x === '条目不存在'), '应提示条目不存在，实际 ' + JSON.stringify(t));
  const entry = await d.data('entry');
  assert(!entry, '无效 id 不应装配条目');
  // 页面未崩溃：仍在详情页路由，无未捕获异常导致白屏
  const cur = await mp.currentPage();
  assert(cur && cur.path === 'pages/culture-detail/culture-detail', '页面应保持不崩溃');

  rec('T6', '无效 id 深链：toast 兜底且不崩溃', true);
} catch (e) { rec('T6', '无效 id 深链兜底', false, e.message); }

// ---- 汇总 ----
const fails = results.filter((r) => !r.ok).length;
console.log(`\n[culture-e2e] ${results.length - fails}/${results.length} PASS`);
if (fails > 0) process.exit(1);
await mp.disconnect();
process.exit(0);
