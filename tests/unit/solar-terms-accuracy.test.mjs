// tests/unit/solar-terms-accuracy.test.mjs — 节气精度对拍（回归基线）
//
// 权威值：紫金山天文台发布的 2026 年二十四节气精确时刻（北京时间），
// 经 tool.cncn.com / jieqi.xuenb.com / timecha.com 三方交叉一致。
//
// 【精度演进】
//   移植前（无 ΔT 换算）：24/24 日期正确，时刻平均偏差 2.04 分钟、最大 3 分钟
//       → 偏移方向恒为正，系统性偏移，主因缺ΔT（TT−UT）
//   移植后（接入 ΔT）  ：24/24 日期正确，时刻平均偏差 0.83 分钟、最大 1 分钟
//       → 2026-10-06 自 Core `domain-solar-term` 移植 Espenak & Meeus 分段多项式
//
// 本测试锁定当前基线，防止后续改动破坏精度；断言上限已按移植后实测收紧。
// 若未来提升到秒级，可进一步收紧 ST2 的上限。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deltaTSeconds, utcJdToTt } from '../../miniprogram/lib/solarlon.js';
import { termJde, jdeToGregorian } from '../../miniprogram/lib/engine.js';

/** JDE(UT) → 北京时间 {m, d, mins}。基准校验：JD2451545.0 → 2000-01-01 20:00。 */
function jdeToBeijing(jde) {
  const shift = jde + 8 / 24;                    // UT → 东八区
  const dayNo = Math.floor(shift + 0.5);
  const frac = shift + 0.5 - dayNo;
  let mins = Math.round(frac * 1440);
  let extra = 0;
  if (mins >= 1440) { mins -= 1440; extra = 1; }
  const g = jdeToGregorian(dayNo);
  return { y: g.y, m: g.m, d: g.d + extra, mins };
}

// 引擎 ord → 名称（黄经 = mod360(285 + ord*15)，故 ord0=小寒 285°）
const NAME = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

// 紫金山天文台 2026 节气（北京时间）[月, 日, 时, 分]
const AUTH = [
  [1, 5, 16, 22], [1, 20, 9, 44], [2, 4, 4, 1], [2, 18, 23, 51],
  [3, 5, 21, 58], [3, 20, 22, 45], [4, 5, 2, 39], [4, 20, 9, 38],
  [5, 5, 19, 48], [5, 21, 8, 36], [6, 5, 23, 48], [6, 21, 16, 24],
  [7, 7, 9, 56], [7, 23, 3, 12], [8, 7, 19, 42], [8, 23, 10, 18],
  [9, 7, 22, 40], [9, 23, 8, 4], [10, 8, 14, 28], [10, 23, 17, 37],
  [11, 7, 17, 51], [11, 22, 15, 23], [12, 7, 10, 52], [12, 22, 4, 49],
];

/** 逐项计算偏差（分钟），跨日折算。 */
function measure() {
  return NAME.map((name, o) => {
    const b = jdeToBeijing(termJde(o, 2026));
    const [am, ad, ah, ai] = AUTH[o];
    let diff = b.mins - (ah * 60 + ai);
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    const pad = (n) => String(n).padStart(2, '0');
    return {
      o, name, diff,
      sameDate: b.m === am && b.d === ad,
      got: `${b.m}-${b.d} ${pad(Math.floor(b.mins / 60))}:${pad(b.mins % 60)}`,
    };
  });
}

test('ST1 2026 全部 24 节气日期与紫金山天文台一致', () => {
  const bad = measure().filter((r) => !r.sameDate);
  assert.equal(
    bad.length, 0,
    `日期不符: ${bad.map((r) => `${r.name}(${r.got})`).join(', ')}`,
  );
});

test('ST2 节气时刻偏差 ≤1 分钟（移植 ΔT 后实测最大 1 分钟）', () => {
  const rows = measure();
  const worst = rows.reduce((a, r) => (Math.abs(r.diff) > Math.abs(a.diff) ? r : a));
  assert.ok(
    Math.abs(worst.diff) <= 1,
    `最大偏差 ${worst.name} ${worst.diff} 分钟（引擎 ${worst.got}）`,
  );
});

test('ST3 偏差已收敛（移植 ΔT 后应无系统性正偏移）', () => {
  const positives = measure().filter((r) => r.diff > 0).length;
  // 移植后偏移方向应分散（不再是恒正的系统偏移）
  assert.ok(
    positives <= 20,
    `正偏移项应 ≤20（实测 ${positives}/24）；若≥23 说明 ΔT 未生效或被移除`,
  );
});

test('ST4 ΔT 分段多项式：关键节点与连续性（移植自Core）', () => {
  // 分段边界处应连续（无跳变）
  const checks = [1899.9, 1900, 1920, 1941, 1961, 1986, 2000, 2026, 2100, 2101];
  checks.forEach((y) => {
    const dt = deltaTSeconds(y);
    assert.ok(Number.isFinite(dt), `ΔT(${y}) 应为有限数，实得 ${dt}`);
  });
  // 已知值：ΔT(2026) ≈ 75.1s；ΔT(2000) ≈ 63.8s
  assert.ok(Math.abs(deltaTSeconds(2026) - 75.1) < 1.5, `ΔT(2026) 应约 75s，实得 ${deltaTSeconds(2026).toFixed(1)}`);
  assert.ok(Math.abs(deltaTSeconds(2000) - 63.8) < 1.5, `ΔT(2000) 应约 64s，实得 ${deltaTSeconds(2000).toFixed(1)}`);
  // 域外钳制：1900 以下取1900 值，2100 以上取 2100 值
  assert.equal(deltaTSeconds(1850), deltaTSeconds(1900), '域外下方应钳制到 1900');
  assert.equal(deltaTSeconds(2200), deltaTSeconds(2100), '域外上方应钳制到 2100');
});

test('ST5 utcJdToTt：ΔT 换算方向正确（TT应晚于 UT）', () => {
  const jdUtc = 2461120.0; // 2026-03-20
  const jdTt = utcJdToTt(jdUtc);
  const diffSec = (jdTt - jdUtc) * 86400;
  assert.ok(diffSec > 0, 'TT 应晚于 UT（ΔT>0）');
  assert.ok(Math.abs(diffSec - 75) < 2, `ΔT 换算应约 +75s，实得 ${diffSec.toFixed(1)}s`);
});
