// pages/result/result.js — 独立「历法档案」结果页。
// 纯展示 + 保存档案卡片；AI 只解释已算好的事实，失败自动降级本地规则文本。
import { resolveInsight, buildFacts, insightCacheKey, OUTPUT_VERSION, PROMPT_VER } from '../../lib/insight.js';

// 用户最多等 8 秒；云函数服务端上限更长，仅用于让已开始的模型调用有机会完成并进入服务端缓存。
const INSIGHT_TIMEOUT_MS = 8000;

// 客户端只保留“本次小程序会话”的 AI 结果，避免模型切换后跨会话误用旧内容。
// 跨会话复用由云函数服务端 cacheKey(docHash+promptVer+model+outputVersion) 负责。
const SESSION_CACHE = new Map();
const SESSION_CACHE_MAX = 20;

function cacheRead(key) {
  const ins = SESSION_CACHE.get(key);
  if (!ins) return null;
  if (ins.outputVersion !== OUTPUT_VERSION || ins.promptVer !== PROMPT_VER
    || !/^[0-9a-f]{64}$/.test(String(ins.docHash || '')) || !ins.model
    || !ins.sections || !ins.sections.length || !ins.limitations) {
    SESSION_CACHE.delete(key);
    return null;
  }
  SESSION_CACHE.delete(key);
  SESSION_CACHE.set(key, ins);
  return ins;
}

function cacheWrite(key, insight) {
  if (!key || !insight) return;
  SESSION_CACHE.delete(key);
  SESSION_CACHE.set(key, insight);
  while (SESSION_CACHE.size > SESSION_CACHE_MAX) {
    const oldest = SESSION_CACHE.keys().next().value;
    SESSION_CACHE.delete(oldest);
  }
}

const CARD_VALUE_X = 200;
function estWidth(str, fontSize) {
  let w = 0;
  for (const ch of String(str == null ? '' : str)) {
    w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55;
  }
  return w;
}
function clipText(str, maxW, fontSize) {
  const s = String(str == null ? '' : str);
  if (estWidth(s, fontSize) <= maxW) return s;
  let out = '';
  for (const ch of s) {
    if (estWidth(out + ch + '…', fontSize) > maxW) break;
    out += ch;
  }
  return out + '…';
}

