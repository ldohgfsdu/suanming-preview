/**
 * miniprogram/lib/archive.js — complete "Eastern Time Cultural Archive" composer.
 * Deterministic, pure-equation facts only (no fate/luck/judgement).
 * Builds on the verified engine.js core (JDN, solar lon, terms, pillars, EoT).
 * Adds: four pillars (year/month/day/hour), 五虎遁 month, 五鼠遁 hour, 五行 tally,
 * 日柱纳音 (60-cycle), solar-term prev/next UTC, 朔望月龄 via Meeus new-moon,
 * and 真太阳时 offset = EoT + 4*(lon-120) minutes (place optional).
 */
'use strict';

import {
  gregorianToJde, jdeToGregorian,
  termJdeNear, dayPillar, yearPillar, eotMinutes, isoUtc,
  GANS, ZHIS, TERMS,
} from './engine.js';
import { solarToLunar } from './lunar.js';

export const ELEMENT = {
  '甲': 'wood', '乙': 'wood', '丙': 'fire', '丁': 'fire', '戊': 'earth',
  '己': 'earth', '庚': 'metal', '辛': 'metal', '壬': 'water', '癸': 'water',
};
export const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

// 地支本气五行（本气藏干，确定性映射，非预测）：子水 丑土 寅木 卯木 辰土 巳火 午火 未土 申金 酉金 戌土 亥水
export const ELEMENT_ZHI = {
  '子': 'water', '丑': 'earth', '寅': 'wood', '卯': 'wood', '辰': 'earth', '巳': 'fire',
  '午': 'fire', '未': 'earth', '申': 'metal', '酉': 'metal', '戌': 'earth', '亥': 'water',
};

// 六甲子纳音 (static, day-cycle index 0..59)
const NAYIN = [
  '海中金', '海中金', '炉中火', '炉中火', '大林木', '大林木', '路旁土', '路旁土', '剑锋金', '剑锋金',
  '山头火', '山头火', '涧下水', '涧下水', '城头土', '城头土', '白蜡金', '白蜡金', '杨柳木', '杨柳木',
  '泉中水', '泉中水', '屋上土', '屋上土', '霹雳火', '霹雳火', '松柏木', '松柏木', '长流水', '长流水',
  '沙中金', '沙中金', '山下火', '山下火', '平地木', '平地木', '壁上土', '壁上土', '金箔金', '金箔金',
  '覆灯火', '覆灯火', '天河水', '天河水', '大驿土', '大驿土', '钗钏金', '钗钏金', '桑柘木', '桑柘木',
  '大溪水', '大溪水', '沙中土', '沙中土', '天上火', '天上火', '石榴木', '石榴木', '大海水', '大海水',
];

const D2R = Math.PI / 180;
function mod360(x) { let v = x % 360; if (v < 0) v += 360; return v; }
function rd(d) { return d * D2R; }

// ---------------- 月份柱 ----------------
// 月之支以“节”为分界；节序为偶 {0,2,4,...,22}：
//   ord=0 小寒->丑(1) ; 2 立春->寅(2) ; 4 惊蛰->卯(3) ... 22 大雪->子(0)
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

/** 月柱：五虎遁（寅月干由年干定）。ganzhiYear 为八字年。 */
export function monthPillar(jde, ganzhiYear) {
  const ord = findJieOrd(jde);
  if (ord < 0) return null;
  const zhi = monthBranchFromOrd(ord);
  const yStem = (((ganzhiYear - 1984) % 10) + 10) % 10;
  const yinStem = (yStem * 2 + 2) % 10;           // 五虎遁
  const stem = (yinStem + ((zhi - 2 + 12) % 12)) % 10;
  return { gan: GANS[stem], zhi: ZHIS[zhi], ganzhi: GANS[stem] + ZHIS[zhi] };
}

