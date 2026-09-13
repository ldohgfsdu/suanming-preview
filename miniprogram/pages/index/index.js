// pages/index/index.js — 东方时间文化档案 首页。
// 目标：降低输入门槛（出生地点选择，无需知道经度；公历/农历切换；时辰显示现代时间），
//       增强可信度（今日天时、真太阳时说明、生成过程过渡）。
// 纯天文历法事实，不含任何预测、判定或运气换算。
// 相对导入保持带 .js 扩展名，与 lib/ 内既有约定一致。

import { computeArchive, ELEMENT_NAME as ELEM_NAME } from '../../lib/archive.js';
import { solarToLunar } from '../../lib/lunar.js';
import { PROVINCE_NAMES, cityNames, districtNames, locateProvinceCity } from '../../lib/place.js';
import { lunarToSolar, lunarMonthsOfYear, lunarDaysOfMonth } from '../../lib/lunarReverse.js';
import { sunTimes } from '../../lib/sun.js';

function pad(n) { return String(n).padStart(2, '0'); }
// 月相亮度比例（0=朔 … 1=望 … 0）及盈/亏方向，纯周期函数，用于小小的月亮示例条。
function litMoon(age) {
  if (age == null || !Number.isFinite(age)) return null;
  const f = ((age % 29.530588861) + 29.530588861) % 29.530588861 / 29.530588861;
  const lit = Math.sin(Math.PI * f) ** 2;
  return { lit, litPct: Math.round(lit * 100), filling: f < 0.5 ? '盈' : '亏' };
}
const HISTORY_KEY = 'eastTime.history.v1';
const MAX_HISTORY = 50;
function fmtUTC(utc) {
  if (!utc) return '—';
  const s = utc.slice(0, 16).replace('T', ' ');
  return s + ' (UTC)';
}
function formatTime(utc) { return fmtUTC(utc); }

// 距某节气剩余时间，返回「X天X小时」／「不足1小时」
function fmtDaysLeft(days) {
  if (days == null || !isFinite(days)) return '';
  if (days <= 0.001) return '已到';
  const totalH = days * 24;
  const hh = Math.floor(totalH);
  const mm = Math.round((totalH - hh) * 60);
  if (hh <= 0) return `${mm} 分钟`;
  if (hh < 24) return `${hh} 小时 ${mm} 分`;
  return `${Math.floor(hh / 24)} 天 ${pad(hh % 24)} 时`;
}

// 十二时辰：现代时间范围（传统名称主、现代时间副）。内部 hour 为中点（子=0）。
const SHICHEN = [
  { name: '子时', range: '23:00–01:00', hour: 0 },
  { name: '丑时', range: '01:00–03:00', hour: 2 },
  { name: '寅时', range: '03:00–05:00', hour: 4 },
  { name: '卯时', range: '05:00–07:00', hour: 6 },
  { name: '辰时', range: '07:00–09:00', hour: 8 },
  { name: '巳时', range: '09:00–11:00', hour: 10 },
  { name: '午时', range: '11:00–13:00', hour: 12 },
  { name: '未时', range: '13:00–15:00', hour: 14 },
  { name: '申时', range: '15:00–17:00', hour: 16 },
  { name: '酉时', range: '17:00–19:00', hour: 18 },
  { name: '戌时', range: '19:00–21:00', hour: 20 },
  { name: '亥时', range: '21:00–23:00', hour: 22 },
];
const HOUR_OPTIONS = ['时辰未知'].concat(SHICHEN.map((s) => `${s.name}（${s.range}）`));

// 由真实时刻（本地时间小时）映射到十二时辰槽（子=23–01 … 亥=21–23）。
// 时辰槽 k 覆盖 [2k-1, 2k+1)，据此把 getHours() 归入对应槽。
function shichenIndexOfHour(h) {
  if (!Number.isFinite(h)) return 0; // 未知
  return Math.floor((((h + 1) + 24) % 24) / 2) % 12;
}

// 农历文字
const MONTH_CN = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

