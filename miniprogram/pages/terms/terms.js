// pages/terms/terms.js — 全年节气历。
// 展示指定公历年份的 24 个节气时刻（按设备本地时区显示），按四季分组。
// 纯天文历法计算（Meeus 太阳视黄经求解），无任何预测/判定内容。
import { termJde, isoUtc, TERMS } from '../../lib/engine.js';
import { fmtTermLong } from '../../lib/display.js';

const TERM_MO_REF = [
  '小寒(丑)', '大寒(丑)', '立春(寅)', '雨水(寅)', '惊蛰(卯)', '春分(卯)',
  '清明(辰)', '谷雨(辰)', '立夏(巳)', '小满(巳)', '芒种(午)', '夏至(午)',
  '小暑(未)', '大暑(未)', '立秋(申)', '处暑(申)', '白露(酉)', '秋分(酉)',
  '寒露(戌)', '霜降(戌)', '立冬(亥)', '小雪(亥)', '大雪(子)', '冬至(子)',
];
const SEASON_GROUPS = [
  { name: '冬末·春', ords: [0, 1, 2, 3, 4, 5] },
  { name: '春·夏', ords: [6, 7, 8, 9, 10, 11] },
  { name: '夏·秋', ords: [12, 13, 14, 15, 16, 17] },
  { name: '秋·冬', ords: [18, 19, 20, 21, 22, 23] },
];

function weekCn(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

Page({
  data: {
    year: 2000,
    rows: [],
    loading: false,
  },

  onLoad(options) {
    const qy = options && options.year ? parseInt(options.year, 10) : NaN;
    const y = Number.isFinite(qy) && qy >= 1900 && qy <= 2100 ? qy : new Date().getFullYear();
    this.setData({ year: y });
    this.buildYear(y);
  },
  onShareAppMessage() {
    return {
      title: `${this.data.year} 年 · 全年 24 节气时刻（设备本地时区）`,
      path: `/pages/terms/terms?year=${this.data.year}`,
    };
  },

  buildYear(year) {
    this.setData({ loading: true });
    const rows = [];
    for (const ord of SEASON_GROUPS.flatMap((s) => s.ords)) {
      try {
        const obj = termJde(ord, year);
        const longStr = fmtTermLong(isoUtc(obj));
        const hm = longStr.slice(11, 16);
        const y = longStr.slice(0, 4);
        const m = longStr.slice(5, 7);
        const dd = longStr.slice(8, 10);
        rows.push({ ord, name: TERMS[ord], monthRef: TERM_MO_REF[ord], date: `${y}-${m}-${dd}`, time: hm, wcn: weekCn(`${y}-${m}-${dd}`) });
      } catch (e) { /* 越界跳过 */ }
    }
    this.setData({ year, rows, loading: false });
  },

  onYearTap() {
    if (this.data.loading) return;
    const base = this.data.year;
    const years = [];
    const seen = new Set();
    for (let i = -6; i <= 6; i++) {
      if (base + i >= 1900 && base + i <= 2100 && !seen.has(base + i)) { seen.add(base + i); years.push(base + i); }
    }
    wx.showActionSheet({
      itemList: years.map((y) => `${y} 年`),
      success: (res) => {
        const y = years[res.tapIndex];
        if (y) this.buildYear(y);
      },
    });
  },
});