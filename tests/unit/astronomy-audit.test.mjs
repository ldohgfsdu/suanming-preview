/**
 * tests/unit/astronomy-audit.test.mjs — 天文/历法事实层批量回归（Ground-Truth Audit）。
 *
 * 用途：把「事实层」与权威盘外数据（节气/朔/日干支锚点/农历春节/闰月/端午）对拍。
 *     只锁定算法推导结果；不做按日期硬编码补丁，也不复制网络 Oracle 静态结果进产品代码。
 *
 * 明示容差（非臆造）：
 *   - 节气瞬时：太阳视黄经用 Meeus 低精度（几何+光行差+近似章动），民用时间相对权威表约
 *     ±5-6 min 包络；本文件统一断言 ±8 min。
 *   - 朔时刻：Meeus 新月，与日食实测/权威朔表差 ≤约 3-4 min；本文件断言 ±6 min。
 *   - 日柱/月柱/年柱：纯干支序列，锚定 1949-10-01 = 甲子日；逐日唯一，无容差。
 *
 * 指定 Oracle 参考（任务书 / 香港天文台 2026-09 样例，北京时）：
 *   2026-09-15 → 农历八月初五、日干支 壬辰
 *   白露 2026-09-07 22:41；朔 2026-09-11 11:27；秋分 2026-09-23 08:05
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newMoonJde, computeArchive } from '../../miniprogram/lib/archive.js';
import { termJde, gregorianToJde, jdeToGregorian, solarLon } from '../../miniprogram/lib/engine.js';
import { solarLongitude } from '../../miniprogram/lib/solarlon.js';
import { solarToLunar } from '../../miniprogram/lib/lunar.js';

const TERM_TOL_MIN = 3;   // 高精度视黄经后对权威表 ≤~1-2min（原 Meeus ±8min 已升级）
const NEWMOON_TOL_MIN = 6;

/** 高精度视黄经 lon 在权威分至与时角的误差容差（度）：≤0.02° ≈ ≤1.8 分。 */
const SOLAR_LON_DEG_TOL = 0.02;

/** JDE -> 北京民用时 (UTC+8)：{y,m,d,H,M}。 */
function bjOf(jde) {
  const f = ((jde + 0.5) % 1); const fr = f < 0 ? f + 1 : f;
  let hh = fr * 24 + 8; let ds = Math.floor(hh / 24); hh -= ds * 24;
  const g = jdeToGregorian(jde + ds);
  return { y: g.y, m: g.m, d: g.d, H: Math.floor(hh), M: Math.round((hh - Math.floor(hh)) * 60) % 60 };
}
function durMin(a, b) {
  const da = gregorianToJde(a.y, a.m, a.d) + (a.H * 60 + a.M) / 1440;
  const db = gregorianToJde(b.y, b.m, b.d) + (b.H * 60 + b.M) / 1440;
  return Math.abs(da - db) * 1440;
}
function termBj(year, ord) { return bjOf(termJde(ord, year)); }
function newMoonNear(y, m, d) {
  const jdn = gregorianToJde(y, m, d);
  let k = Math.round((jdn - 2451550.09766) / 29.530588861);
  return { k, jde: newMoonJde(k) };
}
function okTerm(name, year, ord, oracle, tol) {
  const got = termBj(year, ord);
  const diff = durMin(got, oracle);
  assert.ok(diff <= tol,
    `${name}${year} diff=${diff.toFixed(1)}min，权威 ${oracle.y}-${oracle.m}-${oracle.d} ${oracle.H}:${oracle.M}，实得 ${got.y}-${got.m}-${got.d} ${got.H}:${got.M}`);
}

// ========================= 指定 Oracle（最高优先级） =========================
test('A1 2026 Oracle：日柱=壬辰、农历八月初五', () => {
  const f = computeArchive(2026, 9, 15, 12, 120);
  assert.strictEqual(f.four.day.ganz, '壬辰');
  const lu = solarToLunar(2026, 9, 15);
  assert.strictEqual(lu.month, 8);
  assert.strictEqual(lu.day, 5);
  assert.strictEqual(lu.leap, false);
});

