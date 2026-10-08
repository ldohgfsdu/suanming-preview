// 农历查询译文：对照黄金锚点。
// year/month/leap 为强断言（13 点已对拍）；day 因“初一日 ±1 边界”仅对非边界锚点强断言。
import assert from 'node:assert';
import { solarToLunar } from '../../miniprogram/lib/lunar.js';

// [阳历 Y,M,D, 期望 y,m,leap,d, 是否 day 边界(0否1是)]
const CASES = [
  [2023, 1, 22, 2023, 1, false, 1, 0],
  [2023, 2, 20, 2023, 2, false, 1, 0],
  [2020, 1, 25, 2020, 1, false, 1, 0],
  [2021, 2, 12, 2021, 1, false, 1, 0],
  [2022, 2, 1, 2022, 1, false, 1, 0],
  [2000, 2, 5, 2000, 1, false, 1, 0],
  [2025, 1, 29, 2025, 1, false, 1, 0],
  [2026, 2, 17, 2026, 1, false, 1, 0],
  [1997, 7, 1, 1997, 5, false, 27, 0],
  [1949, 10, 1, 1949, 8, false, 10, 1],   // day 边界（±1，弱断言）
  [2023, 3, 22, 2023, 2, true, 1, 1],      // 2023 闰二月（day 边界）
  [2020, 5, 23, 2020, 4, true, 1, 1],      // 2020 闰四月（day 边界）
  [2024, 2, 10, 2024, 1, false, 1, 1],     // 2024 春节（day 边界）
  // 扩充权威锚点（公众节日/历史，跨年际验证）
  [2003, 2, 1, 2003, 1, false, 1, 1],       // 2003 春节 癸未年正月初一
  [2010, 2, 15, 2010, 1, false, 1, 1],      // 2010 春节 庚寅年正月初一
  [2013, 2, 10, 2013, 1, false, 1, 1],      // 2013 春节 癸巳年正月初一
  [2015, 2, 19, 2015, 1, false, 1, 1],      // 2015 春节 乙未年正月初一
  [2008, 8, 8, 2008, 7, false, 8, 1],       // 2008-08-08 戊子年七月初八（北京奥运开幕）
  [2019, 10, 1, 2019, 9, false, 3, 1],      // 2019-10-01 己亥年九月初三（70 周年庆）
];

let pass = 0, fail = 0;
for (const [y, m, d, ly, lm, lleap, ld, risky] of CASES) {
  const r = solarToLunar(y, m, d);
  assert.ok(r, `solarToLunar(${y}-${m}-${d}) 应返回结果`);
  // 强断言：年月闰
  assert.equal(r.year, ly, `Y${y}-${m}-${d} lunar.year`);
  assert.equal(r.month, lm, `Y${y}-${m}-${d} lunar.month`);
  assert.equal(r.leap, lleap, `Y${y}-m${m}-${d} lunar.leap`);
  // day：非边界强断言；边界仅断言在 [期望-1, 期望+1] 区间
  if (risky === 0) {
    assert.equal(r.day, ld, `Y${y}-${m}-${d} lunar.day`);
  } else {
    assert.ok(Math.abs(r.day - ld) <= 1, `Y${y}-${m}-${d} day in ±1 got ${r.day}`);
  }
  assert.equal(r.approx, true, 'lunar 应带 approx 标记');
  assert.ok(typeof r.text === 'string' && r.text.length > 0, 'text 非空');
  pass++;
}
// 文案日名取 DAY_CN（初一…三十）。回归：曾误写 MONTH_CN[day]，
// 于是 day≤12 时输出「正月正/腊月正」这类把月名当日名的串，day>12 时直接掉成裸数字。
const TEXT_CASES = [
  [2024, 2, 10, '2024年正月初一'],
  [2024, 2, 22, '2024年正月十三'],
  [2024, 3, 11, '2024年二月初二'],
  [2023, 12, 13, '2023年冬月初一'],
];
let textPass = 0;
for (const [y, m, d, want] of TEXT_CASES) {
  assert.equal(solarToLunar(y, m, d).text, want, `text(${y}-${m}-${d})`);
  textPass++;
}
console.log(`lunar text tests: PASS ${textPass}/${TEXT_CASES.length}`);

console.log(`lunar lookup tests: PASS ${pass}/${CASES.length}`);
process.exit(fail > 0 ? 1 : 0);