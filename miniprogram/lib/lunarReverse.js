/**
 * miniprogram/lib/lunarReverse.js — 农历 → 公历（阳历）反查。
 *
 * 用途：「公历/农历」切换下，用户在农历模式下选择 农历年 / 月 / (闰月) / 日 后，
 *   换算成公历日期再交给既有 computeArchive（核心计算不变）。
 *
 * 依据：复用已固化的 `LUNAR_TABLE`（每朔月的 Meeus 朔 + 中气判定的
 *   [year, month, leap, startJDN, len]）。给定农历年月日 → 定位所在朔月行 →
 *   公历 JDN = startJDN + (day-1) → 再转回公历年月日。
 *
 * 工程纪律：
 *   - 不新增历法规则，纯粹把用户输入的「农历」翻成既有引擎希望的「公历」。
 *   - 朔日 ±1 边界沿用 lunar.js 的 approx 语义（真实历法误差，不臆造）。
 *   - direction: 公历日期由 jdeToGregorian 得到；超前表范围(1900-2100)外返回 null。
 */

'use strict';

import { jdeToGregorian } from './engine.js';
import { LUNAR_TABLE, LUNAR_RANGE } from './lunar-table.js';

/** 中国农历月名 with 闰月 —— 与 lunar.js 一致 */
export const MONTH_CN = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

/**
 * 农历日期 → 公历日期。
 * @param year 农历年（如 2026）
 * @param month 农历月 1..12（正..腊）
 * @param leap 是否闰月
 * @param day 农历日 1..30
 * @returns { {y,m,d, approx, day, monthName, text} | null }
 */
export function lunarToSolar(year, month, leap, day) {
  if (!year || !month || !day) return null;
  // 找对应朔月行 [ly, lm, lp, startJDN, len]
  let row = null;
  for (let i = 0; i < LUNAR_TABLE.length; i++) {
    const r = LUNAR_TABLE[i];
    if (r[0] === year && r[1] === month && ((r[2] === 1) === !!leap)) { row = r; break; }
  }
  if (!row) return null;
  const len = row[4];
  if (day < 1 || day > len) return null;
  const startJDN = row[3];
  const jdn = startJDN + (day - 1);
  const g = jdeToGregorian(jdn);
  // 超出农历表年份范围视为失效
  if (g.y < LUNAR_RANGE[0] || g.y > LUNAR_RANGE[1]) return null;
  return {
    jde: jdn,
    year: g.y, month: g.m, day: g.d,
    solar: `${String(g.y).padStart(4, '0')}-${String(g.m).padStart(2, '0')}-${String(g.d).padStart(2, '0')}`,
    dayName: DAY_CN[day] || String(day),
    monthName: (leap ? '闰' : '') + MONTH_CN[month] + '月',
    leap,
    approx: true, // 朔日 ±1 边界（沿用 lunar 语义）
  };
}

/**
 * 列出某农历年所有「月」选项（含闰月），返回 [{value: 月序号, leap, label}]
 * 用途：农历模式下第二列的候选。
 */
export function lunarMonthsOfYear(year) {
  const out = [];
  for (let i = 0; i < LUNAR_TABLE.length; i++) {
    const r = LUNAR_TABLE[i];
    if (r[0] !== year) continue;
    const leap = r[2] === 1;
    out.push({ month: r[1], leap, label: (leap ? '闰' : '') + MONTH_CN[r[1]] + '月' });
  }
  return out;
}

/** 某农历年某月（含闰）可选的「日」天数。 */
export function lunarDaysOfMonth(year, month, leap) {
  for (let i = 0; i < LUNAR_TABLE.length; i++) {
    const r = LUNAR_TABLE[i];
    if (r[0] === year && r[1] === month && ((r[2] === 1) === (leap === true))) return r[4];
  }
  return 30;
}

/** 农历年代范围 */
export { LUNAR_RANGE };