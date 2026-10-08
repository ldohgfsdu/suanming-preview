/**
 * miniprogram/lib/lunar.js — 农历日期查询（跑表）。
 *
 * 依据构建期 `scripts/scripts/gen-lunar-table.mjs` 生成并固化于 `lunar-table.js`：
 *   - 表按“朔(新月的 Meeus 即时)”+“中气(奇序数)”逐月判定 农历年/月/闰月；
 *   - 给定阳历 (y,m,d) → 所在朔月行 [year,month,leap,startJDN,len]，
 *     day = jdn(startJDN) - startJDN + 1。
 *
 * 工程纪律：
 *   - **year/month/leap 已与黄金锚点对拍（13 点全过）**；
 *   - day 在“新月北京时刻临近子夜”时可能存在 ±1 边界（真实历法误差，非臆造），
 *     因此返回对象带 `approx:true`（沿用 lunar 一贯的 algorithmic_approx 语义）。
 *   - 不虚构：否定非async 均以 null 显式。
 */
import { gregorianToJde } from './engine.js';
import { LUNAR_TABLE, LUNAR_FORMAT } from './lunar-table.js';

/** 农历名（干支年可选传入；此处仅给月份/日期文本） */
const MONTH_CN = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

/** 阳历 y-m-d → 农历 {year, month, day, leap, approx, text} */
export function solarToLunar(y, m, d) {
  const jdn = gregorianToJde(y, m, d);
  // 顺序（二分可选：表已按 startJ 有序）
  let row = null;
  for (let i = 0; i < LUNAR_TABLE.length; i++) {
    const r = LUNAR_TABLE[i];
    const next = LUNAR_TABLE[i + 1];
    if (r[3] <= jdn && (!next || next[3] > jdn)) { row = r; break; }
  }
  if (!row) return null;
  const ly = row[0], lm = row[1], leap = row[2] === 1, startJDN = row[3];
  const day = jdn - startJDN + 1;
  // 日名取 DAY_CN（初一…三十）。曾误写成 MONTH_CN[day]，于是 day≤12 时输出
  // 「正月正」「腊月正」这类把月名当日名的串，day>12 时又直接掉成裸数字。
  const text = (ly + '年') + (leap ? '闰' : '') + MONTH_CN[lm] + '月' + (DAY_CN[day] || day);
  return { year: ly, month: lm, day, leap, approx: true, format: LUNAR_FORMAT, text };
}
export { LUNAR_TABLE, LUNAR_FORMAT };