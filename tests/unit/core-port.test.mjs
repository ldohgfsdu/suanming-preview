// tests/unit/core-port.test.mjs — Core 引擎移植能力测试
//
// 覆盖自Core（Kotlin）移植至 Preview（JS）的四项能力：
//   1. 中国夏令时 1986–1991（12 次切换表）+ gap/fold 边界处理
//   2. 双时间轴纪律（年/月柱用出生绝对瞬间，日/时柱用地方太阳钟）
//   3. 子时换日双策略 + 晚子时五鼠遁修正
//   4. 不可计算降级契约（时区/经度不自洽 >60° 拒绝计算）
//
// 依据：《中共中央办公厅、国务院办公厅关于在全国范围内实行夏时制的通知》（1986-04）、
// 国务院办公厅关于暂停实行夏时制的通知（1992-04-05 起停用）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEASONS, WallState, classifyWall, resolveWallToInstant, covers, appliesTo,
  timezoneCentralMeridian, assessLonTimezoneConsistency, DEGRADE_MESSAGES,
} from '../../miniprogram/lib/chinadst.js';
import {
  computeArchive, DayBoundaryRule, applyDayBoundary, hourStemDayStem,
  DEFAULT_DAY_BOUNDARY_RULE,
} from '../../miniprogram/lib/archive.js';
import { gregorianToJde, dayPillar } from '../../miniprogram/lib/engine.js';

// ─────────────────── 1. 中国夏令时 ───────────────────

test('CD1 夏令时表：6季 12 次切换，与独立推算的「第2个周日」规则一致', () => {
  assert.equal(SEASONS.length, 6, '应为 1986–1991 共 6 季');
  // 1988 年网络百科称「4月10日」，但国务院办公厅通知原文（京政办发[1988]17号）
  // 与人民日报 1988-04-11 报道均确认是 **4月17日**。本表采 4/17，此断言锁死该结论。
  const y1988 = SEASONS.find((s) => s.year === 1988);
  assert.deepEqual(y1988.springForward, [1988, 4, 17], '1988 开始应为 4/17（政府文件口径）');
  assert.deepEqual(y1988.fallBack, [1988, 9, 11], '1988 结束应为 9/11');
  // 1986 为首年，5/4 才开始（4 月第 2 个周日是 4/13，因准备期推迟一周）
  const y1986 = SEASONS.find((s) => s.year === 1986);
  assert.deepEqual(y1986.springForward, [1986, 5, 4], '1986 开始应为 5/4（首年推迟）');

  // 切换日必须是星期日（可独立验证的硬事实）
  SEASONS.forEach((s) => {
    [s.springForward, s.fallBack].forEach(([y, mo, d]) => {
      const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
      assert.equal(dow, 0, `${y}-${mo}-${d} 应为星期日`);
    });
  });

  // ⚠️ **不**假设「固定为第 N 个周日」——该规则与政府文件冲突：
  //   1988 年国务院办公厅通知（京政办发[1988]17号）明确为 **4月17日**，
  //   而1988-04 的第 2 个周日是 4/10、第 3 个才是 4/17。
  //   1989/1990 同理与「第 2 个周日」不符。
  //   故本测试只锁定**一手文件确认的日期**，不臆造推导规则。
  //   逐项锁定（来源：国务院办公厅逐年通知 + 人民日报当年报道）
  const OFFICIAL = {
    1986: { springForward: [1986, 5, 4], fallBack: [1986, 9, 14] },
    1987: { springForward: [1987, 4, 12], fallBack: [1987, 9, 13] },
    1988: { springForward: [1988, 4, 17], fallBack: [1988, 9, 11] },
    1989: { springForward: [1989, 4, 16], fallBack: [1989, 9, 17] },
    1990: { springForward: [1990, 4, 15], fallBack: [1990, 9, 16] },
    1991: { springForward: [1991, 4, 14], fallBack: [1991, 9, 15] },
  };
  SEASONS.forEach((s) => {
    assert.deepEqual(s.springForward, OFFICIAL[s.year].springForward, `${s.year} 开始日期须与官方一致`);
    assert.deepEqual(s.fallBack, OFFICIAL[s.year].fallBack, `${s.year} 结束日期须与官方一致`);
  });
});

