/**
 * miniprogram/lib/chinadst.js — 中国夏令时（1986–1991）与不可计算降级契约
 *
 * 移植自 Core `domain-solar-time`：
 *   - `ChinaDaylightSaving.kt`（12 次切换表 + WallState 分类）
 *   - `CivilInstant.kt`（gap/fold 边界处理）
 *   - `SolarTime.kt:45`（MAX_LONGITUDE_TZ_MISMATCH_DEGREES 降级契约）
 *
 * 依据（**一手政府文件**，已交叉核对）：
 *   - 《中共中央办公厅、国务院办公厅关于在全国范围内实行夏时制的通知》（1986-04）
 *   - 《国务院办公厅关于1988年夏时制起止时间的通知》
 *     → 北京市人民政府办公厅 京政办发[1988]17号 原文：
 *       「1988年夏时制定于4月17日(星期日)凌晨2时开始……9月11日(星期日)凌晨2时结束」
 *     → 人民日报 1988-04-11 第1版：「夏时制从4月17日开始」
 *   - 《国务院办公厅关于暂停实行夏时制的通知》（1992-04-05 起停用）
 *
 * 规则：每年 4 月中旬、9 月中旬的某个**星期日** 02:00 切换（逐年日期见 SEASONS）。
 * 1986 为首年，5 月 4 日才开始（准备期推迟）。
 *
 * ⚠️ **不假设「固定第 N 个周日」**：网络百科常概括为「4 月/9 月第 2 个周日」，
 *    但逐年实际日期**并不都等于第 2 个周日**（1988 年 4 月 17 日是当月第 3 个周日）。
 *    故本表只采用**逐年政府文件确认的日期**，不套用任何推导公式。
 *
 * ⚠️ **数据争议已定论**：部分百科（如百度百科「北京夏令时」词条）称 1988 年为「4 月 10 日」，
 *    与本表冲突。经核对**国务院办公厅通知原文（京政办发[1988]17号）
 *    + 人民日报 1988-04-11 第1 版报道**，1988 年确为 **4 月 17 日**，本表采 4/17。
 *
 * 设计要点（承接 Core 的工程纪律）：
 *   1. **不依赖设备 tzdata** —— 切换日期硬编码，避免设备时区库差异导致结果漂移
 *   2. **gap（不存在的时间）绝不静默猜测** —— 拨快跳过的 02:00–03:00 标为 GAP
 *   3. **fold（出现两次的时间）必须显式选择** —— 拨回重复的 01:00–02:00 标为 FOLD
 *   4. **时区/经度不自洽即降级** —— 偏差 >60° 时拒绝计算，不静默回落
 */

'use strict';

/** 夏令时多出的秒数（1 小时）。 */
export const DST_SECONDS = 3600;

/** 切换发生的北京钟表整点。 */
const TRANSITION_HOUR = 2;

/** 视为中国境内、适用全国夏令时表的 IANA 时区（含历史别名）。 */
export const CHINA_ZONE_IDS = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Chungking',
  'Asia/Harbin',
  'PRC',
]);

/** 1986–1991 全部 6 季（12 次切换）。春季拨快日/ 秋季拨回日均为星期日。 */
export const SEASONS = [
  { year: 1986, springForward: [1986, 5, 4], fallBack: [1986, 9, 14] },
  { year: 1987, springForward: [1987, 4, 12], fallBack: [1987, 9, 13] },
  { year: 1988, springForward: [1988, 4, 17], fallBack: [1988, 9, 11] },
  { year: 1989, springForward: [1989, 4, 16], fallBack: [1989, 9, 17] },
  { year: 1990, springForward: [1990, 4, 15], fallBack: [1990, 9, 16] },
  { year: 1991, springForward: [1991, 4, 14], fallBack: [1991, 9, 15] },
];

/** 墙钟状态。 */
export const WallState = {
  STANDARD: 'STANDARD',   // 标准时（未实行夏令时）
  DAYLIGHT: 'DAYLIGHT',   // 夏令时，唯一（需退 1 小时）
  GAP: 'GAP',             // 拨快跳过：钟表上不存在
  FOLD: 'FOLD',           // 拨回重复：钟表上出现两次
};

function seasonOf(year) {
  return SEASONS.find((s) => s.year === year) || null;
}

/** 该年是否在硬编码表覆盖范围内（表外年份一律标准时）。 */
export function covers(year) {
  return seasonOf(year) != null;
}

