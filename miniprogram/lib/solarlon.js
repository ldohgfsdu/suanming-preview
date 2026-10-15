/**
 * miniprogram/lib/solarlon.js — 高精度太阳视黄经（生产主路径）。
 *
 * 口径：太阳**视几何黄经**（地心、真春分点/平黄道 of date，含岁差、章动、光行差、FK5 改正），
 * 单位度（0–360）。方法为完整 VSOP87（地球）级数 + 岁差至当日 + 1980 IAU 章动（63 项）
 * + 光行差 + FK5 改正。
 *
 * 时间基准：入参为 **UTC** 儒略日，内部先经 `deltaTSeconds` 换算为 **TT（力学时）**
 * 再代入 VSOP87 级数（级数定义于力学时基准）。此换算与 Core
 * `domain-solar-term/.../SolarTermCalculator.sunApparentLongitude` 接线一致。
 *
 * 精度实测（2026 年 24 节气 vs 紫金山天文台）：**24/24 日期正确，时刻偏差 ≤1 分钟**。
 * 详见 `tests/unit/solar-terms-accuracy.test.mjs`。
 *
 * 系数<来源>：
 *   - VSOP87B Earth（IMCCE 官方文件）L/R 级数 —— 见 sunEphem.data.js（由 scripts 从
 *     `.tmp/VSOP87B.ear` 程序化生成，杜绝手抄错）。
 *   - 章动：Meeus ch.22（1980 IAU），63 项，系数亦来自 sunEphem.data.js。
 *   - 岁差：Meeus ch.21.6 p 系（一般岁差在黄经），自 J2000 起算。
 *   - FK5 + 光行差 + 章动：Meeus ch.25 / soniakeys.meeus 等价口径。
 *   - ΔT：Espenak & Meeus（NASA TP-2006-214141）分段多项式，移植自 Core 的 DeltaT 实现。
 *
 * 本模块只产出“视黄经”（确定性实数），不缓存、不插值；engine.termJde 以二分法求解。
 *
 * 单一事实源说明：
 *   `engine.solarLon` 只是本模块 `solarLongitude` 的转发（历史命名保留），
 *   **二者是同一个高精度实现**，不存在「低精度 Meeus」生产路径。
 *   一致性由 tests/unit/astronomy-audit.test.mjs 的 A18 断言（<1e-9）钉住。
 *   `solarLongitudeLow` 是 Meeus 低精度参考实现，仅供人工调试/对拍用，
 *   **生产路径不使用**（sun.js / engine.js 均走高精度）。
 */
'use strict';

// ΔT 分段多项式的定义域（域外钳制到端点）
const DELTA_T_START_YEAR = 1900.0;
const DELTA_T_END_YEAR = 2100.0;

import { L, R, NUT } from './sunEphem.data.js';

const D2R = Math.PI / 180;
const AS2R = D2R / 3600;             // 角秒→弧度
const RAD = 180 / Math.PI;           // 弧度→度

function mod360(x) { let v = x % 360; if (v < 0) v += 360; return v; }

/** 给定功率序列（VSOP87 L/R）在 τ（=T·0.1）处的值（弧度级）。 */
function seriesValue(series, tau) {
  const keys = Object.keys(series);
  let acc = 0;
  for (let p = keys.length - 1; p >= 0; p--) {
    const t = series[keys[p]];
    let c = 0;
    for (let i = 0; i < t.length; i += 3) {
      c += t[i] * Math.cos(t[i + 1] + t[i + 2] * tau);
    }
    acc = acc * tau + c;
  }
  return acc; // 弧度
}

/** Meeus ch.22 章动经度 Δψ（弧秒）。 */
function nutationLongitudeArcsec(T) {
  const H = (a, b, c, d) => a + b * T + c * T * T + d * T * T * T;
  const D = H(297.85036, 445267.11148, -0.0019142, 1 / 189474) * D2R;
  const M = H(357.52772, 35999.05034, -0.0001603, -1 / 300000) * D2R;
  const F = H(93.27191, 483202.017538, -0.0036825, 1 / 327270) * D2R;
  const O = H(125.04452, -1934.136261, 0.0020708, 1 / 450000) * D2R;
  const Nm = H(134.96298, 477198.867398, 0.0086972, 1 / 5620) * D2R;
  let dp = 0;
  for (const r of NUT) {
    const arg = r[0] * D + r[1] * M + r[2] * Nm + r[3] * F + r[4] * O;
    dp += Math.sin(arg) * (r[5] + r[6] * T);
  }
  return dp / 10000; // 0.0001″ → 角秒
}

