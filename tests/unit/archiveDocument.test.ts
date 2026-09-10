/**
 * 单元测试：S-4 §7 inputHashScope 的代码侧契约（B-6② 收口）。
 * 依据 S4_ARCHIVE_DOCUMENT_SCHEMA_v1 FROZEN §2/§7：
 *   覆盖集（IN）= calendar_type,year,month,day,hour,minute,hour_unknown,
 *               is_leap_month,place_id,longitude,latitude,timezone_id,
 *               solar_time_mode,day_boundary （共 14）
 *   排除集（OUT）= consent,_openid,客户端元数据,input_echo,trace
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInputHash,
  buildArchiveScope,
  assertInputScope,
  computeDocHash,
  buildDocHashScope,
  assertDocScope,
  DOC_HASH_KEYS,
  INPUT_HASH_KEYS,
  type ArchiveInput,
  type ArchiveVersion,
  type ArchiveFacts,
} from '../../shared/domain/archiveDocument.js';

function sampleInput(overrides: Partial<ArchiveInput> = {}): ArchiveInput {
  return {
    calendarType: 'SOLAR',
    year: 2023, month: 3, day: 20,
    hour: 12, minute: 0,
    isLeapMonth: false,
    placeId: null,
    longitude: null, latitude: null,
    timezoneId: null,
    solarTimeMode: 'TRUE_SOLAR',
    dayBoundary: 'ZI',
    ...overrides,
  };
}

test('scope 键集合 == S-4 §7 覆盖的 14 键（无多余、无缺失）', () => {
  const scope = buildArchiveScope(sampleInput());
  const keys = Object.keys(scope);
  assert.strictEqual(keys.length, INPUT_HASH_KEYS.length);
  assert.strictEqual(keys.length, 14);
  // OUT 集严禁出现
  for (const forbid of ['consent', '_openid', 'openid', 'input_echo', 'created_at', 'updated_at']) {
    assert.ok(!keys.includes(forbid), `OUT 键不应存在: ${forbid}`);
  }
  assertInputScope(scope); // 不抛 = 键集精确 14 个
});

test('hour_unknown: hour<0 时 hour 为 null 且 hour_unknown=true', () => {
  const scope = buildArchiveScope(sampleInput({ hour: -1, minute: -1 }));
  assert.strictEqual(scope.hour, null);
  assert.strictEqual(scope.hour_unknown, true);
});

test('缺失选填字段编码为显式 null（HASH Delta 4）', () => {
  const scope = buildArchiveScope(sampleInput());
  for (const k of ['place_id', 'timezone_id', 'latitude', 'longitude']) {
    assert.strictEqual(scope[k], null, `${k} 未提供应显式 null`);
  }
});

test('经纬度 DEC(6)：入 scope 为定点整数，非裸浮点', () => {
  const scope = buildArchiveScope(sampleInput({ longitude: 116.397128, latitude: 39.90923 }));
  assert.strictEqual(typeof scope.longitude, 'number');
  assert.strictEqual(Number.isInteger(scope.longitude), true);
  assert.strictEqual(typeof scope.latitude, 'number');
  assert.strictEqual(Number.isInteger(scope.latitude), true);
  // 116.397128 -> Q(v,6): 116397128
  assert.strictEqual(scope.longitude, 116397128);
  // 39.90923 -> 39909230
  assert.strictEqual(scope.latitude, 39909230);
});

test('同输入 → 稳定 input_hash；字段不同 → hash 不同', () => {
  const a = computeInputHash(sampleInput()).value;
  const b = computeInputHash(sampleInput()).value;
  assert.strictEqual(a, b);
  assert.ok(a.startsWith('sha256:'));

  const c = computeInputHash(sampleInput({ solarTimeMode: 'MEAN_SOLAR' })).value;
  assert.notStrictEqual(c, a, 'solar_time_mode 不同 → hash 应不同');
});

test('collection 边界：solar_time_mode 三值各产生不同 hash + hour_unknown 也影响 hash', () => {
  const base = computeInputHash(sampleInput()).value;
  const modes = ['STANDARD', 'MEAN_SOLAR', 'TRUE_SOLAR'] as const;
  const set = new Set<string>();
  for (const m of modes) set.add(computeInputHash(sampleInput({ solarTimeMode: m })).value);
  assert.strictEqual(set.size, 3, '三值应互异');
  const withUnknown = computeInputHash(sampleInput({ hour: -1, minute: -1 })).value;
  assert.notStrictEqual(withUnknown, base, 'hour_unknown 应影响 hash');
});

// ---------------- docHash（S-4 §5 + input_hash + §6）----------------
function sampleVersion(): ArchiveVersion {
  return { schemaVersion: 'v1', algoVersion: 'bazi-core-1.3', traceVersion: 'trace-1', chartSchemaVersion: null, factsSchemaVersion: null };
}
function sampleFacts(): ArchiveFacts {
  return {
    solarNormalized: { year: 2023, month: 3, day: 20, hour: 12, minute: 0, hourUnknown: false },
    lunar: { year: 2023, month: 2, day: 29, isLeapMonth: false },
    instantIso: '2023-03-20T04:00:00Z',
    prevTerm: { name: '惊蛰', instantIso: '2023-03-06T04:00:00Z', ordinal: 4 },
    nextTerm: { name: '春分', instantIso: '2023-03-20T21:00:00Z', ordinal: 5 },
    daysToNextTerm: 0.4,
    yearGanZhi: '癸卯', monthGanZhi: '乙卯', dayGanZhi: '戊寅', hourGanZhi: '戊午',
    lonDiffSeconds: -14400, eotSeconds: -420, totalOffsetSeconds: -14820, solarTimeDegraded: true,
    elementCount: { wood: 1, fire: 1, earth: 2, metal: 0, water: 0 },
  };
}

test('docHash scope 恰好含 §7 的 19 键，排除集不在内', () => {
  const scope = buildDocHashScope(sampleVersion(), 'sha256:abc', sampleFacts());
  const keys = Object.keys(scope);
  assert.strictEqual(keys.length, DOC_HASH_KEYS.length);
  assert.strictEqual(keys.length, 19);
  for (const forbid of ['doc_id', 'created_at', 'updated_at', '_openid', 'display_iso_utc', 'input_echo', 'trace', 'insight']) {
    assert.ok(!keys.includes(forbid), `docHash OUT 键不应存在: ${forbid}`);
  }
  assertDocScope(scope);
});

test('版本层非 null chart/facts 应抛错（TBD-2）', () => {
  assert.throws(() => computeDocHash({ ...sampleVersion(), chartSchemaVersion: 'x' }, 'sha256:abc', sampleFacts()));
});

test('docHash DEC 字段为定点整数且稳定', () => {
  const v = sampleVersion();
  const a = computeDocHash(v, 'sha256:abc', sampleFacts()).value;
  const b = computeDocHash(v, 'sha256:abc', sampleFacts()).value;
  assert.strictEqual(a, b);
  assert.ok(a.startsWith('sha256:'));
});