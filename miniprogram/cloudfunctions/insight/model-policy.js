/**
 * cloudfunctions/insight/model-policy.js — 模型调用失败分类、重试状态机与输出解析（纯函数，无 SDK 依赖）。
 *
 * 策略：
 *   模型调用异常
 *   ├─ 429 / quota / rate limit → 不重试，model_rate_limited
 *   ├─ 401 / 403               → 不重试，model_auth_failed
 *   ├─ 5xx / 网络类             → 可重试一次，model_unavailable
 *   └─ 成功
 *      ├─ 输出不是合法 JSON      → 不重试，model_output_not_json
 *      └─ Guard 不通过          → 带 repair hint 重试一次
 *
 * 429/401/403 是 provider 在明确拒绝，立刻重试只会放大成本与限流；
 * 唯一应该自动重试的是「模型成功返回但没过我们自己的 Guard」。
 *
 * clientReason 是唯一允许回传给客户端的口径，provider 原始报错只进服务端日志。
 */
'use strict';

const CLIENT = {
  RATE_LIMITED: 'model_rate_limited',
  AUTH_FAILED: 'model_auth_failed',
  UNAVAILABLE: 'model_unavailable',
  NOT_JSON: 'model_output_not_json',
};

const STATUS_RE = /\b(4\d\d|5\d\d)\b/;

function statusOf(err) {
  if (!err || typeof err !== 'object') return null;
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (err.response && typeof err.response.status === 'number') return err.response.status;
  if (err.data && typeof err.data.statusCode === 'number') return err.data.statusCode;
  const m = String(err.message || err.errMsg || '').match(STATUS_RE);
  return m ? Number(m[1]) : null;
}

function rawMessage(err) {
  if (err == null) return 'model_call_failed';
  if (typeof err === 'string') return err;
  return String(err.message || err.errMsg || err.errCode || 'model_call_failed');
}

function classifyModelError(err) {
  const status = statusOf(err);
  const raw = rawMessage(err);
  if (status === 429 || /rate[_\s-]?limit|too many request|quota|exceed|限流|配额|超限/i.test(raw)) {
    return { kind: 'rate_limited', retryable: false, clientReason: CLIENT.RATE_LIMITED, status };
  }
  if (status === 401 || status === 403
    || /unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication|access[_\s-]?denied|签名|鉴权/i.test(raw)) {
    return { kind: 'auth_failed', retryable: false, clientReason: CLIENT.AUTH_FAILED, status };
  }
  if (status && status >= 500) {
    return { kind: 'server_error', retryable: true, clientReason: CLIENT.UNAVAILABLE, status };
  }
  // 只有明确命中网络瞬态特征才重试。没有 status 的未知异常（SDK 配置错、TypeError、
  // model-not-found 等）一律按 failed 处理、不重试：多打一次模型只会放大成本。
  if (/network|timeout|timed out|econnreset|econnrefused|etimedout|socket|fetch failed|dns|enotfound|eai_again|超时|网络/i.test(raw)) {
    return { kind: 'transient', retryable: true, clientReason: CLIENT.UNAVAILABLE, status };
  }
  return { kind: 'failed', retryable: false, clientReason: CLIENT.UNAVAILABLE, status };
}

function classifyNotJson() {
  return { kind: 'not_json', retryable: false, clientReason: CLIENT.NOT_JSON, status: null };
}

/**
 * 服务端日志脱敏：provider 异常文本里可能带 sk- 密钥、token/secret、Bearer、
 * 带 query 的 URL。客户端已经只拿 clientReason，但 CloudBase 日志同样不该出现密钥。
 */
const REDACT_RULES = [
  [/sk-[A-Za-z0-9_-]{6,}/g, 'sk-[REDACTED]'],
  // 值里可能直接是 Bearer xxx，所以要把带前缀的凭据整体吃掉，否则会留下半截 token。
  [/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|authorization|password|signature|sig)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|(?:Bearer|Basic)\s+[^\s"',&]+|[^\s"',&]+)/gi, '$1$2[REDACTED]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._-]+/gi, '$1 [REDACTED]'],
  [/(https?:\/\/[^\s?'"&]+)\?[^\s"']+/gi, '$1?[REDACTED]'],
];

function redactProviderError(err) {
  let s = rawMessage(err);
  REDACT_RULES.forEach(([re, rep]) => { s = s.replace(re, rep); });
  return s.slice(0, 300);
}

/** 从模型输出里抠出第一个 JSON 对象；解析失败返回 null（按 model_output_not_json 处理）。 */
function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

/**
 * 重试状态机。
 * @param {object} opts
 * @param {(hint: string|null) => Promise<object|null>} opts.callModel 返回解析后的 JSON；非 JSON 返回 null。
 * @param {(parsed: object) => string[]} opts.guard 返回空数组表示通过。
 * @param {() => ({ok: boolean})} [opts.quotaCheck] 返回 {ok:false} 时直接按限流降级，不再调用模型。
 * @param {(cls: object, err: any) => void} [opts.onCallError] 服务端日志钩子（provider 原始错误只在这里出现）。
 * @param {(errors: string[], attempt: number) => void} [opts.onGuardFail]
 * @param {number} [opts.maxAttempts]
 * @returns {Promise<{ok: boolean, insight?: object, reason?: string, modelCalls: number}>}
 */
async function runModelAttempts(opts) {
  const {
    callModel, guard, quotaCheck, onCallError, onGuardFail,
    maxAttempts = 2,
  } = opts;
  let hint = null;
  let outcome = null;
  let modelCalls = 0;

  for (let attempt = 0; attempt < maxAttempts && !outcome; attempt += 1) {
    if (quotaCheck) {
      const q = quotaCheck();
      if (!q || !q.ok) {
        outcome = { kind: 'rate_limited', clientReason: CLIENT.RATE_LIMITED };
        break;
      }
    }
    modelCalls += 1;
    let parsed = null;
    try {
      parsed = await callModel(hint);
    } catch (e) {
      const cls = classifyModelError(e);
      if (onCallError) onCallError(cls, e);
      if (!cls.retryable || attempt > 0) {
        outcome = cls;
        break;
      }
      hint = cls.kind;
      continue;
    }
    if (!parsed) {
      outcome = classifyNotJson();
      break;
    }
    const errors = guard(parsed) || [];
    if (!errors.length) return { ok: true, insight: parsed, modelCalls };
    if (onGuardFail) onGuardFail(errors, attempt);
    if (attempt === 0) hint = errors.join(',');
    else outcome = { kind: 'guard', clientReason: 'guard:' + errors.join(',') };
  }

  return { ok: false, reason: (outcome && outcome.clientReason) || CLIENT.UNAVAILABLE, modelCalls };
}

module.exports = {
  CLIENT,
  classifyModelError,
  classifyNotJson,
  extractJson,
  redactProviderError,
  runModelAttempts,
  statusOf,
  rawMessage,
};
