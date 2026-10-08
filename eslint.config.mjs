// ESLint 8.57 flat config (eslint.config.mjs)
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import js from '@eslint/js';

// JS 侧与 TS 侧同源（eslint:recommended）；未使用变量降为 warning，免得淹没真实缺陷。
const JS_RULES = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-console': 'off',
};

// 微信小程序运行时全局：不声明就会被 no-undef 判成未定义，或反过来被整目录 ignore 掉。
const WECHAT_GLOBALS = {
  wx: 'readonly',
  Page: 'readonly',
  App: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
};

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      globals: { ...globals.node, ...globals.es2021 },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
  // 小程序源码（ES module + WeChat 全局）。此前被整体 ignore —— 门禁显示 lint 绿，
  // 但真正要发布的小程序代码一次都没被检查过。
  // 只挂 node + WeChat 全局：浏览器全局里的 `ai` 等历史元素名会与业务局部变量撞名。
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...WECHAT_GLOBALS },
    },
    rules: JS_RULES,
  },
  // 云函数是 CommonJS（require / exports）。置于上一条之后，使 sourceType 覆盖
  // miniprogram/cloudfunctions/ 这份镜像副本。
  {
    files: ['**/cloudfunctions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node },
    },
    rules: JS_RULES,
  },
  // 脚本与测试（ES module + node 全局），含 eslint.config.mjs 自身。
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: JS_RULES,
  },
  {
    ignores: ['node_modules/', 'dist/', 'dist-test/', '.git/', '.tmp/', 'package-lock.json'],
  },
];
