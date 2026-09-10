// pages/index/index.js — 输入公历日期并生成本地历法档案（纯事实，无命运推算）
// 相对导入使用无扩展名写法（微信 DevTools 最稳）；Node 单测仍用带扩展名导入。
import { buildFacts } from '../../lib/engine';

function pad(n) { return String(n).padStart(2, '0'); }

Page({
  data: {
    date: '',
    dateLabel: '',
    hasResult: false,
    result: null
  },

  onLoad() {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    this.setData({ date, dateLabel: date });
  },

  onDateChange(e) {
    const date = e.detail.value;
    this.setData({ date, dateLabel: date, hasResult: false, result: null });
  },

  onGenerate() {
    const parts = this.data.date.split('-').map((n) => parseInt(n, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) {
      wx.showToast({ title: '日期无效', icon: 'none' });
      return;
    }
    try {
      const f = buildFacts(y, m, d);
      const result = {
        solar: `${y}-${pad(m)}-${pad(d)}`,
        dayPillar: `${f.dayPillar.gan}${f.dayPillar.zhi}`,
        yearPillar: `${f.yearPillar.gan}${f.yearPillar.zhi}`,
        ganzhiYear: f.yearPillar.ganzhiYear,
        prevTerm: f.prevTerm ? `${f.prevTerm.name}（${f.prevTerm.utc.slice(0, 10)}）` : '—',
        nextTerm: f.nextTerm ? `${f.nextTerm.name}（${f.nextTerm.utc.slice(0, 10)}）` : '—',
        daysToNext: f.daysToNextTerm != null ? Number(f.daysToNextTerm).toFixed(2) + ' 天' : '—',
        eot: f.eotMinutes != null ? (f.eotMinutes >= 0 ? '+' : '') + Number(f.eotMinutes).toFixed(1) + ' 分钟' : '—'
      };
      this.setData({ result, hasResult: true });
    } catch (err) {
      wx.showToast({ title: '仅支持 1900-2100 年', icon: 'none' });
    }
  }
});