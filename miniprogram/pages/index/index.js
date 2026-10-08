// pages/index/index.js — 东方时间文化档案 首页。
// 纯天文历法事实：时间、节气、干支、太阳时间、农历、五行字面计数。

import { computeArchive, ELEMENT_NAME as ELEM_NAME } from '../../lib/archive.js';
import { gregorianToJde, dayPillar, hourPillar } from '../../lib/engine.js';
import { solarToLunar } from '../../lib/lunar.js';
import { PROVINCE_NAMES, cityNames, districtNames, locateProvinceCity } from '../../lib/place.js';
import { lunarToSolar, lunarMonthsOfYear, lunarDaysOfMonth } from '../../lib/lunarReverse.js';
import { sunTimes } from '../../lib/sun.js';
import { resolveChinaCivilTime } from '../../lib/civilTime.js';
import { fmtTermDate, fmtDaysLeft, fmtTermLong, fmtDaysLeftTechnical, fmtAgeDays, fmtTrueSolarMinutes, fmtLng } from '../../lib/display.js';

function pad(n) { return String(n).padStart(2, '0'); }
function pad2(n) { return String(n).padStart(2, '0'); }

function litMoon(age) {
  if (age == null || !Number.isFinite(age)) return null;
  const f = ((age % 29.530588861) + 29.530588861) % 29.530588861 / 29.530588861;
  const lit = Math.sin(Math.PI * f) ** 2;
  return { lit, litPct: Math.round(lit * 100), filling: f < 0.5 ? '盈' : '亏' };
}

// 「今日天时」固定采用北京时间语义，避免设备位于海外时出现“本地日期 + 北京日出”的混合口径。
function beijingNowParts() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}

const HISTORY_KEY = 'eastTime.history.v2';
const LEGACY_HISTORY_KEY = 'eastTime.history.v1';
const MAX_HISTORY = 50;

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

function shichenIndexOfHour(h) {
  if (!Number.isFinite(h)) return 0;
  return Math.floor((((h + 1) + 24) % 24) / 2) % 12;
}

const MONTH_CN = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

