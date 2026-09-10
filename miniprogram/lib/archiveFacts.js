/**
 * miniprogram/lib/archiveFacts.js — engine computeArchive output → S-4 §6 facts adapter.
 *
 * 目的：把运行引擎 `computeArchive` 的确定性产物映射为 shared/domain 的 `ArchiveFacts`
 *   （即 S-4 §6 事实层），使 `doc_hash` 可由“引擎产物”直接计算（B-6② 闭环）。
 * 输出字段名/形状与 `shared/domain/archiveDocument.ts` 的 `ArchiveFacts` 一致（camelCase），
 * 可直接喂给 `computeDocHash(version, inputHash, facts)`。
 *
 * 口径：
 *   - S4 冻结稿 §2/§5/§6/§7
 *   - 工程纪律：只 map 引擎真实算出的量；§6 `lunar` 的落地日历日在 lunar-table
 *     （Meeus 朔 + 中气）具备后被 engine 实际计算出（year/month/leap 与黄金锚点
 *     对拍通过，day 带朔日边界 ±1 的 approx 标记）；表未覆盖 → 显式 null。
 *   - engine 的 `trueSolar.offsetMinutes` 是总时差（分钟）；§6 要求拆成秒：
 *     lon_diff_seconds / eot_seconds / total_offset_seconds，这里用 engine 导出
 *     eotMinutes(JD) 与输入 lonDeg 重拆。
 */
'use strict';

import { eotMinutes } from './engine.js';

const S = 60; // 分钟→秒

/** 从 computeArchive 结果 + 原始日期分量，组装 S-4 §6 事实层（== ArchiveFacts 形状）。 */
export function toFacts(arc, { year, month, day, hour, minute }, lonDeg, jd) {
  if (!arc || !arc.four) throw new TypeError('toFacts: 须传入 computeArchive 结果');

  const yp = arc.four.year;
  const mp = arc.four.month;
  const dp = arc.four.day;
  const hp = arc.four.hour;

  const hourVal = (hour >= 0 && hour <= 23) ? hour : null;
  const minuteVal = (minute >= 0 && minute < 60) ? minute : null;

  // ---- 真太阳时拆分（秒）----
  let lonDiffSeconds = null, eotSeconds = null, totalOffsetSeconds = null;
  if (Number.isFinite(lonDeg) && jd !== undefined) {
    const eotMin = eotMinutes(jd);
    eotSeconds = Math.round(eotMin * S);
    lonDiffSeconds = Math.round(4 * (lonDeg - 120) * S);
    // 总时差 = 经度差 + 均时差（秒）；由两个已舍入分量求和，保证 total===lonDiff+eot
    totalOffsetSeconds = lonDiffSeconds + eotSeconds;
  }
  const solarTimeDegraded = !Number.isFinite(totalOffsetSeconds);

  // 农历落地日：engine computeArchive 已由 lunar-table（Meeus 朔+中气）算得；
  // 若表未覆盖则该日为 null（不伪造）。lunar 恒带 approx:true 标记（朔日边界 ±1）。
  const lun = arc.lunar && arc.lunar.year != null ? arc.lunar : null;
  return {
    solarNormalized: { year, month, day, hour: hourVal, minute: minuteVal, hourUnknown: hourVal === null },
    lunar: {
      year: lun ? lun.year : null,
      month: lun ? lun.month : null,
      day: lun ? lun.day : null,
      isLeapMonth: lun ? lun.leap : false,
    },
    instantIso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    prevTerm: arc.term.prev ? { name: arc.term.prev.name, instantIso: arc.term.prev.utc, ordinal: arc.term.prev.ord } : null,
    nextTerm: arc.term.next ? { name: arc.term.next.name, instantIso: arc.term.next.utc, ordinal: arc.term.next.ord } : null,
    daysToNextTerm: arc.term.daysToNext, // DEC(6)
    yearGanZhi: yp ? yp.gan + yp.zhi : null,
    monthGanZhi: mp ? mp.gan + mp.zhi : null,
    dayGanZhi: dp ? dp.gan + dp.zhi : null,
    hourGanZhi: hp ? hp.gan + hp.zhi : null,
    lonDiffSeconds,
    eotSeconds,
    totalOffsetSeconds,
    solarTimeDegraded,
    elementCount: arc.tally, // {wood,fire,earth,metal,water}
  };
}