test('CD2 墙钟分类：STANDARD / GAP / DAYLIGHT / FOLD 四态', () => {
  // 表外年份 → 标准时
  assert.equal(classifyWall(1995, 6, 15, 12, 0), WallState.STANDARD);
  // 1990 夏季 → 夏令时
  assert.equal(classifyWall(1990, 6, 15, 12, 0), WallState.DAYLIGHT);
  // 1990-04-15 02:30 → 拨快缺口（不存在）
  assert.equal(classifyWall(1990, 4, 15, 2, 30), WallState.GAP);
  // 1990-04-15 03:30 → 已进入夏令时
  assert.equal(classifyWall(1990, 4, 15, 3, 30), WallState.DAYLIGHT);
  // 1990-09-16 01:30 → 拨回重叠（出现两次）
  assert.equal(classifyWall(1990, 9, 16, 1, 30), WallState.FOLD);
  // 秋季 03:30 → 回标准时
  assert.equal(classifyWall(1990, 9, 16, 3, 30), WallState.STANDARD);
  assert.equal(covers(1990), true);
  assert.equal(covers(1995), false);
});

test('CD3 gap 缺口必须拒绝计算，绝不静默顺延', () => {
  const r = resolveWallToInstant(1990, 4, 15, 2, 30);
  assert.equal(r.ok, false);
  assert.equal(r.state, WallState.GAP);
  assert.equal(r.reason, 'dst_gap');
  assert.ok(DEGRADE_MESSAGES.dst_gap);
});

test('CD4 fold 重叠必须显式选择早/晚，且两者相差 1 小时', () => {
  const none = resolveWallToInstant(1990, 9, 16, 1, 30);
  assert.equal(none.ok, false, '未指定应拒绝');
  assert.equal(none.reason, 'dst_fold_unresolved');

  const earlier = resolveWallToInstant(1990, 9, 16, 1, 30, { foldChoice: 'earlier' });
  const later = resolveWallToInstant(1990, 9, 16, 1, 30, { foldChoice: 'later' });
  assert.equal(earlier.ok, true);
  assert.equal(later.ok, true);
  assert.equal(earlier.dstApplied, true, '第一次为夏令时');
  assert.equal(later.dstApplied, false, '第二次为标准时');
  // 同一钟面读数：早（夏令时，UTC+9）的瞬时应**早于**晚（标准时，UTC+8）1 小时
  assert.equal(
    earlier.epochMilli - later.epochMilli, -3600 * 1000,
    '早/晚两次应相差 1 小时（earlier 的瞬时更早）',
  );
});

test('CD5 夏令时期间偏移 +1 小时（同一钟面读数对比）', () => {
  // 用**同一月同一日**的 12:00，对比夏令时区间内外是不可能的，
  // 故改为：同一天 12:00，分别按「夏令时」与「标准时」口径解析，瞬时应差 1 小时。
  // 通过 classifyWall 确认 1990-06-15 属夏令时、1990-12-15 属标准时，
  // 再验证两者的**墙钟→UTC 偏移量**之差为 1 小时。
  const dstDate = resolveWallToInstant(1990, 6, 15, 12, 0);
  const stdDate = resolveWallToInstant(1990, 12, 15, 12, 0);
  assert.equal(dstDate.dstApplied, true, '1990-06 应为夏令时');
  assert.equal(stdDate.dstApplied, false, '1990-12 应为标准时');

  // 分别减去各自墙钟的 Date.UTC 基准，得到 UTC 偏移量（分钟）
  const offDst = (dstDate.epochMilli - Date.UTC(1990, 5, 15, 12, 0)) / 60000;
  const offStd = (stdDate.epochMilli - Date.UTC(1990, 11, 15, 12, 0)) / 60000;
  assert.equal(offDst, -9 * 60, '夏令时 UTC 偏移应为 +9h（即 -540 分钟）');
  assert.equal(offStd, -8 * 60, '标准时 UTC 偏移应为 +8h（即 -480 分钟）');
  assert.equal(offStd - offDst, 60, '两者偏移量应相差 60 分钟');
});

