// 边界回归：极值年份、立春换年柱、子时换日、真太阳时经度差异。
// 对应赛事开发计划 §5.1 边界用例清单。
import assert from 'node:assert';
import { test } from 'node:test';
import { computeArchive } from '../../miniprogram/lib/archive.js';
import { termJde, gregorianToJde } from '../../miniprogram/lib/engine.js';

// ---------- 极值年份不再崩溃（曾经因节气跨年越界而 throw） ----------
test('极值 1900-01-01 可算', () => {
  const a = computeArchive(1900, 1, 1, 12, null);
  assert.strictEqual(a.solar.y, 1900);
  assert.ok(a.four.year.ganz, '应有年柱');
});
test('极值 1900-02-01 可算（立春前立后）', () => {
  const a = computeArchive(1900, 2, 1, 12, null);
  assert.strictEqual(a.four.year.ganz, '己亥');
});
test('极值 2100-12-31 可算', () => {
  const a = computeArchive(2100, 12, 31, 12, null);
  assert.strictEqual(a.solar.y, 2100);
});
test('极值 2100-01-01 可算', () => {
  const a = computeArchive(2100, 1, 1, 12, null);
  assert.strictEqual(a.solar.y, 2100);
});
// 仍须对用户非法输入报错
test('用户输入越界仍抛错（1899 / 2101）', () => {
  assert.throws(() => computeArchive(1899, 1, 1));
  assert.throws(() => computeArchive(2101, 12, 31));
});

// ---------- 立春换年柱 ----------
test('立春前 2/3 → 癸卯；立春后 2/4 → 甲辰（2024）', () => {
  assert.strictEqual(computeArchive(2024, 2, 3, 12, null).four.year.ganz, '癸卯');
  assert.strictEqual(computeArchive(2024, 2, 4, 12, null).four.year.ganz, '甲辰');
});

// ---------- 子时换日规则（日柱当日不变，时柱随 23/0 均为子时，1 点进丑时） ----------
test('子时 23:00 时柱=壬子，日柱=癸亥（2023-05-04）', () => {
  const a = computeArchive(2023, 5, 4, 23, null);
  assert.strictEqual(a.four.day.ganz, '癸亥');
  assert.strictEqual(a.four.hour.ganz, '壬子');
});
test('00:30 时柱仍壬子（子时）,日柱不变', () => {
  const a = computeArchive(2023, 5, 4, 0, null);
  assert.strictEqual(a.four.day.ganz, '癸亥');
  assert.strictEqual(a.four.hour.ganz, '壬子');
});

// ---------- 真太阳时经度差异（北京 vs 乌鲁木齐） ----------
test('同一时刻经度差导致真太阳时分钟数不同', () => {
  const bj = computeArchive(2023, 5, 4, 12, 116.4);
  const wlmq = computeArchive(2023, 5, 4, 12, 86.86);
  assert.ok(!bj.trueSolar.degraded && !wlmq.trueSolar.degraded);
  const diff = Math.abs(bj.trueSolar.offsetMinutes - wlmq.trueSolar.offsetMinutes);
  assert.ok(diff > 100, `北京=${bj.trueSolar.offsetMinutes} 乌市=${wlmq.trueSolar.offsetMinutes} 差${diff.toFixed(0)}分`);
});

// ---------- 闰年 2/29 ----------
test('闰年 2024-02-29 正常计算', () => {
  const a = computeArchive(2024, 2, 29, 12, null);
  assert.strictEqual(a.solar.d, 29);
  assert.ok(a.four.day.ganz.length === 2);
});

// ---------- 已测试的节气基准一致性复述 ----------
test('2024 立春节气时刻落在 2/4 附近', () => {
  const lichun = termJde(2, 2024);
  const g = gregorianToJde(2024, 2, 4);
  assert.ok(Math.abs(lichun - g) < 1, '立春应落在 2/4 前后一天内');
});