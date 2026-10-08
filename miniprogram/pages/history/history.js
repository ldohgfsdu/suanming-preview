// pages/history/history.js — 历史档案（本地存储）。
const HISTORY_KEY = 'eastTime.history.v2';
const LEGACY_HISTORY_KEY = 'eastTime.history.v1';

Page({
  data: {
    list: [],
    has: false,
    loading: true,
  },

  onShow() {
    this.load();
  },

  load() {
    let list = [];
    try {
      list = wx.getStorageSync(HISTORY_KEY) || [];
      if (!list.length) list = wx.getStorageSync(LEGACY_HISTORY_KEY) || [];
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

  persist(list) {
    try {
      wx.setStorageSync(HISTORY_KEY, list);
      // 一旦发生写操作即完成到 v2 的迁移，避免旧 key 再被读回。
      wx.removeStorageSync(LEGACY_HISTORY_KEY);
    } catch (e) { /* 本地存储失败不阻断页面 */ }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const list = (this.data.list || []).filter((r) => r.id !== id);
    this.persist(list);
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
        this.persist([]);
        this.setData({ list: [], has: false });
      },
    });
  },

  goCreate() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onUse(e) {
    const id = e.currentTarget.dataset.id;
    const r = (this.data.list || []).find((x) => x.id === id);
    if (!r) return;
    const pages = getCurrentPages();
    const idx = pages.length - 2;
    if (idx >= 0 && pages[idx]) {
      const prev = pages[idx];
      if (prev && typeof prev.applyHistory === 'function') prev.applyHistory(r);
    }
    wx.navigateBack();
  },
});
