# Suanming Preview · 全面审查报告 V4（2026-10-08）

> 性质：V3 后的修复闭环审查。
> 分支：`fix/v4-closure`。
> 基线：由 `main@67b79c49ac33addde378a9849a9689e4fbcf31d1` 开始修复。
> 验证：GitHub Actions canonical gate；源码修改后曾在 `9945bf9` 基线上完成一次 **158/158** 全绿，随后仅继续更新文档并要求再次走同一门禁。
> 原则：本报告区分“已修复”“已缓解”“仍未闭合”，不把仓库里存在但未接入生产的能力写成已完成。

---

## 0. Verdict

V4 把 V3 中最危险的一批“仓库里有能力、生产链却没走”的问题真正接入了运行路径：历史中国夏时制、AI 鉴权/事实校验、版本化缓存、月龄绝对瞬间、历史输入恢复、今日时区语义、CI/隐私门禁均已修复或显著加固。

当前项目可判定为：

> **比赛候选版 / 高完成度 Beta：核心门禁全绿，可进入微信开发者工具 + 真机终验；仍不应宣称完整冻结 ArchiveDocument 链、全局分布式 AI 限流、真实区县级坐标已经完成。**

| 维度 | V4 判定 | 说明 |
|---|---|---|
| 工程门禁 | **PASS** | canonical gate：typecheck 0、lint 0、TS 28/28、mjs 130/130，共 158/158 |
| 历法核心 | **PASS_WITH_BOUNDARIES** | DST 已接生产；月龄按出生瞬间；UTC minute carry 修复；既有节气/农历/日界回归保持全绿 |
| AI 安全 | **PARTIAL→显著改善** | OPENID、严格 schema、服务端 SHA-256、Guard、版本化服务端缓存、单实例配额均落地；全局配额仍未落地 |
| 架构契约 | **PARTIAL** | 客户端不再伪造 docHash，但完整冻结 ArchiveDocument/docHash 生产链仍未闭合 |
| 地点精度 | **HONEST_DEGRADE** | 不再声称区县精确坐标；明确披露地级行政中心近似，支持手动经度 |
| 历史可复现 | **PASS** | v2 保存完整输入快照并恢复地点/经度/时间/DST fold 选择；v1 可迁移 |
| 今日天时语义 | **PASS** | 日期、当前时间、日出日落统一北京口径 |
| CI / 隐私检查 | **PASS** | CI 与本地共用唯一 gate；隐私脚本递归扫描生产源码真实 API 调用 |
| 真机 / 微信开发者工具 E2E | **OPEN** | 仍需提交前人工终验，不用单元测试冒充真机验收 |

---

## 1. V4 已修复项

### 1.1 1986–1991 中国夏时制从“测试能力”变为“生产能力”

新增 `miniprogram/lib/civilTime.js`，把用户输入的历史墙钟时间先解析为绝对瞬间，再统一换算为标准北京时间，随后才进入 `computeArchive()`。

生产交互规则：

- DAYLIGHT：自动退回 1 小时到标准北京时间；
- GAP：拨快缺口中的不存在时间直接拒绝，要求用户修改；
- FOLD：拨回重复小时必须由用户明确选择“第一次（夏令时）/第二次（标准时）”；
- 日期可随换算跨到前一日，日期与时间一起归一，不能只减 1 小时而不改日历日。

新增 `civil-time.test.mjs` 锁定 5 类路径，包括 1990-06-15 12:00 夏令时钟面 → 标准北京时间 11:00，以及 00:30 回退跨日前一日。

### 1.2 月相月龄改按实际出生瞬间

旧实现用固定历日 `jd` 计算月龄，同一天 00:00 与 20:00 得到相同月龄。V4 改为使用出生绝对瞬间 `wallJde`。

新增回归：同日 00:00 与 20:00 的月龄差约 0.8333 天；时辰未知时明确采用当日北京时间午正代表时刻。

### 1.3 UTC 格式化分钟进位修复

旧 `isoUtc()` 分别 `floor(hour)`、`round(minute)`，理论上可输出非法 `12:60:00Z`。

V4 改成将 JDE 统一换算成 Unix 分钟后整体四舍五入，再交给 UTC Date 做日期/小时进位；回归锁定 23:59:40 → 次日 00:00。

### 1.4 地点“假区县精度”改为诚实降级