test('A2 2026 节气 vs Oracle（±8min）：白露、秋分', () => {
  okTerm('白露', 2026, 16, { y: 2026, m: 9, d: 7, H: 22, M: 41 }, TERM_TOL_MIN);
  okTerm('秋分', 2026, 17, { y: 2026, m: 9, d: 23, H: 8, M: 5 }, TERM_TOL_MIN);
});

test('A3 2026 朔 vs Oracle（±6min）：2026-09-11 11:27', () => {
  const nm = newMoonNear(2026, 9, 11);
  const got = bjOf(nm.jde);
  const diff = durMin(got, { y: 2026, m: 9, d: 11, H: 11, M: 27 });
  assert.ok(diff <= NEWMOON_TOL_MIN, `2026-09-11 朔 diff=${diff.toFixed(1)}min，实得 ${got.y}-${got.m}-${got.d} ${got.H}:${got.M}`);
});

// ========================= 日柱/春节/闰月 锚点 =========================
test('A4 日柱锚点与关键稳定日', () => {
  // 1949-10-01 甲子（建国日，铁锚）
  assert.strictEqual(computeArchive(1949, 10, 1, 12, null).four.day.ganz, '甲子');
  assert.strictEqual(computeArchive(2000, 1, 1, 12, null).four.day.ganz, '戊午');
  assert.strictEqual(computeArchive(2026, 9, 15, 12, null).four.day.ganz, '壬辰');
});

test('A5 春节（正月初一）锚点（多文化权威日）', () => {
  const ref = { '2023-01-22': 1, '2024-02-10': 1, '2025-01-29': 1, '2026-02-17': 1, '2020-01-25': 1, '2018-02-16': 1, '2000-02-05': 1 };
  for (const [date] of Object.entries(ref)) {
    const [y, m, d] = date.split('-').map(Number);
    const lu = solarToLunar(y, m, d);
    assert.strictEqual(lu.month, 1, `${date} 应为正月初一`);
    assert.strictEqual(lu.day, 1, `${date} 应为正月初一`);
    assert.strictEqual(lu.leap, false);
  }
});

test('A6 闰月锚点：2020 闰四月 / 2023 闰二月 / 2017 闰六月', () => {
  const leap = [
    // [阳历日, 期望农历月, 期望闰?]
    [2020, 5, 23, 4, true],   // 2020 闰四月（端午 06-25 五月初五，闰四在 05-23）
    [2020, 6, 21, 5, false],  // 五月（含夏至）初一日
    [2023, 3, 22, 2, true],   // 2023 闰二月
    [2017, 7, 23, 6, true],   // 2017 闰六月初一
  ];
  for (const [y, m, d, eM, eLeap] of leap) {
    const lu = solarToLunar(y, m, d);
    assert.strictEqual(lu.month, eM, `${y}-${m}-${d} 月份`);
    assert.strictEqual(lu.leap, eLeap, `${y}-${m}-${d} 闰`);
  }
});

test('A7 端午锚点：2020 五月初五 = 2020-06-25', () => {
  const lu = solarToLunar(2020, 6, 25);
  assert.strictEqual(lu.month, 5);
  assert.strictEqual(lu.day, 5);
  assert.strictEqual(lu.leap, false);
});

// =============================== 节气 ===============================
test('A8 分至锚点（2024）±3min', () => {
  okTerm('春分', 2024, 5, { y: 2024, m: 3, d: 20, H: 11, M: 6 }, TERM_TOL_MIN);
  okTerm('秋分', 2024, 17, { y: 2024, m: 9, d: 22, H: 20, M: 44 }, TERM_TOL_MIN);
  okTerm('冬至', 2024, 23, { y: 2024, m: 12, d: 21, H: 17, M: 21 }, TERM_TOL_MIN);
});

