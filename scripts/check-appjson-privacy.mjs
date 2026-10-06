// scripts/check-appjson-privacy.mjs — app.json 隐私字段自检
//
// 背景：requiredPrivateInfos 是「定位类 API」专用字段，微信仅接受以下 8 个取值：
//   chooseAddress, chooseLocation, choosePoi, getFuzzyLocation,
//   getLocation, onLocationChange, startLocationUpdate, startLocationUpdateBackground
// 填入其他 API（如 saveImageToPhotosAlbum）会导致预览期编译报错：
//   requiredPrivateInfos[0] 字段需为 chooseAddress,chooseLocation,...
//
// 正确做法：相册等非定位权限只在 permission 里写 desc。
// 本脚本在提交前/门禁前自检，避免同类错误复发。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JSON = join(__dirname, '..', 'miniprogram', 'app.json');

const LOCATION_APIS = [
  'chooseAddress', 'chooseLocation', 'choosePoi', 'getFuzzyLocation',
  'getLocation', 'onLocationChange',
  'startLocationUpdate', 'startLocationUpdateBackground',
];

const errors = [];
const warnings = [];

let appJson;
try {
  appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
} catch (e) {
  console.error(`[appjson] 无法解析 app.json: ${e.message}`);
  process.exit(1);
}

// 1) requiredPrivateInfos 只能包含定位类 API
const rpi = appJson.requiredPrivateInfos;
if (Array.isArray(rpi) && rpi.length) {
  rpi.forEach((api, i) => {
    if (!LOCATION_APIS.includes(api)) {
      errors.push(
        `requiredPrivateInfos[${i}] = "${api}" 不是定位类 API，会导致预览编译报错。` +
        `仅允许：${LOCATION_APIS.join(', ')}。非定位权限请写在 permission 里。`,
      );
    }
  });
}

// 2) 声明了定位 API 就必须声明；用了定位 API 也必须声明（互相校验）
const raw = readFileSync(APP_JSON, 'utf8');
const usedLocation = LOCATION_APIS.filter((api) => raw.includes(api));
if (usedLocation.length && (!Array.isArray(rpi) || !rpi.length)) {
  warnings.push(
    `检测到可能使用定位 API（${usedLocation.join(', ')}），` +
    `但未声明 requiredPrivateInfos —— 若真在调用会报错。`,
  );
}

// 3) permission 里声明的 scope 必须有 desc（否则真机弹窗无说明，易被驳回）
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
  `permission: ${Object.keys(permission).length} 项）`,
);
