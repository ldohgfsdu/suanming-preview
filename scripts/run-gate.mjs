// 门禁统一入口 —— 绕开 npm 子进程 PATH 强插问题。
//
// 背景：本机存在多个 Node（18.20.4 与 22.22.2）。npm 在 Windows 上运行
// scripts 时，会把自己的 node 目录强插到子进程 PATH 最前，因此：
//
//   即使外层用 node18 绝对路径调用 npm，子进程里的 `node` 仍解析到 22
//
// 后果是 `--experimental-vm-modules` 等 Node 18/22 行为差异会伪装成
// MODULE_NOT_FOUND / 语法错误，极易被误判为代码缺陷（已发生两次）。
//
// 本入口的做法：自己按 process.execPath 找齐工具链内的可执行文件，
// 用绝对路径逐个调用，全程不让子进程去猜 `node` 是谁。
//
// 用法（推荐）：
//   node scripts/run-gate.mjs
// 环境变量：
//   SUANMING_NODE_DIR   指定 Node 根目录（含 node.exe / node_modules/npm）
//                      不指定时从当前 process.execPath 推断
//
// 退出码：0 = 全部门禁通过；非 0 = 首个失败环节的退出码

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const requiredNode = pkg.engines.node;
const requiredMajor = requiredNode.split('.')[0];

// ── 定位 Node 根目录 ────────────────────────────────────────────────
// 优先用显式指定；否则从当前 process.execPath 反推（…\<root>\node.exe）。
function resolveNodeDir() {
  if (process.env.SUANMING_NODE_DIR) {
    return process.env.SUANMING_NODE_DIR;
  }
  // process.execPath = <root>\node.exe  →  root = dirname(execPath)
  return dirname(process.execPath);
}

const nodeDir = resolveNodeDir();
const nodeBin = join(nodeDir, 'node.exe');
const npmCli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

if (!existsSync(nodeBin)) {
  console.error(
    `[gate] 找不到 node.exe：${nodeBin}\n` +
      `请设置 SUANMING_NODE_DIR 指向 Node 根目录（含 node.exe 与 node_modules/npm）。`
  );
  process.exit(1);
}

const thisNode = process.version;
if (!thisNode.replace(/^v/, '').startsWith(requiredMajor + '.')) {
  console.error(
    `[gate] 启动门禁的 Node 版本不对：要求 v${requiredMajor}.x（engines=${requiredNode}），` +
      `当前 ${thisNode}（${process.execPath}）。\n` +
      `请用项目固定版本启动，例如：\n` +
      `  powershell -ExecutionPolicy Bypass -File .\\scripts\\setup-env.ps1`
  );
  process.exit(1);
}

// ── 逐环节执行 ─────────────────────────────────────────────────────
const steps = [
  ['版本守卫', [join(repoRoot, 'scripts', 'check-node-version.mjs'), 'verify-node']],
  ['隐私字段自检', [join(repoRoot, 'scripts', 'check-appjson-privacy.mjs')]],
  ['typecheck', [join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', 'tsconfig.json']],
  ['lint', [join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'), '.']],
  ['测试构建', [join(repoRoot, 'scripts', '_clean-dist.mjs')]],
  ['测试编译', [join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.test.json']],
];

// node --test 需要分别跑（TS 与 mjs 两个测试根），单独处理。
const testRuns = [
  ['TS 单测', ['--test', '--experimental-vm-modules', 'dist-test/tests/unit']],
  ['mjs 单测', ['--test', 'tests/unit']],
];

function run(label, args) {
  process.stdout.write(`\n── ${label} ──\n`);
  const r = spawnSync(nodeBin, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${nodeDir};${process.env.PATH}` },
  });
  if (r.error) {
    console.error(`[gate] ${label} 无法启动：${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\n[gate] ✗ ${label} 失败（exit ${r.status}）—— 门禁中止，后续环节未执行。`);
    process.exit(r.status || 1);
  }
}

console.log(`[gate] Node ${thisNode}`);
console.log(`[gate] nodeBin = ${nodeBin}`);
console.log(`[gate] npm     = ${npmCli}`);

for (const [label, args] of steps) run(label, args);
for (const [label, args] of testRuns) run(label, args);

console.log('\n[gate] ✓ 全部门禁通过（版本守卫 → 隐私字段自检 → typecheck → lint → 测试构建 → TS 单测 → mjs 单测）');
