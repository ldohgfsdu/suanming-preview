// 门禁统一入口 —— 固定使用启动当前脚本的 Node，可在 Windows / Linux CI 一致运行。
//
// 背景：开发机可能同时存在多个 Node。npm 在 Windows 上运行 scripts 时，会把自己的
// node 目录插到子进程 PATH 前面，导致门禁子进程误用另一个 Node。这里不再让子进程
// 自己解析 `node`：所有步骤都直接使用 process.execPath。
//
// 用法（推荐）：
//   node scripts/run-gate.mjs
//
// 环境变量：
//   SUANMING_NODE_BIN   可显式指定 Node 可执行文件；默认 process.execPath。
//                      仅用于特殊本地工具链，CI 不需要设置。
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
const nodeBin = process.env.SUANMING_NODE_BIN || process.execPath;
const nodeDir = dirname(nodeBin);

if (!existsSync(nodeBin)) {
  console.error(
    `[gate] 找不到 Node 可执行文件：${nodeBin}\n` +
      '请用项目固定 Node 启动门禁，或设置 SUANMING_NODE_BIN。',
  );
  process.exit(1);
}

const thisNode = process.version;
if (!thisNode.replace(/^v/, '').startsWith(requiredMajor + '.')) {
  console.error(
    `[gate] 启动门禁的 Node 版本不对：要求 v${requiredMajor}.x（engines=${requiredNode}），` +
      `当前 ${thisNode}（${process.execPath}）。\n` +
      '请切换到项目固定 Node 18.20.4 后重试。',
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

const testRuns = [
  ['TS 单测', ['--test', '--experimental-vm-modules', 'dist-test/tests/unit']],
  ['mjs 单测', ['--test', 'tests/unit']],
];

function run(label, args) {
  process.stdout.write(`\n── ${label} ──\n`);
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const r = spawnSync(nodeBin, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${nodeDir}${pathSep}${process.env.PATH || ''}` },
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

for (const [label, args] of steps) run(label, args);
for (const [label, args] of testRuns) run(label, args);

console.log('\n[gate] ✓ 全部门禁通过（版本守卫 → 隐私字段自检 → typecheck → lint → 测试构建 → TS 单测 → mjs 单测）');
