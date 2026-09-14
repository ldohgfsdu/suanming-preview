import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeArchive, monthPillar, hourPillar, tally, lunarAge, newMoonJde, lunarPhase,
} from '../../miniprogram/lib/archive.js';
import { gregorianToJde } from '../../miniprogram/lib/engine.js';

test('monthPillar.liChun starts 寅 month', () => {
  const jd = gregorianToJde(2023, 2, 5); // 次日仍在寅月
  const mp = monthPillar(jd, 2023);
  assert.strictEqual(mp.zhi, '寅');
  assert.ok(['甲', '丙', '戊', '庚', '壬'].includes(mp.gan)); // 五虎遁为阳干
});

test('monthPillar.2023-03-20 乙卯 (卯月)', () => {
  const mp = monthPillar(gregorianToJde(2023, 3, 20), 2023);
  assert.strictEqual(mp.ganzhi, '乙卯');
});

test('hourPillar 五鼠遁: 甲日甲子时', () => {
  const hp = hourPillar(0, 23); // 日干甲、子时
  assert.strictEqual(hp.ganzhi, '甲子');
});

test('hourPillar 己日戊辰时', () => {
  const hp = hourPillar(5, 7); // 己干、辰时
  assert.strictEqual(hp.ganzhi, '戊辰');
});

test('computeArchive 2000-01-01 己未日', () => {
  const f = computeArchive(2000, 1, 1);
  assert.strictEqual(f.four.day.ganz, '己未');
  assert.strictEqual(f.four.year.ganz, '己卯');
});

test('computeArchive 2023-02-04 干支年 癸卯', () => {
  const f = computeArchive(2023, 2, 4);
  assert.strictEqual(f.four.year.ganz, '癸卯');
});

test('computeArchive 2023-03-20 春分日前节气为惊蛰/次为春分', () => {
  const f = computeArchive(2023, 3, 20);
  assert.strictEqual(f.term.next.name, '春分');
  assert.ok(f.term.daysToNext >= 0);
});

test('computeArchive trueSolar 经度法', () => {
  const f = computeArchive(2023, 3, 20, 12, 116);
  assert.ok(Number.isFinite(f.trueSolar.offsetMinutes)); // 有经度则给出修正
  const g = computeArchive(2023, 3, 20, 12);
  assert.strictEqual(g.trueSolar.degraded, true); // 无经度则 degraded
});

test('computeArchive 无经度 moon 不炸', () => {
  const f = computeArchive(2023, 11, 15, 8);
  assert.ok(f.moon.ageDays >= 0 && f.moon.ageDays < 29.6);
  assert.ok(['朔', '娥眉月', '上弦月', '盈凸月', '望', '亏凸月', '下弦月', '残月'].includes(f.moon.name));
});

test('tally 计入天干+地支|气（丙午丁酉壬辰丙午 → 火5 水1 金1 土1 木0）', () => {
  const t = tally(['丙', '丁', '壬', '丙'], ['午', '酉', '辰', '午']);
  assert.deepStrictEqual(t, { wood: 0, fire: 5, earth: 1, metal: 1, water: 1 });
});

test('tally 仅天干时不计地支（向后兼容）', () => {
  assert.deepStrictEqual(tally(['丙', '丁']), { wood: 0, fire: 2, earth: 0, metal: 0, water: 0 });
});

test('computeArchive 五行总数 = 呈现柱数×2（天干+地支各计一次）', () => {
  const f = computeArchive(2024, 2, 4, 12, null);
  const present = Object.values(f.four).filter((p) => p && p.ganz);
  const sum = Object.values(f.tally).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, present.length * 2);
});