/**
 * tests/unit/sun-audit.test.mjs — 日出/日落（晨昏）事实层审计。
 *
 * 明示约定（engine 与 pages 民用时间一致：东八区 UTC+8 钟面）：
 *   - 日出/日落 = 太阳中心达地平线（标准大气折射 -0.833°），非民用暮光（<-6°）。
 *   - 返回时刻为北京时间（东八区钟面），由当地经度把平太阳时换算到钟面。
 *   - 方法：NOAA 通用算法，工程精度 ±1 分钟；本文件镜像断言放宽到 ±6 分钟。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes } from '../../miniprogram/lib/sun.js';

function hm(t) { const [H, M] = t.split(':').map(Number); return { H, M }; }
function diffMin(h1, h2) {
  const a = h1.H * 60 + h1.M, b = h2.H * 60 + h2.M, d = Math.abs(a - b);
  return Math.min(d, 1440 - d);
}
function dayLen(rise, set) { // 同一日昼长（分钟）：日落-日出，跨 0 取正
  return (set.H * 60 + set.M - rise.H * 60 - rise.M + 1440) % 1440;
}

// 北京常用坐标
const BJ = [116.4074, 39.9042];
const TOL = 6;

test('S1 北京夏至/冬至：昼长与代表性日出（±6min）', () => {
  const sum = sunTimes(2025, 6, 21, ...BJ);
  assert.strictEqual(sum.valid, true);
  const lnS = dayLen(hm(sum.sunrise), hm(sum.sunset));
  assert.ok(lnS >= 14 * 60 && lnS <= 15 * 60, `夏至昼长 ${(lnS / 60).toFixed(1)}h`);
  assert.ok(diffMin(hm(sum.sunrise), { H: 4, M: 50 }) <= TOL, `夏至日出 ${sum.sunrise} 应≈04:50`);

  const w = sunTimes(2025, 12, 21, ...BJ);
  assert.strictEqual(w.valid, true);
  const lnW = dayLen(hm(w.sunrise), hm(w.sunset));
  assert.ok(lnW >= 9 * 60 && lnW <= 9.7 * 60, `冬至昼长 ${(lnW / 60).toFixed(1)}h`);
  assert.strictEqual(hm(w.sunrise).H, 7); // 冬至起日出约 07:37
});

test('S2 正午=东八区钟面 12:2x（非地方平太阳时）', () => {
  const e = sunTimes(2025, 3, 20, ...BJ);
  const noon = hm(e.noon);
  assert.ok(noon.H === 12 && noon.M >= 20 && noon.M <= 26, `春分正午 ${e.noon} 应 12:20~12:26`);
});

test('S3 显式地点：经度越西，日出/日落越晚（北京 vs 新疆）', () => {
  const b = sunTimes(2025, 6, 21, ...BJ);
  const w = sunTimes(2025, 6, 21, 87.6, 43.8); // 乌鲁木齐
  const ss = diffMin(hm(w.sunset), hm(b.sunset));
  assert.ok(ss >= 100, `乌鲁木齐日落应晚于北京 ≥100min（实得 ${w.sunset} vs ${b.sunset}）`);
});

test('S4 高纬极昼/极夜 valid=false', () => {
  assert.strictEqual(sunTimes(2025, 12, 21, 20, 78).valid, false);  // 极夜
  assert.strictEqual(sunTimes(2025, 6, 21, 20, 68).valid, false);   // 北极圈内极昼
});