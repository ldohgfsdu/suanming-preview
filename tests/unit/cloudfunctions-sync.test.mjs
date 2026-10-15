// tests/unit/cloudfunctions-sync.test.mjs — 云函数部署镜像同步检查的自校验
//
// 为什么单独一个文件：
//   tests/unit/insight.test.mjs 的 I12 只逐字节比对 index.js。2026-10 审查时确认
//   model-policy.js / package.json / config.json 三个文件无任何强制，一致纯属运气。
//   同步逻辑收敛到 scripts/sync-cloudfunctions.mjs 后，这些网必须自己也被验证 ——
//   否则「检查永远返回绿」比「没有检查」更危险。
//
// 本文件全部在临时目录里跑，不碰工作树。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diffSync, writeSync, listFiles, MIRROR_ONLY_ALLOWED } from '../../scripts/sync-cloudfunctions.mjs';

/** 造一对「权威副本 / 镜像」临时目录。 */
function fixture(files, mirrorOnly = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cf-sync-'));
  const auth = join(root, 'authoritative');
  const mirror = join(root, 'mirror');
  mkdirSync(auth, { recursive: true });
  mkdirSync(mirror, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = join(auth, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content, 'utf8');
  }
  for (const [rel, content] of Object.entries(mirrorOnly)) {
    const p = join(mirror, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content, 'utf8');
  }
  return { root, auth, mirror };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

const BASELINE = {
  'insight/index.js': 'exports.main = () => ({});\n',
  'insight/model-policy.js': 'module.exports = {};\n',
  'insight/package.json': '{"name":"insight"}\n',
  'insight/config.json': '{"permissions":{}}\n',
};

test('S1 两侧完全一致 → ok，且报告比较过的文件', () => {
  const f = fixture(BASELINE);
  try {
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, false, '镜像为空时应当不 ok（4 个文件缺失）');
    assert.equal(d.missingInMirror.length, 4);

    const w = writeSync(f.auth, f.mirror);
    assert.equal(w.copied, 4);

    const d2 = diffSync(f.auth, f.mirror);
    assert.equal(d2.ok, true, JSON.stringify(d2, null, 2));
    assert.equal(d2.compared.length, 4, '应逐个比对 4 个文件');
    assert.deepEqual(d2.differing, []);
    assert.deepEqual(d2.missingInMirror, []);
    assert.deepEqual(d2.unexpectedMirrorOnly, []);
  } finally {
    cleanup(f.root);
  }
});

test('S2 单文件内容漂移 → 检出并指名该文件', () => {
  const f = fixture(BASELINE);
  try {
    writeSync(f.auth, f.mirror);
    // 只改权威副本，模拟「改了 miniprogram/cloudfunctions 忘了同步」
    writeFileSync(join(f.auth, 'insight/model-policy.js'), 'module.exports = { drifted: true };\n', 'utf8');
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, false, '漂移必须被检出');
    assert.deepEqual(d.differing, ['insight/model-policy.js']);
    assert.equal(d.compared.length, 4, '仍应比对全部 4 个文件');
  } finally {
    cleanup(f.root);
  }
});

test('S3 镜像缺少文件 → 检出', () => {
  const f = fixture(BASELINE);
  try {
    writeSync(f.auth, f.mirror);
    rmSync(join(f.mirror, 'insight/config.json'));
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, false);
    assert.deepEqual(d.missingInMirror, ['insight/config.json']);
  } finally {
    cleanup(f.root);
  }
});

test('S4 镜像多出未登记文件 → 检出', () => {
  // 注意：这里不先调 writeSync —— 它会顺手把未登记文件删掉（S5 测的就是这点），
  // 检测动作必须发生在同步之前。
  const f = fixture(BASELINE, { 'insight/rogue.js': '// 只加在镜像侧\n' });
  try {
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, false, '未登记的镜像-only 文件必须失败');
    assert.deepEqual(d.unexpectedMirrorOnly, ['insight/rogue.js']);
    assert.deepEqual(d.onlyInMirror, ['insight/rogue.js']);
  } finally {
    cleanup(f.root);
  }
});

test('S5 --write 会删除未登记的镜像-only 文件', () => {
  const f = fixture(BASELINE, { 'insight/rogue.js': '// 只加在镜像侧\n' });
  try {
    const w = writeSync(f.auth, f.mirror);
    assert.equal(w.removed, 1, '应删除 1 个未登记文件');
    const after = listFiles(f.mirror);
    assert.equal(after.includes('insight/rogue.js'), false);
    assert.equal(diffSync(f.auth, f.mirror).ok, true);
  } finally {
    cleanup(f.root);
  }
});

test('S6 已登记的镜像-only 例外（README.md）被允许且不会被删', () => {
  // 先确认登记表里确实登记了我们要用的那一项，避免「夹具太假」造成的假绿
  assert.equal(MIRROR_ONLY_ALLOWED.has('README.md'), true, 'README.md 应在白名单中');
  const f = fixture(BASELINE, { 'README.md': '本目录是部署镜像\n' });
  try {
    writeSync(f.auth, f.mirror);
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, true, '登记过的例外不应导致失败');
    assert.deepEqual(d.onlyInMirror, ['README.md']);
    assert.deepEqual(d.unexpectedMirrorOnly, []);

    const w = writeSync(f.auth, f.mirror);
    assert.equal(w.removed, 0, '例外文件不得被删除');
    assert.equal(listFiles(f.mirror).includes('README.md'), true);
  } finally {
    cleanup(f.root);
  }
});

test('S7 二进制差异同样检出（不只文本）', () => {
  const f = fixture(BASELINE);
  try {
    writeSync(f.auth, f.mirror);
    const buf = Buffer.from([0x00, 0xff, 0x10]);
    writeFileSync(join(f.auth, 'insight/package.json'), buf);
    const d = diffSync(f.auth, f.mirror);
    assert.equal(d.ok, false);
    assert.deepEqual(d.differing, ['insight/package.json']);
  } finally {
    cleanup(f.root);
  }
});

test('S8 真实仓库：权威副本与镜像当前一致（防止上述全绿是因为夹具太假）', async () => {
  const { execFileSync } = await import('node:child_process');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const out = execFileSync(process.execPath, [join(root, 'scripts/sync-cloudfunctions.mjs')], {
    cwd: root, encoding: 'utf8',
  });
  assert.match(out, /全部一致/, out);
  const n = Number(/\((\d+) 个文件全部一致/.exec(out)?.[1] ?? /(\d+) 个文件全部一致/.exec(out)?.[1]);
  assert.ok(n >= 4, `真实仓库应至少比对 4 个文件，实际 ${n}`);
});
