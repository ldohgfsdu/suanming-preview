/**
 * scripts/gen-lunar-table.mjs — 构建期生成农历月表（1900–2101）。
 *
 * 依据与算法：
 *   - 朔：`newMoonJde(k)`（Meeus 新月），月首公历日 JDN = floor(nmJDE + 0.5 + 8/24)（北京）
 *   - 中气：`termJde(ord,year)`，中气 = 奇数 ord ∈ {1,3,...,23}
 *   - 月号规则：含中气的朔月月号 = 该中气映射；无中气的朔月 = 闰月（号取上一正常月）。
 *   - 农历年：该月所属“正月”（month==1 且非闰）的公历年。
 *   - 锚点：2023-01-22 = 癸卯年正月初一（公众熟知，探针已由 newMoonJde 确认）。
 *
 * 工程纪律：表由天文算式推导并与黄金锚点对拍，确定性可重现；与权威万年历不符
 * 由对拍用例显式暴露，不静默。
 */
import { newMoonJde } from '../miniprogram/lib/archive.js';
import { gregorianToJde, jdeToGregorian, termJde } from '../miniprogram/lib/engine.js';

const B8 = 8 / 24; // Beijing +8h
// 中气 ord(1,3,...,23) -> 农历月号（正月=1）：
//   大寒(1)->12, 雨水(3)->1, 春分(5)->2, 谷雨(7)->3, 小满(9)->4, 夏至(11)->5,
//   大暑(13)->6, 处暑(15)->7, 秋分(17)->8, 霜降(19)->9, 小雪(21)->10, 冬至(23)->11
const MID_SEQ = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
export function pMonthFromOrd(ord) {
  const p = MID_SEQ.indexOf(ord);
  if (p < 0) return null;
  return p === 0 ? 12 : p; // 大寒->12月（腊月），雨水->1...冬至->11
}

const MAX_JDN = gregorianToJde(2100, 12, 31);
const MIN_JDN = gregorianToJde(1900, 1, 1);
export function beijingJDN(instJDE) {
  // 新月瞬间 -> 北京民用日（按北京 00:00 换日的 JDN），夹取到引擎合法年段
  const g = jdeToGregorian(instJDE);
  let hh = g.h + 8;
  let y = g.y, m = g.m, d = g.d;
  if (hh >= 24) {
    // 日 +1（用分支避免越界抛错）
    if (y > 2100) { y = 2100; m = 12; d = 31; }
    else if (y === 2100 && m === 12) { d = 31; }
    else { const nx = jdeToGregorian(gregorianToJde(y, m, d + 1)); y = nx.y; m = nx.m; d = nx.d; }
  }
  let j = gregorianToJde(Math.min(2100, Math.max(1900, y)), m, d);
  if (j > MAX_JDN) return MAX_JDN;
  if (j < MIN_JDN) return MIN_JDN;
  return j;
}

export function monthStartJ(k) { return beijingJDN(newMoonJde(k)); }
export function monthLen(k) { return monthStartJ(k + 1) - monthStartJ(k); }

/** 朔月 [newMoonJde(k), newMoonJde(k+1)) 内包含的中气 ord，或 null */
export function midOrdIn(k) {
  const lo = newMoonJde(k), hi = newMoonJde(k + 1);
  const yr = jdeToGregorian(lo).y;
  for (let o = 1; o < 24; o += 2) {
    for (let yy = Math.max(1900, yr - 1); yy <= Math.min(2100, yr + 1); yy++) {
      const q = termJde(o, yy);
      if (q >= lo && q < hi) return o;
    }
  }
  return null;
}

/**
 * 生成农历月表。kLo..kHi（不含边界，可含闰）。anchorK 须为 2023 正月朔，其 year=2023。
 */
export function generate(anchorK, kLo, kHi) {
  // pass1: base month by mid
  const base = new Map();
  for (let k = kLo; k <= kHi; k++) {
    const mid = midOrdIn(k);
    base.set(k, { mid, month: mid == null ? null : pMonthFromOrd(mid) });
  }
  // pass2: 闰月号 = 上一正常月
  const rec = new Map();
  let lastNormalMonth = null;
  for (let k = kLo; k <= kHi; k++) {
    const b = base.get(k);
    let month = b.month;
    let leap = b.month == null;
    if (leap) month = lastNormalMonth;
    else lastNormalMonth = b.month;
    rec.set(k, { k, startJ: monthStartJ(k), len: monthLen(k), midOrd: b.mid, month, leap });
  }
  // anchor 校验
  const ar = rec.get(anchorK);
  if (!ar || ar.month !== 1) throw new Error(`锚点 k=${anchorK} 非正月(month=1)`);

  // pass3: 农历年双向定序
  const anchorYear = jdeToGregorian(newMoonJde(anchorK)).y; // 2023
  // 正向：anchorK+1 .. kHi
  let y = anchorYear;
  for (let k = anchorK; k <= kHi; k++) {
    const r = rec.get(k);
    if (r.month === 1) y = jdeToGregorian(newMoonJde(k)).y; // 本正月朔公历年
    r.year = y;
  }
  // 反向：anchorK-1 .. kLo
  let yb = anchorYear - 1; // 锚点（2023正月）之前属上一农历年
  for (let k = anchorK - 1; k >= kLo; k--) {
    const r = rec.get(k);
    if (r.month === 1) {
      // 本正月朔的公历年即其农历年；其‘更早’月份降一年
      const sy = jdeToGregorian(newMoonJde(k)).y;
      r.year = sy;
      yb = sy - 1;
    } else {
      r.year = yb;
    }
  }
  return [...rec.values()].sort((a, b) => a.k - b.k);
}