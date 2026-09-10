/**
 * engine/lib/types.ts — ArchiveDocument/ArchiveInput 类型定义（S-4 v1 冻结，镜像 shared/protocol）
 * 注意：本文件仅为运行期类型/构造器，不参与 docHash（docHash 见 shared/hash）。
 */
import type { SolarTimeMode as STM, DayBound as DB, CalendarKind as CK } from '../../shared/protocol/enums';

/** 用户输入（S-4 §2） */
export interface ArchiveInput {
  /** 历法类型，枚举：SOLAR/LUNAR */
  calendar_type: CK;
  year: number;
  month: number;
  day: number;
  /** 时（hour_unknown 时可为 0，若 hour_unknown=true） */
  hour?: number;
  minute?: number;
  hour_unknown?: boolean;
  is_leap_month?: boolean;
  place_id?: string;
  longitude?: number;
  latitude?: number;
  timezone_id?: string;
  solar_time_mode: STM;
  day_boundary: DB;
  /** 知情同意（不入 hash） */
  consent: boolean;
}

/** 单个节气 */
export interface SolarTermPoint {
  name: string;
  /** 序：0=小寒 … 23=大雪（春分=3） */
  ordinal: number;
  /** UTC 瞬时（秒） */
  utc_seconds: number;
}

/** 干支一对 */
export interface Ganzhi {
  gan: string;
  zhi: string;
}

/** 五行字面统计（仅数量，不判喜用） */
export interface ElementCount {
  wood: number;
  fire: number;
  earth: number;
  metal: number;
  water: number;
}

/** 事实层（S-4 §6） */
export interface ArchiveFacts {
  solar_normalized: { year: number; month: number; day: number; hour?: number; minute?: number; hour_unknown?: boolean };
  lunar: { year?: number; month?: number; day?: number; is_leap_month?: boolean;
    /** true 表示农历为算法近似（新月法），未含闰月表 */
    algorithmic_approx: boolean };
  instant_iso: string;
  prev_term: SolarTermPoint;
  next_term: SolarTermPoint;
  days_to_next_term: number;
  year_ganzhi: string;
  month_ganzhi: string;
  day_ganzhi: string;
  hour_ganzhi?: string;
  lon_diff_seconds: number;
  eot_seconds: number;
  total_offset_seconds: number;
  solar_time_degraded: boolean;
  element_count: ElementCount;
}

/** 透明 trace（B1） */
export interface TimeTraceEntry {
  label: string;
  note: string;
  out?: unknown;
}

/** ArchiveDocument（S-4 v1） */
export interface ArchiveDocument {
  schema_version: string;
  algo_version: string;
  trace_version: string;
  chart_schema_version: string | null;
  facts_schema_version: string | null;
  input_hash: string;
  doc_hash: string;
  facts: ArchiveFacts;
  trace_hash: string;
  input_echo: unknown;
  // 服务字段（不入 docHash）
  doc_id?: string;
  created_at?: string;
  _openid?: string;
}

export type { STM, DB, CK };