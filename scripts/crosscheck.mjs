// crosscheck.mjs — HASH_CONTRACT_V1 §14 跨语言对拍：Kotlin(JVM) vs TypeScript。
// 目标：对同一逻辑文档，Kotlin 参考实现与 TS 参考实现产出同一 docHash → B-6 关闭核心证据。
//
// 前置：已运行 `npm run test:build`（生成 dist-test）与 `kotlin-ref/build.ps1`（生成 jar）。
// 用法：node scripts/crosscheck.mjs
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { computeHash } from '../dist-test/shared/hash/hash.js';
import { canonicalSerialize } from '../dist-test/shared/hash/canonical.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JAR = path.join(ROOT, 'kotlin-ref', 'out', 'hash-ref.jar');

// ---------------- 复刻 Kotlin runFixtures() 中的同一批文档 ----------------
function obj(...kvs) {
  const m = {};
  for (const [k, v] of kvs) m[k] = v;
  return m;
}

const fixtures = {
  'F1-doc': obj(
    ['hash_contract_version', 'hash-contract-v1'],
    ['schema_version', 'archive-document-1.0'],
    ['algorithm_version', 'bazi-core-1.3'],
    ['input_hash', 'sha256:abcd1234'],
    ['year_pillar', obj(['gan', '甲'], ['zhi', '子'])],
  ),
  'F2-int': obj(
    ['eot_seconds_scaled6', -3716584],
    ['lon_diff_seconds', -120],
  ),
  'F3-dec': obj(
    ['lon_diff_seconds', -3716584],
    ['boundary_flag', 0],
  ), // Kotlin 侧等价于 Quantize.q(-3.7165835,6)
  'F4-null': obj(
    ['hash_contract_version', 'hash-contract-v1'],
    ['hour_pillar', null],
  ),
  'F4-empty': obj(
    ['hash_contract_version', 'hash-contract-v1'],
    ['hour_pillar', ''],
  ),
  'F4-omit': obj(['hash_contract_version', 'hash-contract-v1']),
};

// ---------------- 定位 JDK java.exe ----------------
const JDK_DIR = path.join(process.env.USERPROFILE, '.workbuddy', 'binaries', 'jdk');
function findJava() {
  const entry = readdirSync(JDK_DIR, { withFileTypes: true }).find((d) => d.isDirectory());
  if (!entry) throw new Error('未找到 JDK（~/.workbuddy/binaries/jdk）');
  return path.join(JDK_DIR, entry.name, 'bin', 'java.exe');
}

// ---------------- 运行 Kotlin jar 并解析 ----------------
const java = findJava();
if (!statSync(JAR).isFile()) {
  console.error('[crosscheck] Kotlin jar 不存在，请先运行 kotlin-ref/build.ps1');
  process.exit(2);
}
const res = spawnSync(java, ['-Dfile.encoding=UTF-8', '-jar', JAR], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
if (res.error || res.status !== 0) {
  console.error('[crosscheck] 运行 Kotlin jar 失败。请先执行 kotlin-ref/build.ps1');
  if (res.error) console.error(res.error.message);
  process.exit(2);
}

function parseKotlin(stdout) {
  const map = {};
  for (const line of stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const name = line.slice(0, eq).trim();
    const rest = line.slice(eq + 1);
    const [hash, byteLen, ...canonParts] = rest.split('\t');
    map[name] = { hash: (hash || '').trim(), byteLen: (byteLen || '').trim(), canonical: canonParts.join('\t') };
  }
  return map;
}
const kt = parseKotlin(res.stdout);

// ---------------- 逐 fixture 对拍 ----------------
let failures = 0;
const lines = [];
for (const [name, doc] of Object.entries(fixtures)) {
  const ts = computeHash(doc);
  const tsCanonical = canonicalSerialize(doc);
  const k = kt[name];
  if (!k) {
    lines.push(`[MISSING-KOTLIN] ${name}: Kotlin 未输出该 fixture`        );
    failures++;
    continue;
  }
  const hashOk = k.hash === ts.value;
  const canonOk = k.canonical === tsCanonical;
  const ok = hashOk && canonOk;
  if (!ok) failures++;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    lines.push(`        TS : ${ts.value} (${ts.byteLength}B)`);
    lines.push(`        KOT: ${k.hash}   (${k.byteLen}B)`);
    lines.push(`        TS  canonical: ${tsCanonical}`);
    lines.push(`        KOT canonical: ${k.canonical}`);
  }
}

console.log(lines.join('\n'));
console.log('');
console.log(failures === 0
  ? `跨语言对拍通过：${Object.keys(fixtures).length} 个 fixture 的 hash 与 canonical 全部一致`
  : `跨语言对拍失败：${failures} 项不一致`);
process.exit(failures === 0 ? 0 : 1);