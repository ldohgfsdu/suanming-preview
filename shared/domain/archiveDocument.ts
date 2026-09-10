/**
 * shared/domain/archiveDocument.ts
 * ---------------------------------------------------------------------------
 * S-4 ArchiveDocument schema v1（FROZEN_V1）的「inputHash」侧类型 + 构建器。
 *
 * 依据（自上而下权威）：
 *   - S4_ARCHIVE_DOCUMENT_SCHEMA_v1 冻结稿 §2（ArchiveInput 表）+ §7（hashScope）
 *   - HASH_CONTRACT_V1 §10/§11/Delta（canonical、INT/DEC(6)、无裸浮点、显式 null）
 *   - shared/protocol/enums.ts（SolarTimeMode / DayBound 枚举值）
 *
 * 本模块职责（B-6② 收口的代码侧契约）：
 *   1. 把“用户输入”聚合为 §7 inputHash 覆盖的确定性字段对象（全 14 键）。
 *   2. `computeInputHash()` 产出 `input_hash`（「sha256:…」）。
 *   3. `assertScopeKeys()` 保证 scope 键集**恰好等于** §7 IN 集；不在集内
 *      （consent、_openid、客户端元数据、input echo）绝不进入。
 *
 * 规约：
 *   - ASCII key（HASH_CONTRACT P-1）
 *   - 经纬度 DEC(6)：入 scope 前 Q(v,6) 定点整数，禁止裸浮点
 *   - 缺失选填字段：scope 中编码为显式 null（Delta 4）
 *   - year/month/day/hour/minute 为 INT；hour_unknown/is_leap_month 为 BOOL
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
  /** 历法类型：SOLAR / LUNAR */
  calendarType: CalendarKindValue;
  year: number;
  month: number;
  day: number;
  /** 小时 0..23；<0 表示「时辰未知」 */
  hour: number;
  /** 分钟 0..59；<0 表示未知 */
  minute: number;
  /** 是否农历闰月 */
  isLeapMonth: boolean;
  /** 内置城市库 ID（方案 A）；无则 null */
  placeId: string | null;
  /** 经度（度，东经为正）；无则 null。入库 DEC(6)，入 scope 前定点化。 */
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

/**
 * §7 inputHash 覆盖的 14 个字段键（ASCII snake_case，升序即 canonical 序）。
 */
export const INPUT_HASH_KEYS = [
  'calendar_type', 'day', 'day_boundary', 'hour', 'hour_unknown',
  'is_leap_month', 'latitude', 'longitude', 'minute', 'month',
  'place_id', 'solar_time_mode', 'timezone_id', 'year',
] as const;
export type InputHashKey = (typeof INPUT_HASH_KEYS)[number];
export const INPUT_HASH_KEY_COUNT = INPUT_HASH_KEYS.length; // 14

/**
 * 把用户输入编码为 §7 覆盖的规范对象。
 * - 经纬度先 Q(v,6)（HASH_CONTRACT §7.3，禁止裸浮点入 scope）
 * - 缺失选填字段编码为显式 null（HASH Delta 4）
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

/**
 * 断言 scope 键集 恰好 == §7 的 14 键（无多余、无缺失）。
 * 若后续 schema 改动致集合偏移，散列前显式抛错，防静默漂移。
 */
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