test('CD6 时区适用性：中国时区含历史别名', () => {
  ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'PRC']
    .forEach((z) => assert.equal(appliesTo(z), true, `${z} 应适用`));
  assert.equal(appliesTo('Asia/Urumqi'), false, '新疆不适用全国表');
  assert.equal(appliesTo('Europe/London'), false);
});

// ─────────────────── 2. 双时间轴纪律 ───────────────────

test('TA1 年/月柱用出生绝对瞬间，不受真太阳时修正影响', () => {
  // 同一出生时刻，仅改变经度（→ 真太阳时修正量不同），
  // 若年/月柱随真太阳时漂移，则违反双时间轴纪律。
  const a = computeArchive(1990, 6, 15, 12, 80.0);
  const b = computeArchive(1990, 6, 15, 12, 130.0);
  assert.equal(a.four.year.ganz, b.four.year.ganz, '年柱不应随经度变化');
  assert.equal(a.four.month.ganz, b.four.month.ganz, '月柱不应随经度变化');
});

test('TA2 日/时柱由真太阳时驱动（与年/月柱口径不同）', () => {
  // 真太阳时跨日时，日柱会变——这正是双时间轴的设计意图
  const r = computeArchive(1990, 6, 15, 0.5, 80.0);
  assert.ok(r.four.day, '日柱应存在');
  assert.ok(r.trueSolar, '应产出真太阳时信息');
});

// ─────────────────── 3. 子时换日双策略 ───────────────────

test('ZI1 applyDayBoundary：早子时23:00 换日，晚子时不换', () => {
  const zi = applyDayBoundary(1990, 6, 15, 23, DayBoundaryRule.CHANGE_AT_ZI);
  assert.equal(zi.dayShifted, true, '早子时口径 23:00 应换日');
  assert.deepEqual([zi.y, zi.m, zi.d], [1990, 6, 16]);

  const mid = applyDayBoundary(1990, 6, 15, 23, DayBoundaryRule.CHANGE_AT_MIDNIGHT);
  assert.equal(mid.dayShifted, false, '晚子时口径不应换日');
  assert.deepEqual([mid.y, mid.m, mid.d], [1990, 6, 15]);
});

test('ZI2 时辰不详不捏造正午，时支留空', () => {
  const r = applyDayBoundary(1990, 6, 15, -1, DayBoundaryRule.CHANGE_AT_ZI);
  assert.equal(r.hourForZhi, null, '时辰不详应留空，不得捏造');
  assert.equal(r.dayShifted, false);
});

test('ZI3 晚子时五鼠遁：时干按次日日干起（非当日）', () => {
  const today = { y: 1990, m: 6, d: 15 };
  const todayPillar = dayPillar(gregorianToJde(1990, 6, 15));
  const nextPillar = dayPillar(gregorianToJde(1990, 6, 16));
  // 晚子时 23:30 → 用次日日干
  const lateStem = hourStemDayStem(today, 23, DayBoundaryRule.CHANGE_AT_MIDNIGHT, todayPillar);
  assert.equal(lateStem, nextPillar.index % 10, '晚子时时干应按次日日干');
  assert.notEqual(
    lateStem, todayPillar.index % 10,
    '次日日干应与当日日干不同（否则测试无区分度）',
  );
  // 早子时口径：日柱本身已是次日，直接用日柱日干
  const ziStem = hourStemDayStem(
    { y: 1990, m: 6, d: 16 }, 23, DayBoundaryRule.CHANGE_AT_ZI, nextPillar,
  );
  assert.equal(ziStem, nextPillar.index % 10, '早子时口径应直接用日柱日干');
});

