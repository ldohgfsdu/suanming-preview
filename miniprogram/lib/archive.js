/**
 * miniprogram/lib/archive.js — complete "Eastern Time Cultural Archive" composer.
 * Deterministic, pure-equation facts only (no fate/luck/judgement).
 * Builds on the verified engine.js core (JDN, solar lon, terms, pillars, EoT).
 * Adds: four pillars (year/month/day/hour), 五虎遁 month, 五鼠遁 hour, 五行 tally,
 * solar-term prev/next UTC, 朔望月龄 via Meeus new-moon,
 * and 真太阳时 offset = EoT + 4*(lon-120) minutes (place optional).
 */
'use strict';

import {
  gregorianToJde, jdeToGregorian,
  termJdeNear, dayPillar, yearPillar, eotMinutes, solarTermResultAt,
  GANS, ZHIS,
} from './engine.js';
import { solarToLunar } from './lunar.js';

export const ELEMENT = {
  '甲': 'wood', '乙': 'wood', '丙': 'fire', '丁': 'fire', '戊': 'earth',
  '己': 'earth', '庚': 'metal', '辛': 'metal', '壬': 'water', '癸': 'water',
};
export const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

// 地支本气五行（确定性映射）：子水 丑土 寅木 卯木 辰土 巳火 午火 未土 申金 酉金 戌土 亥水
export const ELEMENT_ZHI = {
  '子': 'water', '丑': 'earth', '寅': 'wood', '卯': 'wood', '辰': 'earth', '巳': 'fire',
  '午': 'fire', '未': 'earth', '申': 'metal', '酉': 'metal', '戌': 'earth', '亥': 'water',
};

const D2R = Math.PI / 180;
function mod360(x) { let v = x % 360; if (v < 0) v += 360; return v; }
function rd(d) { return d * D2R; }

// ---------------- 月份柱 ----------------
function monthBranchFromOrd(ord) {
  return ((((ord - 2) / 2 + 2) % 12) + 12) % 12;
}
function findJieOrd(jde) {
  let best = -1, bestJ = -Infinity;
  for (let o = 0; o < 24; o += 2) {
    const t = termJdeNear(o, jde);
    if (t && t.jde <= jde && t.jde > bestJ) { bestJ = t.jde; best = o; }
  }
  return best;
}

/** 月柱：五虎遁（寅月干由年干定）。 */
export function monthPillar(jde, ganzhiYear) {
  const ord = findJieOrd(jde);
  if (ord < 0) return null;
  const zhi = monthBranchFromOrd(ord);
  const yStem = (((ganzhiYear - 1984) % 10) + 10) % 10;
  const yinStem = (yStem * 2 + 2) % 10;
  const stem = (yinStem + ((zhi - 2 + 12) % 12)) % 10;
  return { gan: GANS[stem], zhi: ZHIS[zhi], ganzhi: GANS[stem] + ZHIS[zhi] };
}

/** 时柱：五鼠遁。hour in 0..23（23 与 0 皆子时）。 */
export function hourPillar(dayStemIdx, hour) {
  const zhi = Math.floor((hour + 1) / 2) % 12;
  const ziStem = (dayStemIdx * 2) % 10;
  const stem = (ziStem + zhi) % 10;
  return { gan: GANS[stem], zhi: ZHIS[zhi], ganzhi: GANS[stem] + ZHIS[zhi] };
}

export const DayBoundaryRule = {
  CHANGE_AT_ZI: 'CHANGE_AT_ZI',
  CHANGE_AT_MIDNIGHT: 'CHANGE_AT_MIDNIGHT',
};
export const DEFAULT_DAY_BOUNDARY_RULE = DayBoundaryRule.CHANGE_AT_ZI;

/** 依子时换日口径，推断历日与取时支小时。 */
export function applyDayBoundary(y, m, d, hour, rule = DEFAULT_DAY_BOUNDARY_RULE) {
  if (!(hour >= 0)) return { y, m, d, hourForZhi: null, dayShifted: false };
  if (rule === DayBoundaryRule.CHANGE_AT_ZI && hour >= 23) {
    const n = nextDay(y, m, d);
    return { y: n.y, m: n.m, d: n.d, hourForZhi: hour, dayShifted: true };
  }
  return { y, m, d, hourForZhi: hour, dayShifted: false };
}

function nextDay(y, m, d) {
  const jd = gregorianToJde(y, m, d) + 1;
  const g = jdeToGregorian(jd);
  return { y: g.y, m: g.m, d: g.d };
}

/** 晚子时五鼠遁时干取次日日干。 */
export function hourStemDayStem(pillarDate, hour, rule, dayPillarObj) {
  if (rule === DayBoundaryRule.CHANGE_AT_MIDNIGHT && hour >= 23) {
    const n = nextDay(pillarDate.y, pillarDate.m, pillarDate.d);
    return dayPillar(gregorianToJde(n.y, n.m, n.d)).index % 10;
  }
  return dayPillarObj.index % 10;
}

