// pages/culture/culture.js — 传统文化科普库（浏览 + 检索）。
// 纯内容页：数据来自 lib/culture-data.js，零计算、零网络、零隐私。
import {
  CULTURE_ENTRIES,
  CULTURE_CATEGORIES,
  cultureCategoryOf,
  cultureSearch,
} from '../../lib/culture-data.js';

Page({
  data: {
    keyword: '',
    activeCat: 'all',
    cats: [{ id: 'all', name: '全部' }].concat(CULTURE_CATEGORIES),
    list: [],
    total: CULTURE_ENTRIES.length,
  },

  onLoad() {
    this.applyFilter();
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.applyFilter();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  onCatTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeCat) return;
    this.setData({ activeCat: id });
    this.applyFilter();
  },

  applyFilter() {
    const kw = (this.data.keyword || '').trim();
    const cat = this.data.activeCat;
    let hits = kw ? cultureSearch(kw) : CULTURE_ENTRIES.slice();
    if (cat !== 'all') hits = hits.filter((x) => x.category === cat);
    const list = hits.map((x) => {
      const c = cultureCategoryOf(x.category);
      return { ...x, catName: c ? c.name : '' };
    });
    this.setData({ list });
  },

  goEntry(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/culture-detail/culture-detail?id=${id}` });
  },

  onShareAppMessage() {
    return {
      title: '传统文化科普 · 干支 五行 八卦 节气',
      path: '/pages/culture/culture',
    };
  },
});
