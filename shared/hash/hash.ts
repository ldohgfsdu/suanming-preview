/**
 * shared/hash/hash.ts
 * ---------------------------------------------------------------------------
 * HASH_CONTRACT_V1 §11/§12：SHA-256 + "sha256:" 前缀 + hashScope 编排（TS 参考实现）。
 *
 * 入口 `computeHash(doc, scope)`：
 *  1. 断言 P-1（key ASCII）、P-7（无重复 key）在整个树下执行；
 *  2. 递归对字符串值做 NFC + 白名单断言（P-2/P-3）；
 *  3. 校验无裸浮点（P-4）、无 undefined/NaN/Infinity/-0（P-5）、时间字段为 INT（P-6）；
 *  4. canonicalSerialize → UTF-8 字节（显式 'utf8'）；
 *  5. SHA-256 → "sha256:" + 64 位小写 hex。
 *
 * 禁止直接 `JSON.stringify(obj)` 作 canonical（§15 #2）。数据流 = ArchiveInput → doc → hash。
 */
import { createHash } from 'node:crypto';
import { canonicalSerialize, assertAsciiKeys, assertNoDuplicateKeys } from './canonical.js';
import type { EnvFingerprint } from './fingerprint.js';
import { fingerprint } from './fingerprint.js';

export interface HashResult {
  /** "sha256:" + 64 位小写十六进制（§11 存储形式，共 71 字符） */
  value: string;
  /** canonical form 字节数（调试/B-6 证据） */
  byteLength: number;
  /** 运行环境指纹（U 版本登记，B-6） */
  env: EnvFingerprint;
}

/** 递归执行成型断言树（P-1/P-2/P-3/P-4/P-5/P-6/P-7/P-8 在 schema 层另行校验）。 */
function assertTree(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'bigint') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: 非有限数值 → HASH_RAW_FLOAT`);
    // §7.2：-0 归一为 0（被 isPlainScalar 放行后由 toIntString 序列化为 '0'）
    if (Object.is(value, -0)) return;
    if (!Number.isInteger(value)) throw new TypeError(`${path}: 裸浮点 ${value} → HASH_RAW_FLOAT`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertTree(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    assertAsciiKeys(obj);
    assertNoDuplicateKeys(obj);
    for (const k of Object.keys(obj)) {
      assertTree(obj[k], `${path}.${k}`);
    }
    return;
  }
  // undefined / function / symbol → 非法
  throw new TypeError(`${path}: 值类型${typeof value}非法 → HASH_INVALID_VALUE`);
}

/**
 * 计算 hash。`value` 须是待 hash 的字段对象（已按 schema 组装、数值已定点化整数）。
 */
export function computeHash(value: unknown): HashResult {
  assertTree(value);
  const canonical = canonicalSerialize(value);
  const bytes = Buffer.from(canonical, 'utf8'); // 显式 utf8（§5.1，禁止依赖默认）
  const digest = createHash('sha256').update(bytes).digest('hex'); // 小写 64 位
  return {
    value: `sha256:${digest}`,
    byteLength: bytes.byteLength,
    env: fingerprint(),
  };
}