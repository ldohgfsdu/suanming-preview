// 黄金对拍：用 generate() 生成农历表并核对已知锚点。
import { newMoonJde } from '../miniprogram/lib/archive.js';
import { gregorianToJde, jdeToGregorian } from '../miniprogram/lib/engine.js';
import { generate, monthStartJ } from './gen-lunar-table.mjs';

const anchorJdn = gregorianToJde(2023, 1, 22);
let anchorK = Math.round((anchorJdn - 2451550.09766) / 29.530588853);
while (monthStartJ(anchorK) > anchorJdn) anchorK -= 1;
while (monthStartJ(anchorK + 1) <= anchorJdn) anchorK += 1;
console.log('anchorK=', anchorK, 'monthStart=', monthStartJ(anchorK), '(want', anchorJdn + ')');

const kLo = Math.floor((gregorianToJde(1900, 1, 1) - 2451550.09766) / 29.530588853);
const kHi = Math.ceil((gregorianToJde(2100, 12, 31) - 2451550.09766) / 29.530588853);
const rows = generate(anchorK, kLo, kHi);
console.log('生成月数:', rows.length);

function lunarOf(Y, M, D) {
  const jdn = gregorianToJde(Y, M, D);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const next = rows[i + 1];
    if (r.startJ <= jdn && (!next || next.startJ > jdn)) return { row: r, dd: jdn - r.startJ + 1 };
  }
  return null;
}

const GOLDEN = [
  [2023, 1, 22, 2023, 1, 0, 1],
  [2023, 3, 22, 2023, 2, 1, 1],   // 2023 闰二月初一
  [2023, 2, 20, 2023, 2, 0, 1],   // 二月初一
  [2020, 1, 25, 2020, 1, 0, 1],
  [2020, 4, 23, 2020, 4, 0, 1],   // 2020 四月初一
  [2020, 5, 23, 2020, 4, 1, 1],   // 2020 闰四月初一
  [2021, 2, 12, 2021, 1, 0, 1],
  [2022, 2, 1, 2022, 1, 0, 1],
  [2024, 2, 10, 2024, 1, 0, 1],
  [2000, 2, 5, 2000, 1, 0, 1],
  [1949, 10, 1, 1949, 8, 0, 10],  // 1949-10-01 己丑年八月初十
  [1997, 7, 1, 1997, 5, 0, 27],   // 1997-07-01 丁丑年五月廿七 (香港回归)
  [2025, 1, 29, 2025, 1, 0, 1],   // 2025 春节
  [2026, 2, 17, 2026, 1, 0, 1],   // 2026 春节
];
let pass = 0, fail = 0;
for (const [Y, M, D, ly, lm, lleap, ld] of GOLDEN) {
  const g = lunarOf(Y, M, D);
  if (!g) { console.log(`  MISS ${Y}-${M}-${D}`); fail++; continue; }
  const { row, dd } = g;
  const ok = row.year === ly && row.month === lm && (row.leap ? 1 : 0) === lleap && dd === ld;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${Y}-${M}-${D} -> 得(${row.year}y ${row.leap ? '闰' : ''}${row.month}m d${dd}) 期望(${ly}y ${lleap ? '闰' : ''}${lm}m d${ld})`,
  );
  ok ? pass++ : fail++;
}
console.log(`\n黄金对拍: pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);