import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArchive } from '../../miniprogram/lib/archive.js';

test('MI1 同一历日不同出生时刻的朔望月龄应随绝对瞬间推进', () => {
  const a = computeArchive(2024, 4, 14, 0, null);
  const b = computeArchive(2024, 4, 14, 20, null);
  const diff = b.moon.ageDays - a.moon.ageDays;
  assert.ok(diff > 0.82 && diff < 0.85, `20 小时应约为 0.8333 天，实得 ${diff}`);
});

test('MI2 时辰未知时使用当日北京时间午正作为月龄代表时刻', () => {
  const unknown = computeArchive(2024, 4, 14, -1, null);
  const noon = computeArchive(2024, 4, 14, 12, null);
  assert.equal(unknown.moon.ageDays, noon.moon.ageDays);
});