/** 该时区是否适用中国夏令时表。 */
export function appliesTo(zoneId) {
  return zoneId != null && CHINA_ZONE_IDS.has(zoneId);
}

/** 把 [y,m,d] 与 时:分 组合为可比较的整数键（YYYYMMDDHHMM，便于字典序比较）。 */
function wallKey(y, mo, d, h, mi) {
  return y * 100000000 + mo * 1000000 + d * 10000 + h * 100 + mi;
}

/**
 * 按全国表判定墙钟状态（只看墙钟数字，不看出生地时区）。
 * @param {number} y 年 @param {number} mo 月 @param {number} d 日
 * @param {number} h 时 @param {number} mi 分
 * @returns {string} WallState 之一
 */
export function classifyWall(y, mo, d, h, mi) {
  const s = seasonOf(y);
  if (!s) return WallState.STANDARD;
  const t = wallKey(y, mo, d, h, mi);
  const gapStart = wallKey(s.springForward[0], s.springForward[1], s.springForward[2], TRANSITION_HOUR, 0);
  const gapEnd = gapStart + 100;            // 03:00
  const foldEnd = wallKey(s.fallBack[0], s.fallBack[1], s.fallBack[2], TRANSITION_HOUR, 0);
  const foldStart = foldEnd - 100;          // 01:00
  if (t < gapStart) return WallState.STANDARD;
  if (t < gapEnd) return WallState.GAP;
  if (t < foldStart) return WallState.DAYLIGHT;
  if (t < foldEnd) return WallState.FOLD;
  return WallState.STANDARD;
}

/**
 * 把墙钟（北京时间钟面读数）解析为绝对瞬间的 UTC 毫秒。
 *
 * 规则（承接 Core `CivilInstant.resolve`）：
 *   - STANDARD：标准时（UTC+8）
 *   - DAYLIGHT：夏令时（UTC+9）
 *   - GAP：**拒绝** —— 该钟面时间不存在，不猜测
 *   - FOLD：**必须显式选择** —— 该钟面时间出现两次
 *
 * @param {number} y @param {number} mo @param {number} d
 * @param {number} h @param {number} mi
 * @param {{ foldChoice?: 'earlier'|'later' }} [opts] FOLD 时的显式选择
 * @returns {{ ok: true, epochMilli: number, dstApplied: boolean, state: string }
 *          | { ok: false, state: string, reason: string }}
 */
export function resolveWallToInstant(y, mo, d, h, mi, opts) {
  const state = classifyWall(y, mo, d, h, mi);
  const base = Date.UTC(y, mo - 1, d, h, mi);

  if (state === WallState.GAP) {
    // 拨快缺口：02:00–02:59 根本不存在。不静默顺延到 03:00，交由调用方显式处理。
    return {
      ok: false,
      state,
      reason: 'dst_gap',
      message: `${y}-${mo}-${d} ${h}:${mi} 处于夏令时拨快缺口（该钟面时间不存在）`,
    };
  }
  if (state === WallState.FOLD) {
    const choice = opts && opts.foldChoice;
    if (choice !== 'earlier' && choice !== 'later') {
      return {
        ok: false,
        state,
        reason: 'dst_fold_unresolved',
        message: `${y}-${mo}-${d} ${h}:${mi} 处于夏令时拨回重叠（该钟面时间出现两次），需显式指定早/晚`,
      };
    }
    // 第一次为夏令时（早，+1h），第二次为标准时（晚，不变）
    const dstApplied = choice === 'earlier';
    const offsetMin = -8 * 60 - (dstApplied ? 60 : 0);
    return {
      ok: true,
      epochMilli: base + offsetMin * 60000,
      dstApplied,
      state,
    };
  }

  const dstApplied = state === WallState.DAYLIGHT;
  const offsetMin = -8 * 60 - (dstApplied ? 60 : 0);
  return {
    ok: true,
    epochMilli: base + offsetMin * 60000,
    dstApplied,
    state,
  };
}

/**
 * 不可计算降级契约（移植 Core `SolarTime.kt:45` 的 MAX_LONGITUDE_TZ_MISMATCH_DEGREES）。
 *
 * 时区中央经线与出生地实际经度偏差过大时，**拒绝计算**并降级，
 * 避免「看起来正常但实际错」的结果。
 *
 * @param {number|null} placeLon 出生地经度（东经为正）
 * @param {string|null} timezoneId IANA 时区
 * @returns {{ degraded: boolean, reason?: string, tzCentralMeridianLon?: number }}
 */
