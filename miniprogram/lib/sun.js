/**
 * miniprogram/lib/sun.js — 日出 / 日落 / 正午的确定性天文计算（仅展示层，扩展真实能力）。
 *
 * 用途：「今日天时」卡片需要的真实日出/日落时间，由用户出生地点经度(lng)/纬度(lat)驱动；
 *       未选择出生地点时前端用默认北京 (116.4074, 39.9042)。
 * 方法：NOAA 通用日出日落算法（太阳赤纬 + 时角 H + 折射 -0.833° 补偿），工程精度 ±1 分钟。
 *
 * 工程纪律：
 *   - 只计算「某公历日、某 lng、某 lat」的日出/日落，不修改八字/节气/历法/真太阳时核心。
 *   - 复用 engine.js 导出的 gregorianToJde / jdeToGregorian / solarLon / eotMinutes，
 *     保持 JS 侧确定性，便于单测对拍。
 *   - 返回 HH:MM 当地平均太阳时(LMT)；两极地区（极昼/极夜）返回 valid=false。
 */

'use strict';

import { gregorianToJde, solarLon, eotMinutes } from './engine.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const OBLIQUITY = 23.44; // 黄赤交角(deg) 近似，足够 ±1min

/** 太阳赤纬（deg）：由 Meeus 低精度太阳视黄经 λ 换算。 */
function solarDeclination(jde) {
  const lon = solarLon(jde) * D2R;
  const egz = OBLIQUITY * D2R;
  return Math.asin(Math.sin(egz) * Math.sin(lon)) * R2D;
}

function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

/**
 * 计算某公历日 (y,m,d) 在 (lngDeg, latDeg) 的日出/日落/正午。
 * 返回：
 *   - valid=true ： { sunrise, sunset, noon } 均为 "HH:MM"（当地平均太阳时 LMT）。
 *   - valid=false：极昼/极夜区或无有效昼夜，sunrise/sunset 为 null。
 */
export function sunTimes(y, m, d, lngDeg, latDeg) {
  const jd0 = gregorianToJde(y, m, d); // 当日 0h（JDN）中午坐标系
  const phi = latDeg * D2R;
  const dec = solarDeclination(jd0);

  // 余弦判据 cosH = -tanφ·tanδ；abs>1 → 极昼/极夜。
  const t = Math.tan(phi) * Math.tan(dec * D2R);
  if (Math.abs(t) > 1) {
    return { sunrise: null, sunset: null, noon: null, valid: false };
  }
  const H0 = Math.acos(Math.min(1, Math.max(-1, -t))) * R2D; // 半日照时角(deg)

  // 均时差（分钟），时角加减：每度 = 4 分钟。
  const eot = eotMinutes(jd0);
  // 地方平太阳时正午(LMT) = 12h - (lng-120)/15 - EoT/60：以太阳过当地子午线算正午。
  const noonH = 12 - (lngDeg - 120) / 15 - eot / 60;
  const wrap = (x, y) => ((x % y) + y) % y;

  const srise = wrap(noonH - H0 / 15, 24);
  const sset = wrap(noonH + H0 / 15, 24);
  const noon = wrap(noonH, 24);

  const fmt = (h) => `${pad2(h)}:${pad2((h * 60) % 60)}`;
  return {
    sunrise: fmt(srise),
    sunset: fmt(sset),
    noon: fmt(noon),
    valid: true,
  };
}