/** 四柱五行字数（天干 + 地支本气）。 */
export function tally(ganArr, zhiArr = []) {
  const c = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const g of ganArr) { const e = ELEMENT[g]; if (e) c[e] += 1; }
  for (const z of zhiArr) { const e = ELEMENT_ZHI[z]; if (e) c[e] += 1; }
  return c;
}

// ---------------- 新月（Meeus） ----------------
export function newMoonJde(k) {
  const T = k / 1236.85;
  let J = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T + 0.000000150 * T * T * T - 0.00000000073 * T * T * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = mod360(2.5534 + 29.10535670 * k - 0.0000014 * T * T);
  const Mm = mod360(201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T - 0.000000058 * T * T * T * T);
  const Fm = mod360(160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T + 0.000000046 * T * T * T * T);
  const Om = mod360(124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T * T * T);
  J +=
    -0.40720 * Math.sin(rd(Mm))
    + 0.17241 * E * Math.sin(rd(M))
    + 0.01608 * Math.sin(rd(2 * Mm))
    + 0.01039 * Math.sin(rd(2 * Fm))
    + 0.00739 * E * Math.sin(rd(Mm - M))
    - 0.00514 * E * Math.sin(rd(Mm + M))
    + 0.00208 * E * E * Math.sin(rd(2 * M))
    - 0.00111 * Math.sin(rd(Mm - 2 * M))
    - 0.00057 * Math.sin(rd(Mm + 2 * Fm))
    + 0.00056 * E * Math.sin(rd(2 * Mm + M))
    - 0.00042 * Math.sin(rd(3 * M))
    + 0.00042 * E * Math.sin(rd(M + 2 * Fm))
    + 0.00038 * E * Math.sin(rd(M - 2 * Fm))
    - 0.00024 * E * Math.sin(rd(2 * Mm - M))
    - 0.00007 * Math.sin(rd(Om))
    - 0.00007 * Math.sin(rd(Mm + 2 * M))
    - 0.00004 * Math.sin(rd(Mm - 2 * Fm))
    + 0.00004 * Math.sin(rd(2 * Mm - 2 * M))
    + 0.00004 * Math.sin(rd(3 * M))
    - 0.00003 * Math.sin(rd(Mm + M - 2 * Om))
    + 0.00003 * Math.sin(rd(2 * Mm + 2 * Fm));
  return J;
}

export function lunarAge(jde) {
  const k = Math.round((jde - 2451550.09766) / 29.530588861);
  let j = k;
  while (newMoonJde(j) > jde) j -= 1;
  while (newMoonJde(j + 1) <= jde) j += 1;
  const nm = newMoonJde(j);
  return { newMoonIndex: j, newMoonJde: nm, ageDays: jde - nm };
}

export function lunarPhase(ageDays) {
  const a = ageDays % 29.530588861;
  if (a < 1.0) return { name: '朔', sym: 'new' };
  if (a < 4.0) return { name: '娥眉月', sym: 'crescent' };
  if (a < 6.5) return { name: '娥眉月', sym: 'crescent' };
  if (a < 10.0) return { name: '上弦月', sym: 'first_quarter' };
  if (a < 13.5) return { name: '盈凸月', sym: 'gibbous' };
  if (a < 16.5) return { name: '望', sym: 'full' };
  if (a < 20.5) return { name: '亏凸月', sym: 'gibbous' };
  if (a < 23.5) return { name: '下弦月', sym: 'last_quarter' };
  if (a < 28.0) return { name: '残月', sym: 'crescent' };
  return { name: '残月', sym: 'crescent' };
}

function zhiOfHour(hour) {
  if (!Number.isFinite(hour)) return 0;
  return Math.floor(((((hour + 1) + 24) % 24) / 2)) % 12;
}

function shiftDate(y, m, d, days) {
  const g = jdeToGregorian(gregorianToJde(y, m, d) + days);
  return { y: g.y, m: g.m, d: g.d };
}

export function trueSolarToLocal(y, m, d, hour, lonDeg) {
  const jmin = eotMinutes(gregorianToJde(y, m, d)) + 4 * (lonDeg - 120);
  const solarHour = hour + jmin / 60;
  const dayShift = Math.floor(solarHour / 24);
  const canonHour = ((solarHour % 24) + 24) % 24;
  const canonDate = shiftDate(y, m, d, dayShift);
  return {
    offsetMinutes: Number(jmin.toFixed(2)),
    solarHour, dayShift, canonHour,
    canonDate, dayChanged: dayShift !== 0,
    dateText: `${String(canonDate.y).padStart(4, '0')}-${String(canonDate.m).padStart(2, '0')}-${String(canonDate.d).padStart(2, '0')}`,
  };
}

/**
 * hour 为标准北京时间的 0..23 小数小时；-1 表示未知。历史中国夏时制必须在调用本函数前
 * 通过 civilTime.js 先解析为标准北京时间，避免把夏时制墙钟误当成 UTC+8。
 */
