/**
 * scripts/sync-cloudfunctions.mjs — 云函数部署镜像同步
 *
 * 背景：微信开发者工具只把「项目根之下」的 cloudfunctions 识别为可上传的云函数，
 * 而项目根是 miniprogram/，所以**权威副本**在 miniprogram/cloudfunctions/，
 * 仓库根的 cloudfunctions/ 只是架构契约留档（见 cloudfunctions/README.md）。
 *
 * 该目录树曾长期靠人工记忆保持同步。2026-10 的审查发现：tests/unit/insight.test.mjs 的
 * I12 只逐字节比对了 index.js 一个文件，model-policy.js / package.json / config.json
 * 三个文件没有任何强制 —— 当时一致纯属运气，而 model-policy.js 恰是终验 R2/R3
 * 反复修改过的那一个。
 *
 * 用法（CLI）：
 *   node scripts/sync-cloudfunctions.mjs            # 检查（不一致则退出 1，打印差异）
 *   node scripts/sync-cloudfunctions.mjs --write    # 从权威副本同步过去（miniprogram → 根）
 *   node scripts/sync-cloudfunctions.mjs --list     # 只列出两侧文件清单
 *
 * 也可 import：`diffSync()` / `writeSync()` 是纯函数，供测试在临时目录里构造
 * 临时漂移来验证检查不是假绿（见 tests/unit/cloudfunctions-sync.test.mjs）。
 */
