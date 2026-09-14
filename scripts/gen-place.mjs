/**
 * scripts/gen-place.mjs — 生成 miniprogram/lib/place.js（全量行政区划 + 坐标，仅 UI 层）。
 *
 * 数据源：
 *   - 区划名称 / 层级：modood/Administrative-divisions-of-China（民政部码）
 *   - 坐标：阿里 DataV areas_v3（地级行政中心 centroid，WGS-84）
 * 覆盖：31 个省级（含直辖市）全部地级 + 区县；港澳台沿用既有最小条目（DataV 不覆盖）。
 *
 * 运行（一次性，需网络）：
 *   node .tmp/admin/fetch.mjs && node scripts/gen-place.mjs && npm run build:check
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tmp = path.join(root, '.tmp', 'admin');

/* ---------------- 数据源读取 ---------------- */
const pcaFile = path.join(tmp, 'pca-code.json');
if (!fs.existsSync(pcaFile)) throw new Error('缺 pca-code.json，请先下载 modood pca-code.json 到 ' + pcaFile);
const pca = JSON.parse(fs.readFileSync(pcaFile, 'utf8'));

function loadProvFeatures(code) {
  const f = path.join(tmp, 'prov', code + '0000.json');
  if (!fs.existsSync(f)) return [];
  const g = JSON.parse(fs.readFileSync(f, 'utf8'));
  return g.features || [];
}

/* ---------------- 组装 DATA ---------------- */
const PROV = {
  '11':'北京市','12':'天津市','13':'河北省','14':'山西省','15':'内蒙古自治区',
  '21':'辽宁省','22':'吉林省','23':'黑龙江省','31':'上海市','32':'江苏省',
  '33':'浙江省','34':'安徽省','35':'福建省','36':'江西省','37':'山东省',
  '41':'河南省','42':'湖北省','43':'湖南省','44':'广东省','45':'广西壮族自治区',
  '46':'海南省','50':'重庆市','51':'四川省','52':'贵州省','53':'云南省',
  '54':'西藏自治区','61':'陕西省','62':'甘肃省','63':'青海省','64':'宁夏回族自治区',
  '65':'新疆维吾尔自治区',
};
const MUNI = new Set(['11','12','31','50']); // 直辖市

// DataV 个别缺失 centroid 的行政中心补正（实测驻在地；如新增告警由此补入）
const COORD_FIX = {
  '无锡市': [120.3011, 31.5743],
  '泸州市': [105.4434, 28.8719],
};

function r4(v) { return Math.round(v * 10000) / 10000; }

const DATA = {};
let warnings = [];

for (const [codeP, provName] of Object.entries(PROV)) {
  const provNode = pca.find((p) => p.code === codeP);
  if (!provNode) continue;
  const feats = loadProvFeatures(codeP);
  const featByAdcode = new Map();
  for (const f of feats) featByAdcode.set(String(f.properties.adcode), f);

  // 直辖市：省即市；区县=所辖区，坐标=所辖区 centroid 均值
  if (MUNI.has(codeP)) {
    const districtNames = feats.map((f) => f.properties && f.properties.name).filter(Boolean);
    const cents = feats.map((f) => f.properties && f.properties.centroid).filter((c) => Array.isArray(c));
    const lng = cents.length ? cents.reduce((s, c) => s + c[0], 0) / cents.length : null;
    const lat = cents.length ? cents.reduce((s, c) => s + c[1], 0) / cents.length : null;
    if (lng == null) warnings.push(provName + ' 缺坐标');
    DATA[provName] = lng == null ? [] : [[provName, r4(lng), r4(lat), districtNames]];
    continue;
  }

  // 普通省：地级行政区；把“省直辖县级行政区划”直接上展为省级行（保留民政部码下的真实县/县级市）
  const rows = [];
  for (const city of provNode.children) {
    const isPseudo = /省直辖|自治区直辖|直辖县级|县级行政区划/.test(city.name);
    if (isPseudo) {
      // 直辖县级：其 children 是真实地级县级市/县，各自有 DataV 坐标
      for (const county of city.children || []) {
        const ad = String(county.code);
        const feat = featByAdcode.get(ad);
        const c = feat ? feat.properties.centroid : null;
        const ccx = c ? r4(c[0]) : (COORD_FIX[county.name] ? COORD_FIX[county.name][0] : null);
        const ccy = c ? r4(c[1]) : (COORD_FIX[county.name] ? COORD_FIX[county.name][1] : null);
        if (ccx == null || ccy == null) { warnings.push('缺坐标: ' + provName + '/' + county.name + ' (' + ad + ')'); continue; }
        rows.push([county.name, ccx, ccy, []]);
      }
      continue;
    }
    const ad = String(city.code) + '00';
    const feat = featByAdcode.get(ad);
    const c = feat && Array.isArray(feat.properties.centroid) ? feat.properties.centroid : null;
    const dists = (city.children || []).map((x) => x.name);
    const cx = c ? r4(c[0]) : (COORD_FIX[city.name] ? COORD_FIX[city.name][0] : null);
    const cy = c ? r4(c[1]) : (COORD_FIX[city.name] ? COORD_FIX[city.name][1] : null);
    if (cx == null || cy == null) { warnings.push('缺坐标: ' + provName + '/' + city.name + ' (' + ad + ')'); continue; }
    rows.push([city.name, cx, cy, dists]);
  }
  DATA[provName] = rows;
}

