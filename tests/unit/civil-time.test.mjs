import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChinaCivilTime } from '../../miniprogram/lib/civilTime.js';

// 1990-06-15 12:00 夏令时钟表 = 标准北京时间 11:00。
test('CT1 夏令时墙钟必须退回 1 小时再进入历法引擎', () => {
  const r = resolveChinaCivilTime(1990, 6, 15, 12, 0);
  assert.equal(r.ok, true);
  assert.equal(r.dstApplied, true);
  assert.deepEqual([r.y, r.m, r.d, r.hour, r.minute], [1990, 6, 15, 11, 0]);
});

// 00:30 退一小时会跨到前一日 23:30，日期必须一起变化。
test('CT2 夏令时校正跨日前一日时日期同步回退', () => {
  const r = resolveChinaCivilTime(1990, 6, 15, 0, 30);
  assert.equal(r.ok, true);
  assert.deepEqual([r.y, r.m, r.d, r.hour, r.minute], [1990, 6, 14, 23, 30]);
});

test('CT3 拨快缺口直接拒绝，不静默猜测', () => {
  const r = resolveChinaCivilTime(1990, 4, 15, 2, 30);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'dst_gap');
});

test('CT4 拨回重叠必须显式选择，两个瞬时相差一小时', () => {
  const none = resolveChinaCivilTime(1990, 9, 16, 1, 30);
  assert.equal(none.ok, false);
  assert.equal(none.needsFoldChoice, true);

  const first = resolveChinaCivilTime(1990, 9, 16, 1, 30, 'earlier');
  const second = resolveChinaCivilTime(1990, 9, 16, 1, 30, 'later');
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.epochMilli - second.epochMilli, -3600 * 1000);
  assert.equal(first.dstApplied, true);
  assert.equal(second.dstApplied, false);
});

test('CT5 非夏令时年份保持原钟表时间', () => {
  const r = resolveChinaCivilTime(2000, 1, 1, 8, 15);
  assert.equal(r.ok, true);
  assert.equal(r.dstApplied, false);
  assert.deepEqual([r.y, r.m, r.d, r.hour, r.minute], [2000, 1, 1, 8, 15]);
});
