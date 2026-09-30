/**
 * scripts/_clean-dist.mjs — 删除 dist-test 构建产物目录。
 *
 * 作用：`test:build` 的前置清理。原实现用内联 `node -e "...{...}"`，
 * 在 npm-on-Windows 默认 cmd 与 Git Bash 的引号/花括号解析存在脆弱性。
 * 抽为独立脚本：参数为零、含中文说明，跨 shell 可移植，语义完全等价。
 *
 * 用法：node scripts/_clean-dist.mjs
 * 兼容：Node 18（ESM，package.json type=module）。
 */
'use strict';

import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 项目根 = 本脚本所在目录的上一级。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'dist-test');

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
}