当前 `place.js` 的区县是名称层级，计算坐标实质为所属地级行政中心坐标。V4 不再让 UI/材料暗示“选择区县即得到区县级经纬度”：

- 首页动态提示明确“计算坐标按所属地级行政中心近似”；
- 结果页坐标加“地级行政中心近似”；
- “为什么需要出生地点”说明中明确近似边界；
- 临界时刻用户可在高级设置手动填写更准确经度。

**本项是 HONEST_DEGRADE，不是区县坐标升级。** 真正的区县级坐标仍属后续任务。

### 1.5 历史档案 v2 可复现

历史记录现在保存完整输入快照：

- 公历/农历模式；
- 农历选择；
- 出生时分 / 未知状态；
- 性别；
- 地点省市区；
- 手动经度；
- DST FOLD 的 earlier/later 选择。

“重新生成”会恢复完整输入，而不是只恢复日期/性别/时间。v1 历史仍可读；发生新写操作后迁移到 v2。

### 1.6 “今日天时”统一北京口径

旧实现用设备本地 `new Date()` 取日期/当前时间，却固定用北京坐标算日出日落，海外设备会形成语义混合。

V4 统一：

- 今日日期：北京时间；
- 当前时间：北京时间；
- 日出日落：北京坐标；
- UI 显式写“北京口径 / 北京时间 / 日出（北京）”。

---

## 2. AI 安全与契约闭环

### 2.1 已完成

云函数 `insight` 现要求微信上下文中存在 `OPENID`，否则 fail-closed 返回 `unauthenticated`。

入参事实采用严格白名单 schema：

- 顶层只允许 `pillars / solarTerm / solarTime / lunar / wuxing`；
- 柱名、干支、五行均做白名单与形状检查；
- 五行固定 5 项、唯一名称、整数计数；
- 拒绝未知字段；
- payload 有 8000 字符上限。

客户端已经停止上传本地 FNV 缓存键冒充 `docHash`。服务端对规范化 `{schemaVersion, facts}` 计算 SHA-256 指纹，并以：

```text
docHash + promptVer + model + outputVersion
```

构成服务端缓存键。

客户端持久 AI 缓存已改为仅当前小程序会话缓存，避免模型切换后跨会话继续读旧结果；跨会话复用交给知道真实 `model` 的服务端缓存。

Output Guard 现在至少检查：

- sections/limitations 结构；
- section ID；
- `FACT | CULTURAL_CONTEXT`；
- 长度；
- 禁词；
- evidenceId 严格白名单；
- FACT 小节必须包含对应输入事实；
- 输出中出现的干支不得超出输入事实。

Guard 失败仍只重试恰好 1 次。

### 2.2 限流现状：只能判“第一层保护已落地”

服务端按 OPENID 提供默认：

- 6 次/分钟；
- 40 次/日；
- 服务端结果缓存默认 24 小时、128 条。

但 RATE/CACHE 当前为云函数实例内存 Map。CloudBase 可横向扩容，因此它**不是跨实例全局强配额**。

结论：

> 比赛演示与轻流量场景已经比 V3 安全得多；正式公开大流量上线前，必须把配额/去重下沉到 CloudBase 数据库、Redis 类服务或 API Gateway 全局限流层。

### 2.3 完整 ArchiveDocument 冻结契约仍未闭合

`shared/domain/archiveDocument.ts` 已存在完整 inputHash/docHash scope，但当前生产 AI 服务端 hash 只覆盖 AI 所需 facts 文档，并不是冻结 S-4 `ArchiveDocument` 的 19-key docHash。

所以 V4 的正确描述是：

> “客户端伪 docHash 已消除；服务端拥有可信 SHA-256 AI 事实文档指纹。”

不能写成：

> “冻结 ArchiveDocument/docHash 全链已经完成。”

---

## 3. CI / 门禁收口

### 3.1 唯一真值源

GitHub Actions 现在执行：

```bash
npm ci
npm run gate
```

而 `scripts/run-gate.mjs` 同时支持 Windows 与 Linux，不再写死 `node.exe`。

完整顺序：

```text
版本守卫
→ 隐私字段自检
→ typecheck
→ lint
→ 测试构建
→ 测试编译
→ TS tests
→ mjs tests
```

### 3.2 隐私门禁不再只搜 app.json

`check-appjson-privacy.mjs` 现在递归扫描生产源码：

```text
miniprogram/**/*.{js,ts,wxs}
```