/** 时柱：五鼠遁。hour in 0..23（23 与 0 皆子时）。dayStemIdx 0..9。 */
export function hourPillar(dayStemIdx, hour) {
  const zhi = Math.floor((hour + 1) / 2) % 12;   // 0=子
  const ziStem = (dayStemIdx * 2) % 10;          // 五鼠遁
  const stem = (ziStem + zhi) % 10;
  return { gan: GANS[stem], zhi: ZHIS[zhi], ganzhi: GANS[stem] + ZHIS[zhi] };
}

/** 四柱五行字数（天干 + 地支|气）；zhiArr 可选，缺省仅计天干。 */
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
    -0.40720 * Math.sin(rd(M))
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

/** 朔（新月）起始的月龄（天），及最近的朔时刻 */
export function lunarAge(jde) {
  const k = Math.round((jde - 2451550.09766) / 29.530588861);
  // 找到 k 使 newMoonJde(k) <= jde < newMoonJde(k+1)
  let j = k;
  while (newMoonJde(j) > jde) j -= 1;
  while (newMoonJde(j + 1) <= jde) j += 1;
  const nm = newMoonJde(j);
  return { newMoonIndex: j, newMoonJde: nm, ageDays: jde - nm };
}

/** 朔望月龄 -> 月相名（含 phase 判定位） */
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

// ---------------- 完整档案 ----------------
/** 由小时（可为小数）映射到时辰槽 index（子=0 … 亥=11）。 */
function zhiOfHour(hour) {
  if (!Number.isFinite(hour)) return 0;
  return Math.floor(((((hour + 1) + 24) % 24) / 2)) % 12;
}
/** 在公历日上增加 days 天后返回新的公历日（仅取“日”，天内时刻取午正）。 */
function shiftDate(y, m, d, days) {
  const g = jdeToGregorian(gregorianToJde(y, m, d) + days);
  return { y: g.y, m: g.m, d: g.d };
}
/** 真太阳时本地化：把所选时刻（小时）按出生地真太阳时修正，得到本地历日与太阳时。
 * 返回修正分钟、修正后太阳时(solarHour，可为负或≥24)、跨日天数(dayShift)、
 * 归一化日内太阳时(canonHour)与移动后的公历日(canonDate)。 */
export function trueSolarToLocal(y, m, d, hour, lonDeg) {
  const jmin = eotMinutes(gregorianToJde(y, m, d)) + 4 * (lonDeg - 120);
  const solarHour = hour + jmin / 60;                    // 可 <0 或 ≥24
  const dayShift = Math.floor(solarHour / 24);          // 负=前一日，正=次日
  const canonHour = ((solarHour % 24) + 24) % 24;
  const canonDate = shiftDate(y, m, d, dayShift);
  return {
    offsetMinutes: Number(jmin.toFixed(2)),
    solarHour, dayShift, canonHour,
    canonDate, dayChanged: dayShift !== 0,
    dateText: `${String(canonDate.y).padStart(4, '0')}-${String(canonDate.m).padStart(2, '0')}-${String(canonDate.d).padStart(2, '0')}`,
  };
}

