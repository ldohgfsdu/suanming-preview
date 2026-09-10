/** 构建：由 gen-lunar-table 生成 1900–2100 农历月表 JSON → miniprogram/lib/lunar-table.json */
import { gregorianToJde } from '../miniprogram/lib/engine.js';
import { generate, monthStartJ } from './gen-lunar-table.mjs';
import { writeFileSync } from 'node:fs';

// 锚点：2023-01-22 正月初一
const anchorJdn = gregorianToJde(2023, 1, 22);
let anchorK = Math.round((anchorJdn - 2451550.09766) / 29.530588853);
while (monthStartJ(anchorK) > anchorJdn) anchorK -= 1;
while (monthStartJ(anchorK + 1) <= anchorJdn) anchorK += 1;

const kLo = Math.floor((gregorianToJde(1900, 1, 1) - 2451550.09766) / 29.530588853);
const kHi = Math.ceil((gregorianToJde(2100, 12, 31) - 2451550.09766) / 29.530588853);
const rows = generate(anchorK, kLo, kHi);

// 紧凑行： [year, month, leap(0/1), startJDN, len]
const AACT = rows.filter(r => r.len >= 28 && r.len <= 31).map(r => [r.year, r.month, r.leap ? 1 : 0, r.startJ, r.len]);
const out = { format: 'lunar-table-v1', range: [1900, 2100], rows: AACT };
const jsonPath = new URL('../miniprogram/lib/lunar-table.json', import.meta.url);
writeFileSync(jsonPath, JSON.stringify(out));
// 同时写 ESM 模块，供小程序与 Node 统一加载
const jsPath = new URL('../miniprogram/lib/lunar-table.js', import.meta.url);
writeFileSync(jsPath, `// 农历月表 v1：由 Meeus 朔 + 中气(奇序数) 推导；year/month/leap 稳固，day 可能存在初一日 ±1 边界。
// 行：[year, month, leap(0/1), startJDN, len]
export const LUNAR_TABLE = ${JSON.stringify(AACT)};
export const LUNAR_FORMAT = 'lunar-table-v1';
export const LUNAR_RANGE = [1900, 2100];
`);
console.log('written rows=', AACT.length, 'first=', AACT[0], 'last=', AACT[AACT.length - 1]);