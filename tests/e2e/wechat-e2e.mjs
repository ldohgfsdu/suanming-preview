// tests/e2e/wechat-e2e.mjs — 微信开发者工具自动化终验（**不进门禁**，需要本机已登录的开发者工具）
// 手动运行：
//   npm i -D miniprogram-automator   （或设 AUTOMATOR_PATH 指向含该包的 node_modules）
//   微信开发者工具先开着项目，且「安全设置 → 服务端口 / CLI 调用」已开启
//   node tests/e2e/wechat-e2e.mjs
// 退出码：0 = 全 PASS；1 = 存在 FAIL（代码缺陷）；2 = 只有 BLOCKED（外部阻断，如模型额度 429）。
//   打印 FAIL 却返回 0 是不允许的：shell/CI 必须能据此判定失败。
// 覆盖：夏令时 GAP/FOLD、23 点日界、真太阳时跨时辰跨日、历史 v2 重新生成、
//       AI 本地降级 / 8s 超时降级 / 云端成功、分享卡→相册、深色模式配置、分享深链。
// 已知环境限制：真机性能、相册权限系统弹窗、深浅色实际切换需人工确认。
/* global wx, getApp */
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let automator;
try {
  automator = (await import('miniprogram-automator')).default;
} catch {
  const pkg = process.env.AUTOMATOR_PATH
    ? pathToFileURL(path.join(process.env.AUTOMATOR_PATH, 'miniprogram-automator', 'out', 'index.js')).href
    : null;
  try {
    automator = (await import(pkg)).default;
  } catch {
    console.error('缺少依赖 miniprogram-automator：请在仓库根目录 npm i -D miniprogram-automator，'
      + '或设置环境变量 AUTOMATOR_PATH 指向 node_modules 目录。');
    process.exit(2);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = process.env.WX_CLI_PATH
  || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const PROJECT = process.env.WX_PROJECT_PATH
  || path.resolve(__dirname, '../../miniprogram');

const results = [];
function rec(id, name, ok, detail) {
  results.push({ id, name, ok, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  :: ' + detail : ''}`);
}
// BLOCKED：不是代码缺陷，而是外部阻断（如模型额度 429、云环境不可用）。
// 规则：FAIL>0 → exit 1；只有 BLOCKED → exit 2；全 PASS → exit 0。
function recBlocked(id, name, detail) {
  results.push({ id, name, ok: false, status: 'BLOCKED', detail });
  console.log(`BLOCKED  ${id}  ${name}${detail ? '  :: ' + detail : ''}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function waitUntil(fn, ms = 10000, every = 200) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = undefined; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, every));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- connect (enable automation if needed) ----
let mp = null;
for (let i = 0; i < 3 && !mp; i++) {
  try {
    mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  } catch (e) {
    console.log('[setup] connect failed, enabling automation via cli ...');
    const { spawnSync } = await import('node:child_process');
    spawnSync(CLI, ['auto', '--project', PROJECT, '--auto-port', '9420'], { stdio: 'ignore' });
    await sleep(8000);
  }
}
if (!mp) { console.log('FATAL: cannot connect'); process.exit(2); }
console.log('[setup] connected');

// ---- dialog mocks ----
for (const m of ['showToast', 'showModal', 'showActionSheet', 'canvasToTempFilePath', 'saveImageToPhotosAlbum']) {
  try { await mp.restoreWxMethod(m); } catch { /* 可能从未 mock 过 */ }
}
await mp.evaluate(() => {
  globalThis.__e2e = { modals: [], sheets: [], toasts: [], modalConfirm: true, sheetTap: 0, cloudCalls: 0 };
  return true;
});
await mp.mockWxMethod('showToast', function (opts) {
  const g = globalThis.__e2e || (globalThis.__e2e = {});
  g.toasts = (g.toasts || []).concat([opts && opts.title]);
  if (opts && opts.success) opts.success({ errMsg: 'showToast:ok' });
  return {};
});
await mp.mockWxMethod('showModal', function (opts) {
  const g = globalThis.__e2e || (globalThis.__e2e = {});
  g.modals = (g.modals || []).concat([{ title: opts && opts.title, content: opts && opts.content }]);
  const ok = g.modalConfirm !== false;
  if (opts && opts.success) opts.success({ confirm: ok, cancel: !ok });
  if (opts && opts.complete) opts.complete({ confirm: ok, cancel: !ok });
  return { confirm: ok, cancel: !ok };
});
await mp.mockWxMethod('showActionSheet', function (opts) {
  const g = globalThis.__e2e || (globalThis.__e2e = {});
  g.sheets = (g.sheets || []).concat([opts && opts.itemList]);
  const t = g.sheetTap || 0;
  if (opts && opts.success) opts.success({ tapIndex: t, errMsg: 'showActionSheet:ok' });
  if (opts && opts.complete) opts.complete({ tapIndex: t });
  return { tapIndex: t };
});
async function e2eLog() { return (await mp.evaluate(() => globalThis.__e2e)) || {}; }
const consoleLines = [];
mp.on('console', (l) => { consoleLines.push(String(l && (l.args ? l.args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') : l.content || l.message))); });
async function clearLog() {
  await mp.evaluate(() => {
    const g = globalThis.__e2e || (globalThis.__e2e = {});
    g.modals = []; g.sheets = []; g.toasts = []; g.saves = [];
    delete g.canvas; delete g.save;
    return true;
  });
}

const LON_BJ = 116.4;

const pad2 = (n) => String(n).padStart(2, '0');
async function openIndex(fields) {
  const p = await mp.reLaunch('/pages/index/index');
  await sleep(600);
  const f = Object.assign({ calMode: 'solar', timeUnknown: false, hour: 12, minute: 0 }, fields);
  f.hourLabel = `${pad2(f.hour)}:${pad2(f.minute)}`;
  f.preciseTime = f.hourLabel;
  await p.setData(f);
  await p.setData({ lonActive: true, lonText: String(LON_BJ), placeLon: LON_BJ, placeValid: true, placeLabel: '手动经度', placeHint: '按手动经度计算真太阳时' });
  await clearLog();
  return p;
}
async function setLon(p, lon) {
  await p.setData({ lonActive: true, lonText: String(lon), placeLon: lon, placeValid: true, placeLabel: '手动经度', placeHint: 'x' });
}
async function generate(p) {
  await p.callMethod('onGenerate');
  return waitUntil(async () => {
    const cur = await mp.currentPage();
    return cur && cur.path === 'pages/result/result' ? cur : null;
  }, 15000, 300);
}
async function resultData() {
  const rp = await mp.currentPage();
  return waitUntil(async () => {
    const r = await rp.data('r');
    return r && r.solar ? r : null;
  }, 8000, 200);
}
function pillar(r, key) { const p = (r.pillars || []).find((x) => x.key === key); return p ? p.ganz : null; }

async function startInsight() {
  const rp = await mp.currentPage();
  const r0 = await waitUntil(async () => {
    const x = await rp.data('r');
    return x && x.solar ? x : null;
  }, 8000, 200);
  assert(r0, '结果页没有档案数据');
  rp.callMethod('onGenerateInsight').catch((e) => consoleLines.push('callMethod err: ' + e.message));
  return rp;
}
async function waitInsight(rp, ms = 25000) {
  return waitUntil(async () => {
    const x = await rp.data();
    return x.insightState === 'done' && !x.insightLoading ? x : null;
  }, ms, 200);
}

// ================= T1 DST GAP =================
try {
  const p = await openIndex({ solarDate: '1990-04-15', solarDateLabel: '1990-04-15', hour: 2, minute: 30 });
  await p.callMethod('onGenerate');
  await sleep(1500);
  const log = await e2eLog();
  const cur = await mp.currentPage();
  assert((log.modals || []).some((m) => m.title === '历史夏令时缺口'), '未弹出历史夏令时缺口弹窗');
  assert((log.modals || []).find((m) => m.title === '历史夏令时缺口').content.includes('02:30'), '弹窗未指明 02:30');
  assert(cur.path === 'pages/index/index', 'GAP 应阻止跳转，实际 ' + cur.path);
  rec('T1', '1986–1991 夏令时 GAP：1990-04-15 02:30 拒绝生成', true, '弹窗+停留首页');
} catch (e) { rec('T1', '1986–1991 夏令时 GAP 拒绝', false, e.message); }

// ================= T2 DST DAYLIGHT 换算 =================
try {
  const p = await openIndex({ solarDate: '1990-06-15', solarDateLabel: '1990-06-15', hour: 12, minute: 0 });
  await generate(p);
  const r = await resultData();
  const log = await e2eLog();
  assert(r.standardBjTime === '1990-06-15 11:00', 'standardBjTime=' + r.standardBjTime);
  assert(String(r.clockTimeLabel).includes('夏时制'), 'clockTimeLabel=' + r.clockTimeLabel);
  assert(String(r.dstNote).includes('1986–1991'), 'dstNote=' + r.dstNote);
  assert(r.bjTime === '12:00', 'bjTime=' + r.bjTime);
  const m = (log.modals || [])[0];
  assert(m && m.title === '时辰变更提示', '应弹时辰变更提示: ' + JSON.stringify(log.modals));
  assert(!/undefined/.test(m.content), '弹窗文案含 undefined: ' + m.content);
  assert(m.content.includes('标准北京时间：1990-06-15 11:00'), 'content=' + m.content);
  assert(m.content.includes('时柱：'), 'content=' + m.content);
  rec('T2', '夏令时生产换算：1990-06-15 12:00 → 标准北京 11:00 + 弹窗文案无 undefined', true, m.content.split('\n').pop());
} catch (e) { rec('T2', '夏令时生产换算', false, e.message); }

// ================= T3 DST FOLD earlier/later =================
try {
  const p = await openIndex({ solarDate: '1990-09-16', solarDateLabel: '1990-09-16', hour: 1, minute: 30 });
  await mp.evaluate(() => { globalThis.__e2e.sheetTap = 0; return true; });
  await p.callMethod('onGenerate');
  await sleep(400);
  const log0 = await e2eLog();
  assert((log0.sheets || []).length === 1, '应弹出 FOLD 选择器，实际 sheets=' + JSON.stringify(log0.sheets));
  assert(JSON.stringify(log0.sheets[0]).includes('第一次出现'), '选择器文案=' + JSON.stringify(log0.sheets[0]));
  await waitUntil(async () => (await mp.currentPage()).path === 'pages/result/result', 15000, 300);
  const rA = await resultData();
  const hourA = pillar(rA, 'hour');
  assert(String(rA.dstNote).includes('第一次'), 'dstNoteA=' + rA.dstNote);

  const p2 = await openIndex({ solarDate: '1990-09-16', solarDateLabel: '1990-09-16', hour: 1, minute: 30 });
  await mp.evaluate(() => { globalThis.__e2e.sheetTap = 1; return true; });
  await p2.callMethod('onGenerate');
  await sleep(400);
  await waitUntil(async () => (await mp.currentPage()).path === 'pages/result/result', 15000, 300);
  const rB = await resultData();
  const hourB = pillar(rB, 'hour');
  assert(String(rB.dstNote).includes('第二次'), 'dstNoteB=' + rB.dstNote);
  assert(rA.standardBjTime !== rB.standardBjTime, '两次选择应给出不同标准北京时间: ' + rA.standardBjTime + ' vs ' + rB.standardBjTime);
  assert(hourA !== hourB, '两次选择应给出不同时柱: ' + hourA + ' vs ' + hourB);
  rec('T3', '夏令时 FOLD：1990-09-16 01:30 需显式选第一次/第二次', true, `${rA.standardBjTime}/${hourA} vs ${rB.standardBjTime}/${hourB}`);
} catch (e) { rec('T3', '夏令时 FOLD 显式选择', false, e.message); }

// ================= T4 23点日界 =================
try {
  const p = await openIndex({ solarDate: '2023-05-04', solarDateLabel: '2023-05-04', hour: 23, minute: 0 });
  await generate(p);
  const rA = await resultData();
  const logA = await e2eLog();
  assert(pillar(rA, 'day') === '壬戌', '23:00 日柱=' + pillar(rA, 'day'));
  assert(rA.crossDay === false, '23:00@116.4 太阳钟 22:49 不应跨历日, crossDay=' + rA.crossDay);
  assert((logA.modals || []).length >= 1, '应有真太阳时校正弹窗');
  assert(!(logA.modals || []).some((m) => /undefined/.test(m.content)), '弹窗含 undefined: ' + JSON.stringify(logA.modals));
  // 基线必须等于「同一墙钟时间、不做经度修正」的 computeArchive 结果（23:00 已按子时换日进次日），
  // 校正后退回前一天，所以弹窗要同时给出具体日柱与时柱，不能只断言出现了「时柱：」。
  const mA = logA.modals[0];
  assert(mA.title === '真太阳时校正跨日', 'title=' + mA.title);
  assert(mA.content.includes('日柱：癸亥 → 壬戌'), '日柱基线错：' + mA.content);
  assert(mA.content.includes('时柱：壬子 → 辛亥'), '时柱基线错：' + mA.content);

  const p2 = await openIndex({ solarDate: '2023-05-04', solarDateLabel: '2023-05-04', hour: 23, minute: 30 });
  await generate(p2);
  const rB = await resultData();
  const logB = await e2eLog();
  assert(pillar(rB, 'day') === '癸亥', '23:30 日柱=' + pillar(rB, 'day'));
  assert(rB.solar === '2023-05-04', '出生日期应保持 2023-05-04, solar=' + rB.solar);
  // 23:30 校正后仍是子时次日，与基线一致 → 不该弹任何变更提示。
  assert((logB.modals || []).length === 0, '23:30 校正前后无差异，不应弹窗: ' + JSON.stringify(logB.modals));
  rec('T4', '23 点日界：23:00 退回前一天 / 23:30 维持次日（癸亥）', true,
    `23:00→${pillar(rA, 'day')}(弹窗含 日柱：癸亥 → 壬戌), 23:30→${pillar(rB, 'day')}(无弹窗)`);
} catch (e) { rec('T4', '23 点日界', false, e.message); }

// ================= T5 真太阳时跨时辰+跨日 =================
try {
  const p = await openIndex({ solarDate: '2023-05-04', solarDateLabel: '2023-05-04', hour: 0, minute: 30 });
  await setLon(p, 90);
  await generate(p);
  const r = await resultData();
  const log = await e2eLog();
  assert(r.crossDay === true, 'crossDay=' + r.crossDay);
  assert(r.canonDateText === '2023-05-03', 'canonDateText=' + r.canonDateText);
  assert(pillar(r, 'day') !== '甲辰', '日柱不应仍是 05-04: ' + pillar(r, 'day'));
  assert((log.modals || []).some((m) => m.title === '真太阳时校正跨日'), 'modal=' + JSON.stringify(log.modals));
  assert(!(log.modals || []).some((m) => /undefined/.test(m.content)), '弹窗含 undefined: ' + JSON.stringify(log.modals));
  // 跨日基线：同一墙钟 00:30 不做经度修正仍是 05-04 的壬戌/丙子，校正后退回 05-03。
  assert((log.modals || []).some((m) => m.content.includes('日柱：壬戌 → 辛酉')), '跨日基线错：' + JSON.stringify(log.modals));
  assert(String(r.hourLabel2).includes('真太阳时'), 'hourLabel2=' + r.hourLabel2);
  rec('T5', '真太阳时跨日：东经90° 墙钟 00:30 → 太阳钟前一日 22:30', true, `${r.canonDateText} 日柱=${pillar(r, 'day')} 时柱=${pillar(r, 'hour')}`);
} catch (e) { rec('T5', '真太阳时跨时辰/跨日', false, e.message); }

// ================= T6 历史重新生成 =================
try {
  const p = await openIndex({ solarDate: '1990-06-15', solarDateLabel: '1990-06-15', hour: 12, minute: 30 });
  await generate(p);
  await resultData();
  await mp.navigateBack();
  await sleep(500);
  const hp = await mp.navigateTo('/pages/history/history');
  await sleep(1000);
  const list = await hp.data('list');
  assert(list && list.length >= 1, '历史列表为空');
  const rec0 = list[0];
  assert(rec0.solar === '1990-06-15', '首条 solar=' + rec0.solar);
  assert(rec0.standardBjTime === '1990-06-15 11:30', '历史应保存标准北京 11:30，实际 ' + rec0.standardBjTime);
  assert(rec0.archiveInput && rec0.archiveInput.version === 2, 'archiveInput version=' + (rec0.archiveInput && rec0.archiveInput.version));
  const cards = await hp.$$('.card');
  assert(cards.length >= 1, '未找到历史卡片');
  const useBtn = await cards[0].$('.act-use');
  await useBtn.tap();
  await sleep(2500);
  const idx = await mp.currentPage();
  assert(idx.path === 'pages/index/index', 'tap 重新生成后应回首页，实际 ' + idx.path);
  const d = await idx.data();
  assert(d.solarDate === '1990-06-15', '恢复 solarDate=' + d.solarDate);
  assert(d.hour === 12 && d.minute === 30, `恢复 hour=${d.hour} minute=${d.minute}`);
  assert(d.lonActive === true && Number(d.placeLon) === 116.4, `恢复 lon=${d.placeLon} active=${d.lonActive}`);
  assert(d.calMode === 'solar', 'calMode=' + d.calMode);
  rec('T6', '历史档案 v2 快照重新生成：完整恢复日期/时刻/经度', true, `${d.solarDate} ${d.hour}:${d.minute} lon=${d.placeLon}`);
} catch (e) { rec('T6', '历史重新生成', false, e.message); }

// ================= T7 AI 本地降级（云未配置） =================
try {
  await mp.evaluate(() => { getApp().globalData.cloudEnvId = ''; return getApp().globalData.cloudEnvId; });
  const p = await openIndex({ solarDate: '2001-03-08', solarDateLabel: '2001-03-08', hour: 9, minute: 15 });
  await generate(p);
  const rp = await startInsight();
  const d = await waitInsight(rp, 12000);
  assert(d.insightModel === '本地规则', 'insightModel=' + d.insightModel);
  assert(d.insightSections.length >= 4, 'sections=' + d.insightSections.length);
  assert(d.insightLimitations.length >= 1, '缺 limitations');
  const banned = (d.insightSections || []).map((s) => s.content).join('\n');
  assert(!/(预测|排盘)/.test(banned), '正文出现禁词');
  await mp.evaluate(() => { getApp().globalData.cloudEnvId = 'cloud1-d5ggz0479e06a5688'; return 1; });
  rec('T7', 'AI 未配云时本地规则降级（有正文、无禁词）', true, `${d.insightSections.length} 节`);
} catch (e) {
  try { await mp.evaluate(() => { getApp().globalData.cloudEnvId = 'cloud1-d5ggz0479e06a5688'; return 1; }); } catch { /* 还原失败可忽略 */ }
  rec('T7', 'AI 本地规则降级', false, e.message);
}

// ================= T9 AI 云端成功（真实云函数） =================
try {
  const p = await openIndex({ solarDate: '1988-11-20', solarDateLabel: '1988-11-20', hour: 16, minute: 40 });
  await generate(p);
  const rp = await startInsight();
  const t0 = Date.now();
  const d = await waitInsight(rp, 40000);
  const ms = Date.now() - t0;
  if (d.insightModel === 'AI 生成') {
    rec('T9', 'AI 云端成功（真实云函数 + Guard）', true, `${ms}ms, ${d.insightSections.length} 节`);
  } else {
    const tail = consoleLines.filter((l) => l.includes('[insight]')).slice(-4);
    const stale = consoleLines.some((l) => l.includes('missing_doc_fields'))
      ? ' | 判定：线上云函数仍是 V4 之前版本（missing_doc_fields 已在 92f035f 移除），需重新部署 cloudfunctions/insight'
      : '';
    const quota = consoleLines.some((l) => /status code 429|model_rate_limited/.test(l))
      ? ' | 判定：模型接口 429 限流/额度耗尽，需在云开发控制台提升该模型调用额度后重测（外部阻断，非代码缺陷）'
      : '';
    const detail = `insightModel=${d.insightModel} (${ms}ms) ${tail.join(' // ')}${stale}${quota}`;
    // 429 属外部额度阻断：标 BLOCKED 而不是伪装成 PASS，也不是代码 FAIL。
    if (quota) recBlocked('T9', 'AI 云端成功（真实云函数 + Guard）', detail);
    else rec('T9', 'AI 云端成功（真实云函数 + Guard）', false, detail);
  }
} catch (e) { rec('T9', 'AI 云端成功', false, e.message); }

// ================= T8 AI 8 秒超时降级 =================
try {
  await mp.evaluate(() => {
    globalThis.__cloudSaved = wx.cloud ? wx.cloud.callFunction.bind(wx.cloud) : null;
    wx.cloud.callFunction = function (opts) {
      const g = globalThis.__e2e || (globalThis.__e2e = {});
      g.cloudCalls = (g.cloudCalls || 0) + 1;
      setTimeout(() => { if (opts && opts.fail) opts.fail({ errMsg: 'cloud.callFunction:fail mock-timeout' }); }, 10000);
      return {};
    };
    return 'installed';
  });
  const p = await openIndex({ solarDate: '1995-07-21', solarDateLabel: '1995-07-21', hour: 7, minute: 5 });
  await generate(p);
  const rp = await startInsight();
  const t0 = Date.now();
  const d = await waitInsight(rp, 25000);
  const ms = Date.now() - t0;
  const log = await e2eLog();
  assert(log.cloudCalls >= 1, '云函数未被调用');
  assert(d.insightModel === '本地规则', 'insightModel=' + d.insightModel);
  assert(d.insightSections.length >= 4, '降级正文缺失 sections=' + d.insightSections.length);
  assert(ms >= 7000 && ms <= 11000, `降级耗时 ${ms}ms 不在 8s 红线附近`);
  await mp.evaluate(() => {
    if (globalThis.__cloudSaved) wx.cloud.callFunction = globalThis.__cloudSaved;
    return 'restored';
  });
  rec('T8', 'AI 8 秒超时降级（云挂起 → 本地规则接管）', true, `${ms}ms, cloudCalls=${log.cloudCalls}`);
} catch (e) {
  try {
    await mp.evaluate(() => { if (globalThis.__cloudSaved) wx.cloud.callFunction = globalThis.__cloudSaved; return 1; });
  } catch { /* 还原失败可忽略 */ }
  rec('T8', 'AI 8 秒超时降级', false, e.message);
}

// ================= T10 分享卡保存到相册 =================
// automator 的 mockWxMethod 会剥掉 canvasToTempFilePath 的 success/fail 回调（实测 opts 只剩 canvasId），
// 所以 canvas 走真实实现，只拦 saveImageToPhotosAlbum 来确认链路真的走到了保存这一步。
try {
  await mp.restoreWxMethod('canvasToTempFilePath');
  await mp.mockWxMethod('saveImageToPhotosAlbum', function (opts) {
    const g = globalThis.__e2e || (globalThis.__e2e = {});
    g.saves = (g.saves || []).concat([opts && opts.filePath]);
    if (opts && opts.success) opts.success({ errMsg: 'saveImageToPhotosAlbum:ok' });
    return {};
  });
  const rp = await mp.currentPage();
  const hasR = await rp.data('r');
  assert(hasR && hasR.solar, '当前页无档案数据');
  await clearLog();
  await rp.callMethod('onSaveCard');
  await sleep(6000);
  const log = await e2eLog();
  assert((log.saves || []).length >= 1, 'saveImageToPhotosAlbum 未被调用（canvas 未产出 tempFilePath）: ' + JSON.stringify(log));
  assert(log.saves[0] && String(log.saves[0]).length > 4, 'filePath 非法: ' + log.saves[0]);
  assert((log.toasts || []).some((t) => String(t).includes('已保存')), 'toasts=' + JSON.stringify(log.toasts));
  await mp.restoreWxMethod('saveImageToPhotosAlbum');
  rec('T10', '分享卡链路：真实 canvas 产出 tempFilePath → saveImageToPhotosAlbum（系统相册权限需人工）', true, String(log.saves[0]));
} catch (e) {
  try { await mp.restoreWxMethod('saveImageToPhotosAlbum'); } catch { /* 还原失败可忽略 */ }
  rec('T10', '分享卡保存到相册链路', false, e.message);
}

// ================= T11 深色模式配置 =================
try {
  const appJson = JSON.parse(fs.readFileSync(path.join(PROJECT, 'app.json'), 'utf8'));
  assert(appJson.darkmode === true, 'app.json darkmode != true');
  const theme = fs.readFileSync(path.join(PROJECT, 'theme.json'), 'utf8');
  const t = JSON.parse(theme);
  assert(t.light && t.dark, 'theme.json 缺 light/dark 主题');
  assert(Object.keys(t.dark).length >= 3, 'dark 主题变量过少');
  const si = await mp.systemInfo();
  assert(typeof si.theme === 'string', 'systemInfo.theme 缺失');
  const pages = appJson.pages;
  const dirs = fs.readdirSync(PROJECT + '\\pages', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => 'pages/' + d.name + '/' + d.name);
  const missing = dirs.filter((d) => !pages.includes(d));
  assert(missing.length === 0, '页面目录未注册: ' + missing.join(','));
  rec('T11', '深色模式配置契约：darkmode + theme.json 双主题 + 页面注册（真机视觉需人工）', true, `theme=${si.theme}, vars=${Object.keys(t.dark).length}`);
} catch (e) { rec('T11', '深色模式配置契约', false, e.message); }

// ================= T12 结果页可分享 =================
try {
  const rp = await mp.currentPage();
  const share = await rp.callMethod('onShareAppMessage');
  assert(share && share.title && share.path === '/pages/index/index', JSON.stringify(share));
  assert(String(share.title).length > 4, 'share title=' + share.title);
  rec('T12', '结果页分享卡片文案与深链', true, share.title);
} catch (e) { rec('T12', '分享', false, e.message); }

console.log('\n================ SUMMARY ================');
for (const r of results) console.log(`${r.status}  ${r.id}  ${r.name}${r.detail ? '  :: ' + r.detail : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const blocked = results.filter((r) => r.status === 'BLOCKED').length;
console.log(`\n${pass}/${results.length} passed  (FAIL=${failed}, BLOCKED=${blocked})`);

await mp.disconnect();
// 退出码必须反映真实结果，否则 shell/CI 会把「打印了 FAIL」当成通过。
if (failed > 0) process.exitCode = 1;
else if (blocked > 0) process.exitCode = 2;
else process.exitCode = 0;
