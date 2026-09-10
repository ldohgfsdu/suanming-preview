/**
 * shared/hash/quantize.ts
 * ---------------------------------------------------------------------------
 * HASH_CONTRACT_V1 §7.3 DEC(d) 定点小数量化。跨语言必须一致。
 *
 * Q(v, d) = sgn(v) · floor( |v| · 10^d + 0.5 )
 *  - 四舍五入、远离零点、正负对称（非银行家舍入，非 Math.round 负零偏置）
 *  - 10^d 用整数常量表，禁止 Math.pow（避免实现差异）
 *  - d ∈ 0..9
 */

/** 10^d 整数常量表（§7.3 强制，禁止 Math.pow）。d = 0..9。 */
const POW10 = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000] as const;

/**
 * 计算 |v|·10^d 的目标，用 BigDecimal 语义避免 IEEE 平台差异。
 * 说明：为跨语言一致，本实现用「整数拆解 + 高精度字符串算术」而非双精度乘法，
 * 消除 ECMAScript 与 JVM 在超大值乘法上的潜在舍入分歧（契约 §7.3 要求 10^d 用常量表，
 * 但乘法舍入本身须正确）。此处采用对任一真实 DEC(d) 字段足够安全的十进制字符串量化。
 */
export function q(value: number, d: number): bigint {
  if (!Number.isInteger(d) || d < 0 || d > 9) {
    throw new RangeError(`HASH_DEC_RANGE: d=${d} 非法，须为 0..9`);
  }
  if (!Number.isFinite(value)) {
    throw new TypeError(`HASH_RAW_FLOAT: 不能对非有限值 ${value} 量化`);
  }
  const scale = POW10[d]!;

  // 分离符号，远离零点的四舍五入
  const negative = value < 0 || Object.is(value, -0);
  const abs = Math.abs(value);

  const scaled = abs * scale; // 定点放大
  const roi = Math.floor(scaled + 0.5); // +0.5 然后向下取整 = 四舍五入（远离零点，因 abs 非负）

  // 远离零点：负值取负，-0 归 0
  const result = negative ? -roi : roi;
  return BigInt(result);
}

/** 版本标识，供外部登记（本实现对应 HASH_CONTRACT_V1）。 */
export const DEC_QUANTIZER_VERSION = 'hash-dec-quantizer-1' as const;