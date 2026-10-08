// tests/unit/insight-model-policy.test.mjs
// 锁住云函数模型调用的失败分类与重试状态机（model-policy 是纯函数模块，无 SDK 依赖）。
// 对应评审要求：
//   1) HTTP 429 → model_rate_limited，模型调用次数 = 1（不能自己再打一次）
//   2) HTTP 200 + 非 JSON → model_output_not_json
//   3) HTTP 200 + JSON + Guard 失败 → 带 repair hint 重试一次
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../../cloudfunctions/insight/model-policy.js');

const {
  CLIENT, classifyModelError, classifyNotJson, extractJson, runModelAttempts,
} = policy;

function err(status, message) {
  const e = new Error(message || `Request failed with status code ${status}`);
  e.status = status;
  return e;
}

test('MP1 429/配额限流：不重试，modelCalls=1，回传 model_rate_limited', async () => {
  let calls = 0;
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; throw err(429); },
    guard: () => [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.modelCalls, 1);
  assert.equal(calls, 1, '429 后不得立刻再打一次模型');
  assert.equal(r.reason, CLIENT.RATE_LIMITED);
});

test('MP1b 429 只出现在 message 里（无 status 字段）时同样不重试', async () => {
  const cls = classifyModelError(new Error('Request failed with status code 429'));
  assert.equal(cls.kind, 'rate_limited');
  assert.equal(cls.retryable, false);
  assert.equal(cls.clientReason, CLIENT.RATE_LIMITED);
});

test('MP2 401/403 鉴权失败：不重试，model_auth_failed', async () => {
  for (const s of [401, 403]) {
    let calls = 0;
    const r = await runModelAttempts({
      callModel: async () => { calls += 1; throw err(s, 'invalid api key'); },
      guard: () => [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
    assert.equal(r.reason, CLIENT.AUTH_FAILED);
    assert.equal(classifyModelError(err(s)).retryable, false);
  }
});

test('MP3 5xx/网络类：可重试一次，仍失败则 model_unavailable，modelCalls=2', async () => {
  let calls = 0;
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; throw err(500, 'internal server error'); },
    guard: () => [],
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 2);
  assert.equal(r.modelCalls, 2);
  assert.equal(r.reason, CLIENT.UNAVAILABLE);
});

test('MP4 200 但输出不是合法 JSON：不重试，model_output_not_json', async () => {
  let calls = 0;
  const hints = [];
  const r = await runModelAttempts({
    callModel: async (hint) => {
      calls += 1;
      hints.push(hint);
      return extractJson('抱歉，我无法按要求输出。');
    },
    guard: () => [],
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 1);
  assert.equal(hints[0], null);
  assert.equal(r.reason, CLIENT.NOT_JSON);
  assert.deepEqual(classifyNotJson(), {
    kind: 'not_json', retryable: false, clientReason: CLIENT.NOT_JSON, status: null,
  });
});

test('MP5 Guard 失败：带 repair hint 重试恰好一次，第二次仍失败则 guard:xxx', async () => {
  let calls = 0;
  const hints = [];
  const r = await runModelAttempts({
    callModel: async (hint) => { calls += 1; hints.push(hint); return { sections: [] }; },
    guard: () => ['sections_shape'],
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 2, 'Guard 失败只允许重试一次');
  assert.equal(hints[0], null, '第一轮不带修复提示');
  assert.equal(hints[1], 'sections_shape', '第二轮必须带上一轮的校验错误');
  assert.equal(r.reason, 'guard:sections_shape');
});

test('MP6 Guard 第一轮通过：只调用一次模型', async () => {
  let calls = 0;
  const insight = { sections: [{ id: 's0' }], limitations: ['x'] };
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; return insight; },
    guard: () => [],
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 1);
  assert.equal(r.modelCalls, 1);
  assert.equal(r.insight, insight);
});

test('MP7 第一轮 Guard 失败、第二轮通过：成功返回且 modelCalls=2', async () => {
  let calls = 0;
  const insight = { sections: [{ id: 's0' }], limitations: ['x'] };
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; return calls === 1 ? { sections: [] } : insight; },
    guard: (p) => (p === insight ? [] : ['sections_shape']),
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
  assert.equal(r.insight, insight);
});

test('MP8 配额用尽：直接降级，模型调用次数 = 0', async () => {
  let calls = 0;
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; return {}; },
    guard: () => [],
    quotaCheck: () => ({ ok: false }),
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 0);
  assert.equal(r.modelCalls, 0);
  assert.equal(r.reason, CLIENT.RATE_LIMITED);
});

test('MP9 不把 provider 原始报错回传客户端', async () => {
  const raw = 'Request failed with status code 429; quota=xxx; key=sk-123456';
  let calls = 0;
  const r = await runModelAttempts({
    callModel: async () => { calls += 1; throw new Error(raw); },
    guard: () => [],
  });
  assert.equal(calls, 1);
  assert.notEqual(r.reason, raw);
  assert.equal(r.reason.includes('sk-'), false);
  assert.equal(r.reason, CLIENT.RATE_LIMITED);
});

test('MP10 extractJson 支持围栏/正文混排，垃圾输入返回 null', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('前言 {"a":1} 后语'), { a: 1 });
  assert.equal(extractJson('没有 JSON 的纯文本'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson(null), null);
});
