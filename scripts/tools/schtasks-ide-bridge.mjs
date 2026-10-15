// scripts/tools/schtasks-ide-bridge.mjs — 创建/触发交互式计划任务「WxIDEBridge」（Windows 专用，辅助工具）。
// 用途：当直接 spawn GUI 不可靠时，用计划任务在当前用户的**交互式桌面会话**里拉起 IDE 桥接。
// 前置：%TEMP%\wxide-bridge.bat 必须事先自备（内容通常是启动 IDE + 桥接端口）。
// 用法：node scripts/tools/schtasks-ide-bridge.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BAT = path.join(process.env.TEMP, 'wxide-bridge.bat');
const USER = process.env.USERNAME;

if (!fs.existsSync(BAT)) {
  console.error('缺少 ' + BAT + '（需事先自备，见文件头注释）');
  process.exit(1);
}

function run(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  console.log('$', cmd.slice(0, 80) + '...');
  console.log('  status:', r.status, '| stdout:', (r.stdout || '').trim().slice(0, 200), '| stderr:', (r.stderr || '').trim().slice(0, 200));
  return r;
}

run(`schtasks /Create /TN WxIDEBridge /TR "${BAT}" /SC ONCE /ST 00:00 /IT /RU ${USER} /F`);
run('schtasks /Run /TN WxIDEBridge');
