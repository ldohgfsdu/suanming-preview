// place.js —— 省市区 → 经纬度 查询测试（新增 UI 数据源，不触碰核心历法）。
import assert from 'node:assert';
import {
  PROVINCE_NAMES,
  cityNames,
  districtNames,
  locateProvinceCity,
} from '../../miniprogram/lib/place.js';

// 省份完整性
assert.ok(PROVINCE_NAMES.includes('北京市'), '含直辖市');
assert.ok(PROVINCE_NAMES.includes('广东省'), '含既有省');
assert.ok(PROVINCE_NAMES.length >= 34, '至少 34 个省级行政区');

// 城市完整性
const jx = cityNames('广东省');
assert.ok(jx.includes('广州市'), '广东省含广州');
assert.equal(cityNames('北京市')[0], '北京市', '直辖市城市为其本身');

// 区县完整性
const hz = districtNames('浙江省', '杭州市');
assert.ok(Array.isArray(hz) && hz.length > 0, '杭州有区县');
assert.ok(hz.includes('西湖区'), '含 西湖区');

// 坐标解析（WGS-84 近似）
const gz = locateProvinceCity('广东省', '广州市', '越秀区');
assert.ok(gz, '广州越秀可解析');
assert.ok(Math.abs(gz.lng - 113.26) < 0.5, `广州经度 ≈113.26，got ${gz.lng}`);
assert.ok(Math.abs(gz.lat - 23.13) < 0.5, `广州纬度 ≈23.13，got ${gz.lat}`);

const bj = locateProvinceCity('北京市', '北京市', '北京市');
assert.ok(bj && Math.abs(bj.lng - 116.4) < 1.0, '北京经度≈116.4');

// 不存在的省内地无 → 返回城市级坐标（降级不回退到空）
const dg = locateProvinceCity('广东省', '东莞市', '莞城区');
assert.ok(dg && dg.city === '东莞市', '区县缺失回退城市级');

console.log('place.test.mjs: PASS');
process.exit(0);