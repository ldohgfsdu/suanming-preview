/**
 * 单元测试：shared/ 领域协议层版本与枚举的一致性快照。
 * 目的：证明「类型检查 → 静态检查 → 单元测试」链路可运行（B-1 ⑥ 最小门禁的引擎面）。
 * 这是纯协议断言，不涉及任何历法计算实现。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROTOCOL_VERSIONS, HASH_CONTRACT_VERSION, SCHEMA_VERSION, CORE_VERSION } from '../../shared/protocol/versions.js';
import { SolarTimeMode, DayBound, CalendarKind, DegradeReason } from '../../shared/protocol/enums.js';

test('shared 协议版本标识符合冻结值', () => {
  assert.equal(HASH_CONTRACT_VERSION, 'hash-contract-v1');
  assert.equal(SCHEMA_VERSION, 'archive-document-schema-v1');
  assert.equal(CORE_VERSION, 'bazi-core-1.3');
  assert.equal(PROTOCOL_VERSIONS.chartSchema, 'bazi-chart-1.1');
  assert.equal(PROTOCOL_VERSIONS.factsSchema, 'calculated-facts-1.1');
});

test('shared 版本聚合引用自每一常量（同源）', () => {
  assert.equal(PROTOCOL_VERSIONS.hashContract, HASH_CONTRACT_VERSION);
  assert.equal(PROTOCOL_VERSIONS.algorithm, CORE_VERSION);
});

test('S-9：solar_time_mode 取 3 值，与 Core 口径一致', () => {
  const modes = Object.values(SolarTimeMode);
  assert.equal(modes.length, 3);
  assert.deepEqual(new Set(modes), new Set(['STANDARD', 'MEAN_SOLAR', 'TRUE_SOLAR']));
});

test('ASCII 大写枚举：day_bound / calendar_kind / degrade_reason 均可枚举且无重复', () => {
  const sets: Array<[string, readonly string[]]> = [
    ['DAY_BOUND', Object.values(DayBound)],
    ['CALENDAR', Object.values(CalendarKind)],
    ['DEGRADE', Object.values(DegradeReason)],
  ];
  for (const [name, vals] of sets) {
    assert.equal(new Set(vals).size, vals.length, `${name} 枚举不应有重复值`);
    for (const v of vals) {
      // 枚举必须为 ASCII 大写蛇形（HASH_CONTRACT §10.2 Delta 2）
      assert.match(v, /^[A-Z0-9_]+$/, `${name} 枚举值 '${v}' 必须为 ASCII 大写蛇形`);
    }
  }
});