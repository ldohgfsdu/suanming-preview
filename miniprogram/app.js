// miniprogram/app.js — app entry
App({
  globalData: {
    appName: '东方时间文化档案',
    // 云开发环境ID。留空时全站自动走本地规则降级路径，功能不中断。
    cloudEnvId: 'cloud1-d5ggz0479e06a5688',
  },

  onLaunch() {
    const env = (this.globalData && this.globalData.cloudEnvId) || '';
    if (!env) {
      console.info('[insight] 未配置 cloudEnvId，使用本地规则降级路径');
      return;
    }
    if (!wx.cloud) {
      console.warn('[insight] 当前基础库不支持云开发，使用本地规则降级路径');
      return;
    }
    try {
      wx.cloud.init({ env, traceUser: false });
      console.info('[insight] 云开发已初始化');
    } catch (e) {
      console.warn('[insight] 云开发初始化失败，使用本地规则降级路径', e);
    }
  },
});