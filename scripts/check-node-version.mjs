// 验证本仓库要求的 Node 主版本（engines + .nvmrc 双固定）。
//
// 两个入口共用同一份判定逻辑：
//   1. preinstall —— npm 生命周期钩子（仅 install 那一刻触发）
//   2. verify-node —— 门禁首步（见 package.json 的 gate:node / test:all）
//
// 存在的理由：preinstall 只在 install 时跑一次，而 test:all 是
// `npm run` 链式调用，子进程直接继承宿主 PATH。若宿主 PATH 中
// 其他 Node 版本排在前面，门禁会静默用错版本运行，并伪装成
// 与版本无关的 MODULE_NOT_FOUND / 语法差异。门禁必须自己再拦一次。
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const required = pkg.engines.node; // 例 '18.20.4'
const major = required.split('.')[0];

// 入口标签：preinstall（默认）| verify-node
const label = process.argv[2] === 'verify-node' ? 'verify-node' : 'preinstall';

function getNodeVersion() {
  const v = execFileSync(process.execPath, ['-v'], { encoding: 'utf8' }).trim();
  // 形如 v18.20.4
  return v.replace(/^v/, '');
}

const actual = getNodeVersion();
const actualMajor = actual.split('.')[0];

if (actualMajor !== major) {
  console.error(
    `[${label}] Node 主版本不匹配：要求 v${major}.x（engines=${required}），当前 v${actual}。\n` +
      `  运行环境：${process.execPath}\n` +
      `请使用项目固定工具链启动（见 scripts/setup-env.ps1），例如 node v18.20.4。\n` +
      (label === 'verify-node'
        ? `  若宿主 PATH 中存在多个 Node，请改用绝对路径调用，例如：\n` +
          `    "<node18 绝对路径>" "<node18 绝对路径>/node_modules/npm/bin/npm-cli.js" run test:all\n`
        : '')
  );
  process.exit(1);
}

console.log(`[${label}] Node v${actual} 通过（engines=${required}）。`);
