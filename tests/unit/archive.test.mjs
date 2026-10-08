import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeArchive, monthPillar, hourPillar, tally, trueSolarToLocal,
} from '../../miniprogram/lib/archive.js';
import { dayPillar, gregorianToJde, yearPillar } from '../../miniprogram/lib/engine.js';

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

test('computeArchive 2000-01-01 戊午日（1949-10-01=甲子锚定）', () => {
  const f = computeArchive(2000, 1, 1);
  assert.strictEqual(f.four.day.ganz, '戊午');
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

// ---- 真太阳时“单一时间事实源”模型 ----
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function slotIdx(h) { return Math.floor(((((h + 1) + 24) % 24) / 2)) % 12; }

test('UTC8 乌鲁木齐 午时 真太阳时跨时辰→巳时，日不变', () => {
  const f = computeArchive(2024, 6, 1, 12, 87.8);
  const sh = trueSolarToLocal(2024, 6, 1, 12, 87.8);
  assert.strictEqual(f.dayShift, 0);
  assert.strictEqual(f.trueSolar.dayChanged, false);
  assert.strictEqual(sh.canonDate.y, 2024);
  assert.strictEqual(f.solar.y, 2024);
  // 修正后落在巳时（canonHour≈9.9），时柱应为巳，不是午
  assert.strictEqual(SHICHEN[slotIdx(sh.canonHour)], '巳');
  assert.strictEqual(f.four.hour.zhi, '巳');
});

test('北京 子时(00) 真太阳时跨零点：日界按太阳钟重判，日历日与输入分开', () => {
  // ① 墙钟 00:00 @116.4°E → 太阳钟 6-14 23:46。太阳历日是 6-14，但 23:46 已过晚子时
  //    日界，按双时间轴纪律（日界走太阳钟 + CHANGE_AT_ZI）日柱取次日 6-15，
  //    与墙钟 00:00 同判——真太阳时在这里不改变日柱，这正是口径一致的表现。
  const f = computeArchive(2024, 6, 15, 0, 116.4);
  assert.strictEqual(f.dayShift, -1);
  assert.strictEqual(f.trueSolar.dayChanged, true);
  assert.strictEqual(f.trueSolar.canonDate.d, 14); // 太阳历日 = 6-14
  assert.strictEqual(f.solarInput.d, 15);
  const d15 = dayPillar(gregorianToJde(2024, 6, 15));
  assert.strictEqual(f.four.day.ganz, d15.gan + d15.zhi, '太阳钟 23:46 属晚子时 → 次日');
  assert.strictEqual(f.solar.d, 15); // 排盘历日（含日界修正）

  // ② 墙钟 00:00 @90°E → 太阳钟 6-14 21:59：真太阳时真跨到前一日且未进晚子时，
  //    日柱与排盘历日都跟太阳历日走，与输入日 6-15 分开。
  const g = computeArchive(2024, 6, 15, 0, 90);
  assert.strictEqual(g.dayShift, -1);
  assert.strictEqual(g.trueSolar.canonDate.d, 14);
  assert.strictEqual(g.solarInput.d, 15);
  const d14 = dayPillar(gregorianToJde(2024, 6, 14));
  assert.strictEqual(g.four.day.ganz, d14.gan + d14.zhi, '未进晚子时 → 日柱跟太阳历日');
  assert.strictEqual(g.solar.d, 14);
});

test('无经度-无真时修正：日柱仍用输入日', () => {
  const a = computeArchive(2024, 6, 15, 12, null);
  const d15 = dayPillar(gregorianToJde(2024, 6, 15));
  assert.strictEqual(a.four.day.ganz, d15.gan + d15.zhi);
  assert.strictEqual(a.solar.d, 15);
});

test('非边界日期：年/月柱稳定且与地点无关（2020-06-15）', () => {
  for (const h of [6, 12, 18]) {
    for (const lon of [null, 87.8]) {
      const f = computeArchive(2020, 6, 15, h, lon);
      assert.strictEqual(f.four.year.ganz, '庚子');
      assert.strictEqual(f.four.month.ganz, '壬午');
      assert.strictEqual(f.four.day.ganz, '己丑'); // 未跨日
      assert.strictEqual(f.dayShift, 0);
    }
  }
});

test('年/月柱由绝对出生瞬间重判（跨立春：2024-02-04）', () => {
  // absolute birth instant = 北京墙钟时刻 = gregorianToJde(y,m,d)+(h-20)/24
  // （gregorianToJde 返回历日正午 UT＝北京 20:00，故须减 20 小时；与地点无关的太阳黄经）
  const abs = (y, m, d, h) => gregorianToJde(y, m, d) + (h - 20) / 24;
  for (const h of [0, 12, 17]) {
    const f = computeArchive(2024, 2, 4, h, 87.8);
    const yp = yearPillar(abs(2024, 2, 4, h));
    const mp = monthPillar(abs(2024, 2, 4, h), yp.ganzhiYear);
    assert.strictEqual(f.four.year.ganz, yp.gan + yp.zhi);
    assert.strictEqual(f.four.month.ganz, mp.ganzhi);
  }
  // 立春 2024-02-04 16:26:53（北京）：此前 → 癸卯，此后 → 甲辰
  assert.strictEqual(computeArchive(2024, 2, 4, 0, 87.8).four.year.ganz, '癸卯');
  assert.strictEqual(computeArchive(2024, 2, 4, 12, 87.8).four.year.ganz, '癸卯');
  assert.strictEqual(computeArchive(2024, 2, 4, 17, 87.8).four.year.ganz, '甲辰');
});

test('修正量≈0 时四柱与原始一致（2024-04-14 经度120）', () => {
  const w = computeArchive(2024, 4, 14, 12, 120);
  assert.ok(Math.abs(w.trueSolar.offsetMinutes) < 1);   // EoT≈0
  assert.strictEqual(w.dayShift, 0);
  const r = computeArchive(2024, 4, 14, 12, null);      // 原非修正路径
  assert.strictEqual(w.trueSolar.degraded, false);
  assert.strictEqual(w.four.year.ganz, r.four.year.ganz);
  assert.strictEqual(w.four.month.ganz, r.four.month.ganz);
  assert.strictEqual(w.four.day.ganz, r.four.day.ganz);
  assert.strictEqual(w.four.hour.ganz, r.four.hour.ganz);
});

test('未知出生时刻不伪造时柱：年/月/日存在、时柱为 null', () => {
  const u = computeArchive(2020, 6, 15, -1, 87.8);
  assert.strictEqual(u.four.hour, null);
  assert.ok(u.four.year && u.four.year.ganz);
  assert.ok(u.four.month && u.four.month.ganz);
  assert.ok(u.four.day && u.four.day.ganz);
  assert.strictEqual(u.dayShift, 0);
});
// ---- 23 点日界基线（首页跨日弹窗「校正前」取值依赖这两个用例） ----
test('23:30 墙钟不做经度修正时已按子时换日进入次日（弹窗基线）', () => {
  const before = computeArchive(2023, 5, 4, 23.5, null);
  assert.strictEqual(before.instant_day, '2023-05-05');
  assert.strictEqual(before.four.day.ganz, '癸亥');
  assert.strictEqual(before.four.hour.ganz, '壬子');
});

test('23:00@116.4 真太阳时退回前一天：日柱/时柱相对基线均变化（dayChanged 仍为 false）', () => {
  const before = computeArchive(2023, 5, 4, 23, null);
  const f = computeArchive(2023, 5, 4, 23, 116.4);
  assert.strictEqual(before.four.day.ganz, '癸亥');
  assert.strictEqual(before.four.hour.ganz, '壬子');
  assert.strictEqual(f.four.day.ganz, '壬戌');
  assert.strictEqual(f.four.hour.ganz, '辛亥');
  assert.strictEqual(f.trueSolar.dayChanged, false, '未跨民用午夜，但确实跨了子时日界');
});

test('00:30@90° 跨日：基线仍为 05-04 壬戌，校正后退回 05-03 辛酉', () => {
  const before = computeArchive(2023, 5, 4, 0.5, null);
  const f = computeArchive(2023, 5, 4, 0.5, 90);
  assert.strictEqual(before.four.day.ganz, '壬戌');
  assert.strictEqual(f.four.day.ganz, '辛酉');
  assert.strictEqual(f.trueSolar.dayChanged, true);
});
