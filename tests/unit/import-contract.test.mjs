// tests/unit/import-contract.test.mjs — 导入名必须真实存在于目标模块
// 背景：2026-10-08 E2E 实测发现 index.js 从 engine.js 导入 hourPillar，
// 而 hourPillar 实际由 archive.js 导出 → 运行时 undefined，
// 恰好只在「真太阳时跨日 / 时辰变更」弹窗分支被调用，门禁与 CI 全绿也抓不到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../miniprogram');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'miniprogram_npm') continue;
      walk(p, out);
    } else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

function exportedNames(src) {
  const names = new Set();
  if (/export\s*\*\s*from/.test(src)) return null; // 星号导出无法静态判定，放行
  for (const re of [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
  ]) {
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
  }
  const block = /export\s*\{([^}]+)\}/g;
  let m;
  while ((m = block.exec(src))) {
    for (const raw of m[1].split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add(as[as.length - 1].trim());
    }
  }
  return names;
}

function resolveTarget(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, base + '.js', join(base, 'index.js')]) {
    try {
      if (statSync(cand).isFile()) return cand;
    } catch { /* try next */ }
  }
  return null;
}

test('IC1 miniprogram 所有具名导入都能在目标模块中找到（防 undefined 运行时炸弹）', () => {
  const problems = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[2];
      if (!spec.startsWith('.')) continue;
      const target = resolveTarget(file, spec);
      if (!target) { problems.push(`${file}: 找不到目标模块 ${spec}`); continue; }
      const exp = exportedNames(readFileSync(target, 'utf8'));
      if (exp === null) continue;
      for (const raw of m[1].split(',')) {
        const piece = raw.trim();
        if (!piece) continue;
        const imported = piece.split(/\s+as\s+/)[0].trim();
        if (!exp.has(imported)) {
          problems.push(`${file.replace(ROOT, 'miniprogram')} → ${spec} 缺少导出 "${imported}"`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], '导入名与导出名不匹配：\n' + problems.join('\n'));
});
