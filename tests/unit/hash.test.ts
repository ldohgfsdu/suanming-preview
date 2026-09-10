/**
 * 单元测试：HASH_CONTRACT_V1 §14 自检 fixture F-1..F-5（TS 参考实现侧）。
 * 目标：在无 Kotlin/JDK 的情况下先在 TS 侧把五类行为固定下来，
 * 后续 Core/Kotlin 参考实现产出同一 docHash 与之对拍（B-6 关闭证据之一）。
 *
 * 覆盖点：
 *   F-1 中文：干支/节气/五行字符串 UTF-8 + 禁止 \uXXXX 转义 + key 排序
 *   F-2 负号与 -0：负经度/负 lonDiff/负 eot；0 与 -0 同一 hash
 *   F-3 DEC(d) 定点小数：Q(v,d) 常量表，正负舍入临界与远离零点对称
 *   F-4 空值：hour_pillar=null vs "" vs 省略 must be distinguishable
 *   F-5 越界/归一化：e+组合锐音符→é；CJK兼容表意 U+F900、全角 U+FF21 → 拒绝（P-3）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeHash } from '../../shared/hash/hash.js';
import type { HashResult } from '../../shared/hash/hash.js';
import { canonicalSerialize, toIntString } from '../../shared/hash/canonical.js';
import { q } from '../../shared/hash/quantize.js';
import { normalizeNfcWhitelist, isWhitelistedCodePoint } from '../../shared/hash/normalize.js';

// ---------------------------------------------------------------- 构造 helper
/** 商品化输入：chronological 最小化 ArchiveDocument 事实子集（仅用于 hash 自检，非正式 schema） */
function docFragment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hash_contract_version: 'hash-contract-v1',
    schema_version: 'archive-document-1.0',
    algorithm_version: 'bazi-core-1.3',
    input_hash: 'sha256:abcd1234',
    year_pillar: { gan: '甲', zhi: '子' },
    ...overrides,
  };
}

// ------------------------------------------------------------------ F-1 中文
test('F-1: 中文值不做 \\uXXXX 转义，UTF-8 原样输出', () => {
  const s = canonicalSerialize({ gan: '甲', zhi: '子' });
  // 必须原样含中文字符（不是 \u7532）
  assert.ok(s.includes('甲'), '中文应原样输出（禁止 \\uXXXX 转义）');
  assert.ok(!s.includes('\\u'), '禁止非 ASCII 的 \\uXXXX 转义');
});

test('F-1: 中文 UTF-8 字节为 3 字节（E7 94 B2）', () => {
  const bytes = Buffer.from('甲', 'utf8');
  assert.deepEqual([...bytes], [0xe7, 0x94, 0xb2]);
});

test('F-1: canonical 对象 key 依 UTF-16 码点升序，无空白', () => {
  const obj = { zhi: '子', gan: '甲' }; // 故意乱序
  const serialized = canonicalSerialize(obj);
  assert.equal(serialized, '{"gan":"甲","zhi":"子"}');
  assert.ok(!serialized.includes(' '), 'canonical 无空白');
});

test('F-1: 同一语义文档产出稳定 docHash（同入同出）', () => {
  const h1 = computeHash(docFragment());
  const h2 = computeHash(docFragment());
  assert.equal(h1.value, h2.value);
  assert.match(h1.value, /^sha256:[0-9a-f]{64}$/);
});

// ------------------------------------------------------------------ F-2 负号与 -0
test('F-2: 负 longitudes/东风或 eot 序列化为负整数', () => {
  const s = canonicalSerialize({ lon_diff_seconds: -120, eot_seconds_scaled6: -3716584 });
  assert.equal(s, '{"eot_seconds_scaled6":-3716584,"lon_diff_seconds":-120}');
});

test('F-2: 0 与 -0 归一为同一 hash', () => {
  const a = computeHash({ v: 0 });
  const b = computeHash({ v: -0 });
  assert.equal(a.value, b.value, '0 与 -0 必须同一 docHash');
  assert.ok(!a.value.includes('-0'));
});