// ================ 高精度视黄经：对权威分至直接对拍（≤0.02°，≈≤1.8min） ================
test('A17 高精度视黄经在权威分至引时 ≈0（astropixels）', () => {
  // astropixels.com 权威分至时刻（UTC，到分钟）。此刻太阳视黄经应为 0/90/180/270。
  const A = [
    [2024, 3, 20, 3, 7, 0],
    [2024, 6, 20, 20, 51, 90],
    [2024, 9, 22, 12, 44, 180],
    [2024, 12, 21, 9, 20, 270],
    [2026, 3, 20, 14, 46, 0],
    [2026, 6, 21, 8, 25, 90],
    [2026, 9, 23, 0, 6, 180],
    [2026, 12, 21, 20, 50, 270],
    [2030, 3, 20, 13, 51, 0],
    [2030, 6, 21, 7, 33, 90],
    [2030, 12, 21, 20, 9, 270],
  ];
  for (const [y, m, d, h, mi, trg] of A) {
    const jde = (Date.UTC(y, m - 1, d, h, mi)) / 86400000 + 2440587.5;
    const lon = solarLongitude(jde);
    let e = (lon - trg + 180) % 360 - 180;
    if (e > 180) e -= 360;
    if (e < -180) e += 360;
    assert.ok(Math.abs(e) <= SOLAR_LON_DEG_TOL,
      `${y}-${m}-${d} 权威分至在时刻视经应≈${trg}°，实得 ${lon.toFixed(4)}°，误差 ${e.toFixed(4)}°`);
  }
});
// engine.solarLon = 高精度（单一事实源）
test('A18 engine.solarLon 与高精度 solarlon.solarLongitude 一致', () => {
  for (const jd of [2460000, 2460390.5, 2461020]) {
    assert.ok(Math.abs(solarLon(jd) - solarLongitude(jd)) < 1e-9, `jd=${jd} 应完全一致`);
  }
});

test('A9 全年 24 节气：严格递增、落在合理月份、年一致', () => {
  let prev = -Infinity;
  for (let o = 0; o < 24; o++) {
    const jde = termJde(o, 2026);
    assert.ok(jde > prev, `节气序号 ${o} 应严格递增`);
    prev = jde;
    const g = jdeToGregorian(jde);
    assert.strictEqual(g.y, 2026);
    assert.ok(g.d >= 3 && g.d <= 24, `节气 ${o} 日 ${g.d} 超出正常窗口`);
  }
  assert.ok(true);
});

// ========================= 朔望月 = 月相 =========================
test('A10 新月时刻与日食/权威锚点 ±6min', () => {
  const anchors = [
    [2024, 4, 8, 18, 21],  // 2024-04-08 日全食新月（UTC）
    [2021, 6, 10, 10, 53], // 2021-06-10 日环食新月（UTC）
  ];
  for (const [y, m, d, H, M] of anchors) {
    const nm = newMoonNear(y, m, d);
    const gb = bjOf(nm.jde);             // 全球同一 UTC 时刻 → 北京显示 +8
    // 权威 UTC 时刻转为北京显示（当日或次日）
    const utc = { y, m, d, H, M };
    const o = { ...utc, H: utc.H + 8 };
    const dh = Math.floor(o.H / 24);
    o.H -= dh * 24;
    const ng = jdeToGregorian(gregorianToJde(utc.y, utc.m, utc.d) + dh);
    o.y = ng.y; o.m = ng.m; o.d = ng.d;
    const diff = durMin(gb, o);
    assert.ok(diff <= NEWMOON_TOL_MIN, `${y}-${m}-${d} 朔 diff=${diff.toFixed(1)}min 实得 ${gb.y}-${gb.m}-${gb.d} ${gb.H}:${gb.M}`);
  }
});