export function assessLonTimezoneConsistency(placeLon, timezoneId) {
  if (placeLon == null || !Number.isFinite(placeLon)) {
    return { degraded: true, reason: 'no_longitude' };
  }
  if (!timezoneId) {
    return { degraded: true, reason: 'no_timezone' };
  }
  const central = timezoneCentralMeridian(timezoneId);
  if (central == null) {
    // 非中国时区/无中央经线概念 → 不做此项校验（不误伤海外）
    return { degraded: false, tzCentralMeridianLon: null };
  }
  const diff = Math.abs(placeLon - central);
  if (diff > 60) {
    return {
      degraded: true,
      reason: 'lon_tz_mismatch',
      tzCentralMeridianLon: central,
    };
  }
  return { degraded: false, tzCentralMeridianLon: central };
}

/**
 * 时区中央经线（度，东经为正）。
 * 采用 IANA 的 representative longitude，覆盖 UTC 全域主要偏移。
 * @param {string} timezoneId
 * @returns {number|null}
 */
export function timezoneCentralMeridian(timezoneId) {
  if (!timezoneId) return null;
  // 中国全境统一北京时间（UTC+8）；含历史别名与新疆不适用此表的情形
  if (CHINA_ZONE_IDS.has(timezoneId)) return 120;
  if (timezoneId === 'Asia/Urumqi' || timezoneId === 'Asia/Kashgar') return 90;
  if (timezoneId === 'Asia/Kathmandu') return 85.5;
  if (timezoneId === 'Asia/Colombo') return 82.5;
  if (timezoneId === 'Asia/Dhaka' || timezoneId === 'Asia/Thimphu') return 90;
  if (timezoneId === 'Asia/Yangon' || timezoneId === 'Asia/Rangoon') return 96;
  if (timezoneId === 'Asia/Bangkok' || timezoneId === 'Asia/Jakarta') return 105;
  if (timezoneId === 'Asia/Ho_Chi_Minh' || timezoneId === 'Asia/Saigon') return 105;
  if (timezoneId === 'Asia/Singapore') return 104.5444;
  if (timezoneId === 'Asia/Kuala_Lumpur' || timezoneId === 'Asia/Kuching') return 112.5;
  if (timezoneId === 'Asia/Manila') return 120;
  if (timezoneId === 'Asia/Taipei') return 120;
  if (timezoneId === 'Asia/Tokyo') return 135;
  if (timezoneId === 'Asia/Seoul') return 127.5;
  if (timezoneId === 'Asia/Hong_Kong') return 120;
  if (timezoneId === 'Asia/Macau') return 120;
  if (timezoneId === 'Australia/Perth') return 115;
  if (timezoneId === 'Australia/Brisbane') return 150;
  if (timezoneId === 'Australia/Sydney' || timezoneId === 'Australia/Melbourne'
      || timezoneId === 'Australia/Canberra' || timezoneId === 'Australia/Hobart') return 150;
  if (timezoneId === 'Australia/Adelaide') return 135;
  if (timezoneId === 'Australia/Darwin') return 135;
  if (timezoneId === 'Pacific/Auckland') return 174.75;
  if (timezoneId === 'Pacific/Fiji') return 180;
  // 整点偏移快速覆盖（UTC±N）
  const m = /^(?:Etc\/)?(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timezoneId);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const hh = Number(m[2]);
    const mm = m[3] ? Number(m[3]) : 0;
    const off = sign * (hh + mm / 60);
    return off * 15;
  }
  const m2 = /^(?:Etc\/)?UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(timezoneId);
  if (m2) {
    // POSIX 风格 Etc/GMT+8 表示 UTC-8
    const sign = m2[1] === '-' ? -1 : 1;
    const hh = Number(m2[2]);
    const mm = m2[3] ? Number(m2[3]) : 0;
    return -(sign * (hh + mm / 60)) * 15;
  }
  return null;
}

/** 降级原因的中文说明（供界面与 AI 解释层使用）。 */
export const DEGRADE_MESSAGES = {
  no_longitude: '未提供出生地经度，无法校正真太阳时',
  no_timezone: '未提供时区，无法确定标准时偏移',
  lon_tz_mismatch: '出生地经度与所选时区不自洽（偏差超过 60°），已拒绝计算真太阳时',
  dst_gap: '该出生时刻处于夏令时拨快缺口（钟面时间不存在）',
  dst_fold_unresolved: '该出生时刻处于夏令时拨回重叠（钟面时间出现两次），需指定早/晚',
};
