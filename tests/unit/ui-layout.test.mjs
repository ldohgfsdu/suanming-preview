// tests/unit/ui-layout.test.mjs — 布局回归守卫（真机实测踩过的两个坑）
//
// L1 微信 <button> UA 注入 `padding: 8px 24px` + `box-sizing: border-box`。
//    若我们再写 `height: 44px; line-height: 44px`，行盒会从内容区顶端起排，
//    文字被顶低一整个 padding-top（真机像素实测 dy=+7.75px）。故必须显式置零垂直 padding。
// L2/L3 letter-spacing 在末字之后也留白，居中文本整体左偏 n×ls/2（实测最大 12rpx）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../miniprogram');

function walk(dir, ext, out) {
  readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  });
  return out;
}

const FILES = { wxss: walk(ROOT, '.wxss', []), wxml: walk(ROOT, '.wxml', []) };

function parseRules(file) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2], file: file.replace(ROOT, '') });
  }
  return out;
}

const RULES = FILES.wxss.flatMap(parseRules);

const BTN_CLASSES = new Set();
FILES.wxml.forEach((f) => {
  const src = readFileSync(f, 'utf8');
  const re = /<button[^>]*class="([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) m[1].split(/\s+/).forEach((c) => c && BTN_CLASSES.add(c));
});

const selectorsOf = (sel) => sel.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
const isButtonRule = (sel) => selectorsOf(sel).some((s) => BTN_CLASSES.has(s.replace(/^\./, '')));
const verticalPaddingZeroed = (body) => (
  /padding-top\s*:\s*0(px|rpx)?\b/.test(body)
  || /padding\s*:\s*0(px|rpx)?(\s|;|$)/.test(body)
  || /padding\s*:\s*0(px|rpx)?\s+[0-9]/.test(body)
);

test('L1 height+line-height 的 button 必须显式置零垂直 padding（UA 8px 会把文字压低）', () => {
  const bad = [];
  RULES.forEach((r) => {
    if (!isButtonRule(r.sel)) return;
    if (!/height\s*:/.test(r.body) || !/line-height\s*:/.test(r.body)) return;
    if (!verticalPaddingZeroed(r.body)) bad.push(`${r.file} [${r.sel}]`);
  });
  assert.ok(BTN_CLASSES.size >= 4, '应从 wxml 抓到 button class');
  assert.deepEqual(bad, [], '以下按钮文字会整体下沉 8px：\n' + bad.join('\n'));
});

test('L2 text-align:center 的规则不得带 letter-spacing（居中会左偏 n*ls/2）', () => {
  const bad = [];
  RULES.forEach((r) => {
    if (/text-align\s*:\s*center/.test(r.body) && /letter-spacing\s*:\s*[1-9]/.test(r.body)) {
      bad.push(`${r.file} [${r.sel}]`);
    }
  });
  assert.deepEqual(bad, [], '居中文字必须去掉 letter-spacing：\n' + bad.join('\n'));
});

test('L3 button 上的类不得带 letter-spacing（同上，UA 默认居中）', () => {
  const bad = [];
  RULES.forEach((r) => {
    if (!isButtonRule(r.sel)) return;
    if (/letter-spacing\s*:\s*[1-9]/.test(r.body)) bad.push(`${r.file} [${r.sel}]`);
  });
  assert.deepEqual(bad, [], '按钮文字必须去掉 letter-spacing：\n' + bad.join('\n'));
});
