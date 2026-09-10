/**
 * shared/hash/normalize.ts
 * ---------------------------------------------------------------------------
 * HASH_CONTRACT_V1 §6 Unicode 归一化与白名单（TS 参考实现）。
 *
 * 规则：
 *  - §6.3 白名单「落入即拒绝」：先对**输入串**的每个码点做白名单判定，
 *    范围外（CJK 兼容表意 U+F900-、全角 U+FF00-、组合记号、Jamo 等）一律抛
 *    HASH_CHAR_OUT_OF_SET。这一步在归一化之前执行，避免「越界字符被 NFC 映射进
 *    合法区后误放行」的跨版本敏感点。
 *  - §6.1 之后对白名单内输入应用 NFC（对合法输入为恒等变换），并断言幂等 P-2。
 *
 * 白名单：
 *   ASCII 可打印 U+0020–U+007E，或 CJK 统一表意 U+4E00–U+9FFF。
 */

/** 判断单个码点是否落在白名单内（§6.3）。 */
export function isWhitelistedCodePoint(cp: number): boolean {
  return (cp >= 0x0020 && cp <= 0x007e) || (cp >= 0x4e00 && cp <= 0x9fff);
}

/** UTF-16 码元迭代得到原始串的完整码点序列（兼容代理对）。 */
function codePointsOf(input: string): number[] {
  const out: number[] = [];
  for (const ch of input) out.push(ch.codePointAt(0)!);
  return out;
}

/**
 * 校验字符串每个字符都落在白名单内，否则抛 HASH_CHAR_OUT_OF_SET。
 * 对**原始串**逐码点判定，不做归一化（归一化在之后单独执行）。
 */
export function assertWhitelist(input: string): void {
  for (const cp of codePointsOf(input)) {
    if (!isWhitelistedCodePoint(cp)) {
      throw new TypeError(
        `HASH_CHAR_OUT_OF_SET: 字符 U+${cp.toString(16).toUpperCase().padStart(4, '0')} 不在白名单（ASCII 可打印 + CJK 统一表意）`
      );
    }
  }
}

/**
 * 规范化入口（P-2/P-3）：先做原始串白名单断言，再执行 NFC，再验幂等。
 * 返回归一化结果；任何不合法输入直接抛（reject），不静默替换。
 */
export function normalizeNfcWhitelist(input: string): string {
  assertWhitelist(input); // P-3（基于原始串，拒绝全角/兼容表意/组合记号等）
  const normalized = input.normalize('NFC'); // §6.1
  // 幂等性 P-2
  if (normalized.normalize('NFC') !== normalized) {
    throw new TypeError('HASH_NFC_UNSTABLE: NFC 不幂等');
  }
  // 归一化后仍须在白名单内（防御性兜底）
  assertWhitelist(normalized);
  return normalized;
}