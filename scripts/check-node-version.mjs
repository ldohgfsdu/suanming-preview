// 验证本仓库要求的 Node 主版本（engines + .nvmrc 双固定）。
// 依赖此脚本在 npm 生命周期 preinstall 中运行，越界则失败并给出明确指引。
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const required = pkg.engines.node; // 例 '18.20.4'
const major = required.split('.')[0];

function getNodeVersion() {
  const v = execFileSync(process.execPath, ['-v'], { encoding: 'utf8' }).trim();
  // 形如 v18.20.4
  return v.replace(/^v/, '');
}

const actual = getNodeVersion();
const actualMajor = actual.split('.')[0];

if (actualMajor !== major) {
  console.error(
    `[preinstall] Node 主版本不匹配：要求 v${major}.x（engines=${required}），当前 v${actual}。\n` +
      `请使用项目固定工具链启动（见 scripts/setup-env.ps1），例如 node v18.20.4。`
  );
  process.exit(1);
}

console.log(`[preinstall] Node v${actual} 通过（engines=${required}）。`);