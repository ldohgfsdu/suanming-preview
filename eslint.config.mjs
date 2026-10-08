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
    ignores: ['node_modules/', 'dist/', 'dist-test/', '.git/', '.tmp/', 'package-lock.json'],
  },
];
