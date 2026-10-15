// tests/unit/insight-contract.test.mjs — insight 层跨模块契约一致性
//
// 背景：禁词表 / 证据 ID / 协议版本常量在「小程序客户端」「云函数」「测试」三处各存一份
// 字面量（两端运行时不同：客户端 ESM、云函数 CommonJS，无法共享同一物理源）。
// 2026-10-08 的审查发现：三份今天逐字相同，但**没有任何测试断言它们相等**。
// 禁词表是提审红线 —— 改漏一处不会响门禁，只会在提审时变成合规事故。
//
// 本文件把这三组契约全部钉死：任一副本漂移即刻门禁失败，并指出是哪一份。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BANNED_WORDS as CLIENT_BANNED,
  EVIDENCE_IDS as CLIENT_EVIDENCE,
  OUTPUT_VERSION as CLIENT_OUTPUT,
  PROMPT_VER as CLIENT_PROMPT,
  SCHEMA_VERSION as CLIENT_SCHEMA,
} from '../../miniprogram/lib/insight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CLIENT_SRC = resolve(__dirname, '../../miniprogram/lib/insight.js');
const SERVER_SRC = resolve(__dirname, '../../cloudfunctions/insight/index.js');
const MIRROR_SRC = resolve(__dirname, '../../miniprogram/cloudfunctions/insight/index.js');

function read(p) {
  return readFileSync(p, 'utf8');
}

/**
 * 从源码里抠出指定声明后的第一个方括号字面量并求值。
 * `decl` 必须以 `[` 结尾 —— 它本身就是开括号，扫描从它开始。
 * 扫描过程感知字符串，避免把字符串里的 [ ] 当括号计数。
 */
function extractArrayLiteral(source, decl) {
  assert.ok(decl.endsWith('['), `decl 必须以 [ 结尾：${decl}`);
  const declAt = source.indexOf(decl);
  assert.ok(declAt >= 0, `源码中未找到声明：${decl}`);
  const open = declAt + decl.length - 1;
  let depth = 0;
  let i = open;
  let quote = null;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  assert.ok(depth === 0, `${decl} 的方括号未闭合`);
  // eslint-disable-next-line no-new-func -- 只对静态数组字面量求值，不含任意代码
  return Function(`"use strict"; return (${source.slice(open, i)});`)();
}

function extractConstString(source, name) {
  const m = source.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`));
  assert.ok(m, `源码中未找到字符串常量：${name}`);
  return m[1];
}

const SERVER = read(SERVER_SRC);
const MIRROR = read(MIRROR_SRC);
const CLIENT = read(CLIENT_SRC);

const serverBanned = extractArrayLiteral(SERVER, 'BANNED_WORDS = [');
const mirrorBanned = extractArrayLiteral(MIRROR, 'BANNED_WORDS = [');
const serverEvidence = extractArrayLiteral(SERVER, 'new Set([');
const mirrorEvidence = extractArrayLiteral(MIRROR, 'new Set([');
const serverOutput = extractConstString(SERVER, 'OUTPUT_VERSION');
const serverPrompt = extractConstString(SERVER, 'PROMPT_VER');
const serverSchema = extractConstString(SERVER, 'SCHEMA_VERSION');

test('C1 禁词表：客户端 / 云函数权威副本 / 部署镜像三份逐字一致', () => {
  assert.deepEqual(
    [...CLIENT_BANNED].sort(),
    [...serverBanned].sort(),
    '客户端与云函数权威副本的 BANNED_WORDS 不一致',
  );
  assert.deepEqual(
    [...CLIENT_BANNED].sort(),
    [...mirrorBanned].sort(),
    '客户端与部署镜像的 BANNED_WORDS 不一致',
  );
});

test('C2 禁词表：非空、无重复、无空白项', () => {
  for (const [name, list] of [['客户端', CLIENT_BANNED], ['云函数', serverBanned], ['镜像', mirrorBanned]]) {
    const arr = [...list];
    assert.ok(arr.length > 0, `${name} 禁词表为空`);
    assert.equal(arr.length, new Set(arr).size, `${name} 禁词表有重复项`);
    arr.forEach((w) => assert.ok(w && w.trim() === w, `${name} 含空白词条：${JSON.stringify(w)}`));
  }
  // 云端 Guard 除禁词表外还额外拒「旺」「衰」两个单字，客户端 validateInsight 未覆盖。
  // 这里断言两侧行为差异被显式登记，而不是悄悄分叉。
  const clientHasWangshuai = [...CLIENT_BANNED].includes('旺衰');
  assert.equal(clientHasWangshuai, true, '客户端禁词表应含「旺衰」');
  assert.match(SERVER, /wangshuai/, '云函数应保留对「旺」「衰」单字的额外 Guard');
});

test('C3 证据 ID：客户端与云函数一致', () => {
  assert.deepEqual(
    [...CLIENT_EVIDENCE].sort(),
    [...serverEvidence].sort(),
    '客户端与云函数的 EVIDENCE_IDS 不一致',
  );
  assert.deepEqual(
    [...CLIENT_EVIDENCE].sort(),
    [...mirrorEvidence].sort(),
    '客户端与部署镜像的 EVIDENCE_IDS 不一致',
  );
});

test('C4 证据 ID：取值固定为 5 个契约 ID', () => {
  assert.deepEqual(
    [...CLIENT_EVIDENCE].sort(),
    ['e_lunar', 'e_pillars', 'e_solar', 'e_term', 'e_wuxing'],
  );
});

test('C5 协议版本：OUTPUT_VERSION / PROMPT_VER / SCHEMA_VERSION 两侧一致', () => {
  assert.equal(CLIENT_OUTPUT, serverOutput, 'OUTPUT_VERSION 客户端与服务端不一致');
  assert.equal(CLIENT_PROMPT, serverPrompt, 'PROMPT_VER 客户端与服务端不一致');
  assert.equal(CLIENT_SCHEMA, serverSchema, 'SCHEMA_VERSION 客户端与服务端不一致');
});

test('C6 协议版本：与客户端导出的常量同源（源码不得有第二套硬编码值）', () => {
  // 客户端源码里三个常量各只允许出现一次定义
  for (const name of ['OUTPUT_VERSION', 'PROMPT_VER', 'SCHEMA_VERSION']) {
    const defs = CLIENT.match(new RegExp(`${name}\\s*=\\s*'`, 'g')) || [];
    assert.equal(defs.length, 1, `客户端源码中 ${name} 的定义应只有 1 处，实际 ${defs.length}`);
  }
});

test('C7 云函数不得信任客户端自报的 docHash / 事实指纹', () => {
  assert.doesNotMatch(SERVER, /event\s*&&\s*event\.docHash/, '服务端不得引用 event.docHash');
  assert.doesNotMatch(SERVER, /event\.insight\b/, '服务端不得直接采信 event.insight');
  assert.match(SERVER, /serverDocHash\(/, '服务端必须自行计算文档指纹');
});

test('C8 部署镜像与权威副本的常量定义一致（index.js 全文相等由 I12 覆盖）', () => {
  // I12 已断言两份 index.js 逐字节相等；这里再确认常量定义没有靠字符串拼接等手法绕过
  assert.equal(extractConstString(MIRROR, 'OUTPUT_VERSION'), serverOutput);
  assert.equal(extractConstString(MIRROR, 'PROMPT_VER'), serverPrompt);
  assert.equal(extractConstString(MIRROR, 'SCHEMA_VERSION'), serverSchema);
});
