// pages/result/result.js — 独立「历法档案」结果页。
// 由首页 onGenerate → commitResult 计算后，经 eventChannel 传入完整档案结果并渲染。
// 纯展示 + 保存档案卡片（canvas 导出），不含任何预测/判定内容。
Page({
  data: {
    r: null,       // 档案结果对象
    loaded: false, // 是否已接收到首页推来的数据
  },

  onLoad() {
    // 接收首页 commitResult 计算好的档案；正常由首页 navigateTo 携带 eventChannel 进入。
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
    ctx.fillText('东方时间文化档案', W / 2, 76);
    ctx.setFillStyle(P.sub);
    ctx.setFontSize(22);
    ctx.fillText(r.solar, W / 2, 112);

    ctx.setFontSize(44);
    ctx.setFillStyle(P.title);
    const pCount = r.pillars.length;
    const colW = W / (pCount + 0.5);
    r.pillars.forEach((p, i) => {
      const x = colW * (i + 0.75);
      ctx.fillText(p.ganz, x, 180);
      ctx.setFontSize(20);
      ctx.setFillStyle(P.label);
      ctx.fillText(`${p.label} · ${(p.element || '时辰未知')}`, x, 208);
      ctx.setFontSize(44);
      ctx.setFillStyle(P.title);
    });

    ctx.setStrokeStyle(P.line);
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(60, 240);
    ctx.lineTo(W - 60, 240);
    ctx.stroke();

    let y = 280;
    const rows = [
      ['日柱纳音', r.nayin],
      ['农历', r.lunarText || '—'],
      ['出生地点', r.place],
      ['上一个节气', r.prevTerm],
      ['下一个节气', r.nextTerm],
      ['月相', (r.moonPhase || '—') + (r.moonAge ? `（朔望月龄 ${r.moonAge}）` : '')],
      ['真太阳时修正', r.trueSolar],
    ];
    ctx.setTextAlign('left');
    ctx.setFontSize(24);
    for (const [k, v] of rows) {
      ctx.setFillStyle(P.label);
      ctx.fillText(k, 48, y);
      ctx.setFillStyle(P.title);
      ctx.fillText(v, 200, y);
      y += 44;
    }

    y += 8;
    ctx.setFillStyle(P.label);
    ctx.setFontSize(22);
    ctx.fillText('五行四柱字数', 48, y);
    y += 30;
    if (r.tally && r.tally.length) {
      const trackW = W - 48 * 2;
      const unit = trackW / 5;
      r.tally.forEach((t) => {
        ctx.setFillStyle(P.title);
        ctx.setFontSize(20);
        ctx.fillText(t.name, 48, y + 14);
        ctx.setFillStyle(P.fill);
        ctx.fillRect(100, y, unit * 4, 16);
        ctx.setFillStyle(P.bar);
        ctx.fillRect(100, y, unit * t.n, 16);
        ctx.setFillStyle(P.title);
        ctx.setFontSize(20);
        ctx.fillText(String(t.n), 100 + unit * 4 + 16, y + 14);
        y += 36;
      });
    }

    ctx.setFontSize(20);
    ctx.setFillStyle(P.foot);
    ctx.setTextAlign('center');
    ctx.fillText('由真实天文历法计算 · 不含预测与判定', W / 2, H - 30);
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