test('A11 月龄跨 0 连续（朔日回落、次日起回升）', () => {
  const nm = newMoonNear(2026, 9, 11);
  const dag = jdeToGregorian(nm.jde);
  // 朔日当月龄应很小（<1.2 天），且前一日显著更大、后一日回升。
  const a = computeArchive(dag.y, dag.m, dag.d - 1, 12, null);
  const b = computeArchive(dag.y, dag.m, dag.d, 12, null);
  const c = computeArchive(dag.y, dag.m, dag.d + 1, 12, null);
  assert.ok(b.moon.ageDays < 1.5, `朔日月龄应低于 1.5（实得 ${b.moon.ageDays}）`);
  assert.ok(b.moon.ageDays < a.moon.ageDays, '跨朔日月龄应回落');
  assert.ok(c.moon.ageDays > b.moon.ageDays, '次日月龄应回升');
});

// =========================== 真太阳时 ===========================
test('A12 无经度/无时辰 退化 + 修正量≈0 恒等', () => {
  const unknown = computeArchive(2026, 9, 15, -1, null);
  assert.strictEqual(unknown.four.hour, null);          // 不伪造时柱
  assert.strictEqual(unknown.four.day.ganz, '壬辰');  // 日柱仍在
  const withLon = computeArchive(2026, 9, 15, 12, 120);
  assert.strictEqual(withLon.trueSolar.degraded, false);
  assert.ok(Number.isFinite(withLon.trueSolar.offsetMinutes));
  // EoT≈0 日 + 经度 120：修正量 ~0，四柱与无修正路径一致
  const near0 = computeArchive(2024, 4, 14, 12, 120);
  const noCorr = computeArchive(2024, 4, 14, 12, null);
  assert.ok(Math.abs(near0.trueSolar.offsetMinutes) < 6, `EoT≈0 修正量应<6min 实得 ${near0.trueSolar.offsetMinutes}`);
  assert.strictEqual(near0.four.year.ganz, noCorr.four.year.ganz);
  assert.strictEqual(near0.four.month.ganz, noCorr.four.month.ganz);
  assert.strictEqual(near0.four.day.ganz, noCorr.four.day.ganz);
  assert.strictEqual(near0.four.hour.ganz, noCorr.four.hour.ganz);
});

test('A13 真太阳时经度敏感：东西差使修正量不同、时柱跨时辰生效', () => {
  const bj0 = computeArchive(2024, 4, 14, 12, 120);
  const xj = computeArchive(2024, 4, 14, 12, 87.6);  // 乌鲁木齐方向
  assert.ok(Math.abs(bj0.trueSolar.offsetMinutes - xj.trueSolar.offsetMinutes) > 100,
    `东西经差应 >100min（京=${bj0.trueSolar.offsetMinutes} 乌=${xj.trueSolar.offsetMinutes}）`);
});

// =========================== 边界 ===========================
test('A14 立春跨年：年柱切换由绝对出生瞬间（经度 120 精确）重判', () => {
  // 立春 2024-02-04 16:26:53（北京）：此前 → 癸卯，此后 → 甲辰
  assert.strictEqual(computeArchive(2024, 2, 4, 0, 120).four.year.ganz, '癸卯');
  assert.strictEqual(computeArchive(2024, 2, 4, 12, 120).four.year.ganz, '癸卯');
  assert.strictEqual(computeArchive(2024, 2, 4, 17, 120).four.year.ganz, '甲辰');
});

test('A15 春节/立春/冬至 跨年一致性（2020/2023/2026）', () => {
  // 四种校准日不抛错且干支两字齐——用于“多年份”烟雾
  for (const [y, m, d] of [[2020, 1, 25], [2023, 1, 22], [2023, 12, 22], [2026, 2, 17], [2026, 12, 22], [2000, 2, 5]]) {
    const f = computeArchive(y, m, d, 12, 120);
    assert.strictEqual(f.four.year.ganz.length, 2);
    assert.strictEqual(f.four.day.ganz.length, 2);
    assert.ok(f.term.next && f.term.prev, `${y}-${m}-${d} 应有前后节气`);
  }
});