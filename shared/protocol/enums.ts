/**
 * 共享领域枚举（共享协议之一）。
 *
 * 依据：
 *   - S-9 裁决：`solar_time_mode` 采取 3 取值，与 Core `SolarTimeMode`
 *     (STANDARD / MEAN_SOLAR / TRUE_SOLAR) 及 CALCULATION_BASELINE CB2 口径一致。
 *   - Core `DayBoundaryRule.CHANGE_AT_ZI / CHANGE_AT_MIDNIGHT` → day_bound 2 值。
 *
 * 枚举值统一为 ASCII UPPER_SNAKE_CASE（HASH_CONTRACT §10.2 Delta 2：key 必须 ASCII）
 */

/** 太阳时间模式：决定是否做均时差 (EoT) 校正 */
export const SolarTimeMode = {
  /** 平太阳时。时间不等长 / 同一经度输入无 EoT 校正。 */
  STANDARD: 'STANDARD',
  /** 平均太阳时：考虑经度与区时的差值，不做 EoT（Core 三值口径的中间态）。 */
  MEAN_SOLAR: 'MEAN_SOLAR',
  /** 真太阳时：经度差 + EoT，为输入瞬时真实太阳时刻。 */
  TRUE_SOLAR: 'TRUE_SOLAR',
} as const;
export type SolarTimeMode = (typeof SolarTimeMode)[keyof typeof SolarTimeMode];

/** 日界规则：以子时（23:00）换日，或以午夜（00:00）换日 */
export const DayBound = {
  /** 子时换日（Core 默认 CHANGE_AT_ZI） */
  ZI: 'ZI',
  /** 午夜换日 */
  MIDNIGHT: 'MIDNIGHT',
} as const
export type DayBound = (typeof DayBound)[keyof typeof DayBound];

/** ArchiveInput 历法类型 */
export const CalendarKind = {
  SOLAR: 'SOLAR',
  LUNAR: 'LUNAR',
} as const
export type CalendarKind = (typeof CalendarKind)[keyof typeof CalendarKind];

/** S4 草案定义的降级原因码（ASCII 枚举，不进入展示/不进入 hash 之外的文案） */
export const DegradeReason = {
  HOUR_UNKNOWN: 'HOUR_UNKNOWN',
  LOCATION_ABSENT: 'LOCATION_ABSENT',
  TZ_DEFAULT_APPLIED: 'TZ_DEFAULT_APPLIED',
  SOLAR_TIME_DEGRADED: 'SOLAR_TIME_DEGRADED',
  DT_EXTERNAL_ACCURACY_UNVERIFIED: 'DT_EXTERNAL_ACCURACY_UNVERIFIED',
  TZDB_PLATFORM_LIMIT: 'TZDB_PLATFORM_LIMIT',
} as const
export type DegradeReason = (typeof DegradeReason)[keyof typeof DegradeReason];