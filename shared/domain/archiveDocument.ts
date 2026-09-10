/**
 * shared/domain/archiveDocument.ts
 * ---------------------------------------------------------------------------
 * S-4 ArchiveDocument schema v1（FROZEN_V1）双 hash 侧的代码契约（B-6② 收口）。
 *
 * 依据（自上而下权威）：
 *   - S4_ARCHIVE_DOCUMENT_SCHEMA_v1 冻结稿 §2（ArchiveInput）、§5 版本层、§6 事实层、§7 hashScope
 *   - HASH_CONTRACT_V1 §10/§11/Delta（canonical、INT/DEC(6)、无裸浮点、显式 null）
 *   - shared/protocol/enums.ts（SolarTimeMode / DayBound / CalendarKind 枚举值）
 *
 * 两条 hashScope：
 *   inputHashScope（14 键，IN/§7） -> input_hash
 *   docHashScope（19 键，IN/§7）   -> doc_hash
 *   断言各键集**恰好**等于 §7 覆盖集；任何 drifted extra/missing 散列前显式抛错。
 *   排除集（consent/_openid/客户端元数据/input_echo/trace/display）绝不入 scope。
 *
 * 规约：
 *   - ASCII key（HASH_CONTRACT P-1）
 *   - DEC(6)：经纬度 days/eot/total 等入 scope 前 Q(v,6) 定点整数，禁裸浮点
 *   - 缺失选填字段编码为显式 null（Delta 4）
 *   - hour/minute<0 表示「未知」；hour_unknown 反推
 */
import { computeHash } from '../hash/hash.js';
import type { HashResult } from '../hash/hash.js';
import { q } from '../hash/quantize.js';
import { SolarTimeMode, DayBound, CalendarKind } from '../protocol/enums.js';

export type CalendarKindValue = keyof typeof CalendarKind;
export type SolarTimeModeValue = keyof typeof SolarTimeMode;
export type DayBoundValue = keyof typeof DayBound;

/** S-4 §2 ArchiveInput：用户输入（落库字段；hashScope 取 §7 全集） */
export interface ArchiveInput {
  calendarType: CalendarKindValue;
  year: number;
  month: number;
  day: number;
  /** 0..23；<0 表示「时辰未知」 */
  hour: number;
  /** 0..59；<0 表示未知 */
  minute: number;
  /** 农历闰月 */
  isLeapMonth: boolean;
  /** 内置城市库 ID（方案 A）；无则 null */
  placeId: string | null;
  /** 经度（度，东经正）；无则 null。入库 DEC(6)。 */
  longitude: number | null;
  /** 纬度（度）；无则 null */
  latitude: number | null;
  /** IANA 时区 ID；无则 null */
  timezoneId: string | null;
  /** 太阳时间模式（三值，S-9） */
  solarTimeMode: SolarTimeModeValue;
  /** 日界规则：ZI / MIDNIGHT */
  dayBoundary: DayBoundValue;
}

/** §7 inputHash 覆盖的 14 个字段键（ASCII snake_case） */
export const INPUT_HASH_KEYS = [
  'calendar_type', 'day', 'day_boundary', 'hour', 'hour_unknown',
  'is_leap_month', 'latitude', 'longitude', 'minute', 'month',
  'place_id', 'solar_time_mode', 'timezone_id', 'year',
] as const;

/**
 * 把用户输入编码为 §7 覆盖的规范对象。
 * - 经纬度先 Q(v,6)
 * - 缺失选填字段编码为显式 null
 */
export function buildArchiveScope(input: ArchiveInput): Record<string, unknown> {
  const lon = input.longitude == null ? null : Number(q(input.longitude, 6));
  const lat = input.latitude == null ? null : Number(q(input.latitude, 6));
  return {
    calendar_type: input.calendarType,
    day: input.day,
    day_boundary: input.dayBoundary,
    hour: input.hour >= 0 ? input.hour : null,
    hour_unknown: input.hour < 0,
    is_leap_month: input.isLeapMonth,
    latitude: lat,
    longitude: lon,
    minute: input.minute >= 0 ? input.minute : null,
    month: input.month,
    place_id: input.placeId ?? null,
    solar_time_mode: input.solarTimeMode,
    timezone_id: input.timezoneId ?? null,
    year: input.year,
  };
}

/** 断言 scope 键集 恰好 == §7 的 14 键（无多余、无缺失）。 */
export function assertInputScope(scope: Record<string, unknown>): void {
  const keys = Object.keys(scope).sort();
  const want = [...INPUT_HASH_KEYS].sort();
  if (keys.length !== want.length || keys.join(',') !== want.join(',')) {
    throw new TypeError(
      `HASH_SCOPE_SET_MISMATCH: 偏离 S-4 §7。实际=[${keys.join(',')}] 期望=[${want.join(',')}]`,
    );
  }
}