Page({
  data: {
    // 公历/农历模式
    calMode: 'solar',
    solarDate: '',
    solarDateLabel: '',

    // 农历选择器
    lunarYearList: [],
    lunarMonthLabels: [],
    lunarDayList: [],
    lunarValue: [0, 0, 0],       // [年, 月, 日] 索引
    lunarLabel: '',
    lunarSel: null,               // {year, month, leap, day}
    lunarPreview: '',            // 农历→公历 即时换算预览

    // 时辰
    hourOptions: HOUR_OPTIONS,
    hourIdx: 0,
    hour: -1,                     // 内部小时数（-1=未知）
    hourLabel: '时辰未知',

    // 性别（仅供档案存档，不参与历法计算）
    genders: ['男', '女'],
    gender: '男',

    // 出生地点（省级菜单）
    provNames: PROVINCE_NAMES,
    provIdx: 0,
    // 城市（非直辖市时用）与城区（非直辖时为区县列）
    placeMode: 'municipal',        // 'municipal'=直辖市（两级：省→区） | 'province'（三级：省→市→县）
    cityNames: [],
    cityIdx: 0,
    districtNames: [],
    districtIdx: 0,
    placeLabel: '选择出生地点',
    placeHint: '用于校正地方太阳时（真太阳时）',
    placeLon: null,
    placeLat: null,
    placeValid: false,

    showAdvanced: false,
    lonText: '',
    lonActive: false,

    // 今日天时
    today: null,

    // 结果
    hasResult: false,
    result: null,

    // 生成过渡
    generating: false,
    genStepIndex: -1,
    genSteps: ['正在读取出生时间…', '正在校正地方太阳时…', '正在计算节气节点…', '正在生成东方时间档案…'],
    genText: '',
  },

  // 分享：每次生成一份档案（首页）。
  onShareAppMessage() {
    return {
      title: '东方时间文化档案 — 基于真实天文历法',
      path: '/pages/index/index',
    };
  },

  onLoad() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    this.initSolar(`${y}-${pad(m)}-${pad(d)}`);
    this.initLunarToToday(y, m, d);
    this.initPlace();
    this.buildToday(y, m, d);
    // 时钟
    this.refreshClock();
    this._ticker = setInterval(() => this.refreshClock(), 15000);
  },

  onUnload() {
    if (this._ticker) clearInterval(this._ticker);
    if (this._genTimer) clearTimeout(this._genTimer);
  },

  // ============ 公历 / 农历 ============
  initSolar(dateStr) {
    this.setData({ solarDate: dateStr, solarDateLabel: dateStr });
  },
  // 公历/农历标签切换（不改动已选日期，仅切换输入模式）
  switchSolarMode() {
    this.setData({ calMode: 'solar' });
  },
  // 一键回到今天：公历/农历日期归位今日；时辰自动设为当前真实时刻所在的时辰；
  // 并刷新顶部「今日天时」卡、清空已生成的结果，让表单与今日天时彼此呼应。
  onResetToday() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const t = `${y}-${pad(m)}-${pad(d)}`;
    // 时辰：按当前真实时刻归入十二时辰槽（回填给“出生时刻”输入，便于立即生成）
    const h = now.getHours();
    const idx = shichenIndexOfHour(h);
    const s = SHICHEN[idx];
    this.setData({
      hourIdx: idx + 1,        // 选择器第 0 项为“时辰未知”
      hour: s.hour,           // 槽中点，供内部时辰干支计算
      hourLabel: `${s.name}（${s.range}）`,
      hasResult: false,
      result: null,
    });
    this.initSolar(t);
    this.initLunarToToday(y, m, d);
    this.buildToday(y, m, d);   // 今日天时卡同步刷新（含当前时刻）
    this.refreshClock();
  },
  switchLunarMode() {
    this.setData({ calMode: 'lunar' });
  },
  onSolarDateChange(e) {
    this.setData({ solarDate: e.detail.value, solarDateLabel: e.detail.value, calMode: 'solar', hasResult: false, result: null });
  },

  yearList() {
    const arr = [];
    for (let y = 1901; y <= 2100; y++) arr.push(y);
    return arr;
  },
  initLunarToToday(y, m, d) {
    const l = solarToLunar(y, m, d);
    if (l) this.applyLunar(l.year, l.month, l.leap, l.day);
  },
  // 依据农历年月日，构建三级选择器状态
  applyLunar(year, month, leap, day) {
    const years = this.yearList();
    const months = lunarMonthsOfYear(year);
    const dim = lunarDaysOfMonth(year, month, !!leap);
    const days = [];
    for (let i = 1; i <= dim; i++) days.push(DAY_CN[i] || String(i));
    const yIdx = Math.max(0, years.indexOf(year));
    const mIdx = Math.max(0, months.findIndex((q) => q.month === month && q.leap === !!leap));
    const dIdx = Math.max(0, Math.min(day - 1, days.length - 1));
    // 农历 → 公历 正向反查预览（教学/对照用）
    let lunarPreview = '';
    try {
      const r = lunarToSolar(year, month, !!leap, day);
      if (r) {
        const p = (n) => String(n).padStart(2, '0');
        lunarPreview = `${r.year} 年 ${p(r.month)} 月 ${p(r.day)} 日`;
      }
    } catch (e) { /* 预览失败不阻塞选择 */ }
    this.setData({
      lunarYearList: years,
      lunarMonthLabels: months.map((x) => x.label),
      lunarDayList: days,
      lunarValue: [yIdx, mIdx, dIdx],
      lunarSel: { year, month, leap: !!leap, day },
      lunarPreview,
      lunarLabel: `${year}年${(leap ? '闰' : '')}${MONTH_CN[month]}月${DAY_CN[day] || day}`,
    });
  },
  onLunarColumnChange(e) {
    const col = e.detail.column, v = e.detail.value;
    let value = this.data.lunarValue;
    value = value.slice();
    value[col] = v;
    const years = this.data.lunarYearList;
    const ySel = years[value[0]] || years[0];
    this.setData({ lunarValue: value });
    if (col === 0) {
      // 年变 → 重建月
      const months = lunarMonthsOfYear(ySel);
      const m = months[0];
      const days = this.daysFor(ySel, m.month, m.leap);
      this.setData({
        lunarMonthLabels: months.map((x) => x.label),
        lunarDayList: days,
        lunarValue: [value[0], 0, 0],
      });
    } else if (col === 1) {
      const months = this.currentMonthsOf(ySel);
      const m = months[Math.min(value[1], months.length - 1)];
      const days = this.daysFor(ySel, m.month, m.leap);
      this.setData({ lunarDayList: days, lunarValue: [value[0], value[1], 0] });
    }
  },
  currentMonthsOf(y) {
    // 临时制作 month 候选（列已经是设置过的）
    return this.data.lunarMonthLabels.length ? this.labelsToMonths(y, this.data.lunarMonthLabels) : lunarMonthsOfYear(y);
  },
  // months 候选：由 label 重建 month/leap 结构（用于 column1 变动后取 day 列表）
  labelsToMonths(y, labels) {
    const full = lunarMonthsOfYear(y);
    const out = [];
    for (const lb of labels) {
      const i = full.findIndex((x) => x.label === lb);
      if (i >= 0) out.push(full[i]);
    }
    return out;
  },
  daysFor(year, month, leap) {
    const dim = lunarDaysOfMonth(year, month, !!leap);
    const arr = [];
    for (let i = 1; i <= dim; i++) arr.push(DAY_CN[i] || String(i));
    return arr;
  },
  onLunarChange(e) {
    const v = e.detail.value;
    const years = this.data.lunarYearList;
    const y = years[v[0]];
    const months = lunarMonthsOfYear(y);
    const m = months[Math.min(v[1], months.length - 1)];
    const day = v[2] + 1;
    this.applyLunar(y, m.month, m.leap, day);
    this.setData({ calMode: 'lunar', hasResult: false, result: null });
  },

  // ============ 时辰 ============
  onHourChange(e) {
    const idx = Number(e.detail.value);
    if (idx === 0) {
      this.setData({ hourIdx: 0, hour: -1, hourLabel: '时辰未知', hasResult: false, result: null });
      return;
    }
    const s = SHICHEN[idx - 1];
    this.setData({
      hourIdx: idx,
      hour: s.hour,
      hourLabel: `${s.name}（${s.range}）`,
      hasResult: false, result: null,
    });
  },

  // 性别选择（不影响历法计算，仅存档展示）
  onGenderTap(e) {
    this.setData({ gender: e.currentTarget.dataset.g, hasResult: false, result: null });
  },

  // ============ 出生地点 ============
  // 直辖市/特别行政区：城市列只有“市本级”，应隐藏“选市”步骤，直接 省→区县 两级。
  isMunicipal(prov) {
    const cn = cityNames(prov);
    return cn.length === 1 && cn[0] === prov;
  },
  initPlace() {
    // 默认北京市
    const provIdx = Math.max(0, PROVINCE_NAMES.indexOf('北京市'));
    this.setData({ provIdx });
    this.setCityList();
  },
  setCityList() {
    const prov = PROVINCE_NAMES[this.data.provIdx];
    const cn = cityNames(prov);
    const municipal = this.isMunicipal(prov);
    this.setData({ cityNames: cn, cityIdx: 0, placeMode: municipal ? 'municipal' : 'province' });
    if (municipal) {
      // 直辖市：市本级即市本身，直接把区县列拿满
      const dn = districtNames(prov, prov);
      this.setData({ districtNames: dn.length ? dn : [prov], districtIdx: 0 });
      this.applyPlace();
    } else {
      this.setData({ districtNames: this.childDistricts(prov), districtIdx: 0 });
      this.applyPlace();
    }
  },
  onProvChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ provIdx: idx });
    this.setCityList();
  },
  onCityChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ cityIdx: idx });
    this.setDistrictList();
  },
  childDistricts(prov) {
    const city = this.data.cityNames[this.data.cityIdx] || this.data.cityNames[0];
    const dn = districtNames(prov, city);
    return dn.length ? dn : [city];
  },
  setDistrictList() {
    const prov = PROVINCE_NAMES[this.data.provIdx];
    this.setData({ districtNames: this.childDistricts(prov), districtIdx: 0 });
    this.applyPlace();
  },
  onDistrictChange(e) {
    this.setData({ districtIdx: Number(e.detail.value) });
    this.applyPlace();
  },
  applyPlace() {
    const prov = PROVINCE_NAMES[this.data.provIdx];
    const municipal = this.data.placeMode === 'municipal';
    // 直辖市：城市 = 省份本身；普通省：城市 = 所选市
    const city = municipal ? prov : (this.data.cityNames[this.data.cityIdx] || this.data.cityNames[0]);
    const district = this.data.districtNames[this.data.districtIdx];
    const place = locateProvinceCity(prov, city, district);
    if (!place) return;
    const dName = place.district && place.district !== place.city ? '·' + place.district : '';
    this.setData({
      placeValid: true,
      placeLon: place.lng,
      placeLat: place.lat,
      placeCityText: municipal ? '' : place.city,
      placeLabel: `${place.prov} ${municipal ? '' : place.city}${dName}`.replace(/\s+$/, ''),
      placeHint: `东经 ${place.lng.toFixed(1)}° · 北纬 ${place.lat.toFixed(1)}°`,
      lonActive: false,
      hasResult: false, result: null,
    });
  },

  // 高级：手动经度
  onToggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
    if (!this.data.showAdvanced && this.data.lonActive) {
      // 收起高级不改动已手填的经度
    }
  },
  onLongitudeInput(e) { this.setData({ lonText: e.detail.value }); },
  onApplyLon() {
    const v = Number((this.data.lonText || '').trim());
    if (!Number.isFinite(v) || v < 73 || v > 135) {
      this.setData({ lonActive: false, placeLon: null, placeLat: null });
      if (this.data.lonText) wx.showToast({ title: '请输入东经 73–135°', icon: 'none' });
      return;
    }
    this.setData({
      lonActive: true,
      placeLon: v,
      placeLat: null,
      placeLabel: `手动经度 · 东经 ${v}°`,
      placeHint: '用于地方太阳时修正',
      hasResult: false, result: null,
    });
  },

  // ============ 今日天时 ============
  buildToday(y, m, d) {
    try {
      const f = computeArchive(y, m, d);
      const ganzhi = (f.four.year ? f.four.year.ganz : '—') + '年 '
        + (f.four.month ? f.four.month.ganz : '—') + '月 '
        + (f.four.day ? f.four.day.ganz : '—') + '日';
      const term = f.term.next;
      const sun = sunTimes(y, m, d, 116.4074, 39.9042); // 今日天时默认本地（北京）
      this.setData({
        today: {
          ganzhi,
          termName: term ? term.name : '—',
          termDate: term ? term.utc.slice(0, 16).replace('T', ' ') : '',
          termApprox: term ? formatTime(term.utc) : '',
          sunrise: sun.valid ? sun.sunrise : '—',
          sunset: sun.valid ? sun.sunset : '—',
          moon: f.moon ? f.moon.name : '—',
          moonAge: f.moon ? Number(f.moon.ageDays).toFixed(1) : '',
          daysToNext: f.term.daysToNext != null ? Number(f.term.daysToNext).toFixed(1) : '',
          termTime: fmtDaysLeft(f.term.daysToNext),
          dateText: `${y}年${m}月${d}日`,
        },
      });
      this.refreshClock();
    } catch (e) {
      this.setData({ today: null });
    }
  },
  refreshClock() {
    if (!this.data.today) return;
    const now = new Date();
    this.setData({
      'today.nowText': `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
  },

  // ============ 生成 ============
  finalizeLon() {
    if (this.data.lonActive) return this.data.placeLon;
    if (this.data.placeValid) return this.data.placeLon;
    return null;
  },
  resolveDateInput() {
    if (this.data.calMode === 'lunar') {
      const s = this.data.lunarSel;
      if (!s) return null;
      const r = lunarToSolar(s.year, s.month, s.leap, s.day);
      if (!r) return null;
      return { y: r.year, m: r.month, d: r.day, lunarText: `${s.year}年${(s.leap ? '闰' : '')}${MONTH_CN[s.month]}月${DAY_CN[s.day] || s.day}` };
    }
    const parts = (this.data.solarDate || '').split('-').map((n) => parseInt(n, 10));
    return (parts[0] && parts[1] && parts[2]) ? { y: parts[0], m: parts[1], d: parts[2], lunarText: '' } : null;
  },
  onGenerate() {
    if (this.data.generating) return;
    const input = this.resolveDateInput();
    if (!input) { wx.showToast({ title: '请检查日期', icon: 'none' }); return; }
    const steps = this.data.genSteps;
    this.setData({ generating: true, genStepIndex: -1 });
    let i = 0;
    const run = () => {
      if (i >= steps.length) { this.commitResult(input); return; }
      this.setData({ genStepIndex: i, genText: steps[i] });
      i++;
      this._genTimer = setTimeout(run, 400);
    };
    run();
  },
  commitResult(input) {
    const lon = this.finalizeLon();
    const { y, m, d } = input;
    try {
      const f = computeArchive(y, m, d, this.data.hour, lon);
      const pillars = ['year', 'month', 'day', 'hour']
        .filter((k) => f.four[k])
        .map((k) => ({ label: f.four[k].label, ganz: f.four[k].ganz, element: ELEM_NAME[f.four[k].element] }));
      const tallyRaw = ['wood', 'fire', 'earth', 'metal', 'water']
        .map((k) => ({ name: ELEM_NAME[k], n: (f.tally[k] || 0) }))
        .filter((x) => x.n > 0);
      const tallyMax = Math.max(1, ...tallyRaw.map((x) => x.n));
      const tally = tallyRaw.map((x) => ({
        ...x,
        pct: Math.round((x.n / tallyMax) * 100),
      }));
      const term = f.term.next ? `${f.term.next.name} ${formatTime(f.term.next.utc)}` : '—';
      // 「生命时间轴」：自出生日到今天已历多少年/天（纯日历，无歧义）。
      let sinceLabel = '';
      try {
        const birth = new Date(y, m - 1, d);
        const tdy = new Date();
        tdy.setHours(0, 0, 0, 0);
        const days = Math.round((tdy.getTime() - birth.getTime()) / 86400000);
        if (!Number.isNaN(days) && days >= 0) {
          const yrs = Math.floor(days / 365.2425);
          const rem = days - Math.round(yrs * 365.2425);
          if (rem <= 0) {
            sinceLabel = `已 ${yrs} 年`;
          } else {
            sinceLabel = `已 ${yrs + 1} 岁 · 累计 ${days.toLocaleString()} 天`;
          }
        }
      } catch (e) { /* 不影响主体 */ }
      const result = {
        solar: `${y}-${pad(m)}-${pad(d)}`,
        gender: this.data.gender,
        lunarText: this.data.calMode === 'lunar' ? (input.lunarText || '') : (f.lunar ? f.lunar.text : ''),
        lunarApprox: f.lunar ? !!f.lunar.approx : false,
        place: lon != null ? `${this.data.placeLabel} · 东经 ${lon}°` : '请选择出生地点（跳过真太阳时）',
        pillars,
        nayin: f.nayin,
        hourLabel2: this.data.hour >= 0 ? this.data.hourLabel : '时辰未知',
        tally,
        prevTerm: f.term.prev ? `${f.term.prev.name} ${formatTime(f.term.prev.utc)}` : '—',
        nextTerm: term,
        daysToNext: f.term.daysToNext != null ? Number(f.term.daysToNext).toFixed(2) + ' 天' : '—',
        moon: f.moon ? `${f.moon.name}（朔望月龄 ${Number(f.moon.ageDays).toFixed(1)} 天）` : '—',
        moonPhase: f.moon ? f.moon.name : '',
        moonLit: f.moon ? litMoon(f.moon.ageDays) : null,
        trueSolar: f.trueSolar.degraded
          ? '未提供地点'
          : `${f.trueSolar.offsetMinutes >= 0 ? '+' : ''}${Number(f.trueSolar.offsetMinutes).toFixed(1)} 分钟`,
        since: sinceLabel,
      };
      // 生成结果改为跳转到独立「历法档案」页，并在返回时可继续修改参数。
      this.setData({ generating: false });
      this.saveHistory(f, input, lon);
      wx.navigateTo({
        url: '/pages/result/result',
        success: (res) => {
          if (res && res.eventChannel) res.eventChannel.emit('archive', { result });
        },
      });
    } catch (err) {
      this.setData({ generating: false, genStepIndex: -1 });
      wx.showToast({ title: '仅支持 1900-2100 年', icon: 'none' });
    }
  },

  // ============ 说明 ============
  onWhyPlace() {
    wx.showModal({
      title: '为什么需要出生地点？',
      content: '由于不同经度地区太阳运行时间存在差异，系统根据出生地点修正地方太阳时，用于提高时间计算的准确性。',
      showCancel: false,
      confirmText: '知道了',
    });
  },
  onTodayInfo() {
    wx.showModal({
      title: '今日天时',
      content: '根据真实天文历法计算当日干支、节气节点、日出日落时间，展示历法计算能力。',
      showCancel: false,
    });
  },

  // 本地历史存档（P0-5 基础版：仅本地，无云端依赖；含隐私数据说明）
  saveHistory(f, input, lon) {
    const { y, m, d } = input;
    const rec = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      solar: `${y}-${pad(m)}-${pad(d)}`,
      yearGanzhi: f.four.year ? f.four.year.ganz : '',
      dayGanzhi: f.four.day ? f.four.day.ganz : '',
      gender: this.data.gender,
      placeLabel: (lon != null && this.data.placeLabel) ? this.data.placeLabel : '未选择地点',
    };
    try {
      const list = wx.getStorageSync(HISTORY_KEY) || [];
      list.unshift(rec);
      const trimmed = list.slice(0, MAX_HISTORY);
      wx.setStorageSync(HISTORY_KEY, trimmed);
    } catch (e) { /* 存储失败静默，不影响本次生成 */ }
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  goToday() {
    wx.navigateTo({ url: '/pages/today/today' });
  },

  goTerms() {
    wx.navigateTo({ url: '/pages/terms/terms' });
  },

  // 由今日页“以今日作为出生档案日期”回填
  applyToday(solar) {
    if (!solar) return;
    this.setData({ calMode: 'solar', solarDate: solar, solarDateLabel: solar, hasResult: false, result: null });
  },

  // 由历史页“重新生成”回填日期与性别
  applyHistory(r) {
    if (!r) return;
    const set = {};
    if (r.solar && /^\d{4}-\d{2}-\d{2}$/.test(r.solar)) {
      set.calMode = 'solar';
      set.solarDate = r.solar;
      set.solarDateLabel = r.solar;
    }
    if (r.gender === '男' || r.gender === '女') set.gender = r.gender;
    set.hasResult = false;
    set.result = null;
    this.setData(set);
  },

  // 打开“关于 / 免责声明“页面
  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },
});