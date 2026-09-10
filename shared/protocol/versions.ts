/**
 * Suanming Preview · shared/ 领域协议层
 * ---------------------------------------------------------------------------
 * 目的：作为跨层 (miniprogram / cloudfunctions / engine / insight) 唯一共享的
 *       协议、版本标识、类型与规范化约定的事实源。
 *
 * 权威依据（自上而下）：
 *   - HASH_CONTRACT_V1（hash-contract-v1）→ shared/domain/hash.ts
 *   - S-4 ArchiveDocument schema v1（草案）→ shared/domain/archiveDocument.ts
 *   - S-3 命名裁决：概念名为 `ArchiveDocument`（不使用 `ArchiveDoc`）
 *   - S-9 裁决：solar_time_mode 取 3 值 (STANDARD / MEAN_SOLAR / TRUE_SOLAR)
 *
 * 铁律（Handbook §3、MEMENTORY#工程铁律）：
 *   - shared/ 尽量无业务运行时依赖；不存密钥、页面状态、数据库客户端、
 *     重复算法、可变全局状态。
 *   - 本层只声明「协议」，不实现计算。实现见 engine/。
 *   - 所有字符串尽量 ASCII snake_case；数值只允许 INT / DEC 定点。
 *
 * 本文件只包含「版本」这一部分，属于可安全并行的地基。
 */

/** Hash 契约版本标识（HASH_CONTRACT_V1） */
export const HASH_CONTRACT_VERSION = 'hash-contract-v1' as const;

/** ArchiveDocument schema 版本（S-4 冻结后由 v1 draft 转正即固定） */
export const SCHEMA_VERSION = 'archive-document-schema-v1' as const;

/** Core 计算版本（CALCULATION_BASELINE_V1 关键常量，实测核对） */
export const CORE_VERSION = 'bazi-core-1.3' as const;

/** 四柱 chart schema 版本（Core 实测） */
export const CHART_SCHEMA_VERSION = 'bazi-chart-1.1' as const;

/** 计算结果事实 schema 版本（Core 实测） */
export const FACTS_SCHEMA_VERSION = 'calculated-facts-1.1' as const;

/** 历法算法版本声明（Preview 侧，随对拍锁定） */
export const ALGO_PREVIEW = 'suanming-preview-engine-1.0' as const;

/** 共享协议包内所有版本标识的聚合，供上层引用与校验 */
export const PROTOCOL_VERSIONS = {
  hashContract: HASH_CONTRACT_VERSION,
  schema: SCHEMA_VERSION,
  algorithm: CORE_VERSION,
  chartSchema: CHART_SCHEMA_VERSION,
  factsSchema: FACTS_SCHEMA_VERSION,
  algoPreview: ALGO_PREVIEW,
} as const;

export type ProtocolVersions = typeof PROTOCOL_VERSIONS;