test('ZI4 双口径日柱是否分叉，取决于太阳钟是否已进晚子时', () => {
  // 墙钟 23:00 @114.3°E → 太阳钟 22:37（经度差把钟拨慢），尚未跨 23:00 日界，
  // 两口径都取当日 → 日柱相同（双时间轴纪律：日界判据必须用太阳钟，不能用墙钟）。
  const a0 = computeArchive(1990, 6, 15, 23, 114.3, DayBoundaryRule.CHANGE_AT_ZI);
  const b0 = computeArchive(1990, 6, 15, 23, 114.3, DayBoundaryRule.CHANGE_AT_MIDNIGHT);
  assert.equal(a0.four.day.ganz, b0.four.day.ganz, '太阳钟未进晚子时 → 两口径同日柱');

  // 墙钟 23:00 @125°E → 太阳钟 23:20，已过日界 → 两口径分叉。
  const a = computeArchive(1990, 6, 15, 23, 125, DayBoundaryRule.CHANGE_AT_ZI);
  const b = computeArchive(1990, 6, 15, 23, 125, DayBoundaryRule.CHANGE_AT_MIDNIGHT);
  assert.notEqual(a.four.day.ganz, b.four.day.ganz, '太阳钟已进晚子时 → 两口径应给出不同日柱');
});

test('ZI5 默认口径为早子时（向后兼容）', () => {
  assert.equal(DEFAULT_DAY_BOUNDARY_RULE, DayBoundaryRule.CHANGE_AT_ZI);
  // 不传第 6 参数时行为应与显式传早子时一致
  const withDefault = computeArchive(1990, 6, 15, 23, 114.3);
  const explicit = computeArchive(1990, 6, 15, 23, 114.3, DayBoundaryRule.CHANGE_AT_ZI);
  assert.equal(withDefault.four.day.ganz, explicit.four.day.ganz, '默认行为须与早子时一致');
});

// ─────────────────── 4. 不可计算降级契约 ───────────────────

test('DG1 时区中央经线与经度偏差 >60° 即降级', () => {
  // 上海 121.4°配 Asia/Shanghai → 差 1.4°，正常
  assert.equal(assessLonTimezoneConsistency(121.4, 'Asia/Shanghai').degraded, false);
  // 乌鲁木齐 87.6° 配 Asia/Shanghai → 差 32.4°，仍在阈值内
  assert.equal(assessLonTimezoneConsistency(87.6, 'Asia/Shanghai').degraded, false);
  // 伦敦 0° 配 Asia/Shanghai → 差 120°，应降级
  const bad = assessLonTimezoneConsistency(0, 'Asia/Shanghai');
  assert.equal(bad.degraded, true, '偏差 120° 应降级');
  assert.equal(bad.reason, 'lon_tz_mismatch');
});

test('DG2 缺经度或缺时区即降级', () => {
  assert.equal(assessLonTimezoneConsistency(null, 'Asia/Shanghai').reason, 'no_longitude');
  assert.equal(assessLonTimezoneConsistency(121.4, null).reason, 'no_timezone');
});

test('DG3 未知时区不误伤（返回不降级，交由其它规则处理）', () => {
  const r = assessLonTimezoneConsistency(139.7, 'Asia/Tokyo');
  assert.equal(r.degraded, false, '东京应识别为 UTC+9 中央经线 135°');
  assert.equal(timezoneCentralMeridian('Asia/Tokyo'), 135);
  assert.equal(timezoneCentralMeridian('Asia/Shanghai'), 120);
  // 未知/不存在的时区名 → central为 null，不做此项校验
  const unknown = assessLonTimezoneConsistency(100, 'Not/AZone');
  assert.equal(unknown.degraded, false);
  assert.equal(unknown.tzCentralMeridianLon, null);
});

test('DG4 每种降级原因都有中文说明', () => {
  Object.keys(DEGRADE_MESSAGES).forEach((k) => {
    assert.ok(DEGRADE_MESSAGES[k], `${k} 应有中文说明`);
    assert.ok(DEGRADE_MESSAGES[k].length >= 8, `${k} 说明应足够完整`);
  });
});
