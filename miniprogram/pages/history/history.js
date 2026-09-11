// pages/history/history.js — 历史档案（本地存储，P0-5 基础版）。
// 仅读取首页 wx.setStorageSync 写入的本地记录；支持逐条删除与清空，删除即真正移除。
// 不含任何云服务依赖；展示出生时间/地点等用户自填信息，均在用户设备本地。
const HISTORY_KEY = 'eastTime.history.v1';

Page({
  data: {
    list: [],
    hasData: false,
    loading: true,
  },

  onShow() {
    this.load();
  },

  load() {
    let list = [];
    try {
      list = wx.getStorageSync(HISTORY_KEY) || [];
    } catch (e) { list = []; }
    const fmt = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const enriched = list.map((r) => ({ ...r, createdTime: fmt(r.createdAt) }));
    this.setData({ list: enriched, has: enriched.length > 0, loading: false });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const list = (this.data.list || []).filter((r) => r.id !== id);
    try {
      wx.setStorageSync(HISTORY_KEY, list);
    } catch (e) { /* 忽略 */ }
    this.setData({ list, has: list.length > 0 });
    wx.showToast({ title: '已删除', icon: 'none' });
  },

  clearHistory() {
    const n = (this.data.list || []).length;
    if (n === 0) return;
    wx.showModal({
      title: '清空历史',
      content: `确定清除全部 ${n} 条本地记录吗？此操作不可恢复。`,
      confirmText: '清除',
      confirmColor: '#9a6b4f',
      success: (res) => {
        if (!res.confirm) return;
        try { wx.setStorageSync(HISTORY_KEY, []); } catch (e) { /* 忽略 */ }
        this.setData({ list: [], has: false });
      },
    });
  },

  // 从历史回到输入页（一次性带入该记录的日期）
  onUse(e) {
    const id = e.currentTarget.dataset.id;
    const r = (this.data.list || []).find((x) => x.id === id);
    if (!r) return;
    const pages = getCurrentPages();
    const idx = pages.length - 2;
    if (idx >= 0 && pages[idx]) {
      const prev = pages[idx];
      if (prev && typeof prev.applyHistory === 'function') {
        prev.applyHistory(r);
      }
    }
    wx.navigateBack();
  },
});