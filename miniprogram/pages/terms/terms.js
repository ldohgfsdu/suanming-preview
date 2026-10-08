// pages/terms/terms.js — 全年节气历。
// 展示指定公历年份的 24 个节气时刻（按设备本地时区显示），按四季分组。
// 纯天文历法计算（Meeus 太阳视黄经求解），无任何预测/判定内容。
import { termJde, isoUtc, TERMS } from '../../lib/engine.js';
import { fmtTermLong } from '../../lib/display.js';

// 各节气所属月建（建月之支）。只放地支 —— 节气名由 name 单独渲染，避免同一行出现两次。
const TERM_MO_REF = [
  '丑', '丑', '寅', '寅', '卯', '卯',
  '辰', '辰', '巳', '巳', '午', '午',
  '未', '未', '申', '申', '酉', '酉',
  '戌', '戌', '亥', '亥', '子', '子',
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
    groups: [],
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
    // 按四季分组渲染（原来只做了数据分组、wxml 从未消费，四季标题一直没画出来）
    const groups = SEASON_GROUPS.map((g) => ({ name: g.name, rows: [] }));
    SEASON_GROUPS.forEach((g, gi) => {
      for (const ord of g.ords) {
        try {
          const obj = termJde(ord, year);
          const longStr = fmtTermLong(isoUtc(obj));
          const hm = longStr.slice(11, 16);
          const y = longStr.slice(0, 4);
          const m = longStr.slice(5, 7);
          const dd = longStr.slice(8, 10);
          groups[gi].rows.push({
            ord,
            name: TERMS[ord],
            monthRef: TERM_MO_REF[ord],
            // 偶数序为「节」（起建月之始），奇数序为「中气」（居月之中）——纯历法事实
            tip: ord % 2 === 0 ? '节 · 建月之始' : '中气 · 居月中',
            date: `${y}-${m}-${dd}`,
            time: hm,
            wcn: weekCn(`${y}-${m}-${dd}`),
          });
        } catch (e) { /* 越界跳过 */ }
      }
    });
    this.setData({ year, groups: groups.filter((g) => g.rows.length), loading: false });
  },

  onYearTap() {
    if (this.data.loading) return;
    const base = this.data.year;
    const years = [];
    const seen = new Set();
    // wx.showActionSheet 的 itemList 上限 6 项，给 13 项会被整体拒接（年份切换点不动）。
    // 取当前年 -2..+3 共 6 档；点选后 base 随之前移，可逐档走到 1900–2100 任意年份。
    for (let i = -2; i <= 3; i++) {
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