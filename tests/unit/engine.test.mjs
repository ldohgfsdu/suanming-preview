// engine unit tests (ESM)
import * as e from '../../miniprogram/lib/engine.js';
import assert from 'node:assert';
import { test } from 'node:test';

test('JDN roundtrip restores the same calendar day', () => {
  const rt = e.jdeToGregorian(e.gregorianToJde(2023, 5, 4));
  assert.strictEqual(rt.y, 2023);
  assert.strictEqual(rt.m, 5);
  assert.strictEqual(rt.d, 4);
});

test('J2000 epoch JDN', () => {
  assert.strictEqual(e.gregorianToJde(2000, 1, 1), 2451545);
});

test('vernal equinox {春分} lands ~2023-03-20 within a day', () => {
  const g = e.jdeToGregorian(e.termJde(5, 2023));
  assert.strictEqual(g.y, 2023);
  assert.strictEqual(g.m, 3);
  const day = g.d;
  assert.ok(Math.abs(day - 20) <= 1, `equinox day=${day}`);
});

test('lichun {立春} lands ~2023-02-04 within a day', () => {
  const g = e.jdeToGregorian(e.termJde(2, 2023));
  assert.strictEqual(g.y, 2023);
  assert.strictEqual(g.m, 2);
  assert.ok(Math.abs(g.d - 4) <= 1, `lichun day=${g.d}`);
});

test('year pillar 2023 is 癸卯', () => {
  const yp = e.yearPillar(e.gregorianToJde(2023, 5, 4));
  assert.strictEqual(yp.gan, '癸');
  assert.strictEqual(yp.zhi, '卯');
});

test('buildFacts produces prev/next solar term bracket', () => {
  const f = e.buildFacts(2023, 5, 4);
  assert.ok(f.prevTerm, 'prev term present');
  assert.ok(f.nextTerm, 'next term present');
  assert.ok(f.daysToNextTerm > 0 && f.daysToNextTerm < 3, `days=${f.daysToNextTerm}`);
});

test('EoT stays within +/-17 minutes for key dates', () => {
  const inBounds = (y, m, d, expect) => {
    const v = e.eotMinutes(e.gregorianToJde(y, m, d));
    assert.ok(Math.abs(v - expect) < 1.5, `EoT=${v.toFixed(2)} expect=${expect}`);
  };
  inBounds(2023, 2, 11, -14.2); // near Feb max negative
  inBounds(2023, 5, 4, +3.4);
  inBounds(2023, 11, 3, +16.4); // near Nov max positive
});

test('out of range year throws', () => {
  assert.throws(() => e.gregorianToJde(1899, 1, 1));
  assert.throws(() => e.gregorianToJde(2101, 1, 1));
});