test('F-2: 禁止前导 +、前导零、尾随 .0（INT 规约）', () => {
  assert.equal(toIntString(7), '7');
  assert.equal(toIntString(0), '0');
  // 前导零/加号/小数点由类型系统(INT)天然排除，这里验证 toIntString 拒绝非整数
  assert.throws(() => toIntString(1.5), /HASH_RAW_FLOAT/);
  assert.throws(() => toIntString(Number.NaN), /HASH_RAW_FLOAT/);
});

// ------------------------------------------------------------------ F-3 DEC
test('F-3: DEC 量化 Q(v,d) 与常量，远离零点对称', () => {
  // EoT = -3.7165835 分钟, d=6 → -3716584（契约示例）
  assert.equal(Number(q(-3.7165835, 6)), -3716584);
  // 正放行临界：x.xxxxxx5 四舍五入向上
  assert.equal(Number(q(0.0000005, 6)), 1);
  // 负向临界：远离零点（对称于正方向）
  assert.equal(Number(q(-0.0000006, 6)), -1);
  assert.equal(Number(q(-0.0000004, 6)), 0);
  // d=0 常量
  assert.equal(Number(q(12.7, 0)), 13);
});

test('F-3: d 越界拒绝（0..9）', () => {
  assert.throws(() => q(1, 10), /HASH_DEC_RANGE/);
});

// ------------------------------------------------------------------ F-4 空值
test('F-4: null vs "" vs 省略 在 canonical 上可区分', () => {
  const withNull = canonicalSerialize({ hour_pillar: null });
  const withEmpty = canonicalSerialize({ hour_pillar: '' });
  const omitted = canonicalSerialize({}); // 无键
  assert.equal(withNull, '{"hour_pillar":null}');
  assert.equal(withEmpty, '{"hour_pillar":""}');
  assert.equal(omitted, '{}');
  assert.notEqual(withNull, withEmpty);
  assert.notEqual(withEmpty, omitted);
  assert.notEqual(withNull, omitted);
});

test('F-4: 三态 hash 不同（时辰未知 null / 空串 / 省略）', () => {
  const fn = (hour_pillar: unknown): HashResult => computeHash(docFragment(hour_pillar === '$omit$' ? {} : { hour_pillar }));
  const hNull = fn(null);
  const hEmpty = fn('');
  const hOmit = fn('$omit$');
  assert.notEqual(hNull.value, hEmpty.value);
  assert.notEqual(hEmpty.value, hOmit.value);
});

// ------------------------------------------------------------------ F-5 越界 / 归一化
test('F-5: e + 组合锐音符，NFC 可合成 é 但组合记号不在白名单，故被 P-3 拒绝', () => {
  const input = 'e\u0301'; // e + 组合锐音符
  // NFC 确实能合成：证明归一化能力存在
  assert.equal(input.normalize('NFC'), '\u00e9');
  // 但组合记号 U+0301 不在白名单 → 必须被拒绝（严禁越界字符进入 hashScope）
  assert.throws(() => normalizeNfcWhitelist(input), /HASH_CHAR_OUT_OF_SET/);
});

test('F-5: CJK 兼容表意（U+F900 区）必须被 P-3 拒绝', () => {
  const compat = '\uf900'; // CJK 兼容表意
  assert.equal(isWhitelistedCodePoint(0xf900), false);
  assert.throws(() => normalizeNfcWhitelist(compat), /HASH_CHAR_OUT_OF_SET/);
});

test('F-5: 全角字符（U+FF21）必须被 P-3 拒绝', () => {
  const wide = '\uff21'; // 全角 A
  assert.equal(isWhitelistedCodePoint(0xff21), false);
  assert.throws(() => normalizeNfcWhitelist(wide), /HASH_CHAR_OUT_OF_SET/);
});

test('F-5: 拼音字符串（ascii-only）合法通过白名单', () => {
  assert.equal(isWhitelistedCodePoint(0x44), true); // 'D'
  assert.equal(normalizeNfcWhitelist('jin mu shui huo tu'), 'jin mu shui huo tu');
});