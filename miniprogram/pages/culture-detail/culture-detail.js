// pages/culture-detail/culture-detail.js — 传统文化科普条目详情页。
// 纯内容页：数据来自 lib/culture-data.js；关联概念以 redirectTo 跳转，保持返回栈干净。
import { cultureEntryById, cultureRelated, cultureCategoryOf } from '../../lib/culture-data.js';

Page({
  data: {
    entry: null,
    related: [],
  },

  onLoad(options) {
    const id = options && options.id ? String(options.id) : '';
    const entry = cultureEntryById(id);
    if (!entry) {
      wx.showToast({ title: '条目不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const cat = cultureCategoryOf(entry.category);
    this.setData({
      entry: { ...entry, catName: cat ? cat.name : '' },
      related: cultureRelated(entry),
    });
    wx.setNavigationBarTitle({ title: entry.name });
  },

  goRelated(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === (this.data.entry && this.data.entry.id)) return;
    wx.redirectTo({ url: `/pages/culture-detail/culture-detail?id=${id}` });
  },

  onShareAppMessage() {
    const e = this.data.entry;
    if (!e) return { title: '传统文化科普', path: '/pages/culture/culture' };
    return {
      title: `${e.name} · 传统文化科普`,
      path: `/pages/culture-detail/culture-detail?id=${e.id}`,
    };
  },
});
