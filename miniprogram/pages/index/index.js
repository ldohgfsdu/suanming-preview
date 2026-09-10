// pages/index/index.js — 输入公历日期与时辰，生成本地「东方时间文化档案」。
// 纯天文历法事实，不含任何命运、吉凶或运气推算。
// 相对导入使用无扩展名写法（DevTools 最稳）；Node 单测仍用带扩展名导入。
import { computeArchive, ELEMENT_NAME as ELEM_NAME } from '../../lib/archive';

function pad(n) { return String(n).padStart(2, '0'); }
function fmtUTC(utc) {
  if (!utc) return '—';
  // "YYYY-MM-DDTHH:MM:00Z" -> "YYYY-MM-DD HH:MM"
  const s = utc.slice(0, 16).replace('T', ' ');
  return s + ' (UTC)';
}
function formatTime(utc) { return fmtUTC(utc); }

Page({
  data: {
    date: '',
    dateLabel: '',
    hour: -1,
    hourLabel: '时辰未知',
    lon: null,
    lonLabel: '未填写（跳过真太阳时）',
    hasResult: false,
    result: null
  },

  onLoad() {
    const now = new Date();
    this.setData({
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      dateLabel: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value, dateLabel: e.detail.value, hasResult: false, result: null });
  },

  onHourChange(e) {
    const idx = e.detail.value;
    const hours = ['guess', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const hour = ({ guess: -1, '子': 0, '丑': 2, '寅': 4, '卯': 6, '辰': 8, '巳': 10, '午': 12, '未': 14, '申': 16, '酉': 18, '戌': 20, '亥': 22 })[hours[idx]];
    // 每位时辰取其中点小时，展示更直观
    const h = hour >= 0 ? (hour + 1) % 24 : -1;
    this.setData({
      hour: h,
      hourLabel: hours[idx] === 'guess' ? '时辰未知' : `「${hours[idx]}」时（${pad((hour) % 24)}-${pad((hour + 2) % 24)}）`,
      hasResult: false,
      result: null
    });
  },

  onLonInput(e) {
    const v = e.detail.value.trim();
    const lon = v === '' ? null : Number(v);
    this.setData({
      lon: (lon !== null && Number.isFinite(lon)) ? lon : null,
      lonLabel: (lon !== null && Number.isFinite(lon)) ? `东经 ${lon}°` : '未填写经度',
      hasResult: false,
      result: null
    });
  },

  onGenerate() {
    const parts = this.data.date.split('-').map((n) => parseInt(n, 10));
    const y = parts[0], m = parts[1], d = parts[2];
    if (!y || !m || !d) { wx.showToast({ title: '日期无效', icon: 'none' }); return; }
    try {
      const f = computeArchive(y, m, d, this.data.hour, this.data.lon);
      const pillars = ['year', 'month', 'day', 'hour']
        .filter((k) => f.four[k])
        .map((k) => ({ label: f.four[k].label, ganz: f.four[k].ganz, element: ELEM_NAME[f.four[k].element] }));

      // 五行四柱字数
      const tallyList = ['wood', 'fire', 'earth', 'metal', 'water']
        .map((k) => ({ name: ELEM_NAME[k], n: (f.tally[k] || 0) }))
        .filter((x) => x.n > 0);

      const term = f.term.next
        ? `${f.term.next.name} ${formatTime(f.term.next.utc)}`
        : '—';

      this.setData({
        hasResult: true,
        result: {
          solar: `${y}-${pad(m)}-${pad(d)}`,
          pillars,
          ganzhi: f.chang_ganzhi,
          nayin: f.nayin,
          hourLabel2: this.data.hour >= 0 ? this.data.hourLabel : '时辰未知',
          tally,
          prevTerm: f.term.prev ? `${f.term.prev.name} ${formatTime(f.term.prev.utc)}` : '—',
          nextTerm: term,
          daysToNext: f.term.daysToNext != null ? Number(f.term.daysToNext).toFixed(2) + ' 天' : '—',
          moon: f.moon ? `${f.moon.name}（朔望月龄 ${Number(f.moon.ageDays).toFixed(1)} 天）` : '—',
          trueSolar: f.trueSolar.degraded
            ? '未提供经度'
            : `${f.trueSolar.offsetMinutes >= 0 ? '+' : ''}${Number(f.trueSolar.offsetMinutes).toFixed(1)} 分钟`
        }
      });
    } catch (err) {
      wx.showToast({ title: '仅支持 1900-2100 年', icon: 'none' });
    }
  }
});