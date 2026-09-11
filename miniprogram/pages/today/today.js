// pages/today/today.js — 今日天时独立页。
// 展示当日完整的历法档案：四柱干支、农历、节气 bracket、月相月龄、日出日落、真太阳时、五行分布。
// 全部为真实天文历法计算，纯展示，不含任何预测/判定内容。
import { computeArchive, ELEMENT_NAME } from '../../lib/archive.js';
import { solarToLunar } from '../../lib/lunar.js';
import { sunTimes } from '../../lib/sun.js';

const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

function pad(n) { return String(n).padStart(2, '0'); }
function formatUTC(utc) {
  if (!utc) return '—';
  const s = utc.slice(0, 16).replace('T', ' ');
  return `${s} UTC`;
}
function dayCn(d) { return DAY_CN[d] || String(d); }
function parseHM(hhmm) {
  const p = hhmm.split(':').map((n) => parseInt(n, 10));
  return p[0] * 60 + (p[1] || 0);
}

Page({
  data: {
    dateText: '',
    lunarText: '',
    ganzhi: { year: '', month: '', day: '' },
    nayin: '',
    pillars: [],
    tally: [],
    term: { prev: '', next: '', days: '' },
    moon: { name: '', age: '' },
    sun: { sunrise: '', sunset: '', daylight: '' },
    nowText: '',
    loading: true,
  },

  onLoad() {
    this.buildToday();
    this._ticker = setInterval(() => this.refreshClock(), 30000);
  },
  onUnload() {
    if (this._ticker) clearInterval(this._ticker);
  },

  buildToday() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    try {
      const f = computeArchive(y, m, d);
      const lunar = solarToLunar(y, m, d) || null;
      // 四柱
      const pillars = ['year', 'month', 'day']
        .filter((k) => f.four[k])
        .map((k) => ({ label: f.four[k].label, ganz: f.four[k].ganz, elem: ELEMENT_NAME[f.four[k].element] }));
      // 五行分布（横轴为文字，供今日页轻量展示）
      const tallyArr = ['wood', 'fire', 'earth', 'metal', 'water']
        .map((k) => ({ name: ELEMENT_NAME[k], n: (f.tally[k] || 0) }))
        .filter((x) => x.n > 0);
      // 节气
      const prev = f.term.prev ? `${f.term.prev.name} ${formatUTC(f.term.prev.utc)}` : '—';
      const next = f.term.next ? `${f.term.next.name} ${formatUTC(f.term.next.utc)}` : '—';
      const daysToNext = f.term.daysToNext != null ? Number(f.term.daysToNext).toFixed(2) + ' 天' : '—';
      // 日出日落（默认北京经纬度）
      const sun = sunTimes(y, m, d, 116.4074, 39.9042);
      this.setData({
        loading: false,
        dateText: `${y}年${m}月${d}日`,
        lunarText: lunar ? `${lunar.year}年${(lunar.leap ? '闰' : '')}${MONTH_CN[lunar.month - 1]}月${dayCn(lunar.day)}` : '—',
        ganzhi: {
          year: f.four.year ? f.four.year.ganz : '—',
          month: f.four.month ? f.four.month.ganz : '—',
          day: f.four.day ? f.four.day.ganz : '—',
        },
        nayin: f.nayin,
        pillars,
        tally: tallyArr.map((x) => `${x.name}${x.n}`).join(' · ') || '—',
        term: { prev, next, daysToNext },
        sun: {
          sunrise: sun.valid ? sun.sunrise : '—',
          sunset: sun.valid ? sun.sunset : '—',
          daylight: sun.valid ? this.daylightText(sun.sunrise, sun.sunset) : '—',
        },
        moon: { phase: f.moon ? f.moon.name : '—', age: f.moon ? `${Number(f.moon.ageDays).toFixed(1)} 天` : '—' },
      });
      this.refreshClock();
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  refreshClock() {
    const now = new Date();
    this.setData({ nowText: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` });
  },

  // 由日出/日落时间计算白昼时长（处理跨午夜与四舍五入）
  daylightText(sunrise, sunset) {
    try {
      let mins = (parseHM(sunset) - parseHM(sunrise) + 24 * 60) % (24 * 60);
      return `${Math.floor(mins / 60)}小时${Math.round(mins % 60)}分`;
    } catch (e) { return '—'; }
  },

  // 用「今日」作为出生档案默认日期，返回首页
  fillToday() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const solar = `${y}-${pad(m)}-${pad(d)}`;
    const pages = getCurrentPages();
    const prev = pages.length >= 2 ? pages[pages.length - 2] : null;
    if (prev && typeof prev.applyToday === 'function') {
      prev.applyToday(solar);
    }
    wx.navigateBack();
  },
});