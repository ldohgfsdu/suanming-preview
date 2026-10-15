// ESLint 8.57 flat config (eslint.config.mjs)
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import js from '@eslint/js';

const JS_RULES = {
  ...js.configs.recommended.rules,
  // Node 18 exposes WebCrypto as global `crypto`，但 CommonJS 里 `const crypto=require(...)` 是合法常用写法。
  'no-redeclare': ['error', { builtinGlobals: false }],
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-console': 'off',
};

// 小程序运行时显式白名单；不要把 globals.node 整包灌进生产前端，否则 process/Buffer
// 误入 miniprogram 也会被 lint 当成合法。
const WECHAT_GLOBALS = {
  wx: 'readonly',
  Page: 'readonly',
  App: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
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
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2021, ...WECHAT_GLOBALS },
    },
    rules: JS_RULES,
  },
  // types/wechat.d.ts —— 微信运行时全局声明（tsconfig.mini.json 检查 miniprogram/ 的生产 JS）。
  // 该文件刻意使用 any，理由见文件内注释与下方说明；不逐处写 eslint-disable-next-line，
  // 因为「为什么放宽」必须集中在一处可审查，而不是散落在 8 个 disable 注释里。
  {
    files: ['types/**/*.d.ts'],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.node, ...globals.es2021 },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // 三类 any 都是「第三方 API 表面」的必要宽松，不是懒：
      //   1. Page/App/Component/Behavior 的 options：一旦有类型，this 就不再是 any，
      //      页面里 this.data.xxx / this.foo() 全变 unknown（实测 +200 个 TS2571）。
      //      精确描述需要完整微信类型库。
      //   2. getStorageSync 返回：storage 内容由调用点各自用 `|| []` 兜底。
      //   3. applyHistory 的 record：历史档案快照字段由 pages/index 自定义。
      // 真正的护栏是 tests/unit/import-contract.test.mjs + 189 个单测。
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // 云函数是 CommonJS；此配置覆盖 miniprogram/cloudfunctions/ 镜像的 sourceType。
  {
    files: ['**/cloudfunctions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node },
    },
    rules: JS_RULES,
  },
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
    ignores: ['node_modules/', 'dist/', 'dist-test/', '.git/', '.tmp/', '.tmp-*', 'tests/e2e/bridge-ide.mjs', 'package-lock.json'],
  },
];