/**
 * ΔT = TT − UT，单位秒。
 *
 * Espenak & Meeus（NASA TP-2006-214141）分段多项式，定义域 1900–2100。
 * 移植自 Core `domain-solar-term/.../Vsop87Earth.kt:158-200`（DeltaT 对象），
 * 公式与分段边界逐条对齐，保证两轨计算口径一致（D-005 双轨分离的事实层共享）。
 *
 * 域外年份**钳制到端点**（确定性，不静默使用错误模型）。
 *
 * @param {number} year 公历年（可含小数）
 * @returns {number} ΔT 秒数
 */
export function deltaTSeconds(year) {
  const y = year;
  if (y < DELTA_T_START_YEAR) return deltaTSeconds(DELTA_T_START_YEAR);
  if (y > DELTA_T_END_YEAR) return deltaTSeconds(DELTA_T_END_YEAR);
  const t = y - 1900;
  if (y < 1920) {
    return -2.79 + 1.494119 * t - 0.0598939 * t * t
      + 0.0061966 * t * t * t - 0.000197 * t * t * t * t;
  }
  if (y < 1941) {
    const u = y - 1920;
    return 21.20 + 0.84493 * u - 0.076100 * u * u + 0.0020936 * u * u * u;
  }
  if (y < 1961) {
    const u = y - 1950;
    return 29.07 + 0.407 * u - (u * u) / 233.0 + (u * u * u) / 2547.0;
  }
  if (y < 1986) {
    const u = y - 1975;
    return 45.45 + 1.067 * u - (u * u) / 260.0 - (u * u * u) / 718.0;
  }
  if (y < 2000) {
    const u = y - 2000;
    return 63.86 + 0.3345 * u - 0.060374 * u * u + 0.0017275 * u * u * u
      + 0.000651814 * u * u * u * u + 0.00002373599 * u * u * u * u * u;
  }
  // 2000–2100：Espenak/Meeus 世纪参数形式
  const c = (y - 2000) / 100;
  return 62.92 + 32.217 * c + 55.89 * c * c;
}

/** 由 UTC 儒略日估算对应公历年（用于取 ΔT）。与 Core 同式。 */
function yearFromUtcJd(jdUtc) {
  return 2000 + (jdUtc - 2451545) / 365.2425;
}

/**
 * UTC 儒略日 → TT 儒略日。
 * 视黄经的 VSOP87 级数在力学时（TT）基准下定义，必须先做此换算，
 * 否则节气时刻会出现约 ΔT（≈2 分钟）的系统性偏移。
 * @param {number} jdUtc UTC 儒略日
 * @returns {number} TT 儒略日
 */
export function utcJdToTt(jdUtc) {
  return jdUtc + deltaTSeconds(yearFromUtcJd(jdUtc)) / 86400.0;
}

/**
 * 高精度太阳视黄经（视心、升到春分点 is de date）。
 *
 * 入参为 **UTC** 儒略日；内部先转 TT 再代入 VSOP87 级数——
 * 与 Core `SolarTermCalculator.sunApparentLongitude` 接线一致
 * （`Vsop87Earth.sunApparentLongitudeTt(DeltaT.utcJdToTt(jd))`）。
 *
 * @param {number} jdeUtc UTC 儒略日
 * @returns {number} 0–360°。
 */
export function solarLongitude(jdeUtc) {
  const jde = utcJdToTt(jdeUtc);
  const T = (jde - 2451545) / 36525;      // 自 J2000 的儒略世纪
  const l0 = seriesValue(L, T * 0.1);    // 地球黄经（J2000，弧度）
  // 岁差（经度 p 系，Meeus 21.6）自 J2000 到当日期
  const pA = (5029.0966 + 1.11113 * T - 0.000006 * T * T) * T * AS2R; // 弧度
  let s = l0 + pA + Math.PI;             // 太阳几何（当前春分点）弧度
  s -= 0.09033 * AS2R;                   // FK5 黄经改正（黄纬≈0 时）
  const rR = seriesValue(R, T * 0.1);    // 日地距离 AU
  const dp = nutationLongitudeArcsec(T) * AS2R;  // 章动经度（弧度）
  const ab = (-20.4898 / rR) * AS2R;     // 光行差（弧度）
  return mod360((s + dp + ab) * RAD);
}

/**
 * 低精度 Meeus 视黄经（太阳几何黄经，不含岁差/章动/光行差/FK5）。
 *
 * **仅用于人工调试与对拍参考，生产路径不使用**：节气求解（engine.solarLon → 本文件
 * solarLongitude）与日出日落（sun.js）都走高精度实现。
 * 保留它是为了在排查精度问题时有一个可手算的对照量，不是 baseline。
 */
export function solarLongitudeLow(jde) {
  const T = (jde - 2451545) / 36525;
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = mod360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = M * D2R;
  L0 += (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  const om = 125.04 - 1934.136 * T;
  L0 -= 0.00569 + 0.00478 * Math.sin(om * D2R);
  return mod360(L0);
}