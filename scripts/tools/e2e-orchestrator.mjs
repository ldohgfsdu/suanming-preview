// scripts/tools/e2e-orchestrator.mjs — 微信开发者工具 + E2E 编排器（Windows 专用，辅助工具，不入门禁）。
// 用途：可靠地拉起 IDE → 等待桥接端口 → `cli.bat auto` → 按序运行目标 e2e → 收尾清理。
// 默认目标：tests/e2e/culture-e2e.mjs；可传参（如 wechat-e2e.mjs）。
// 进度日志写仓库根 .tmp-orch.log（被 .gitignore 的 *.log 覆盖）。
//
// 全部实证结论（2026-10-14 建立，2026-10-15 修订）：
// 1. IDE 存活是概率性的（14s~2min+），必须重试 + 稳定性门（就绪后再观察 20s）；
// 2. IDE 用 --ide-http-port 9420 启动 → .ide 文件写 9420 → CLI auto 的端口检查
//    （i.port 必须等于 .ide 里的端口，否则 "ide-different-port" 直接退出）才能过；
// 3. 【修订】自动化 ws 端口由 `cli auto --auto-port P` 绑定，P 必须是与 IDE
//    HTTP 端口（9420）不同的空闲端口——同端口时 ws 升级被 HTTP 服务 404 拒，
//    automator 永远连不上（旧结论「automator 可直连 HTTP 端口」作废）；
// 4. --disable-gpu --no-sandbox 有助于稳定（run2 实证 IDE 活过整个 e2e）。
// 5. 【新增】App.* 应用层 RPC 需等 appservice 发出 App.initialized（页面真实
//    渲染后才发）；页面编译错误会让自动化全体超时——失败时先看模拟器是否白屏。
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG = path.join(ROOT, '.tmp-orch.log');
const MY_PORT = 9421;        // 桥接监听（IDE 电话回家用）
const IDE_HTTP_PORT = 9420;  // IDE HTTP/CLI 端口（.ide 文件与 cli 端口检查依赖它）
let AUTO_WS_PORT = null;     // 自动化 ws 端口（每次运行动态选空闲端口，见 pickFreePort）
const IDE_EXE = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\微信开发者工具.exe';
const IDE_CWD = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具';
const CLI_BAT = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const PROJECT = path.resolve(ROOT, 'miniprogram');
const MAX_ATTEMPTS = 5;
// 目标 e2e 文件：默认 culture-e2e；可传参跑多个，如：
//   node scripts/tools/e2e-orchestrator.mjs tests/e2e/culture-e2e.mjs tests/e2e/wechat-e2e.mjs
const TARGETS = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => path.resolve(ROOT, p))
  : [path.join(ROOT, 'tests/e2e/culture-e2e.mjs')];

function log(...a) {
  const line = `${new Date().toISOString()} ${a.join(' ')}`;
  fs.appendFileSync(LOG, line + '\n');
  console.log(line);
}
try { fs.unlinkSync(LOG); } catch { /* 首次运行无旧日志 */ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 选一个空闲端口给自动化 ws（cli auto --auto-port）：不能复用 9420（IDE HTTP 端口）。
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

// 等自动化 ws 端口真正监听：cli auto 退出 ≠ 端口就绪（项目窗口打开后才 bind），
// 不等的话 e2e 首连必失败、走 cli 回退重拉（多花 ~10s 且日志噪声）。
async function waitPort(port, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('error', () => resolve(false));
    });
    if (ok) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(1000);
  }
}

let idePort = null;
const server = http.createServer((req, res) => {
  log('REQ', req.method, req.url);
  const m = req.url && req.url.match(/^\/updatePort\?port=(\d+)/);
  if (m) { idePort = parseInt(m[1], 10); log('IDE 电话回家：HTTP 端口 =', idePort); }
  res.statusCode = 200;
  res.end('ok');
});

function killIde(ide) {
  try { execSync('taskkill /F /T /PID ' + ide.pid, { stdio: 'ignore' }); } catch { /* 进程可能已退出 */ }
}