/* ---------------- 港澳台写入（DataV 不覆盖，写入可靠最小集合） ---------------- */
if (!DATA['台湾省']) DATA['台湾省'] = [['台北市', 121.5609, 25.0335], ['高雄市', 120.3119, 22.6163], ['台中市', 120.6794, 24.1433], ['新北市', 121.4611, 25.0364], ['桃园市', 121.3000, 24.9937], ['台南市', 120.2130, 22.9997]];
if (!DATA['香港特别行政区']) DATA['香港特别行政区'] = [['全港', 114.1694, 22.3193, ['香港岛', '九龙', '新界']]];
if (!DATA['澳门特别行政区']) DATA['澳门特别行政区'] = [['全澳', 113.5491, 22.1987, ['澳门半岛', '氹仔', '路环']]];

// 行政中心特殊值（区域质心偏离行政中心时用驻在地）：三沙市=永兴岛
for (const rows of Object.values(DATA)) {
  for (const r of rows) {
    if (r[0] === '三沙市') { r[1] = 112.3325; r[2] = 16.5260; }
  }
}

/* ---------------- 校验 ---------------- */
let totalCity = 0, totalDist = 0;
for (const [prov, rows] of Object.entries(DATA)) {
  const seen = new Set();
  for (const r of rows) {
    if (typeof r[1] !== 'number' || typeof r[2] !== 'number' || !Number.isFinite(r[1]) || !Number.isFinite(r[2])) {
      throw new Error('坐标非法: ' + prov + '/' + r[0] + ' => ' + r[1] + ',' + r[2]);
    }
    const minLat = r[0] === '三沙市' ? 15 : 17;
    if (r[1] < 72 || r[1] > 136 || r[2] < minLat || r[2] > 54) throw new Error('坐标越界: ' + prov + '/' + r[0]);
    if (seen.has(r[0])) throw new Error('省内重复地级: ' + prov + '/' + r[0]);
    seen.add(r[0]);
    totalCity++;
    totalDist += (Array.isArray(r[3]) ? r[3].length : 0);
  }
}
console.log(warnings.length ? '⚠ 缺坐标 ' + warnings.length + ' 处\n  - ' + warnings.slice(0, 20).join('\n  - ') : '');
console.log('地级合计: ' + totalCity + ' / 区县合计: ' + totalDist);

/* ---------------- 写出 place.js ---------------- */
const provBlock = Object.entries(DATA)
  .map(([prov, rows]) => {
    const rs = rows.map(([name, lng, lat, dists]) => {
      const head = '  [\'' + name + '\', ' + lng + ', ' + lat;
      if (!Array.isArray(dists) || !dists.length) return head + ']';
      return head + ', [' + dists.map((d) => '\'' + d + '\'').join(', ') + ']]';
    });
    return '  \'' + prov + '\': [\n' + rs.join(',\n') + ',\n  ],';
  })
  .join('\n');

const api = `
/** 省级列表（保持加入顺序）。 */
export const PROVINCE_NAMES = Object.keys(DATA);

/** 查询某省某地级（区县可选）坐标；区县不在表内时回退为该地级名。 */
export function locateProvinceCity(prov, city, district) {
  const p = DATA[prov];
  if (!p) return null;
  const row = p.find((c) => c[0] === city);
  if (!row) return null;
  const [, lng, lat, districts] = row;
  const d = district && Array.isArray(districts) && districts.indexOf(district) >= 0 ? district : city;
  return { prov, city, district: d, lng, lat };
}

/** 省下列出该省所有地级名。 */
export function cityNames(prov) {
  const p = DATA[prov];
  return p ? p.map((c) => c[0]) : [];
}

/** 省 / 地级下可选区县名（无则只用地级本身）。 */
export function districtNames(prov, city) {
  const p = DATA[prov];
  if (!p) return [];
  const row = p.find((c) => c[0] === city);
  return row && Array.isArray(row[3]) ? row[3] : [];
}
`;

const head = `/**
 * miniprogram/lib/place.js — 中国行政区划 → 经纬度 静态查询表（纯前端，仅 UI 层）。
 *
 * 覆盖：全国 31 省级行政区 + 港澳台；全部地级行政区及区县。
 * 坐标：阿里 DataV 地级行政中心（WGS-84 近似）；仅用于出生地的真太阳时经度修正（±4'/度），不参与核心历法计算。
 * 区县：民政部码；坐标为地级级（区县仅作展示名，不做精密定位）。
 *
 * 本文件由 scripts/gen-place.mjs 生成，请勿手改。
 */

`;
const out = head + 'const DATA = {\n' + provBlock + '\n};\n' + api;
const placeFile = path.join(root, 'miniprogram', 'lib', 'place.js');
fs.writeFileSync(placeFile, out, 'utf8');
console.log('✅ 已生成 ' + placeFile);