并匹配真实 `wx.<locationApi>(...)` 调用；若源码调用但 `requiredPrivateInfos` 未声明则直接失败。

### 3.3 ESLint 环境收紧

小程序前端不再整体继承 Node globals。这样 `process` / `Buffer` 一类 Node-only API 如果误入前端，更容易在 lint 阶段被发现。

### 3.4 V4 门禁实测

在修复源码基线上，GitHub Actions canonical gate：

```text
Node 18.20.4        PASS
privacy self-check  PASS
TypeScript          PASS
ESLint              PASS
TS tests            28/28
mjs tests           130/130
TOTAL                158/158
```

mjs 130 项中包含新增的 DST 生产归一、真实出生瞬间月龄、ISO rollover、AI server contract/security 回归。

---

## 4. 文档与对外口径修正

V3 之后最重要的治理修正不是继续增加“看起来厉害”的数字，而是删掉无法被当前代码支持的说法。

V4 对外必须使用以下口径：

| 事项 | 可以说 | 不可以说 |
|---|---|---|
| 区县 | 覆盖区县名称选择；计算坐标为所属地级行政中心近似；可手动经度 | 3030 区县精确经纬度 |
| DST | 1986–1991 已接生产；GAP 拒绝；FOLD 显式选择 | 仅凭 `chinadst.js` 单测就说主链已支持 |
| AI doc hash | 服务端对 AI 事实文档做 SHA-256 | 完整冻结 ArchiveDocument/docHash 已闭环 |
| AI 限流 | OPENID + 单实例 6/min、40/day 第一层保护 | 全局分布式强限流 |
| AI 缓存 | 服务端按文档指纹+prompt+model+outputVersion 缓存 | 客户端 FNV 是 docHash |
| 测试 | canonical gate 158/158 | 单元测试等同微信真机 E2E |
| 今日天时 | 北京时间 + 北京坐标统一口径 | 自动代表用户本地天时 |

---

## 5. 仍需继续处理的 P1/P2

### P1-1 完整 ArchiveDocument 生产接线

目标仍应是：

```text
ArchiveInput
→ ArchiveDocument
→ frozen input_hash/doc_hash
→ AIInsight
```

而不是继续扩大 facts-only 协议。

### P1-2 全局 AI 配额

公开上线前将请求计数和去重键持久化，确保多实例下配额一致。

### P1-3 云函数物理单源

现在根目录与 `miniprogram/cloudfunctions/insight` 仍是双副本，测试强制完全相同；长期应只保留一个源码真值源，再通过部署/同步步骤消费。

### P1-4 真机 / 微信开发者工具 E2E

至少完成：

```text
首页
→ 普通日期生成
→ DST DAYLIGHT
→ DST GAP
→ DST FOLD 两分支
→ 真太阳时跨时辰/跨日 modal
→ result
→ AI 成功 / 8s fallback / 服务端 fallback
→ 保存相册授权
→ history 删除/清空/重新生成
→ 深色模式
→ 返回栈
```

### P2-1 真实区县坐标

若后续仍希望区县作为精度输入，应引入经过来源审计的区县 centroid/行政驻地坐标，并把“名称层级”和“计算坐标层级”分离为明确 schema。

### P2-2 云函数 runtime 升级

仓库工具链是 Node 18.20.4，CloudBase 配置仍为 Nodejs16.13。只有在确认平台 runtime 和当前 SDK 兼容后再升级，不凭印象修改。

---

## 6. 最终结论

V4 已经把项目从“高完成度但存在若干隐蔽假绿”的状态推进到“可以进入比赛提交前终验”的状态。

最重要的变化不是测试从 145 增到 158，而是以下事实现在真正成立：

1. 历史中国夏时制进入了真实生成链；
2. AI 不能再匿名直接吃任意裸 facts；
3. 客户端不再把本地缓存键伪装成 docHash；
4. 地点精度不再通过区县 UI 制造虚假的精确感；
5. 月龄使用实际出生瞬间；
6. 历史重新生成能恢复原始输入；
7. CI / 隐私检查终于与真实生产源码共享一个门禁真值源。

仍然必须保留的边界是：**完整 ArchiveDocument、全局分布式限流、物理单源云函数、真实区县坐标和真机 E2E 尚未闭合。**

因此 V4 建议状态：

> **APPROVED FOR FINAL DEVICE QA — NOT YET APPROVED FOR UNREVIEWED MERGE / PUBLIC PRODUCTION.**
