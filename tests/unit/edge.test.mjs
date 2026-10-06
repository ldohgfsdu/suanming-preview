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

// ---------- 子时换日规则（已移植 Core 的 DayBoundaryRule，默认早子时换日） ----------
// 2026-10-06 更新：子时换日规则实现后，23:00 起日柱进入**次日**。
// 旧期望「日柱当日不变」对应的是规则未实现时的历史行为，现已更正。
// 独立验算：2023-05-04 日柱=壬戌；23:00 属早子时 → 05-05 日柱=癸亥；
//           时柱按五鼠遁 癸(9)×2%10=8 → 壬子。
test('子时 23:00 换日：日柱=癸亥（次日），时柱=壬子（癸日五鼠遁）', () => {
  const a = computeArchive(2023, 5, 4, 23, null);
  assert.strictEqual(a.four.day.ganz, '癸亥', '23:00 早子时应换入次日');
  assert.strictEqual(a.four.hour.ganz, '壬子', '时干按次日日干癸起遁');
});
test('23:59 同属早子时，与 23:00 一致', () => {
  const a = computeArchive(2023, 5, 4, 23, null);
  const b = computeArchive(2023, 5, 4, 23.9, null);
  assert.strictEqual(a.four.day.ganz, b.four.day.ganz);
  assert.strictEqual(a.four.hour.ganz, b.four.hour.ganz);
});
test('00:30 时柱庚子（当日壬戌日五鼠遁），日柱仍为当日', () => {
  const a = computeArchive(2023, 5, 4, 0, null);
  assert.strictEqual(a.four.day.ganz, '壬戌', '00:30 尚未换日');
  // 壬(8)×2%10=6 → 庚子；此时日柱即当日，不涉「次日日干」修正
  assert.strictEqual(a.four.hour.ganz, '庚子');
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