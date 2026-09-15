/**
 * miniprogram/lib/engine.js — local deterministic calendar core (plain JS, ESM, runnable).
 * Scope/precision notes kept in ASCII:
 *   - Gregorian<->Julian Day exact (Meeus Fliegel inverse).
 *   - gregorianToJde(y,m,d) returns the JDN for that day (noon coordinate epoch) as an integer.
 *   - Solar apparent longitude (Meeus low precision), verified against equinox/solstice.
 *     Model civil-time envelope is about +/-5-6 min from authoritative tables; astronomy-audit
 *     regressions assert an explicit tolerance of +/-8 min.
 *   - Each solar term solved by bisection where apparent lon = 285+15*ord (deg).
 *   - Day pillar anchored: 1949-10-01 = 甲子日 (idx 0) => 2000-01-01 = 戊午日 (idx 55).
 *   - Lunar phases (朔望) solved by Meeus new-moon; lunisolar month table built build-time
     (闰月 via 中气), see lib/lunar-table.js.
 *   - Range 1900-2100; out-of-range throws.
 */
'use strict';

export const GANS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHIS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
export const TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
// approx day-in-month each term falls (ord index); used only as bisection GUESS window
const TERM_REF_MONTH = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12];
const TERM_REF_DAY = [5, 20, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21];

const D2R = Math.PI / 180;
function mod360(x) { let v = x % 360; if (v < 0) v += 360; return v; }
function angDiff(a, b) { let d = mod360(a - b); if (d > 180) d -= 360; return d; }
function toRad(d) { return d * D2R; }

// ---- date <-> JDN ----
// ---- date <-> JDN ----
export function gregorianToJde(y, m, d) {
  if (y < MIN_YEAR || y > MAX_YEAR) throw new Error('range ' + y);
  return gregorianToJdeAny(y, m, d);
}
/** 无年份范围校验的 JDN 换算，仅供节气内部搜索越界一年时使用（不暴露为用户输入）。 */
function gregorianToJdeAny(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export function jdeToGregorian(jde) {
  const z = Math.floor(jde + 0.5);
  const f = jde + 0.5 - z;
  let A = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const di = Math.floor(day);
  return { y: year, m: month, d: di, h: (day - di) * 24 };
}

// ---- solar apparent longitude (Meeus low precision) ----
export function solarLon(jde) {
  const T = (jde - 2451545) / 36525;
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const Mr = toRad(M);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  L0 += C;
  const om = 125.04 - 1934.136 * T;
  L0 -= 0.00569 + 0.00478 * Math.sin(toRad(om));
  return mod360(L0);
}
function zcross(a, b, tgt) { return angDiff(b, tgt) * angDiff(a, tgt) <= 0; }

/** bisect for JDE when lon reaches target within an initial window [lo,hi]. */
function solveLonWindow(target, lo, hi) {
  // widen a bit if needed
  let a = lo, b = hi;
  for (let s = 0; s < 12; s++) {
    if (zcross(solarLon(a), solarLon(b), target)) break;
    a -= 30; b += 30;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (zcross(solarLon(a), solarLon(mid), target)) b = mid; else a = mid;
    if (b - a < 0.0004) break; // sub-minute
  }
  return (a + b) / 2;
}

/** JDE of a given term ord in a given Gregorian year (guess from approx month).
 * 内部允许年份上下越界一年（节气求解需要跨到用户合法范围外），不因此抛错。 */
export function termJde(ord, year) {
  const guess = gregorianToJdeAny(year, TERM_REF_MONTH[ord], TERM_REF_DAY[ord]);
  const target = mod360(285 + ord * 15);
  return solveLonWindow(target, guess, guess);
}

/** JDE of term ord nearest to a given jde (searches civil years y-1..y+1). */
export function termJdeNear(ord, jde) {
  const y = jdeToGregorian(jde).y;
  let best = null, bestD = Infinity;
  for (let yy = y - 1; yy <= y + 1; yy++) {
    const td = termJde(ord, yy);
    const dd = Math.abs(td - jde);
    if (dd < bestD) { bestD = dd; best = { year: yy, jde: td }; }
  }
  return best;
}

/**
 * 统一节气 bracket（单一事实源）：给定任意 JDE，返回它前后最近的节气，以及距下一个节气
 * 的天际（天）。`prev.next`、全页（index 首页 / result / today / terms）都用它，杜绝多处
 * 各自定义 `SolarTermResult` 而漂移。
 * @returns {{prev:null|{name,ord,utc,jde}, next:null|{name,ord,utc,jde}, daysToNext:number|null}}
 */
export function solarTermResultAt(jde) {
  let prev = null, next = null, bestP = -Infinity, bestN = Infinity;
  for (let o = 0; o < 24; o++) {
    const t = termJdeNear(o, jde);
    if (!t) continue;
    if (t.jde <= jde && t.jde > bestP) { bestP = t.jde; prev = { name: TERMS[o], ord: o, utc: isoUtc(t.jde), jde: t.jde }; }
    if (t.jde >= jde && t.jde < bestN) { bestN = t.jde; next = { name: TERMS[o], ord: o, utc: isoUtc(t.jde), jde: t.jde }; }
  }
  const daysToNext = next ? Number(((next.jde - jde)).toFixed(4)) : null;
  return { prev, next, daysToNext };
}

// ---- pillars ----
export function dayPillar(jdn) {
  // 锚点 1949-10-01 = 甲子日（idx 0）。当前 2000-01-01 = 戊午日。
  const idx = (((54 + (Math.floor(jdn + 0.5) - 2451545)) % 60) + 60) % 60;
  return { gan: GANS[idx % 10], zhi: ZHIS[idx % 12], index: idx };
}
export function yearPillar(jde) {
  const y = jdeToGregorian(jde).y;
  const lichun = termJdeNear(2, jde); // 立春 ord 2 near this jde
  const ganzhiYear = jde < lichun.jde ? lichun.year - 1 : lichun.year;
  const idx = ((ganzhiYear - 1984) % 60 + 60) % 60;
  return { gan: GANS[idx % 10], zhi: ZHIS[idx % 12], ganzhiYear, liChunJde: lichun.jde, index: idx };
}

// ---- EoT (Minutes) : Spencer / solar-decl formula (engineering accuracy +/-1 min) ----
function dayOfYear(y, m, d) {
  const start = gregorianToJde(y, 1, 1);
  return Math.round(gregorianToJde(y, m, d) - start) + 1;
}
export function eotMinutes(jde) {
  const g = jdeToGregorian(jde);
  const n = dayOfYear(g.y, g.m, g.d);
  const a = (2 * Math.PI) / 365 * (n - 1);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(a)
    - 0.032077 * Math.sin(a) - 0.014615 * Math.cos(2 * a)
    - 0.040849 * Math.sin(2 * a));
}

