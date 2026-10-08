// scripts/check-appjson-privacy.mjs — app.json 隐私字段自检
//
// requiredPrivateInfos 是定位类 API 专用字段。除此之外，本脚本会递归扫描
// miniprogram/ 生产源码，避免出现“源码调用了定位 API，但 app.json 未声明”的假绿。

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APP_JSON = join(ROOT, 'miniprogram', 'app.json');
const MINI_ROOT = join(ROOT, 'miniprogram');

const LOCATION_APIS = [
  'chooseAddress', 'chooseLocation', 'choosePoi', 'getFuzzyLocation',
  'getLocation', 'onLocationChange',
  'startLocationUpdate', 'startLocationUpdateBackground',
];

const SCAN_EXTS = new Set(['.js', '.ts', '.wxs']);
const errors = [];
const warnings = [];

let appJson;
try {
  appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
} catch (e) {
  console.error(`[appjson] 无法解析 app.json: ${e.message}`);
  process.exit(1);
}

function walk(dir, out = []) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'miniprogram_npm') walk(p, out);
    } else if (SCAN_EXTS.has(extname(entry.name))) {
      out.push(p);
    }
  });
  return out;
}

// 1) requiredPrivateInfos 只能包含微信允许的定位类 API
const rpi = appJson.requiredPrivateInfos;
if (Array.isArray(rpi) && rpi.length) {
  rpi.forEach((api, i) => {
    if (!LOCATION_APIS.includes(api)) {
      errors.push(
        `requiredPrivateInfos[${i}] = "${api}" 不是定位类 API。` +
        `仅允许：${LOCATION_APIS.join(', ')}。非定位权限请写在 permission 里。`,
      );
    }
  });
}

// 2) 真正扫描生产源码里的 wx.<locationApi>(...) 调用，而不是只搜索 app.json。
const used = new Map();
walk(MINI_ROOT).forEach((file) => {
  const src = readFileSync(file, 'utf8');
  LOCATION_APIS.forEach((api) => {
    const re = new RegExp(`\\bwx\\s*\\.\\s*${api}\\s*\\(`, 'g');
    if (re.test(src)) {
      if (!used.has(api)) used.set(api, []);
      used.get(api).push(file.replace(ROOT, '').replace(/\\/g, '/'));
    }
  });
});

for (const [api, files] of used.entries()) {
  if (!Array.isArray(rpi) || !rpi.includes(api)) {
    errors.push(`源码调用 wx.${api}，但 requiredPrivateInfos 未声明。命中：${files.join(', ')}`);
  }
}

if (Array.isArray(rpi)) {
  rpi.forEach((api) => {
    if (LOCATION_APIS.includes(api) && !used.has(api)) {
      warnings.push(`requiredPrivateInfos 声明了 ${api}，但生产源码未发现调用；请确认是否为遗留声明。`);
    }
  });
}

// 3) permission 里的 scope 必须有 desc
const permission = appJson.permission || {};
Object.keys(permission).forEach((scope) => {
  if (!permission[scope] || !permission[scope].desc) {
    errors.push(`permission.${scope} 缺少 desc，真机授权弹窗将无说明文案。`);
  }
});

if (errors.length) {
  console.error('[appjson] ✗ 隐私字段自检未通过：');
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

if (warnings.length) {
  console.warn('[appjson] ⚠ 提醒：');
  warnings.forEach((w) => console.warn('  - ' + w));
}

console.log(
  `[appjson] ✓ 自检通过（requiredPrivateInfos: ${Array.isArray(rpi) ? rpi.length : 0} 项，` +
  `permission: ${Object.keys(permission).length} 项，源码定位 API: ${used.size} 类）`,
);
