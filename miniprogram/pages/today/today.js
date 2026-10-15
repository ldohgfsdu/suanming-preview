// pages/today/today.js — 今日天时独立页。
// 本页的“今日”固定采用北京时间（UTC+8）与北京坐标，避免设备位于其他时区时混用口径。
import { computeArchive, ELEMENT_NAME, hourPillar } from '../../lib/archive.js';
import { dayPillar, gregorianToJde } from '../../lib/engine.js';
import { solarToLunar } from '../../lib/lunar.js';
import { sunTimes } from '../../lib/sun.js';
import { fmtTermDate, fmtDaysLeft } from '../../lib/display.js';
import { cultureToggle } from '../../lib/culture-data.js';

const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

function pad(n) { return String(n).padStart(2, '0'); }
function beijingNowParts() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}
function litMoon(age) {
  if (age == null || !Number.isFinite(age)) return null;
  const f = ((age % 29.530588861) + 29.530588861) % 29.530588861 / 29.530588861;
  const lit = Math.sin(Math.PI * f) ** 2;
  return { litPct: Math.round(lit * 100), filling: f < 0.5 ? '盈' : '亏' };
}
function dayCn(d) { return DAY_CN[d] || String(d); }
function parseHM(hhmm) {
  const p = hhmm.split(':').map((n) => parseInt(n, 10));
  return p[0] * 60 + (p[1] || 0);
}

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

const TERM_INFO = {
  立春: '春季之始。东风解冻，蛰虫始振。古人于此日“咬春”食春饼，迎春御寒。',
  雨水: '冰雪消融成雨。草木萌动，正是“春雨贵如油”的开始。',
  惊蛰: '春雷始鸣，惊醒蛰伏之虫。民间有“春雷响，万物长”之说。',
  春分: '昼夜等长，燕雀南归。古书云“仲春日夜分，雷乃发声”，昼夜均而寒暑平。',
  清明: '气清景明。既是节气也是传统节日，踏青扫墓，种瓜点豆。',
  谷雨: '百谷得雨而生长。江南于此前后播种，有“谷雨前后，种瓜点豆”之谈。',
  立夏: '春尽夏至。蝼蝌鸣、蚯蚓出，农人忙插秧之始。',
  小满: '麦粒渐满而未熟。古人借此“满而不溢”戒骄满，心淡而行健。',
  芒种: '有芒之麦当收，有芒之稻当忙。“芒种忙忙种”就是此刻的写照。',
  夏至: '白天最长。古人称“日长之至，日影短至”，此时阳气至盛、阴气始生。',
  小暑: '暑气初临，温风至。蟋蟀由洞里居，远鹰始习飞，防暑为先。',
  大暑: '一年中最热之时。湿热交汇，有“大暑小暑，晒死老鼠”之谚。此时防暑为先。',
  立秋: '秋之初。凉风有信，梧桐叶落，民间“贴秋膘”以补夏令之耗。',
  处暑: '“出暑”之转，暑热渐退。五谷将熟，夜起凉爽，敛气以凉。',
  白露: '夜凉而白露结，草木凝露。古人以“白露为霜”感秋之将至。',
  秋分: '昼夜平分，稻香蟹肥。秋事过半，收藏纳凉以待冬。',
  寒露: '露欲凝寒。播麦、摘糟多在此前后，草木转为涩疏。',
  霜降: '地上初凝霜。冬麦可播、牛羊转圄，是秋收冬藏的尾声。',
  立冬: '冬之始，水始冰、地始冻。民间于此日进补、品“始约”，迎冬而至。',
  小雪: '降雪初现。有此俗谚“小雪腌菜，大雪腌肉”，备冬食迎严冬。',
  大雪: '大雪纷飞，冬意最盛。适于积肥、囤草备战来年春耕。',
  冬至: '昼短夜长至极，而阳气始生。古人称为“冬至一阳生”，民间多食饺子。',
  小寒: '一年将最冷之时。数九从冬至起，“小寒大寒”，冻可在眼前。',
  大寒: '时之至寒，冬之将尽。寒至极以极，然岁末将至、春气将苏。',
};