/** 计算 input_hash（canonical + sha256 + env 指纹）。先断言键集。 */
export function computeInputHash(input: ArchiveInput): HashResult {
  const scope = buildArchiveScope(input);
  assertInputScope(scope);
  return computeHash(scope);
}

// ============================================================================
// docHash 侧：S-4 §5（版本层）+ input_hash + §6（事实层）
// ============================================================================

/** S-4 §6 事实层形状（与运行引擎 facts 对齐） */
export interface ArchiveFacts {
  solarNormalized: { year: number; month: number; day: number; hour: number; minute: number; hourUnknown: boolean };
  lunar: { year: number; month: number; day: number; isLeapMonth: boolean };
  instantIso: string;
  prevTerm: { name: string; instantIso: string; ordinal: number } | null;
  nextTerm: { name: string; instantIso: string; ordinal: number } | null;
  daysToNextTerm: number; // DEC(6) 天
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  hourGanZhi: string | null;
  lonDiffSeconds: number;   // DEC(6) 秒
  eotSeconds: number;       // DEC(6) 秒
  totalOffsetSeconds: number; // DEC(6) 秒
  solarTimeDegraded: boolean;
  elementCount: { wood: number; fire: number; earth: number; metal: number; water: number };
}

/** S-4 §5 版本层（chart/facts_schema_version 按 TBD-2 为 null） */
export interface ArchiveVersionLayer {
  schemaVersion: string;
  algoVersion: string;
  traceVersion: string;
  chartSchemaVersion: string | null;
  factsSchemaVersion: string | null;
}
/** 别名：docHash 的版本入参类型 */
export type ArchiveVersion = ArchiveVersionLayer;

/** §7 docHash 覆盖：版本(3, 排除两 null) + input_hash + §6 事实层全部（19 键） */
export const DOC_HASH_KEYS = [
  'schema_version', 'algo_version', 'trace_version', 'input_hash',
  'solar_normalized', 'lunar', 'instant_iso', 'prev_term', 'next_term',
  'days_to_next_term', 'year_gan_zhi', 'month_gan_zhi', 'day_gan_zhi', 'hour_gan_zhi',
  'lon_diff_seconds', 'eot_seconds', 'total_offset_seconds', 'solar_time_degraded',
  'element_count',
] as const;

/** 断言版本层 P0 约束：chart/facts_schema_version 必须为 null（TBD-2）。 */
export function assertVersionLayer(v: ArchiveVersion): void {
  if (v.chartSchemaVersion !== null || v.factsSchemaVersion !== null) {
    throw new TypeError('HASH_TBD2: P0 下 chart/facts_schema_version 必须为 null');
  }
}

/** 组装 docHashScope 覆盖对象（§7 IN 集）。DEC 字段 Q(v,..6)。 */
export function buildDocHashScope(
  version: ArchiveVersion,
  inputHash: string,
  facts: ArchiveFacts,
): Record<string, unknown> {
  assertVersionLayer(version);
  const scope: Record<string, unknown> = {
    schema_version: version.schemaVersion,
    algo_version: version.algoVersion,
    trace_version: version.traceVersion,
    input_hash: inputHash,
    solar_normalized: facts.solarNormalized,
    lunar: facts.lunar,
    instant_iso: facts.instantIso,
    prev_term: facts.prevTerm,
    next_term: facts.nextTerm,
    days_to_next_term: Number(q(facts.daysToNextTerm, 6)),
    year_gan_zhi: facts.yearGanZhi,
    month_gan_zhi: facts.monthGanZhi,
    day_gan_zhi: facts.dayGanZhi,
    hour_gan_zhi: facts.hourGanZhi, // null 显式保留
    lon_diff_seconds: Number(q(facts.lonDiffSeconds, 6)),
    eot_seconds: Number(q(facts.eotSeconds, 6)),
    total_offset_seconds: Number(q(facts.totalOffsetSeconds, 6)),
    solar_time_degraded: facts.solarTimeDegraded,
    element_count: facts.elementCount,
  };
  assertDocScope(scope);
  return scope;
}

/** 断言 docHash 键集 恰好 == §7 的 19 键。 */
export function assertDocScope(scope: Record<string, unknown>): void {
  const keys = Object.keys(scope).sort();
  const want = [...DOC_HASH_KEYS].sort();
  if (keys.length !== want.length || keys.join(',') !== want.join(',')) {
    throw new TypeError(
      `HASH_DOC_SCOPE_SET_MISMATCH: 偏离 S-4 §7 docHash。实际=[${keys.join(',')}] 期望=[${want.join(',')}]`,
    );
  }
}

/** 计算 doc_hash（canonical + sha256 + env 指纹）。 */
export function computeDocHash(
  version: ArchiveVersion,
  inputHash: string,
  facts: ArchiveFacts,
): HashResult {
  const scope = buildDocHashScope(version, inputHash, facts);
  return computeHash(scope);
}