async function attempt(n) {
  idePort = null;
  log(`=== 第 ${n} 次尝试 ===`);
  const ide = spawn(IDE_EXE, [
    '--remote-port', String(MY_PORT),
    '--enable-service-port',
    '--ide-http-port', String(IDE_HTTP_PORT),
    '--disable-gpu',
    '--no-sandbox',
  ], { cwd: IDE_CWD, stdio: 'ignore' });
  let dead = false;
  ide.on('error', (e) => log('IDE spawn error:', e.message));
  ide.on('exit', (c) => { dead = true; log('!!! IDE 退出 code =', c); });

  // 等电话回家（cli 服务就绪），最多 60s
  for (let i = 0; i < 60 && !idePort && !dead; i++) await sleep(1000);
  if (dead || !idePort) { log('IDE 未就绪'); killIde(ide); return null; }
  log('IDE 就绪，HTTP 端口', idePort, '（预期', IDE_HTTP_PORT + '）');

  // 稳定性门：再观察 20s，中途死掉就重试
  for (let i = 0; i < 20 && !dead; i++) await sleep(1000);
  if (dead) { log('IDE 在稳定性观察期死亡'); killIde(ide); return null; }
  log('IDE 稳定存活，进入 CLI 阶段');
  return ide;
}

async function main() {
  await new Promise((r) => server.listen(MY_PORT, '127.0.0.1', r));
  log('桥接监听', MY_PORT);
  AUTO_WS_PORT = await pickFreePort();
  log('自动化 ws 端口选定 =', AUTO_WS_PORT);

  let ide = null;
  for (let n = 1; n <= MAX_ATTEMPTS && !ide; n++) ide = await attempt(n);
  if (!ide) { log('多次尝试 IDE 均无法稳定，放弃'); process.exit(2); }

  // CLI auto：此时 .ide = 9420 = IDE HTTP 端口，端口检查可通过；
  // --auto-port 单独给空闲端口绑定自动化 ws（不能与 9420 相同，教训见文件头）。
  // 注意：Node 18.20.2+ 起 spawn .bat 必须 shell:true（BatBadBut 修复），
  // 且命令行要整体传、路径自加引号（踩过 EINVAL）。
  log('--- cli.bat auto 开始 ---');
  const cliCmd = `"${CLI_BAT}" auto --project "${PROJECT}" --auto-port ${AUTO_WS_PORT}`;
  const cli = spawn(cliCmd, { stdio: 'inherit', shell: true });
  const cliCode = await new Promise((r) => cli.on('exit', r));
  log('--- cli.bat auto 退出 code =', cliCode, '---');
  const wsReady = await waitPort(AUTO_WS_PORT);
  log('--- 自动化 ws 端口', AUTO_WS_PORT, wsReady ? '已就绪' : '等待超时（e2e 将自走回退）', '---');

  // 退出码聚合：1（FAIL，代码缺陷）优先级最高并立即停止后续目标；
  // 2（BLOCKED，外部阻断）继续跑后续目标，最终若出现 FAIL 以 FAIL 为准。
  const e2eEnv = { ...process.env, WX_WS_PORT: String(AUTO_WS_PORT) };
  let worst = 0;
  for (const target of TARGETS) {
    log('--- e2e 开始:', target, '---');
    const code = await new Promise((resolve) => {
      const e2e = spawn(process.execPath, [target], { cwd: ROOT, stdio: 'inherit', env: e2eEnv });
      e2e.on('exit', (c) => resolve(c || 0));
    });
    log('--- e2e 退出 code =', code, '---');
    if (code === 1) { worst = 1; log('存在 FAIL，停止后续目标'); break; }
    if (code === 2) worst = worst || 2;
  }
  killIde(ide);
  try { execSync('taskkill /F /IM notepad.exe', { stdio: 'ignore' }); } catch { /* notepad 可能未开 */ }
  process.exit(worst);
}

main();
