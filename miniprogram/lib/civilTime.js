/**
 * 中国历史墙钟时间 → 标准北京时间。
 *
 * 1986–1991 年中国曾实行夏时制。用户输入的是出生证明/钟表上看到的本地时间，
 * 历法引擎内部则统一以标准北京时间（UTC+8）表示绝对瞬间，再进入真太阳时换算。
 * GAP 不猜；FOLD 必须显式选择第一次/第二次。
 */
'use strict';

import { WallState, classifyWall, resolveWallToInstant } from './chinadst.js';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function fromUtcMillisAsBeijingStandard(epochMilli) {
  const d = new Date(epochMilli + BEIJING_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return {
    y, m, d: day, hour, minute,
    hourDecimal: hour + minute / 60,
  };
}

/**
 * @param {number} y @param {number} m @param {number} d
 * @param {number} hour 0..23
 * @param {number} minute 0..59
 * @param {'earlier'|'later'|null} foldChoice
 */
export function resolveChinaCivilTime(y, m, d, hour, minute, foldChoice = null) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { ok: true, unknown: true, state: WallState.STANDARD, dstApplied: false };
  }
  const mi = Number.isInteger(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  const state = classifyWall(y, m, d, hour, mi);

  if (state === WallState.GAP) {
    return {
      ok: false,
      state,
      reason: 'dst_gap',
      message: '该钟表时间处于夏令时拨快缺口，历史上并不存在，请返回修改出生时间。',
    };
  }
  if (state === WallState.FOLD && foldChoice !== 'earlier' && foldChoice !== 'later') {
    return {
      ok: false,
      state,
      reason: 'dst_fold_unresolved',
      needsFoldChoice: true,
      message: '该钟表时间在夏令时结束当天出现两次，需要选择第一次或第二次。',
    };
  }

  const resolved = resolveWallToInstant(
    y, m, d, hour, mi,
    state === WallState.FOLD ? { foldChoice } : undefined,
  );
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    unknown: false,
    state,
    dstApplied: !!resolved.dstApplied,
    foldChoice: state === WallState.FOLD ? foldChoice : null,
    epochMilli: resolved.epochMilli,
    ...fromUtcMillisAsBeijingStandard(resolved.epochMilli),
  };
}