Page({
  data: {
    calMode: 'solar',
    solarDate: '',
    solarDateLabel: '',

    lunarYearList: [],
    lunarMonthLabels: [],
    lunarDayList: [],
    lunarValue: [0, 0, 0],
    lunarLabel: '',
    lunarSel: null,
    lunarPreview: '',

    timeUnknown: true,
    hour: -1,
    minute: 0,
    preciseTime: '12:00',
    shichenHint: '',
    hourLabel: '时辰未知',

    genders: ['男', '女'],
    gender: '男',

    provNames: PROVINCE_NAMES,
    provIdx: 0,
    placeMode: 'municipal',
    cityNames: [],
    cityIdx: 0,
    districtNames: [],
    districtIdx: 0,
    placeLabel: '选择出生地点',
    placeHint: '区县用于名称选择；计算坐标采用所属地级行政中心近似值',
    placeLon: null,
    placeLat: null,
    placeValid: false,

    showAdvanced: false,
    lonText: '',
    lonActive: false,

    today: null,
    hasResult: false,
    result: null,

    generating: false,
    genStepIndex: -1,
    genSteps: ['正在读取出生时间…', '正在校正地方太阳时…', '正在计算节气节点…', '正在生成东方时间档案…'],
    genText: '',
  },

  onShareAppMessage() {
    return { title: '东方时间文化档案 — 基于真实天文历法', path: '/pages/index/index' };
  },

  onLoad() {
    const now = beijingNowParts();
    const y = now.y, m = now.m, d = now.d;
    this.initSolar(`${y}-${pad(m)}-${pad(d)}`);
    this.initLunarToToday(y, m, d);
    this.initPlace();
    this.buildToday(y, m, d);
    this.refreshClock();
  },

  onShow() {
    if (!this._ticker) this._ticker = setInterval(() => this.refreshClock(), 15000);
  },

  onHide() {
    if (this._ticker) { clearInterval(this._ticker); this._ticker = 0; }
  },

  onUnload() {
    if (this._ticker) clearInterval(this._ticker);
    if (this._genTimer) clearTimeout(this._genTimer);
  },

  initSolar(dateStr) {
    this.setData({ solarDate: dateStr, solarDateLabel: dateStr });
  },

  switchSolarMode() {
    this.setData({ calMode: 'solar' });
  },

  onResetToday() {
    const now = beijingNowParts();
    const y = now.y, m = now.m, d = now.d;
    const t = `${y}-${pad(m)}-${pad(d)}`;
    const hh = now.hour;
    const mm = now.minute;
    const s = SHICHEN[shichenIndexOfHour(hh)];
    this.setData({
      timeUnknown: false,
      hour: hh,
      minute: mm,
      preciseTime: `${pad2(hh)}:${pad2(mm)}`,
      hourLabel: `${pad2(hh)}:${pad2(mm)}`,
      shichenHint: `${s.name}（${s.range}）`,
      hasResult: false,
      result: null,
    }, () => wx.showToast({ title: '已更新为当前北京时间', icon: 'none' }));
    this.initSolar(t);
    this.initLunarToToday(y, m, d);
    this.buildToday(y, m, d);
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

  applyLunar(year, month, leap, day) {
    const years = this.yearList();
    const months = lunarMonthsOfYear(year);
    const dim = lunarDaysOfMonth(year, month, !!leap);
    const days = [];
    for (let i = 1; i <= dim; i++) days.push(DAY_CN[i] || String(i));
    const yIdx = Math.max(0, years.indexOf(year));
    const mIdx = Math.max(0, months.findIndex((q) => q.month === month && q.leap === !!leap));
    const dIdx = Math.max(0, Math.min(day - 1, days.length - 1));
    let lunarPreview = '';
    try {
      const r = lunarToSolar(year, month, !!leap, day);
      if (r) lunarPreview = `${r.year} 年 ${pad(r.month)} 月 ${pad(r.day)} 日`;
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
    const value = this.data.lunarValue.slice();
    value[col] = v;
    const years = this.data.lunarYearList;
    const ySel = years[value[0]] || years[0];
    this.setData({ lunarValue: value });
    if (col === 0) {
      const months = lunarMonthsOfYear(ySel);
      const mm = months[0];
      const days = this.daysFor(ySel, mm.month, mm.leap);
      this.setData({ lunarMonthLabels: months.map((x) => x.label), lunarDayList: days, lunarValue: [value[0], 0, 0] });
    } else if (col === 1) {
      const months = this.currentMonthsOf(ySel);
      const mm = months[Math.min(value[1], months.length - 1)];
      const days = this.daysFor(ySel, mm.month, mm.leap);
      this.setData({ lunarDayList: days, lunarValue: [value[0], value[1], 0] });
    }
  },

  currentMonthsOf(y) {
    return this.data.lunarMonthLabels.length ? this.labelsToMonths(y, this.data.lunarMonthLabels) : lunarMonthsOfYear(y);
  },

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
    const mm = months[Math.min(v[1], months.length - 1)];
    const day = v[2] + 1;
    this.applyLunar(y, mm.month, mm.leap, day);
    this.setData({ calMode: 'lunar', hasResult: false, result: null });
  },

  onTimeKnownChange(e) {
    const known = !!(e.detail && e.detail.value);
    if (!known) {
      this.setData({ timeUnknown: true, hour: -1, minute: 0, hourLabel: '时辰未知', shichenHint: '', hasResult: false, result: null });
      return;
    }
    const seg = String(this.data.preciseTime || '12:00').split(':');
    const h = parseInt(seg[0], 10);
    const m = parseInt(seg[1], 10);
    this.setTime(Number.isFinite(h) ? h : 12, Number.isFinite(m) ? m : 0);
  },

  onTimeChange(e) {
    const seg = String(e.detail.value || '12:00').split(':');
    const h = parseInt(seg[0], 10);
    const m = parseInt(seg[1], 10);
    if (!Number.isFinite(h)) return;
    this.setTime(h, Number.isFinite(m) ? m : 0);
  },

  setTime(h, m) {
    const hh = Math.min(23, Math.max(0, Math.round(h)));
    const mm = Math.min(59, Math.max(0, Math.round(m)));
    const s = SHICHEN[shichenIndexOfHour(hh)];
    this.setData({
      timeUnknown: false,
      hour: hh,
      minute: mm,
      preciseTime: `${pad2(hh)}:${pad2(mm)}`,
      hourLabel: `${pad2(hh)}:${pad2(mm)}`,
      shichenHint: `${s.name}（${s.range}）`,
      hasResult: false,
      result: null,
    });
  },

  onGenderTap(e) {
    this.setData({ gender: e.currentTarget.dataset.g, hasResult: false, result: null });
  },

  isMunicipal(prov) {
    const cn = cityNames(prov);
    return cn.length === 1 && cn[0] === prov;
  },

  initPlace() {
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
      const dn = districtNames(prov, prov);
      this.setData({ districtNames: dn.length ? dn : [prov], districtIdx: 0 });
    } else {
      this.setData({ districtNames: this.childDistricts(prov), districtIdx: 0 });
    }
    this.applyPlace();
  },

  onProvChange(e) {
    this.setData({ provIdx: Number(e.detail.value) });
    this.setCityList();
  },

  onCityChange(e) {
    this.setData({ cityIdx: Number(e.detail.value) });
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

  currentPlaceSelection() {
    const prov = PROVINCE_NAMES[this.data.provIdx];
    const municipal = this.data.placeMode === 'municipal';
    const city = municipal ? prov : (this.data.cityNames[this.data.cityIdx] || this.data.cityNames[0]);
    const district = this.data.districtNames[this.data.districtIdx] || city;
    return { prov, city, district, municipal };
  },

  applyPlace() {
    const sel = this.currentPlaceSelection();
    const place = locateProvinceCity(sel.prov, sel.city, sel.district);
    if (!place) return;
    const dName = place.district && place.district !== place.city ? '·' + place.district : '';
    this.setData({
      placeValid: true,
      placeLon: place.lng,
      placeLat: place.lat,
      placeCityText: sel.municipal ? '' : place.city,
      placeLabel: `${place.prov} ${sel.municipal ? '' : place.city}${dName}`.replace(/\s+$/, ''),
      placeHint: `计算坐标按所属地级行政中心近似：东经 ${place.lng.toFixed(1)}° · 北纬 ${place.lat.toFixed(1)}°`,
      lonActive: false,
      hasResult: false,
      result: null,
    });
  },

  onToggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
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
      placeLabel: '手动经度',
      placeHint: `按手动经度东经 ${v}° 计算真太阳时`,
      hasResult: false,
      result: null,
    });
  },

  buildToday(y, m, d) {
    try {
      const f = computeArchive(y, m, d);
      const ganzhi = (f.four.year ? f.four.year.ganz : '—') + '年 '
        + (f.four.month ? f.four.month.ganz : '—') + '月 '
        + (f.four.day ? f.four.day.ganz : '—') + '日';
      const term = f.term.next;
      const sun = sunTimes(y, m, d, 116.4074, 39.9042);
      this.setData({
        today: {
          ganzhi,
          dateText: `${y}年${m}月${d}日`,
          termName: term ? term.name : '—',
          termLong: term ? fmtTermLong(term.utc) : '',
          termDate: term ? fmtTermDate(term.utc) : '',
          sunrise: sun.valid ? sun.sunrise : '—',
          sunset: sun.valid ? sun.sunset : '—',
          moon: f.moon ? f.moon.name : '—',
          moonAge: f.moon ? fmtAgeDays(f.moon.ageDays) : '',
          daysToNext: f.term.daysToNext != null ? fmtDaysLeftTechnical(f.term.daysToNext) : '—',
          termTime: fmtDaysLeft(f.term.daysToNext),
        },
      });
      this.refreshClock();
    } catch (e) {
      this.setData({ today: null });
    }
  },

  refreshClock() {
    if (!this.data.today) return;
    const now = beijingNowParts();
    this.setData({ 'today.nowText': `${pad(now.hour)}:${pad(now.minute)}` });
  },

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
    if (this.data.generating || this.__wheel) return;
    const input = this.resolveDateInput();
    if (!input) { wx.showToast({ title: '请检查出生日期', icon: 'none' }); return; }
    const lon = this.finalizeLon();

    if (!this.data.timeUnknown && this.data.hour >= 0) {
      const probe = resolveChinaCivilTime(input.y, input.m, input.d, this.data.hour, this.data.minute, null);
      if (!probe.ok && probe.reason === 'dst_gap') {
        wx.showModal({
          title: '历史夏令时缺口',
          content: `${input.y}年该日曾实行夏时制，你填写的 ${this.data.hourLabel} 位于拨快跳过的时间段，历史钟表上不存在。请返回修改出生时间。`,
          showCancel: false,
          confirmText: '返回修改',
        });
        return;
      }
      if (!probe.ok && probe.needsFoldChoice) {
        this.__wheel = true;
        wx.showActionSheet({
          itemList: ['第一次出现（夏令时）', '第二次出现（标准时）'],
          success: (r) => {
            this.__wheel = false;
            this.generateResolvedArchive(input, lon, r.tapIndex === 0 ? 'earlier' : 'later');
          },
          fail: () => { this.__wheel = false; },
        });
        return;
      }
    }

    this.generateResolvedArchive(input, lon, null);
  },

  generateResolvedArchive(input, lon, foldChoice) {
    const minute = this.data.timeUnknown ? 0 : this.data.minute;
    const sourceHour = this.data.hour >= 0 ? this.data.hour + minute / 60 : -1;
    let calcInput = input;
    let calcHour = sourceHour;
    let civil = null;

    if (sourceHour >= 0) {
      civil = resolveChinaCivilTime(input.y, input.m, input.d, this.data.hour, minute, foldChoice);
      if (!civil.ok) {
        wx.showToast({ title: '历史时间无法唯一确定', icon: 'none' });
        return;
      }
      calcInput = { ...input, y: civil.y, m: civil.m, d: civil.d };
      calcHour = civil.hourDecimal;
    }

    let f = null;
    try {
      f = computeArchive(calcInput.y, calcInput.m, calcInput.d, calcHour, lon);
    } catch (e) {
      const msg = String((e && e.message) || '');
      console.error('[archive] computeArchive 失败：', msg);
      wx.showToast({ title: /^range\s/.test(msg) ? '仅支持 1900-2100 年' : '生成失败请重试', icon: 'none' });
      return;
    }

    if (calcHour >= 0 && Number.isFinite(lon) && f.trueSolar
      && f.trueSolar.canonHour != null && !f.trueSolar.degraded) {
      const dayChanged = f.trueSolar.dayChanged;
      const rawIdx = shichenIndexOfHour(calcHour);
      const corIdx = shichenIndexOfHour(f.trueSolar.canonHour);
      const timeChanged = corIdx !== rawIdx;
      if (dayChanged || timeChanged) {
        const oldDp = dayPillar(gregorianToJde(calcInput.y, calcInput.m, calcInput.d));
        const oldHp = hourPillar(oldDp.index % 10, calcHour);
        const newDp = f.four.day;
        const newHp = f.four.hour;
        const pieces = [];
        if (f.dayShift !== 0 && newDp.ganz !== oldDp.ganz) pieces.push(`日柱：${oldDp.ganz} → ${newDp.ganz}`);
        else if (f.dayShift !== 0) pieces.push(`日历日：${calcInput.y}-${calcInput.m}-${calcInput.d} → ${f.trueSolar.canonDateText}`);
        if (newHp && oldHp && newHp.ganz !== oldHp.ganz) pieces.push(`时柱：${oldHp.ganz} → ${newHp.ganz}`);
        if (pieces.length === 0 && corIdx !== rawIdx) pieces.push(`时辰：${SHICHEN[rawIdx].name} → ${SHICHEN[corIdx].name}`);
        const title = dayChanged ? '真太阳时校正跨日' : '时辰变更提示';
        const offTxt = `${f.trueSolar.offsetMinutes > 0 ? '+' : ''}${f.trueSolar.offsetMinutes} 分钟`;
        const dstHead = civil && civil.dstApplied
          ? `出生钟表：${input.y}年${input.m}月${input.d}日 ${this.data.hourLabel}（夏时制）\n标准北京时间：${civil.y}-${pad(civil.m)}-${pad(civil.d)} ${pad(civil.hour)}:${pad(civil.minute)}\n`
          : '';
        const bodyHead = dayChanged
          ? `${dstHead}真太阳时：进入${f.trueSolar.canonDateText} ${SHICHEN[corIdx].range}\n`
          : `${dstHead}经真太阳时修正（${offTxt}）后，天文时辰为 ${SHICHEN[corIdx].name}（${SHICHEN[corIdx].range}）。\n`;
        const content = bodyHead + (pieces.length ? '本档案将按校正后的时刻计算相关干支。\n\n' + pieces.join('\n') : '');
        this.__wheel = true;
        wx.showModal({
          title,
          content,
          confirmText: '确认生成',
          cancelText: '返回修改',
          success: (r) => {
            this.__wheel = false;
            if (!r.confirm) return;
            this.setData({ generating: true });
            try { this.commitResult(input, lon, f, civil); } finally { this.setData({ generating: false }); }
          },
          fail: () => { this.__wheel = false; },
        });
        return;
      }
    }

    this.setData({ generating: true });
    try { this.commitResult(input, lon, f, civil); } finally { this.setData({ generating: false }); }
  },

  commitResult(input, lon, f, civil) {
    lon = lon != null ? lon : this.finalizeLon();
    const { y, m, d } = input;
    try {
      const hourP = f.four.hour;
      const pillars = [
        { key: 'year', label: '年柱', ganz: f.four.year ? f.four.year.ganz : '—', element: f.four.year ? ELEM_NAME[f.four.year.element] : '' },
        { key: 'month', label: '月柱', ganz: f.four.month ? f.four.month.ganz : '—', element: f.four.month ? ELEM_NAME[f.four.month.element] : '' },
        { key: 'day', label: '日柱', ganz: f.four.day ? f.four.day.ganz : '—', element: f.four.day ? ELEM_NAME[f.four.day.element] : '' },
        { key: 'hour', label: '时柱', ganz: hourP ? hourP.ganz : '—', element: hourP ? ELEM_NAME[hourP.element] : '', unknown: !hourP },
      ];
      const tallyOrder = ['wood', 'fire', 'earth', 'metal', 'water'];
      const tallyRaw = tallyOrder.map((k) => ({ key: k, name: ELEM_NAME[k], n: (f.tally[k] || 0) }));
      const tallyMax = Math.max(1, ...tallyRaw.map((x) => x.n));
      const tally = tallyRaw.map((x) => ({ ...x, pct: Math.round((x.n / tallyMax) * 100), empty: x.n === 0 }));
      const termNow = f.term.next ? `${f.term.next.name} ${fmtTermDate(f.term.next.utc)}` : '—';
      const approxCoord = lon != null && !this.data.lonActive
        ? `东经 ${Number(this.data.placeLon).toFixed(1)}° · 北纬 ${Number(this.data.placeLat).toFixed(1)}°（地级行政中心近似）`
        : (lon != null ? fmtLng(lon) : '');
      const standardBjTime = civil && !civil.unknown && (civil.dstApplied || civil.state === 'FOLD')
        ? `${civil.y}-${pad(civil.m)}-${pad(civil.d)} ${pad(civil.hour)}:${pad(civil.minute)}` : null;
      const result = {
        solar: `${y}-${pad(m)}-${pad(d)}`,
        solarCN: `${y}年${m}月${d}日`,
        gender: this.data.gender,
        lunarText: this.data.calMode === 'lunar' ? (input.lunarText || '') : (f.lunar ? f.lunar.text : ''),
        lunarApprox: f.lunar ? !!f.lunar.approx : false,
        hasPlace: lon != null,
        placeName: (lon != null) ? (this.data.lonActive ? '手动经度' : this.data.placeLabel) : '未提供出生地点（跳过真太阳时修正）',
        placeCoord: approxCoord,
        pillars,
        hourUnknown: !hourP,
        tally,
        prevTerm: f.term.prev ? `${f.term.prev.name} ${fmtTermDate(f.term.prev.utc)}` : '—',
        nextTerm: termNow,
        daysToNext: f.term.daysToNext != null ? fmtDaysLeft(f.term.daysToNext) : '—',
        moonPhase: f.moon ? f.moon.name : '',
        moonAge: f.moon ? fmtAgeDays(f.moon.ageDays) : '',
        moonLit: f.moon ? litMoon(f.moon.ageDays) : null,
        trueSolar: f.trueSolar.degraded ? '未提供地点' : fmtTrueSolarMinutes(f.trueSolar.offsetMinutes),
        bjTime: this.data.hour >= 0 ? `${pad(this.data.hour)}:${pad(this.data.minute)}` : null,
        clockTimeLabel: civil && civil.dstApplied ? '出生钟表时间（夏时制）' : '出生时间（北京时间）',
        standardBjTime,
        dstNote: civil && civil.state === 'FOLD'
          ? `该时刻处于夏时制结束的重复区间，本次采用${civil.foldChoice === 'earlier' ? '第一次（夏令时）' : '第二次（标准时）'}。`
          : (civil && civil.dstApplied ? '该出生时刻处于 1986–1991 中国夏时制实施期，计算前已换算为标准北京时间。' : ''),
        tsDateTime: (f.trueSolar && f.trueSolar.canonHour != null && !f.trueSolar.degraded)
          ? (f.trueSolar.dayChanged
            ? `${f.trueSolar.canonDateText} ${pad(Math.floor(f.trueSolar.canonHour))}:${pad(Math.round((f.trueSolar.canonHour % 1) * 60))}`
            : `${pad(Math.floor(f.trueSolar.canonHour))}:${pad(Math.round((f.trueSolar.canonHour % 1) * 60))}`)
          : null,
        crossDay: !!(f.trueSolar && f.trueSolar.dayChanged),
        canonDateText: (f.trueSolar && f.trueSolar.canonDateText) || null,
        hourLabel2: this.data.hour >= 0
          ? (f.trueSolar && f.trueSolar.canonHour != null && !f.trueSolar.degraded
            ? `${SHICHEN[shichenIndexOfHour(f.trueSolar.canonHour)].name}（真太阳时）`
            : this.data.hourLabel)
          : '时辰未知',
      };
      this.saveHistory(f, input, lon, civil);
      wx.navigateTo({
        url: '/pages/result/result',
        success: (res) => { if (res && res.eventChannel) res.eventChannel.emit('archive', { result }); },
      });
    } catch (err) {
      console.error('[archive] commitResult 失败：', (err && err.message) || err);
      wx.showToast({ title: '生成失败请重试', icon: 'none' });
    }
  },

  onWhyPlace() {
    wx.showModal({
      title: '为什么需要出生地点？',
      content: '不同经度地区的太阳时不同。系统按出生地经度结合均时差与经度时差计算真太阳时。当前区/县用于名称选择，内置计算坐标采用所属地级行政中心近似值；若出生地接近时辰边界，可在高级设置中手动填写更准确的经度。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onTodayInfo() {
    wx.showModal({
      title: '今日天时（北京口径）',
      content: '日期、当前时间与日出日落统一采用北京时间 / 北京坐标口径，避免设备位于其他时区时产生混合语义。',
      showCancel: false,
    });
  },

  buildArchiveInputSnapshot(input, lon, civil) {
    const place = this.currentPlaceSelection();
    return {
      version: 2,
      calMode: this.data.calMode,
      solar: `${input.y}-${pad(input.m)}-${pad(input.d)}`,
      lunarSel: this.data.calMode === 'lunar' && this.data.lunarSel ? { ...this.data.lunarSel } : null,
      hour: this.data.hour,
      minute: this.data.timeUnknown ? 0 : this.data.minute,
      timeUnknown: !!this.data.timeUnknown,
      gender: this.data.gender,
      foldChoice: civil && civil.state === 'FOLD' ? civil.foldChoice : null,
      place: {
        manual: !!this.data.lonActive,
        lonText: this.data.lonText || '',
        longitude: lon,
        latitude: this.data.lonActive ? null : this.data.placeLat,
        prov: place.prov,
        city: place.city,
        district: place.district,
      },
    };
  },

  saveHistory(f, input, lon, civil) {
    const { y, m, d } = input;
    const archiveInput = this.buildArchiveInputSnapshot(input, lon, civil);
    const rec = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      solar: `${y}-${pad(m)}-${pad(d)}`,
      yearGanzhi: f.four.year ? f.four.year.ganz : '',
      monthGanzhi: f.four.month ? f.four.month.ganz : '',
      dayGanzhi: f.four.day ? f.four.day.ganz : '',
      hourGanzhi: f.four.hour ? f.four.hour.ganz : '',
      gender: this.data.gender,
      placeLabel: (lon != null && this.data.placeLabel) ? this.data.placeLabel : '未选择地点',
      placeCoord: (lon != null && !this.data.lonActive)
        ? `东经 ${Number(this.data.placeLon).toFixed(1)}° · 北纬 ${Number(this.data.placeLat).toFixed(1)}°（地级行政中心近似）`
        : (lon != null ? fmtLng(lon) : ''),
      hour: this.data.hour,
      hourLabel: this.data.hourLabel,
      timeUnknown: !!this.data.timeUnknown,
      minute: this.data.timeUnknown ? 0 : this.data.minute,
      archiveInput,
      bjTime: this.data.hour >= 0 ? `${pad(this.data.hour)}:${pad(this.data.minute)}` : null,
      standardBjTime: civil && !civil.unknown && (civil.dstApplied || civil.state === 'FOLD')
        ? `${civil.y}-${pad(civil.m)}-${pad(civil.d)} ${pad(civil.hour)}:${pad(civil.minute)}` : null,
      tsDateTime: (f.trueSolar && !f.trueSolar.degraded && f.trueSolar.canonHour != null)
        ? (f.trueSolar.dayChanged
          ? `${f.trueSolar.canonDateText} ${pad(Math.floor(f.trueSolar.canonHour))}:${pad(Math.round((f.trueSolar.canonHour % 1) * 60))}`
          : `${pad(Math.floor(f.trueSolar.canonHour))}:${pad(Math.round((f.trueSolar.canonHour % 1) * 60))}`)
        : null,
      trueSolar: f.trueSolar.degraded ? '' : fmtTrueSolarMinutes(f.trueSolar.offsetMinutes),
      crossDay: !!(f.trueSolar && f.trueSolar.dayChanged),
    };
    try {
      let list = wx.getStorageSync(HISTORY_KEY) || [];
      if (!list.length) list = wx.getStorageSync(LEGACY_HISTORY_KEY) || [];
      const sig = (x) => `${x.solar}|${x.hour}|${Number.isFinite(x.minute) ? x.minute : 0}|${x.placeCoord || ''}|${x.gender || ''}`;
      const s = sig(rec);
      const rest = list.filter((x) => sig(x) !== s);
      rest.unshift(rec);
      wx.setStorageSync(HISTORY_KEY, rest.slice(0, MAX_HISTORY));
    } catch (e) { /* 存储失败不影响本次生成 */ }
  },

  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goToday() { wx.navigateTo({ url: '/pages/today/today' }); },
  goTerms() { wx.navigateTo({ url: '/pages/terms/terms' }); },

  applyToday(solar) {
    if (!solar) return;
    this.setData({ calMode: 'solar', solarDate: solar, solarDateLabel: solar, hasResult: false, result: null });
  },

  applyHistory(r) {
    if (!r) return;
    const a = r.archiveInput;
    if (a && a.version === 2) {
      const set = {
        calMode: a.calMode === 'lunar' && a.lunarSel ? 'lunar' : 'solar',
        solarDate: a.solar || r.solar,
        solarDateLabel: a.solar || r.solar,
        gender: a.gender === '女' ? '女' : '男',
        timeUnknown: !!a.timeUnknown,
        hour: a.timeUnknown ? -1 : a.hour,
        minute: a.timeUnknown ? 0 : a.minute,
        preciseTime: a.timeUnknown ? '12:00' : `${pad2(a.hour)}:${pad2(a.minute)}`,
        hourLabel: a.timeUnknown ? '时辰未知' : `${pad2(a.hour)}:${pad2(a.minute)}`,
        shichenHint: a.timeUnknown ? '' : `${SHICHEN[shichenIndexOfHour(a.hour)].name}（${SHICHEN[shichenIndexOfHour(a.hour)].range}）`,
        hasResult: false,
        result: null,
      };

      const p = a.place || {};
      if (p.manual && Number.isFinite(p.longitude)) {
        Object.assign(set, {
          lonActive: true,
          lonText: p.lonText || String(p.longitude),
          placeLon: p.longitude,
          placeLat: null,
          placeValid: true,
          placeLabel: '手动经度',
          placeHint: `按手动经度东经 ${p.longitude}° 计算真太阳时`,
        });
      } else if (p.prov && PROVINCE_NAMES.includes(p.prov)) {
        const provIdx = PROVINCE_NAMES.indexOf(p.prov);
        const cn = cityNames(p.prov);
        const municipal = cn.length === 1 && cn[0] === p.prov;
        const cityIdx = Math.max(0, cn.indexOf(municipal ? p.prov : p.city));
        const city = municipal ? p.prov : (cn[cityIdx] || cn[0]);
        const rawDn = districtNames(p.prov, city);
        const dn = rawDn.length ? rawDn : [city];
        const districtIdx = Math.max(0, dn.indexOf(p.district));
        const district = dn[districtIdx] || dn[0];
        const place = locateProvinceCity(p.prov, city, district);
        if (place) {
          const dName = place.district && place.district !== place.city ? '·' + place.district : '';
          Object.assign(set, {
            provIdx, cityNames: cn, cityIdx,
            placeMode: municipal ? 'municipal' : 'province',
            districtNames: dn, districtIdx,
            placeValid: true,
            placeLon: place.lng,
            placeLat: place.lat,
            placeLabel: `${place.prov} ${municipal ? '' : place.city}${dName}`.replace(/\s+$/, ''),
            placeHint: `计算坐标按所属地级行政中心近似：东经 ${place.lng.toFixed(1)}° · 北纬 ${place.lat.toFixed(1)}°`,
            lonActive: false,
            lonText: '',
          });
        }
      }

      this.setData(set, () => {
        if (a.calMode === 'lunar' && a.lunarSel) {
          this.applyLunar(a.lunarSel.year, a.lunarSel.month, !!a.lunarSel.leap, a.lunarSel.day);
          this.setData({ calMode: 'lunar' });
        }
      });
      return;
    }

    const set = {};
    if (r.solar && /^\d{4}-\d{2}-\d{2}$/.test(r.solar)) {
      set.calMode = 'solar';
      set.solarDate = r.solar;
      set.solarDateLabel = r.solar;
    }
    if (r.gender === '男' || r.gender === '女') set.gender = r.gender;
    if (Number.isInteger(r.hour) && r.hour >= 0 && r.hour < 24) {
      const mm = (Number.isInteger(r.minute) && r.minute >= 0 && r.minute < 60) ? r.minute : 0;
      const s = SHICHEN[shichenIndexOfHour(r.hour)];
      set.timeUnknown = false;
      set.hour = r.hour;
      set.minute = mm;
      set.preciseTime = `${pad2(r.hour)}:${pad2(mm)}`;
      set.hourLabel = set.preciseTime;
      set.shichenHint = `${s.name}（${s.range}）`;
    } else {
      set.timeUnknown = true;
      set.hour = -1;
      set.minute = 0;
      set.hourLabel = '时辰未知';
      set.shichenHint = '';
    }
    set.hasResult = false;
    set.result = null;
    this.setData(set);
  },

  goAbout() { wx.navigateTo({ url: '/pages/about/about' }); },
});