import { readdirSync, statSync, readFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const AUTHORITATIVE = join(ROOT, 'miniprogram', 'cloudfunctions');
const MIRROR = join(ROOT, 'cloudfunctions');

/**
 * 允许「只在镜像侧存在」的文件（相对镜像根目录的路径）。
 *
 * 这些是**有意为之**的差异，逐个登记理由，而不是悄悄放过：
 *   - README.md：内容是「本目录是部署镜像，权威副本在 miniprogram/cloudfunctions/」的
 *     反向提示。它只该出现在镜像根目录；放进权威副本会变成自我矛盾
 *     （权威副本里写「别编辑这里」）。
 *
 * 任何**未登记**的镜像-only 文件都会让检查失败 —— 那通常意味着有人只在镜像侧加了东西
 * 而忘了同步回权威副本，正是本脚本要防的变形。
 */
export const MIRROR_ONLY_ALLOWED = new Set(['README.md']);

/**
 * 递归列出目录下所有普通文件的相对路径。
 * 统一输出正斜杠（Windows 下 relative() 给反斜杠），保证 CLI 报告与测试断言
 * 在 Windows 与 Linux CI 上逐字一致。
 */
export function listFiles(dir) {
  const out = [];
  const walk = (cur) => {
    const st = statSync(cur);
    if (!st.isDirectory()) {
      out.push(relative(dir, cur).split('\\').join('/'));
      return;
    }
    for (const name of readdirSync(cur).sort()) walk(join(cur, name));
  };
  if (statSync(dir).isDirectory()) walk(dir);
  return out;
}

/**
 * 比对权威副本与镜像。纯函数，不写盘。
 * @returns {{ ok: boolean, compared: string[], onlyInMirror: string[],
 *             unexpectedMirrorOnly: string[], missingInMirror: string[],
 *             differing: string[] }}
 */
export function diffSync(authoritativeDir, mirrorDir) {
  const auth = listFiles(authoritativeDir);
  const mirror = listFiles(mirrorDir);
  const authSet = new Set(auth);
  const mirrorSet = new Set(mirror);

  const onlyInMirror = mirror.filter((f) => !authSet.has(f));
  const missingInMirror = auth.filter((f) => !mirrorSet.has(f));
  const compared = auth.filter((f) => mirrorSet.has(f));
  const differing = compared.filter((rel) => {
    const a = readFileSync(join(authoritativeDir, rel));
    const b = readFileSync(join(mirrorDir, rel));
    return !a.equals(b);
  });

  const ok = differing.length === 0
    && missingInMirror.length === 0
    && onlyInMirror.filter((f) => !MIRROR_ONLY_ALLOWED.has(f)).length === 0;

  return {
    ok,
    compared,
    onlyInMirror,
    unexpectedMirrorOnly: onlyInMirror.filter((f) => !MIRROR_ONLY_ALLOWED.has(f)),
    missingInMirror,
    differing,
  };
}

/** 把权威副本同步到镜像（含删除未登记的镜像-only 文件）。 */
export function writeSync(authoritativeDir, mirrorDir) {
  const auth = listFiles(authoritativeDir);
  let copied = 0;
  for (const rel of auth) {
    const target = join(mirrorDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    const a = readFileSync(join(authoritativeDir, rel));
    const b = statSync(target, { throwIfNoEntry: false });
    if (!b || !b.isFile() || !readFileSync(target).equals(a)) {
      copyFileSync(join(authoritativeDir, rel), target);
      copied += 1;
    }
  }
  let removed = 0;
  for (const rel of listFiles(mirrorDir)) {
    if (auth.includes(rel) || MIRROR_ONLY_ALLOWED.has(rel)) continue;
    rmSync(join(mirrorDir, rel), { force: true });
    removed += 1;
  }
  return { copied, removed };
}

function report(d, quiet) {
  const say = quiet ? () => {} : console.log.bind(console);
  const err = console.error.bind(console);
  say(`[sync] 权威副本 miniprogram/cloudfunctions/ : ${d.compared.length + d.missingInMirror.length} 个文件`);
  say(`[sync] 部署镜像 cloudfunctions/            : ${d.compared.length + d.unexpectedMirrorOnly.length
    + d.onlyInMirror.filter((f) => MIRROR_ONLY_ALLOWED.has(f)).length} 个文件`);
  if (!d.ok) {
    if (d.missingInMirror.length) {
      err(`[sync] ✗ 镜像缺少 ${d.missingInMirror.length} 个文件:`);
      d.missingInMirror.forEach((f) => err(`    - ${f}`));
    }
    if (d.unexpectedMirrorOnly.length) {
      err(`[sync] ✗ 镜像多出 ${d.unexpectedMirrorOnly.length} 个文件（未登记为例外）:`);
      d.unexpectedMirrorOnly.forEach((f) => err(`    - ${f}`));
    }
    if (d.differing.length) {
      err(`[sync] ✗ 内容不一致:`);
      d.differing.forEach((f) => err(`    - ${f}`));
    }
    err('\n[sync] 云函数部署镜像与权威副本不同步。');
    err('[sync] 修复：node scripts/sync-cloudfunctions.mjs --write');
    err('[sync] 注意：只改 miniprogram/cloudfunctions/ 下的文件，那是权威副本。');
    return false;
  }
  say(`[sync] ✓ ${d.compared.length} 个文件全部一致`);
  const skipped = d.onlyInMirror.filter((f) => MIRROR_ONLY_ALLOWED.has(f));
  if (skipped.length) say(`[sync] · 已登记例外（仅在镜像侧）：${skipped.join(', ')}`);
  return true;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--list')) {
    console.log(`权威副本 miniprogram/cloudfunctions/（${listFiles(AUTHORITATIVE).length} 个）`);
    listFiles(AUTHORITATIVE).forEach((f) => console.log(`  ${f}`));
    console.log(`部署镜像 cloudfunctions/（${listFiles(MIRROR).length} 个）`);
    listFiles(MIRROR).forEach((f) => console.log(`  ${f}`));
    process.exit(0);
  }
  if (args.has('--write')) {
    const { copied, removed } = writeSync(AUTHORITATIVE, MIRROR);
    console.log(`[sync] 完成：新增/更新 ${copied} 个，删除 ${removed} 个`);
    process.exit(0);
  }
  process.exit(report(diffSync(AUTHORITATIVE, MIRROR), false) ? 0 : 1);
}

// 仅当作为 CLI 直接运行时才执行 main；被 import 时不产生副作用。
if (process.argv[1] && fileURLToPath(import.meta.url) === require$resolve(process.argv[1])) {
  main();
}

// 避免 import node:url 之外的依赖；用一个最小 helper 做路径比较
function require$resolve(p) {
  try {
    return fileURLToPath(new URL(`file://${p.replace(/\\/g, '/')}`));
  } catch {
    return '';
  }
}
