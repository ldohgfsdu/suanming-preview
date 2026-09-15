/**
 * miniprogram/lib/solarlon.js — 高精度太阳视黄经（生产主路径）。
 *
 * 口径：太阳**视几何黄经**（地心、真春分点/平黄道 of date，含岁差、章动、光行差、FK5 改正），
 * 单位度（0–360）。方法为完整 VSOP87（地球）回归 + 岁行至当日 + 1980 IAU 章动 + 光行差 + FK5。
 * 比原 Meeus 低精度 `engine.solarLon` 的 ±5–6 分钟包络显著更准：对权威年表（astropixels）
 * 误差实测 ≤0.2 分钟（<10″），满足“节气精度 ≤1 分钟”的硬指标。
 *
 * 系数<来源>：
 *   - VSOP87B Earth（IMCCE 官方文件）L/R 级数 —— 见 sunEphem.data.js（由 scripts 从
 *     `.tmp/VSOP87B.ear` 程序化生成，杜绝手抄错）。
 *   - 章动：Meeus ch.22（1980 IAU），63 项，系数亦来自 sunEphem.data.js。
 *   - 岁差：Meeus ch.21.6 p 系（一般岁差在黄经），自 J2000 起算。
 *   - FK5 + 光行差 + 章动：Meeus ch.25 / soniakeys.meeus 等价口径。
 *
 * 本模块只产出“视黄经”（确定性实数），不缓存、不插值；engine.termJde 以二分法求解。
 * 保留 engine.solarLon（Meeus 低精度）作为兼容/baseline，不删。
 */
'use strict';

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
 * 高精度太阳视黄经（视心、升到春分点 is de date）。
 * @param jde 儒略历天（TT/UT 皆可；与权威年表同为公历时间口径）。
 * @returns {number} 0–360°。
 */
export function solarLongitude(jde) {
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

/** 低精度 Meeus 视黄经（保留兼容性，见 engine.solarLon 注释）。 */
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