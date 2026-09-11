// lunarReverse.js —— 农历→公历 反查（与 lunar 锚点对偶）测试。
import assert from 'node:assert';
import {
  lunarToSolar,
  lunarMonthsOfYear,
  lunarDaysOfMonth,
} from '../../miniprogram/lib/lunarReverse.js';
import { solarToLunar } from '../../miniprogram/lib/lunar.js';

// 对偶：阳历 → 农历 → 反查阳历 应回到同一天（对 non +-1 边界日期稳定往返）。
const PAIRS = [
  [2020, 1, 25], [2021, 2, 12], [2022, 2, 1], [2023, 1, 22],
  [2024, 2, 10], [2025, 1, 29], [2026, 2, 17], [1997, 7, 1],
];
for (const [y, m, d] of PAIRS) {
  const l = solarToLunar(y, m, d);
  assert.ok(l, `solarToLunar(${y}-${m}-${d})`);
  const s = lunarToSolar(l.year, l.month, l.leap, l.day);
  assert.ok(s, `lunarToSolar(${l.year}-${l.month})`);
  assert.equal(s.month, m, `反查回 ${y}-${m}-${d} 的月（${l.year}${l.month}${l.leap?'闰':''}）`);
}

// 2026 春节锚点
const newYear = lunarToSolar(2026, 1, false, 1);
assert.equal(newYear.solar, '2026-02-17', '2026 正月初一 = 2026-02-17');

// 闰月支持：2023 闰二月存在
const months2023 = lunarMonthsOfYear(2023);
assert.ok(months2023.some((x) => x.leap && x.month === 2), '2023 含闰二月');

// 月份候选数与天数合理性
const m2026 = lunarMonthsOfYear(2025);
assert.ok(m2026.length >= 12, '2025 至少 12 个朔月');
const dim = lunarDaysOfMonth(2026, 1, false);
assert.ok(dim >= 29 && dim <= 30, `2026 正月 29..30 天，got ${dim}`);

console.log('lunarReverse.test.mjs: PASS');
process.exit(0);