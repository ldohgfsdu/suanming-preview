/**
 * types/wechat.d.ts
 * ---------------------------------------------------------------------------
 * 微信小程序运行时全局声明（仅供 TS 检查 miniprogram/ 下的 .js 使用）。
 *
 * 为什么单独一个文件：
 *   仓库的 `tsconfig.mini.json` 用 allowJs + checkJs 覆盖 miniprogram/ 下
 *   3747 行生产 JS。缺了这些全局声明，tsc 会报出 63 个 TS2304
 *   （Cannot find name 'wx' / 'Page' / 'App' / …），把真正的类型错误淹掉。
 *
 * 声明范围：只列 miniprogram/ 实际调用到的 18 个 wx API + 4 个页面全局。
 * **刻意不做索引签名** —— `wx.getLocatoin` 这类拼写错误必须报错，
 * 而不是被 `[key: string]: any` 静默放过。新增 API 时请在这里补签名，
 * 那时 tsc 会明确告诉你缺了哪一个。
 *
 * 精度说明：这里是「够用的最小签名」，不是完整微信类型库。
 * 回调参数用 any（后续可按调用点逐个收紧）。
 */

interface WxShowModalOpts {
  title?: string
  content?: string
  showCancel?: boolean
  cancelText?: string
  cancelColor?: string
  confirmText?: string
  confirmColor?: string
  success?: (res: { confirm: boolean; cancel: boolean }) => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxShowToastOpts {
  title: string
  icon?: 'success' | 'loading' | 'none' | 'error'
  image?: string
  duration?: number
  mask?: boolean
  success?: () => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxShowActionSheetOpts {
  itemList: string[]
  title?: string
  itemColor?: string
  success?: (res: { tapIndex: number }) => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxEventChannel {
  on(eventName: string, cb: (payload: unknown) => void): void
  emit(eventName: string, payload: unknown): void
  off(eventName: string, cb?: (payload: unknown) => void): void
}

interface WxNavigateToOpts {
  url: string
  events?: Record<string, (payload: unknown) => void>
  success?: (res: { eventChannel: WxEventChannel }) => void
  fail?: (err: { errMsg?: string }) => void
  complete?: () => void
}

interface WxNavigateBackOpts {
  delta?: number
  success?: () => void
  fail?: (err: { errMsg?: string }) => void
}

/** redirectTo 与 navigateTo 参数同构（官方类型库即复用 WxNavigateToOpts）。
 *  科普详情页的「关联概念」跳转用它替换当前页，避免返回栈无限堆叠。 */
interface WxRedirectToOpts extends WxNavigateToOpts {}

interface WxReLaunchOpts {
  url: string
  success?: () => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxCanvasToTempFilePathOpts {
  canvasId: string
  x?: number
  y?: number
  width?: number
  height?: number
  destWidth?: number
  destHeight?: number
  fileType?: 'png' | 'jpg'
  quality?: number
  success?: (res: { tempFilePath: string }) => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxSaveImageToPhotosAlbumOpts {
  filePath: string
  success?: () => void
  fail?: (err: { errMsg?: string }) => void
}

interface WxCallFunctionOpts {
  name: string
  data?: unknown
  success?: (res: { result: unknown }) => void
  fail?: (err: { errMsg?: string }) => void
}

/**
 * insight 云函数的响应体（cloudfunctions/insight/index.js 的 jsonReply 契约）。
 * 客户端在 lib/insight.js:288 的 success 回调里按这个形状取值。
 */
interface WxCallFunctionResult {
  ok: boolean
  insight?: {
    outputVersion: string
    docHash: string
    model: string
    promptVer: string
    sections: Array<{
      id: string
      title: string
      contentType: string
      content: string
      evidenceIds: string[]
    }>
    limitations: string[]
    fallback?: boolean
    reason?: string
    cacheHit?: boolean
  }
  reason?: string
}

interface WxCloudCallFunctionOpts {
  name: string
  data?: unknown
  success?: (res: { result: WxCallFunctionResult }) => void
  fail?: (err: { errMsg?: string }) => void
}

/** 2D canvas 上下文：方法面很大，这里按本项目实际用到的收窄。 */
interface WxCanvasContext {
  setFillStyle(color: string): void
  setStrokeStyle(color: string): void
  setLineWidth(width: number): void
  setFontSize(size: number): void
  setTextAlign(align: 'left' | 'center' | 'right'): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  draw(reserve?: boolean, cb?: () => void): void
}

interface WxSystemInfo {
  theme?: 'light' | 'dark'
  SDKVersion?: string
  version?: string
  platform?: string
  windowWidth?: number
  windowHeight?: number
}

interface WxCloud {
  init(opts: { env?: string; traceUser?: boolean; timeout?: number }): void
  callFunction(opts: WxCloudCallFunctionOpts): void
}

interface WxStatic {
  cloud: WxCloud
  showModal(opts: WxShowModalOpts): void
  showToast(opts: WxShowToastOpts): void
  showActionSheet(opts: WxShowActionSheetOpts): void
  navigateTo(opts: WxNavigateToOpts): void
  navigateBack(opts?: WxNavigateBackOpts): void
  redirectTo(opts: WxRedirectToOpts): void
  reLaunch(opts: WxReLaunchOpts): void
  /**
   * 与微信官方类型库一致返回 any：storage 里存的是历史记录数组，
   * 调用点各自用 `|| []` 兜底。
   */
  getStorageSync(key: string): any
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  createCanvasContext(canvasId: string, self?: unknown): WxCanvasContext
  canvasToTempFilePath(opts: WxCanvasToTempFilePathOpts): void
  saveImageToPhotosAlbum(opts: WxSaveImageToPhotosAlbumOpts): void
  setNavigationBarTitle(opts: { title: string }): void
  getSystemInfoSync(): WxSystemInfo
  stopPullDownRefresh(): void
}

declare const wx: WxStatic

/**
 * `Page()` / `App()` 等的配置对象。
 *
 * 刻意用 `any`：微信在运行时把这些对象的方法挂到页面实例上，并向其中注入
 * `this`（含 data、全部生命周期、全部事件回调、页面自定义方法）。精确描述
 * 需要完整的微信类型库；一旦给参数类型，`this` 就不再是 `any`，
 * 页面里的 `this.data.xxx` / `this.foo()` 会全部变成 `unknown`——
 * 实测多出 200+ 个 TS2571，把真正的类型问题淹掉。
 *
 * 该文件的 ESLint 例外在 eslint.config.mjs 的 `types/**\/*.d.ts` 条目里登记。
 */
type WxPageOptions = any

interface WxPageInstance {
  setData(
    data: Record<string, unknown>,
    callback?: () => void,
  ): void
  /** 页面 data；页面内通过 this 访问，这里只描述 getCurrentPages() 拿到的实例。 */
  data: Record<string, unknown>
  /** pages/today 提供：把「今日」回填到上一页（首页）。 */
  applyToday?(solar: string): void
  /** pages/index 提供：把历史档案的完整输入快照回填到首页表单。 */
  applyHistory?(record: any): void
}

declare function App(options: WxPageOptions): void
declare function Page(options: WxPageOptions): void
declare function Component(options: WxPageOptions): void
declare function Behavior(options: WxPageOptions): void
declare function getApp(): {
  globalData: Record<string, unknown>
}
declare function getCurrentPages(): WxPageInstance[]
