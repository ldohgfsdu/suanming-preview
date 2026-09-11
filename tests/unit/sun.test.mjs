// sun.js —— 日出/日落（NOAA 方法）测试。
import assert from 'node:assert';
import { sunTimes } from '../../miniprogram/lib/sun.js';

// 北京 2023-01-01 朝阳升约 07:36、落日约 17:00（约化，不含街道闪烁 ±4 分钟）
const w = sunTimes(2023, 1, 1, 116.4074, 39.9042);
assert.equal(w.valid, true, '北京应有效');
assert.ok(/^\d{2}:\d{2}$/.test(w.sunrise), `sunrise 为 HH:MM，got ${w.sunrise}`);
assert.ok(/^\d{2}:\d{2}$/.test(w.sunset), `sunset 为 HH:MM，got ${w.sunset}`);
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
assert.ok(Math.abs(toMin(w.sunrise) - (7 * 60 + 38)) < 12, `北京 1/1 日出≈07:38±12，got ${w.sunrise}`);
assert.ok(Math.abs(toMin(w.sunset) - (17 * 60 + 2)) < 12, `北京 1/1 日落≈16:58±12，got ${w.sunset}`);

// 夏至白天最长、冬至最短（北京）
const solSummer = sunTimes(2026, 6, 21, 116.4074, 39.9042);
const solWinter = sunTimes(2026, 12, 21, 116.4074, 39.9042);
const dayLen = (x) => toMin(x.sunset) - toMin(x.sunrise);
assert.ok(dayLen(solSummer) > 14 * 60, `夏至白天 >14h，got ${dayLen(solSummer) / 60}h`);
assert.ok(solWinter.valid && dayLen(solWinter) < 10 * 60, `冬至白天 <10h`);

// 赤道地区全年约 12 小时（印尼雅加达）
const eq = sunTimes(2026, 9, 23, 106.8456, -6.2088);
assert.ok(Math.abs(dayLen(eq) - 12 * 60) < 30, `赤道昼长 ≈12h±30m，got ${dayLen(eq)}m`);

console.log('sun.test.mjs: PASS');
process.exit(0);