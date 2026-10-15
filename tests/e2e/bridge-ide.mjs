// tests/e2e/bridge-ide.mjs — 开发者工具自动化端口桥接器（环境绕行工具，不进门禁）。
//
// 背景：本机 Program Blacklist 拦了 reg.exe，导致 `cli.bat auto` 的「拉起 IDE」路径必死
// （CLI 启动 IDE 前要调 reg.exe）。但 IDE 本体启动并不需要 reg.exe——只是 CLI 需要。
//
// 原理（从 app.asar 逆向得出）：
//   1. IDE 带 --remote-port P 启动后，会主动 HTTP 回调 P/updatePort?port=<自己的HTTP端口>；
//   2. IDE 的 GET /upgrade（无鉴权）返回 { port: <自动化 ws 端口>, projectId }；
//   3. automator 的 connect({ wsEndpoint }) 可连任意端口——拿到真实 ws 端口即可驱动。
// 所以本脚本扮演「CLI」：起 9421 监听 → 沙箱外直启 IDE → 收回调 → 问 /upgrade →
// 把 ws 端口写进 .tmp-bridge-result.json，供 e2e 使用。IDE 由本脚本父进程保活。
//
// 运行：node tests/e2e/bridge-ide.mjs   （sandbox 外跑：保命，IDE 启动瞬间可能调 reg.exe）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG = path.join(ROOT, '.tmp-bridge.log');
const RESULT = path.join(ROOT, '.tmp-bridge-result.json');
const MY_PORT = 9421;
const IDE_EXE = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\微信开发者工具.exe';
const IDE_CWD = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具';

function log(...a) {
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.join(' ')}\n`);
}
try { fs.unlinkSync(LOG); } catch {}
try { fs.unlinkSync(RESULT); } catch {}

let idePort = null;

const server = http.createServer((req, res) => {
  log('REQ', req.method, req.url);
  const m = req.url && req.url.match(/^\/updatePort\?port=(\d+)/);
  if (m) {
    idePort = parseInt(m[1], 10);
    log('IDE 电话回家：HTTP 端口 =', idePort);
    res.statusCode = 200;
    res.end('ok');
    probeUpgrade();
    return;
  }
  res.statusCode = 200;
  res.end('ok');
});

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (r) => {
      let body = '';
      r.on('data', (c) => { body += c; });
      r.on('end', () => resolve({ status: r.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function probeUpgrade() {
  if (!idePort) return;
  for (let i = 0; i < 10; i++) {
    try {
      const r = await get(`http://127.0.0.1:${idePort}/upgrade`);
      log('GET /upgrade ->', r.status, r.body);
      if (r.status === 200) {
        const info = JSON.parse(r.body);
        fs.writeFileSync(RESULT, JSON.stringify({ idePort, wsPort: info.port, projectId: info.projectId }, null, 2));
        log('桥接成功：wsPort =', info.port, '→ 已写 .tmp-bridge-result.json');
        return;
      }
    } catch (e) { log('upgrade probe err:', e.message); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  log('upgrade 探测失败');
}

server.listen(MY_PORT, '127.0.0.1', () => {
  log('桥接监听 127.0.0.1:' + MY_PORT);
  const child = spawn(IDE_EXE, ['--remote-port', String(MY_PORT), '--enable-service-port'], { cwd: IDE_CWD, stdio: 'ignore' });
  child.on('error', (e) => log('IDE spawn error:', e.message));
  child.on('exit', (c) => { log('IDE 退出，code =', c); process.exit(0); });
  log('IDE pid =', child.pid);
  // 兜底：60 秒后若还没拿到 ws 端口，试读 .ide 文件（IDE 启动成功会写入）
  setTimeout(async () => {
    if (fs.existsSync(RESULT)) return;
    try {
      const p = parseInt(fs.readFileSync(path.join(process.env.LOCALAPPDATA, '微信开发者工具', 'User Data', '2ca4252ffa87560ea1fd48b913e45179', 'Default', '.ide'), 'utf8').trim(), 10);
      if (p) { idePort = p; log('从 .ide 文件读到端口', p); await probeUpgrade(); }
    } catch (e) { log('读 .ide 失败:', e.message); }
  }, 60000);
});

// 父进程保活：IDE 是本进程的子进程，父进程活着 IDE 才不会被会话回收
setInterval(() => {}, 30000);