export function computeArchive(y, m, d, hour = -1, lonDeg = null,
  dayBoundaryRule = DEFAULT_DAY_BOUNDARY_RULE) {
  const jd = gregorianToJde(y, m, d);
  const wallHour = hour >= 0 ? hour : 12;
  // gregorianToJde 返回该历日正午 UT；北京标准时 20:00 与其对齐，因此减 20h 得绝对瞬间。
  const wallJde = jd + (wallHour - 20) / 24;

  const rawCanon = (Number.isFinite(lonDeg) && hour >= 0 && hour < 24)
    ? trueSolarToLocal(y, m, d, hour, lonDeg) : null;
  const canon = (rawCanon
    && rawCanon.canonDate.y >= 1900 && rawCanon.canonDate.y <= 2100) ? rawCanon : null;

  let yp, mp, dp, hp, y2, m2, d2;
  if (canon) {
    y2 = canon.canonDate.y; m2 = canon.canonDate.m; d2 = canon.canonDate.d;
    const bnd = applyDayBoundary(y2, m2, d2, canon.canonHour, dayBoundaryRule);
    y2 = bnd.y; m2 = bnd.m; d2 = bnd.d;
    dp = dayPillar(gregorianToJde(y2, m2, d2));
    const absJde = wallJde;
    yp = yearPillar(absJde);
    mp = monthPillar(absJde, yp.ganzhiYear);
    if (bnd.hourForZhi != null) {
      const stemBase = hourStemDayStem(
        { y: y2, m: m2, d: d2 }, bnd.hourForZhi, dayBoundaryRule, dp,
      );
      hp = hourPillar(stemBase, 2 * zhiOfHour(canon.canonHour));
    } else {
      hp = null;
    }
  } else {
    const bnd = applyDayBoundary(y, m, d, hour, dayBoundaryRule);
    y2 = bnd.y; m2 = bnd.m; d2 = bnd.d;
    yp = yearPillar(wallJde);
    dp = dayPillar(gregorianToJde(y2, m2, d2));
    mp = monthPillar(wallJde, yp.ganzhiYear);
    if (bnd.hourForZhi != null) {
      const stemBase = hourStemDayStem(
        { y: y2, m: m2, d: d2 }, bnd.hourForZhi, dayBoundaryRule, dp,
      );
      hp = hourPillar(stemBase, bnd.hourForZhi);
    } else {
      hp = null;
    }
  }

  const { prev, next, daysToNext } = solarTermResultAt(wallJde);
  const stems = [yp.gan, mp ? mp.gan : null, dp.gan, hp ? hp.gan : null].filter(Boolean);
  const zhis = [yp.zhi, mp ? mp.zhi : null, dp.zhi, hp ? hp.zhi : null].filter(Boolean);

  const eot = eotMinutes(jd);
  let tSolar = null, degraded = true;
  if (lonDeg != null && Number.isFinite(lonDeg)) {
    tSolar = Number((eot + 4 * (lonDeg - 120)).toFixed(2));
    degraded = false;
  }

  // 月龄属于“绝对瞬间”事实：必须使用出生瞬间 wallJde，而不是固定的该日正午 jd。
  const moonAgeDays = lunarAge(wallJde).ageDays;
  const moon = lunarPhase(moonAgeDays);
  const lunar = solarToLunar(y2, m2, d2);

  return {
    solar: { y: y2, m: m2, d: d2 },
    solarInput: { y, m, d },
    instant_day: `${String(y2).padStart(4, '0')}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
    dayShift: canon ? canon.dayShift : 0,
    lunar,
    four: {
      year: { label: '年', gan: yp.gan, zhi: yp.zhi, ganz: yp.gan + yp.zhi, element: ELEMENT[yp.gan] },
      month: mp ? { label: '月', gan: mp.gan, zhi: mp.zhi, ganz: mp.ganzhi, element: ELEMENT[mp.gan] } : null,
      day: { label: '日', gan: dp.gan, zhi: dp.zhi, ganz: dp.gan + dp.zhi, element: ELEMENT[dp.gan] },
      hour: hp ? { label: '时', gan: hp.gan, zhi: hp.zhi, ganz: hp.ganzhi, element: ELEMENT[hp.gan] } : null,
    },
    chang_ganzhi: yp.gan + yp.zhi + (mp ? mp.gan + mp.zhi : '') + dp.gan + dp.zhi + (hp ? hp.gan + hp.zhi : ''),
    tally: tally(stems, zhis),
    term: { prev, next, daysToNext },
    trueSolar: {
      offsetMinutes: tSolar, degraded,
      canonHour: canon ? Number(canon.canonHour.toFixed(3)) : null,
      canonDate: canon ? { y: canon.canonDate.y, m: canon.canonDate.m, d: canon.canonDate.d } : null,
      canonDateText: canon ? canon.dateText : null,
      dayChanged: canon ? canon.dayChanged : false,
    },
    moon: { ageDays: Number(moonAgeDays.toFixed(4)), name: moon.name, sym: moon.sym },
    algorithmic_approx: false,
  };
}