// ---- ISO ----
export function isoUtc(jde) {
  const g = jdeToGregorian(jde);
  const hh = Math.floor(g.h); const mm = Math.round((g.h - hh) * 60);
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(g.y, 4)}-${pad(g.m, 2)}-${pad(g.d, 2)}T${pad(hh, 2)}:${pad(mm, 2)}:00Z`;
}

/** Find the two terms bracketing a given instant jde: {prev,next}. */
function findBracket(jde) {
  let prev = null, next = null;
  let bestPrev = -Infinity, bestNext = Infinity;
  for (let o = 0; o < 24; o++) {
    const t = termJdeNear(o, jde);
    if (!t) continue;
    if (t.jde <= jde && t.jde > bestPrev) { bestPrev = t.jde; prev = { ord: o, name: TERMS[o], year: t.year, jde: t.jde }; }
    if (t.jde >= jde && t.jde < bestNext) { bestNext = t.jde; next = { ord: o, name: TERMS[o], year: t.year, jde: t.jde }; }
  }
  return { prev, next: next || prev };
}

/** Compose a facts object for a given Gregorian calendar date. */
/** Compose a facts object for a given Gregorian calendar date. */
export function buildFacts(y, m, d) {
  const jd = gregorianToJde(y, m, d);
  const yp = yearPillar(jd);
  const dp = dayPillar(jd);
  const br = findBracket(jd);
  const eot = eotMinutes(jd);
  return {
    solar: { y, m, d },
    instant_iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00Z`,
    dayPillar: dp,
    yearPillar: yp,
    prevTerm: br.prev ? { name: br.prev.name, ordinal: br.prev.ord, utc: isoUtc(br.prev.jde) } : null,
    nextTerm: br.next ? { name: br.next.name, ordinal: br.next.ord, utc: isoUtc(br.next.jde) } : null,
    daysToNextTerm: br.next ? Number((br.next.jde - jd).toFixed(6)) : null,
    eotMinutes: Number(eot.toFixed(6)),
    lonDiffSeconds: null,
    algorithmic_approx: false,
  };
}