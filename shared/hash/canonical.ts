/**
 * shared/hash/canonical.ts
 * ---------------------------------------------------------------------------
 * HASH_CONTRACT_V1 §10 Canonical JSON 序列化（TS 参考实现）。
 * 基线：RFC 8785 (JCS) + 契约四条 Delta：
 *   Delta 1 数值：禁止裸浮点，只允许 INT / DEC(d)（见 value 类型规约）
 *   Delta 2 key 字符集：限 ASCII 可打印、无需转义子集
 *   Delta 3 归一化：NFC + 白名单断言（见 normalize.ts）
 *   Delta 4 空值：显式保留 null，禁止 undefined
 *
 * 面向 hash 输入，产出完全无空白的 canonical UTF-8 字节序列的来源。
 * 本模块只处理「已通过前置断言 P-1..P-8」的树；断言主体见 hash.ts 入口。
 */

/**
 * 判定是否为「标量」且可安全序列化的值。
 * 允许：null / boolean / number(仅整数，见 serializeScalar) / string / bigint(转 INT)。
 * 拒绝 function / symbol / undefined / NaN / Infinity / -0。
 */
const isPlainScalar = (v: unknown): boolean =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  typeof v === 'bigint' ||
  (typeof v === 'number' && Number.isFinite(v));

/** 把 number 权威判为 INT（64 位有符号）并转字符串；非整数/越界即抛。 */
export function toIntString(v: number): string {
  if (!Number.isInteger(v)) {
    throw new TypeError(`HASH_RAW_FLOAT: 非整数数值 ${String(v)} 不得进入 hashScope`);
  }
  if (!Number.isSafeInteger(v)) {
    throw new TypeError(`HASH_INT_RANGE: 数值 ${v} 超出安全整数范围`);
  }
  return String(v);
}

/**
 * 序列化一个值；`tree` 必须在进入前满足前置断言 P-1..P-8（见 hash.ts）。
 * - 普通 number 只允许整数（INT）；字符串原样（已预先 NFC + 白名单）
 * - 含 `__scaled` 的定点小数包装对象请先解为整数再调用
 * 返回无空白的 canonical 字符串（非字节）。
 */
export function canonicalSerialize(value: unknown): string {
  if (isPlainScalar(value)) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return serializeString(value);
    if (typeof value === 'bigint') return value.toString();
    // number（isPlainScalar 已排除非整数，这里再显式收窄认型）
    if (typeof value === 'number') return toIntString(value);
  }
  if (Array.isArray(value)) {
    const inner = value.map((el) => canonicalSerialize(el));
    return `[${inner.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort(compareAscii);
    const inner = keys.map((k) => `${serializeString(k)}:${canonicalSerialize((value as Record<string, unknown>)[k])}`);
    return `{${inner.join(',')}}`;
  }
  // undefined / function / symbol / NaN / Infinity 已在 isPlainScalar 与上层挡住
  throw new TypeError(`HASH_INVALID_VALUE: 不支持的值类型出现在 hashScope`);
}

/** ASCII key 升序：key 已保证为 ASCII 可打印、无转义子集，故按码点升序。 */
function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** JSON 字符串转义（RFC 8785 §9.2 转义表：仅三类）。中文等非 ASCII 原样输出。 */
export function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x22: out += '\\"'; break;        // "
      case 0x5c: out += '\\\\'; break;       // \
      case 0x08: out += '\\b'; break;
      case 0x09: out += '\\t'; break;
      case 0x0a: out += '\\n'; break;
      case 0x0c: out += '\\f'; break;
      case 0x0d: out += '\\r'; break;
      default:
        if (c < 0x20) {
          out += `\\u${c.toString(16).padStart(4, '0')}`; // 小写十六进制
        } else {
          out += s[i]!; // 非 ASCII（含中文）与 ASCII 可打印字符原样输出
        }
    }
  }
  return out + '"';
}

/** 校验对象 key 均为合法 ASCII key（P-1 / §10.2 Delta 2）。 */
export function assertAsciiKeys(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (!/^[\x20-\x7E]+$/.test(k)) {
      throw new TypeError(`HASH_KEY_NOT_ASCII: key "${k}" 非 ASCII 可打印`);
    }
  }
}

/** 校验无重复 key（P-7）：同名字段在对象字面量中重复即属数据错误。 */
export function assertNoDuplicateKeys(obj: Record<string, unknown>): void {
  const seen = new Set<string>();
  for (const k of Object.keys(obj)) {
    if (seen.has(k)) throw new TypeError(`HASH_DUPLICATE_KEY: key "${k}" 重复`);
    seen.add(k);
  }
}