// tests/unit/place.test.mjs — 全量行政区划 place.js 的覆盖率与坐标健全性测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCE_NAMES, cityNames, districtNames, locateProvinceCity } from '../../miniprogram/lib/place.js';
import fs from 'node:fs';

// 覆盖率：全国 31 个省级行政区（民政部名单）+ 港澳台
const EXP_PROVINCES = [
  '北京市','天津市','上海市','重庆市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省',
  '江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省',
  '广西壮族自治区','海南省','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省',
  '宁夏回族自治区','新疆维吾尔自治区','台湾省','香港特别行政区','澳门特别行政区',
];

test('省级全集完整且无多余', () => {
  assert.deepEqual([...PROVINCE_NAMES].sort(), [...EXP_PROVINCES].sort());
});

test('所有地级坐标均落在国界合理范围且为有限数，省内地级不重名', () => {
  for (const [prov, cities] of dataEntries()) {
    const seen = new Set();
    assert.ok(cities.length > 0, prov + ' 不应为空');
    for (const c of cities) {
      assert.ok(!seen.has(c[0]), `${prov}/${c[0]} 重复地级`);
      seen.add(c[0]);
      const lng = c[1], lat = c[2];
      assert.ok(Number.isFinite(lng) && Number.isFinite(lat), `${prov}/${c[0]} 坐标必须为有限数`);
      const minLat = c[0] === '三沙市' ? 15 : 17;
      assert.ok(lng >= 72 && lng <= 136 && lat >= minLat && lat <= 54, `${prov}/${c[0]}(${lng},${lat}) 越界`);
    }
  }
});

test('直辖市：省即一个地级，区县齐备；普通省地级数与民政部一致', () => {
  for (const m of ['北京市','天津市','上海市','重庆市']) {
    const cs = cityNames(m);
    assert.equal(cs.length, 1, m);
    assert.equal(cs[0], m);
    assert.ok(districtNames(m, m).length >= 16, m + ' 区县过少');
  }
  assert.equal(cityNames('湖南省').length, 14);
  assert.equal(cityNames('浙江省').length, 11);
  assert.equal(cityNames('河北省').length, 11);
  assert.equal(cityNames('广东省').length, 21);
  assert.equal(cityNames('四川省').length, 21);
});

test('关键地级可定位（覆盖此前缺失的城市），坐标用于真太阳时经度', () => {
  const samples = [
    ['浙江省','湖州市'], ['浙江省','丽水市'], ['江苏省','无锡市'], ['江苏省','南通市'],
    ['河南省','焦作市'], ['四川省','泸州市'], ['广西壮族自治区','崇左市'],
    ['云南省','文山壮族苗族自治州'], ['贵州省','黔东南苗族侗族自治州'],
    ['甘肃省','庆阳市'], ['黑龙江省','鸡西市'], ['内蒙古自治区','锡林郭勒盟'],
    ['新疆维吾尔自治区','乌鲁木齐市'], ['海南省','三沙市'],
  ];
  for (const [p, c] of samples) {
    const r = locateProvinceCity(p, c, null);
    assert.ok(r, `${p}/${c} 应可定位`);
    assert.ok(r.lng > 70 && r.lng < 136 && r.lat > 15 && r.lat < 54, `${p}/${c} 坐标合理`);
  }
});

test('区县有较大覆盖且地名来自权威数据（无伪造占位）', () => {
  const totalDist = Object.entries(data()).reduce((s, [, cities]) => s + cities.reduce((a, c) => a + (c[3] ? c[3].length : 0), 0), 0);
  assert.ok(totalDist >= 2800, '区县合计应≥2800，实际 ' + totalDist);
  assert.ok(totalDist <= 4000, '区县合计不应过多，实际 ' + totalDist);
  // 抽样区县与民政部一致
  const cs = districtNames('湖南省', '长沙市');
  assert.ok(cs.includes('芙蓉区') && cs.includes('岳麓区'));
  const hn = districtNames('新疆维吾尔自治区', '乌鲁木齐市');
  assert.ok(hn.length >= 7, '乌鲁木齐区县过少');
});

function data() {
  const src = fs.readFileSync(new URL('../../miniprogram/lib/place.js', import.meta.url), 'utf8');
  const start = src.indexOf('const DATA =');
  const end = src.indexOf('/** 省级列表');
  const dataStr = src.slice(start + 'const DATA ='.length, end);
  const objStr = dataStr.slice(0, dataStr.lastIndexOf('};') + 1); // 以 '}' 结束
  const fn = new Function('return (' + objStr + ');');
  return fn();
}
function dataEntries() {
  return Object.entries(data()).filter(([p]) => EXP_PROVINCES.includes(p));
}