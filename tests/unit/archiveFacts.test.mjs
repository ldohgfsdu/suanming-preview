/**
 * 集成测试：engine computeArchive → archiveFacts adapter → computeDocHash
 * （B-6② 闭环：运行引擎产物可直接哈希成 doc_hash）。
 * 覆盖：
 *   - 适配输出与 shared ArchiveFacts 形状一致
 *   - 传入 computeDocHash 不抛键集断言且 hash 稳定
 *   - 农历日历日 = null（P0 未具备农历表，不伪造）
 *   - 太阳时差拆秒可计算；不同输入 → 不同 doc_hash
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeArchive } from '../../miniprogram/lib/archive.js';
import { gregorianToJde } from '../../miniprogram/lib/engine.js';
import { toFacts } from '../../miniprogram/lib/archiveFacts.js';
import { computeDocHash } from '../../dist-test/shared/domain/archiveDocument.js';

const VERSION = {
  schemaVersion: 'v1', algoVersion: 'bazi-core-1.3', traceVersion: 'trace-1',
  chartSchemaVersion: null, factsSchemaVersion: null,
};
const INPUT_HASH = 'sha256:abcd'.padEnd(71, 'e');

test('闭环: 引擎产物 → ArchiveFacts → 稳定 doc_hash, 键集断言通过', () => {
  const Y = 2023, M = 3, D = 20, H = 12, lon = 116.397128;
  const arc = computeArchive(Y, M, D, H, lon);
  const jd = gregorianToJde(Y, M, D);
  const facts = toFacts(arc, { year: Y, month: M, day: D, hour: H, minute: 0 }, lon, jd);

  assert.strictEqual(facts.yearGanZhi.length, 2);
  assert.strictEqual(facts.dayGanZhi.length, 2);
  assert.deepStrictEqual(Object.keys(facts.elementCount), ['wood', 'fire', 'earth', 'metal', 'water']);
  // 农历日历日 = null（未具备表）
  assert.strictEqual(facts.lunar.year, null);
  assert.strictEqual(facts.lunar.month, null);
  // 提供了经度 → 未降级
  assert.strictEqual(facts.solarTimeDegraded, false);

  const h1 = computeDocHash(VERSION, INPUT_HASH, facts);
  const h2 = computeDocHash(VERSION, INPUT_HASH, facts);
  assert.ok(h1.value.startsWith('sha256:'));
  assert.strictEqual(h1.value, h2.value, '同输入 doc_hash 必须稳定');
});

test('太阳时拆秒: lonDiff/eot/total 满足 total=lonDiff+eot', () => {
  const Y = 2023, M = 3, D = 20, H = 12, lon = 116.397128;
  const jd = gregorianToJde(Y, M, D);
  const arc = computeArchive(Y, M, D, H, lon);
  const facts = toFacts(arc, { year: Y, month: M, day: D, hour: H, minute: 0 }, lon, jd);

  assert.strictEqual(typeof facts.lonDiffSeconds, 'number');
  assert.strictEqual(typeof facts.eotSeconds, 'number');
  assert.strictEqual(typeof facts.totalOffsetSeconds, 'number');
  assert.strictEqual(facts.totalOffsetSeconds, facts.lonDiffSeconds + facts.eotSeconds);
  // 经度差 = 4*(116.397128-120)= -3.602872 分 → 秒 = round(-3.602872*60)= round(-216.172)…→ -865
  assert.strictEqual(facts.lonDiffSeconds, -865);
});

test('不同输入 → 不同 doc_hash', () => {
  const Y = 2023, M = 3, D = 20, lon = 116.397128;
  const jd = gregorianToJde(Y, M, D);
  const p = (h) => ({ year: Y, month: M, day: D, hour: h, minute: 0 });
  const f1 = toFacts(computeArchive(Y, M, D, 12, lon), p(12), lon, jd);
  const f2 = toFacts(computeArchive(Y, M, D, 13, lon), p(13), lon, jd);
  const a = computeDocHash(VERSION, INPUT_HASH, f1).value;
  const b = computeDocHash(VERSION, INPUT_HASH, f2).value;
  assert.notStrictEqual(a, b, '时柱不同 → doc_hash 应不同');
});