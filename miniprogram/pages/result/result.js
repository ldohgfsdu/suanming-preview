// pages/result/result.js — 独立「历法档案」结果页。
// 由首页 onGenerate → commitResult 计算后，经 eventChannel 传入完整档案结果并渲染。
// 纯展示 + 保存档案卡片（canvas 导出），仅客观历法数据与文化背景。
// 另含「历法文化解读」AI 层：AI 只解释已算好的事实，失败自动降级本地规则文本，不阻断主链路。
import { resolveInsight, buildFacts, insightCacheKey } from '../../lib/insight.js';

// PRD 冻结性能红线「AI 8s 降级」（PRD:170/289）：超过 8s 一律降级本地规则文本，
// 不让用户对着转圈干等。云函数 config.json 的 timeout=60s 只是服务端上限，与前端
// 等待时长无关；超过 8s 后本轮不再采纳云端结果，但晚到的成功结果会补写缓存（见下）。
const INSIGHT_TIMEOUT_MS = 8000;

// AI 结果本地缓存：同一份档案重复查看时复用，避免重复调用与重复计费。
// 仅缓存云端 AI 产出（本地规则文本即时生成、零成本，无需缓存）。
const CACHE_PREFIX = 'insight_v1_';
const CACHE_INDEX_KEY = 'insight_v1_index';
const CACHE_MAX = 20;

function cacheRead(key) {
  try {
    const raw = wx.getStorageSync(CACHE_PREFIX + key);
    if (!raw || !raw.insight) return null;
    // 结构校验：缓存也须过一遍基本形态，避免旧版本脏数据
    const ins = raw.insight;
    if (!ins.sections || !ins.sections.length || !ins.limitations) return null;
    return ins;
  } catch (e) {
    return null;
  }
}

function cacheWrite(key, insight) {
  try {
    const idx = wx.getStorageSync(CACHE_INDEX_KEY) || [];
    const full = CACHE_PREFIX + key;
    if (idx.indexOf(full) < 0) idx.push(full);
    while (idx.length > CACHE_MAX) {
      const oldest = idx.shift();
      wx.removeStorageSync(oldest);
    }
    wx.setStorageSync(CACHE_INDEX_KEY, idx);
    wx.setStorageSync(full, { insight, ts: Date.now() });
  } catch (e) {
    // 缓存写入失败不影响主链路
  }
}

// ---- 分享卡片：文本估宽与截断 ----
// canvas 不自动换行也不裁剪，长串（「请选择出生地点（跳过真太阳时修正）」、
// 「地名 · 东经 xx.x° · 北纬 xx.x°」）会直接画出画布右边界，必须按估宽截断。
// 估宽口径：CJK/全角按字号宽度，ASCII 按 0.55 字号（中西文混排近似即可）。
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
    r: null,       // 档案结果对象
    loaded: false, // 是否已接收到首页推来的数据
    insightState: 'idle', // idle | loading | done
    insightLoading: false,
    insightSections: [],
    insightLimitations: [],
    insightModel: '',
  },

  onLoad() {
    // 接收首页 commitResult 计算好的档案；正常由首页 navigateTo携带 eventChannel 进入。
    // 铁律：AI 解读须**用户显式点击**才生成（PRD §7.4/§9），此处只渲染档案，不自动调用。
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

  // 页面销毁时清掉降级定时器，避免把页面闭包钉在内存里
  onUnload() {
    if (this._insightTimer) { clearTimeout(this._insightTimer); this._insightTimer = 0; }
  },

  // 用户点击「生成解读」→ 先查缓存，未命中才走云端
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
        insightModel: 'AI 生成 · 本地缓存',
      });
      return;
    }
    await this.loadInsight(r, key);
  },

  // 生成文化解读：云端 AI 优先，失败/超时/未开云 → 本地规则降级
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

    // 等待句柄挂在实例上：页面被关掉（onUnload）时必须清掉，否则定时器把页面闭包
    // 钉住最长 8 秒；竞态结束后同样要清，避免空转。
    let timerId = 0;
    const timeout = new Promise((resolve) => {
      timerId = setTimeout(() => resolve(null), INSIGHT_TIMEOUT_MS);
      this._insightTimer = timerId;
    });

    const work = resolveInsight(archiveResult, { cloudAvailable: cloudReady });
    const settled = await Promise.race([work, timeout]);
    if (timerId) clearTimeout(timerId);
    this._insightTimer = 0;

    // 到点没回：**本轮降级到本地规则**（PRD 冻结红线「8s 降级」），本地规则纯本地、
    // 瞬时可出、永远有内容 —— 绝不能给用户看「暂不可用」。
    // 云端仍在跑的结果本轮不采纳，只补写缓存，下次进同一档案直接命中，避免白烧 Token。
    let payload = settled;
    if (!payload) {
      payload = resolveInsight(archiveResult, { cloudAvailable: false });
      payload.reason = 'timeout';
      work.then((res) => {
        if (res && res.usedAI && res.insight && cacheKey) cacheWrite(cacheKey, res.insight);
      });
    }

    // 打印降级原因，便于真机排查（Console 可见）
    if (!payload.usedAI) {
      console.warn('[insight] 走本地规则降级，原因：', payload.reason);
    } else {
      console.info('[insight] 云端 AI 成功');
    }

    if (payload && payload.insight) {
      const ins = payload.insight;
      // 仅缓存云端 AI 产出（本地规则文本零成本即时生成，无需占用缓存）
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

  // 保存档案卡片
  onSaveCard() {
    const r = this.data.r;
    if (!r) { wx.showToast({ title: '暂无可生成的档案', icon: 'none' }); return; }
    const ctx = wx.createCanvasContext('shareCard', this);
    // 卡高 760（与 wxml canvas 的 height 同步）。明细 6–7 行（有坐标时 7 行）行距 38，
    // 五行条 26 行标签后 26 起、行距 30；末行条形底 ≤698，页脚 H-30=730，不重叠。
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
    // 地点与坐标拆成两行：合写会被 clipText 截成「… · 东…」，坐标信息全丢
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
      // 值右对齐到卡片右缘（与档案页 kv 行一致），超宽按估宽截断
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
        // 条形高 16，文字基线取 y+16（20 号字视觉中心 ≈ y+8）→ 与条形垂直居中
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

  // 返回首页继续修改
  goBackHome() {
    wx.navigateBack();
  },
});