/** hour：0..23，或 -1 = 未知（则无时柱）。lonDeg：本地经度（东经正，如北京 116.4）；null=未提供。 */
export function computeArchive(y, m, d, hour = -1, lonDeg = null) {
  const jd = gregorianToJde(y, m, d);
  // 真太阳时修正：仅当提供了经度且时辰已知时，才进入“单一时间事实源”chain。
  const rawCanon = (Number.isFinite(lonDeg) && hour >= 0 && hour <= 23)
    ? trueSolarToLocal(y, m, d, hour, lonDeg) : null;
  // 若真太阳时修正把本地历日推到受支持年份(1900-2100)之外（仅极能边界），则回退到该日
  // 的非修正路径，避免越界换算抛错。
  const canon = (rawCanon
    && rawCanon.canonDate.y >= 1900 && rawCanon.canonDate.y <= 2100) ? rawCanon : null;

  let yp, mp, dp, hp, y2, m2, d2;
  if (canon) {
    // —— 单一时间事实源：先确定 真太阳时->本地历日+太阳时，再统一算各时间敏感柱 ——
    y2 = canon.canonDate.y; m2 = canon.canonDate.m; d2 = canon.canonDate.d;
    dp = dayPillar(gregorianToJde(y2, m2, d2));
    // 年/月柱由出生“绝对瞬间”的太阳黄经判定（立春/节边界，经既有规则重算）
    const absJde = jd + ((hour - 12) / 24);
    yp = yearPillar(absJde);
    mp = monthPillar(absJde, yp.ganzhiYear);
    // 时柱由修正后的太阳时判定
    hp = hourPillar(dp.index % 10, 2 * zhiOfHour(canon.canonHour));
  } else {
    y2 = y; m2 = m; d2 = d;
    yp = yearPillar(jd); dp = dayPillar(jd);
    mp = monthPillar(jd, yp.ganzhiYear);
    hp = (hour >= 0 && hour <= 23) ? hourPillar(dp.index % 10, hour) : null;
  }

  // 节气 bracket（前后各一）
  let prev = null, next = null, bestP = -Infinity, bestN = Infinity;
  for (let o = 0; o < 24; o++) {
    const t = termJdeNear(o, jd);
    if (!t) continue;
    if (t.jde <= jd && t.jde > bestP) { bestP = t.jde; prev = { name: TERMS[o], ord: o, utc: isoUtc(t.jde) }; }
    if (t.jde >= jd && t.jde < bestN) { bestN = t.jde; next = { name: TERMS[o], ord: o, utc: isoUtc(t.jde), jde: t.jde }; }
  }
  const daysToNext = next ? Number(((next.jde - jd)).toFixed(4)) : null;

  const stems = [yp.gan, mp ? mp.gan : null, dp.gan, hp ? hp.gan : null].filter(Boolean);
  const zhis = [yp.zhi, mp ? mp.zhi : null, dp.zhi, hp ? hp.zhi : null].filter(Boolean);

  // 真太阳时
  let eot = eotMinutes(jd);
  let tSolar = null, degraded = true;
  if (Number.isFinite(lonDeg)) { tSolar = Number((eot + 4 * (lonDeg - 120)).toFixed(2)); degraded = false; }

  const moon = lunarPhase(lunarAge(jd).ageDays);

  const lunar = solarToLunar(y2, m2, d2);

  return {
    solar: { y: y2, m: m2, d: d2 },
    solarInput: { y, m, d },
    instant_day: `${String(y2).padStart(4, '0')}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
    dayShift: canon ? canon.dayShift : 0,
    lunar, // {year,month,day,leap,approx,text} 或 null
    four: {
      year: { label: '年', gan: yp.gan, zhi: yp.zhi, ganz: yp.gan + yp.zhi, element: ELEMENT[yp.gan] },
      month: mp ? { label: '月', gan: mp.gan, zhi: mp.zhi, ganz: mp.ganzhi, element: ELEMENT[mp.gan] } : null,
      day: { label: '日', gan: dp.gan, zhi: dp.zhi, ganz: dp.gan + dp.zhi, element: ELEMENT[dp.gan] },
      hour: hp ? { label: '时', gan: hp.gan, zhi: hp.zhi, ganz: hp.ganzhi, element: ELEMENT[hp.gan] } : null,
    },
    chang_ganzhi: yp.gan + yp.zhi + (mp ? mp.gan + mp.zhi : '') + dp.gan + dp.zhi + (hp ? hp.gan + hp.zhi : ''),
    nayin: NAYIN[dp.index % 60],
    tally: tally(stems, zhis),
    term: { prev, next, daysToNext },
    trueSolar: {
      offsetMinutes: tSolar, degraded,
      canonHour: canon ? Number(canon.canonHour.toFixed(3)) : null,
      canonDate: canon ? { y: canon.canonDate.y, m: canon.canonDate.m, d: canon.canonDate.d } : null,
      dayChanged: canon ? canon.dayChanged : false,
    },
    moon: { ageDays: Number(lunarAge(jd).ageDays.toFixed(4)), name: moon.name, sym: moon.sym },
    algorithmic_approx: false,
  };
}

