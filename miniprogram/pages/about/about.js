// pages/about/about.js — 关于 / 免责声明 / 算法说明 合规页。
// 本页为纯静态展示，不含任何历法计算，也不收集个人信息。
Page({
  onShareAppMessage() {
    return {
      title: '东方时间文化档案 · 历法查询与传统文化科普',
      path: '/pages/index/index',
    };
  },

  goCulture() { wx.navigateTo({ url: '/pages/culture/culture' }); },
});