Page({
  data: {
    dateText: '',
    lunarText: '',
    ganzhi: { year: '', month: '', day: '' },
    pillars: [],
    tally: [],
    term: { prev: '', next: '', days: '' },
    termInfo: '',
    moon: { name: '', age: '' },
    sun: { sunrise: '', sunset: '', daylight: '' },
    shichen: [],
    nowText: '',
    loading: true,
    // 就地科普：与档案页同一套开关语义（see lib/culture-data.js cultureToggle）
    cultureOpenId: '',
    cultureOpen: null,
  },

  onLoad() { this.buildToday(); },
  onShow() {
    if (!this._ticker) this._ticker = setInterval(() => this.refreshClock(), 30000);
  },
  onHide() {
    if (this._ticker) { clearInterval(this._ticker); this._ticker = 0; }
  },
  onUnload() {
    if (this._ticker) clearInterval(this._ticker);
  },
  onShareAppMessage() {
    return {
      title: `今日天时 · ${this.data.dateText} 干支、节气、月相、时辰表`,
      path: '/pages/today/today',
    };
  },
  onPullDownRefresh() {
    this.buildToday();
    wx.stopPullDownRefresh();
  },

  buildToday() {
    const now = beijingNowParts();
    const y = now.y, m = now.m, d = now.d;
    try {
      const f = computeArchive(y, m, d);
      const lunar = solarToLunar(y, m, d) || null;
      const pillars = ['year', 'month', 'day']
        .filter((k) => f.four[k])
        .map((k) => ({ label: f.four[k].label, ganz: f.four[k].ganz, elem: ELEMENT_NAME[f.four[k].element] }));
      const tallyArr = ['wood', 'fire', 'earth', 'metal', 'water']
        .map((k) => ({ name: ELEMENT_NAME[k], n: (f.tally[k] || 0) }));
      const prev = f.term.prev ? `${f.term.prev.name} ${fmtTermDate(f.term.prev.utc)}` : '—';
      const next = f.term.next ? `${f.term.next.name} ${fmtTermDate(f.term.next.utc)}` : '—';
      const daysToNext = f.term.daysToNext != null ? fmtDaysLeft(f.term.daysToNext) : '—';
      const sun = sunTimes(y, m, d, 116.4074, 39.9042);
      const dayStemIdx = dayPillar(gregorianToJde(y, m, d)).index % 10;
      const shichen = SHICHEN.map((s) => {
        const hp = hourPillar(dayStemIdx, s.hour);
        return { name: s.name, range: s.range, ganz: hp.ganzhi };
      });
      this.setData({
        loading: false,
        dateText: `${y}年${m}月${d}日 · 北京口径`,
        lunarText: lunar ? `${lunar.year}年${(lunar.leap ? '闰' : '')}${MONTH_CN[lunar.month - 1]}月${dayCn(lunar.day)}` : '—',
        ganzhi: {
          year: f.four.year ? f.four.year.ganz : '—',
          month: f.four.month ? f.four.month.ganz : '—',
          day: f.four.day ? f.four.day.ganz : '—',
        },
        pillars,
        tally: tallyArr.map((x) => `${x.name}${x.n}`).join(' · ') || '—',
        term: { prev, next, daysToNext },
        termInfo: f.term.prev && TERM_INFO[f.term.prev.name] ? TERM_INFO[f.term.prev.name] : '',
        sun: {
          sunrise: sun.valid ? sun.sunrise : '—',
          sunset: sun.valid ? sun.sunset : '—',
          daylight: sun.valid ? this.daylightText(sun.sunrise, sun.sunset) : '—',
        },
        moon: {
          phase: f.moon ? f.moon.name : '—',
          age: f.moon ? `${Number(f.moon.ageDays).toFixed(1)} 天` : '—',
          lit: f.moon ? litMoon(f.moon.ageDays) : null,
        },
        shichen,
      });
      this.refreshClock();
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  refreshClock() {
    const now = beijingNowParts();
    this.setData({ nowText: `${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)}` });
  },

  daylightText(sunrise, sunset) {
    try {
      const mins = (parseHM(sunset) - parseHM(sunrise) + 24 * 60) % (24 * 60);
      return `${Math.floor(mins / 60)}小时${Math.round(mins % 60)}分`;
    } catch (e) { return '—'; }
  },

  fillToday() {
    const now = beijingNowParts();
    const solar = `${now.y}-${pad(now.m)}-${pad(now.d)}`;
    const pages = getCurrentPages();
    const prev = pages.length >= 2 ? pages[pages.length - 2] : null;
    if (prev && typeof prev.applyToday === 'function') prev.applyToday(solar);
    wx.navigateBack();
  },

  /** 就地科普：ⓘ 就地展开 / 收起概念解释，不离开今日天时页。 */
  onCultureInfo(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    const next = cultureToggle(this.data.cultureOpenId, id);
    if (next) this.setData(next);
  },

  goCultureEntry(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/culture-detail/culture-detail?id=${id}` });
  },
});
