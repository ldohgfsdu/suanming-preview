/**
 * miniprogram/lib/engine.js — local deterministic calendar core (plain JS, ESM, runnable).
 * Range 1900-2100; out-of-range user input throws.
 */
'use strict';

import { solarLongitude } from './solarlon.js';

export const GANS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHIS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
export const TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
const TERM_REF_MONTH = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12];
const TERM_REF_DAY = [5, 20, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21];

function mod360(x) { let v = x % 360; if (v < 0) v += 360; return v; }
function angDiff(a, b) { let d = mod360(a - b); if (d > 180) d -= 360; return d; }

// ---- date <-> JDN ----
export function gregorianToJde(y, m, d) {
  if (y < MIN_YEAR || y > MAX_YEAR) throw new Error('range ' + y);
  return gregorianToJdeAny(y, m, d);
}

/** 无年份范围校验的 JDN 换算，仅供节气内部跨年搜索。 */
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

// ---- solar apparent longitude ----
export function solarLon(jde) {
  return solarLongitude(jde);
}
function zcross(a, b, tgt) { return angDiff(b, tgt) * angDiff(a, tgt) <= 0; }

function solveLonWindow(target, lo, hi) {
  let a = lo, b = hi;
  for (let s = 0; s < 12; s++) {
    if (zcross(solarLon(a), solarLon(b), target)) break;
    a -= 30; b += 30;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (zcross(solarLon(a), solarLon(mid), target)) b = mid; else a = mid;
    if (b - a < 0.0004) break;
  }
  return (a + b) / 2;
}

export function termJde(ord, year) {
  const guess = gregorianToJdeAny(year, TERM_REF_MONTH[ord], TERM_REF_DAY[ord]);
  const target = mod360(285 + ord * 15);
  return solveLonWindow(target, guess, guess);
}

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

export function solarTermResultAt(jde) {
  let prev = null, next = null, bestP = -Infinity, bestN = Infinity;
  for (let o = 0; o < 24; o++) {
    const t = termJdeNear(o, jde);
    if (!t) continue;
    if (t.jde <= jde && t.jde > bestP) {
      bestP = t.jde;
      prev = { name: TERMS[o], ord: o, utc: isoUtc(t.jde), jde: t.jde };
    }
    if (t.jde >= jde && t.jde < bestN) {
      bestN = t.jde;
      next = { name: TERMS[o], ord: o, utc: isoUtc(t.jde), jde: t.jde };
    }
  }
  const daysToNext = next ? Number((next.jde - jde).toFixed(4)) : null;
  return { prev, next, daysToNext };
}

// ---- pillars ----
export function dayPillar(jdn) {
  const idx = (((54 + (Math.floor(jdn + 0.5) - 2451545)) % 60) + 60) % 60;
  return { gan: GANS[idx % 10], zhi: ZHIS[idx % 12], index: idx };
}

export function yearPillar(jde) {
  const lichun = termJdeNear(2, jde);
  const ganzhiYear = jde < lichun.jde ? lichun.year - 1 : lichun.year;
  const idx = ((ganzhiYear - 1984) % 60 + 60) % 60;
  return { gan: GANS[idx % 10], zhi: ZHIS[idx % 12], ganzhiYear, liChunJde: lichun.jde, index: idx };
}

// ---- Equation of Time ----
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
/**
 * JDE(UT) → UTC ISO，精确到分钟。
 * 直接把 JDE 映射到 Unix 分钟并统一四舍五入，天然处理 23:59.5 → 次日 00:00，
 * 避免手工分别 round 分钟产生 `12:60:00Z` 这类非法时间。
 */
export function isoUtc(jde) {
  const unixMinutes = Math.round((jde - 2440587.5) * 1440);
  const d = new Date(unixMinutes * 60000);
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`
    + `T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:00Z`;
}

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