Page({
  data: {
    r: null,
    loaded: false,
    insightState: 'idle',
    insightLoading: false,
    insightSections: [],
    insightLimitations: [],
    insightModel: '',
  },

  onLoad() {
    const channel = this.getOpenerEventChannel();
    if (channel && channel.on) {
      channel.on('archive', (payload) => {
        if (payload && payload.result) {
          this.setData({ r: payload.result, loaded: true });
          wx.setNavigationBarTitle({ title: '历法档案' });
        }
      });
    }
  },

  onUnload() {
    if (this._insightTimer) { clearTimeout(this._insightTimer); this._insightTimer = 0; }
  },

  async onGenerateInsight() {
    const r = this.data.r;
    if (!r || this.data.insightLoading || this.data.insightState === 'loading') return;

    const key = insightCacheKey(buildFacts(r));
    const cached = cacheRead(key);
    if (cached) {
      this.setData({
        insightState: 'done',
        insightLoading: false,
        insightSections: cached.sections || [],
        insightLimitations: cached.limitations || [],
        insightModel: 'AI 生成 · 本次会话缓存',
      });
      return;
    }
    await this.loadInsight(r, key);
  },

  async loadInsight(archiveResult, cacheKey) {
    this.setData({
      insightState: 'loading',
      insightLoading: true,
      insightSections: [],
      insightLimitations: [],
      insightModel: '',
    });

    const app = getApp();
    const cloudReady = !!(app && app.globalData && app.globalData.cloudEnvId && wx.cloud);
    console.info('[insight] cloudReady =', cloudReady,
      '| env =', (app && app.globalData && app.globalData.cloudEnvId) || '(空)');

    let timerId = 0;
    const timeout = new Promise((resolve) => {
      timerId = setTimeout(() => resolve(null), INSIGHT_TIMEOUT_MS);
      this._insightTimer = timerId;
    });

    const work = resolveInsight(archiveResult, { cloudAvailable: cloudReady });
    const settled = await Promise.race([work, timeout]);
    if (timerId) clearTimeout(timerId);
    this._insightTimer = 0;

    let payload = settled;
    if (!payload) {
      payload = resolveInsight(archiveResult, { cloudAvailable: false });
      payload.reason = 'timeout';
      // 晚到的成功结果只写本次会话缓存；跨会话由服务端模型版本缓存负责。
      work.then((res) => {
        if (res && res.usedAI && res.insight && cacheKey) cacheWrite(cacheKey, res.insight);
      });
    }

    if (!payload.usedAI) {
      console.warn('[insight] 走本地规则降级，原因：', payload.reason);
    } else {
      console.info('[insight] 云端 AI 成功');
    }

    if (payload && payload.insight) {
      const ins = payload.insight;
      if (payload.usedAI && cacheKey) cacheWrite(cacheKey, ins);
      this.setData({
        insightState: 'done',
        insightLoading: false,
        insightSections: ins.sections || [],
        insightLimitations: ins.limitations || [],
        insightModel: payload.usedAI ? 'AI 生成' : '本地规则',
      });
    } else {
      this.setData({ insightState: 'done', insightLoading: false, insightModel: '暂不可用' });
    }
  },

  onShareAppMessage() {
    const r = this.data.r;
    return {
      title: (r && r.solar ? r.solar + ' · ' : '') + '东方时间文化档案 — 基于真实天文历法',
      path: '/pages/index/index',
    };
  },

  onSaveCard() {
    const r = this.data.r;
    if (!r) { wx.showToast({ title: '暂无可生成的档案', icon: 'none' }); return; }
    const ctx = wx.createCanvasContext('shareCard', this);
    const W = 600, H = 760;
    const dark = (wx.getSystemInfoSync && wx.getSystemInfoSync().theme) === 'dark';
    const P = dark ? {
      bg: '#27241f', title: '#ede7df', sub: '#c89a6a', label: '#a99e8e',
      line: '#3a3630', fill: '#38332a', bar: '#2f9e78', foot: '#726d63',
    } : {
      bg: '#faf7f0', title: '#3b2f28', sub: '#9a6b4f', label: '#9c8f80',
      line: '#e6ded2', fill: '#efe9de', bar: '#12a173', foot: '#b0a69a',
    };
    ctx.setFillStyle(P.bg);
    ctx.fillRect(0, 0, W, H);
    ctx.setTextAlign('center');
    ctx.setFillStyle(P.title);
    ctx.setFontSize(34);
    ctx.fillText('东方时间文化档案', W / 2, 72);
    ctx.setFillStyle(P.sub);
    ctx.setFontSize(22);
    ctx.fillText(r.solar, W / 2, 106);

    ctx.setFontSize(44);
    ctx.setFillStyle(P.title);
    const pCount = r.pillars.length;
    const colW = W / (pCount + 0.5);
    r.pillars.forEach((p, i) => {
      const x = colW * (i + 0.75);
      ctx.fillText(p.ganz, x, 170);
      ctx.setFontSize(20);
      ctx.setFillStyle(P.label);
      ctx.fillText(clipText(`${p.label} · ${(p.element || '时辰未知')}`, colW - 8, 20), x, 198);
      ctx.setFontSize(44);
      ctx.setFillStyle(P.title);
    });

    ctx.setStrokeStyle(P.line);
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(60, 228);
    ctx.lineTo(W - 60, 228);
    ctx.stroke();

    let y = 264;
    const rows = [
      ['农历', r.lunarText || '—'],
      ['出生地点', r.placeName],
    ];
    if (r.placeCoord) rows.push(['坐标', r.placeCoord]);
    rows.push(
      ['上一个节气', r.prevTerm],
      ['下一个节气', r.nextTerm],
      ['月相', (r.moonPhase || '—') + (r.moonAge ? `（朔望月龄 ${r.moonAge}）` : '')],
      ['真太阳时修正', (r.trueSolar && r.trueSolar !== '未提供地点') ? r.trueSolar : '—'],
    );
    ctx.setFontSize(24);
    for (const [k, v] of rows) {
      ctx.setTextAlign('left');
      ctx.setFillStyle(P.label);
      ctx.fillText(k, 48, y);
      ctx.setTextAlign('right');
      ctx.setFillStyle(P.title);
      ctx.fillText(clipText(v, W - 48 - CARD_VALUE_X, 24), W - 48, y);
      y += 38;
    }

    y += 6;
    ctx.setTextAlign('left');
    ctx.setFillStyle(P.label);
    ctx.setFontSize(22);
    ctx.fillText('五行四柱字数', 48, y);
    y += 26;
    if (r.tally && r.tally.length) {
      const trackW = W - 48 * 2;
      const unit = trackW / 5;
      r.tally.forEach((t) => {
        ctx.setFillStyle(P.title);
        ctx.setFontSize(20);
        ctx.fillText(t.name, 48, y + 16);
        ctx.setFillStyle(P.fill);
        ctx.fillRect(100, y, unit * 4, 16);
        ctx.setFillStyle(P.bar);
        ctx.fillRect(100, y, unit * t.n, 16);
        ctx.setFillStyle(P.title);
        ctx.setFontSize(20);
        ctx.fillText(String(t.n), 100 + unit * 4 + 16, y + 16);
        y += 30;
      });
    }

    ctx.setFontSize(20);
    ctx.setFillStyle(P.foot);
    ctx.setTextAlign('center');
    ctx.fillText('由真实天文历法计算 · 供传统文化研究与娱乐参考', W / 2, H - 30);
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'shareCard',
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: (e) => {
              if (e && e.errMsg && e.errMsg.indexOf('auth') >= 0) {
                wx.showModal({ title: '需要相册权限', content: '请授权保存图片到相册后重试', showCancel: false });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            },
          });
        },
        fail: () => wx.showToast({ title: '生成卡片失败', icon: 'none' }),
      });
    });
  },

  goBackHome() {
    wx.navigateBack();
  },
});
