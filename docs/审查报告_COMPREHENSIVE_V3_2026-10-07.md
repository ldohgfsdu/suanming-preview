# Suanming Preview · 全面审查报告 V3（2026-10-07）

> 审查性质：**只读**。未修改任何源码、冻结文档、Core 或治理文档。
> 唯一写操作：本报告落盘。门禁执行会重建 `dist-test/`（已被 `.gitignore` 忽略）。
> 审查范围：仅 `suanming-preview/` 比赛轨；`governance/` 与 PRD/UI-UX/TechArch 仅作契约对照面。
> 审查基准：PRD v1.2 / TechArch v1.0 / HASH_CONTRACT_V1 / S-4 schema 草案 / MEMORY 冻结契约 + 当前代码事实。
> 时间：2026-10-07（CST）　HEAD：`702a142`（main，71 commits）
> 衔接：V1 = `governance/COMPREHENSIVE_REVIEW_V1.md`（09-30 冻结），V2 = `docs/审查报告_COMPREHENSIVE_V2_2026-10-06.md`。

---

## 0. 总览 Verdict

| 维度 | 判定 | 一句话 |
|---|---|---|
| 工程健康 / 门禁 | **PASS（实测）** | node18 跑 `scripts/run-gate.mjs` 全绿：typecheck 0 错、lint 0 错、**TS 28 + mjs 115 = 143/143**，EXIT=0 |
| V2 遗留项闭环 | **PARTIAL（5/8 闭合）** | N1/N5/N6 已闭、N2 半闭；**N3 半闭（动态文案仍有 2 处可见禁词）**、N4/N7/N8 仍 OPEN |
| P0 事实范围 | **PASS** | 纳音/藏干/十神全清，五行仅字面计数，可见层零禁词（静态） |
| 冻结契约符合度 | **FAIL（4 项硬违反）** | 七页 IA、AI 跳 ArchiveDocument、缓存键非 `docHash+promptVer+model`、**AI 超时 65s 违反 PRD「AI 8s 降级」** |
| 安全与合规 | **PARTIAL** | 零密钥 ✓ 前端零密钥 ✓ 但 **动态文案「排盘/预测」2 处会被用户与审核看见** |
| 治理纪律 | **PARTIAL** | 阻断登记表 14 项仍全 OPEN 且 B-1 描述已与现实不符；参赛材料量化声明过期 |

**总体**：门禁与历法内核依旧扎实（143/143，节气±1min、农历/太阳时 golden 全对拍）。V2 提出的 8 项风险**已闭合 3 项、半闭 2 项**。但本轮新发现 **2 项 P0/P1 级问题**：① AI 降级文案仍有可见层禁词（`排盘`/`预测`），审核关键词按字面命中；② AI 超时上限 65 秒，与 PRD 冻结性能红线「AI 8s 降级」相差 8 倍。另有参赛对外材料的量化数字已整体过期。

---

## 1. 门禁实测（工程健康 · PASS，本次亲自执行）

命令：`& "$env:USERPROFILE\.workbuddy\binaries\nodejs\node-v18.20.4-win-x64\node.exe" scripts\run-gate.mjs`

| 环节 | 结果 |
|---|---|
| 版本守卫 | ✅ Node v18.20.4（engines=18.20.4） |
| 隐私字段自检 | ✅ `requiredPrivateInfos: 0`（定位类 API 未启用）、`permission: 1`（相册权限 desc 正确） |
| typecheck | ✅ exit 0 |
| lint | ✅ exit 0 |
| 测试构建 + TS 单测 | ✅ **28/28** |
| mjs 单测 | ✅ **115/115** |
| **合计** | ✅ **143/143，EXIT=0** |

- 计数演进：V1 `107`（09-29）→ V2 `116`（10-06）→ **`143`（10-07，新增 I10–I13 等 27 项）**。
- 环境事实：本 shell 的 PATH **无任何 `node`**；必须用 node18 绝对路径启动门禁。`run-gate.mjs` 会拒绝非 18 主版本启动（设计如此）。此为**环境可用性提示**，非项目缺陷。
- 未触发任何源码写入；`dist-test/` 为构建产物且被忽略。

---

## 2. V2 的 N1–N8 闭环复核（逐条到代码）

| # | V2 风险 | 状态 | 证据 |
|---|---|---|---|
| **N1** | AI 自动触发 | ✅ **CLOSED** | `pages/result/result.js:57` `onLoad` 不再调用解读；生成入口收敛到 `:72 onGenerateInsight`（点按才走）；`result.wxml:72-74` idle 态按钮 + `wx:if/elif` 状态机；回归锁定 `tests` **I10**「onLoad 不得自动调用解读」 |
| **N2** | AI 直收客户端 facts（跳 doc） | ⚠️ **半闭合** | 服务端已加 `validateFacts`：`cloudfunctions/insight/index.js:85`（四柱/五行取值域、payload ≤ 8000 字符）+ `:233-237` 未过校验即拒；测试 **I12/I13** 锁定。**但仍违规**：入参是 `event.facts` 裸事实（`:227`），`docHash` 字段实为**客户端 FNV 缓存键**（`miniprogram/lib/insight.js:245` 传值、`:230-233` 注释自认），服务端**无任何 ArchiveDocument / 契约 hash 核验** → 违反 PRD:154「输入只许 ArchiveDoc + 资料 ID + promptVer」 |
| **N3** | 可见层禁词 7 处 | ⚠️ **半闭合** | 静态 wxml **0 命中**（全量扫描 `.wxml`：预测/排盘/算命/八字/命理/运势/吉凶/纳音 全 0）✅。**但动态渲染文案仍有 2 处**，见 §4.2 / **V3-1**：`lib/insight.js:151`「传统排盘采用真太阳时…」→ 渲染于 `result.wxml:87`；`lib/insight.js:161`「不含预测、判定或建议」→ 渲染于 `result.wxml:91` |
| **N4** | 七页 IA（6 路由） | ❌ **OPEN** | `miniprogram/app.json` 仍 6 条：index/result/about/history/today/terms。缺 **Input** 独立页、缺 **Transparency** 独立页；Archive/Insight/Transparency 三合一压在 `result`；`today/terms` 为越界新增页 |
| **N5** | today 页纳音 | ✅ **CLOSED** | 全仓 `.js/.wxml/.json` 中 `纳音/nayin` 仅剩 `miniprogram/lib/archive.js:6` 的**陈旧注释**（`日柱纳音 (60-cycle)`，表与字段均已删）→ 建议顺手删注释 |
| **N6** | 35 项未提交 | ✅ **CLOSED** | `6ba4c03` 已固化基线；当前仅 **2 个 docs 文件** 未提交（`docs/备选实操包_2026-10-06.md` +1/-1、`docs/备选操作手册_点击级.md` +26） |
| **N7** | 云函数双副本 + 根无 project.config | ❌ **OPEN** | `cloudfunctions/insight/index.js` 与 `miniprogram/cloudfunctions/insight/index.js` SHA256 **完全相同**（`BDA4439C…`）；`miniprogram/project.config.json` 的 `cloudfunctionRoot: "cloudfunctions/"`（相对项目根 → 指向 `miniprogram/cloudfunctions/`），仓库根**无** `project.config.json` → 根副本为架构占位，**改根副本不会被部署**，漂移风险持续 |
| **N8** | 无 consent 勾选 | ❌ **OPEN** | 全域检索 `consent/同意/勾选` 在 `miniprogram/` **零命中**；无 `__usePrivacyCheck__`、无 `onNeedPrivacyAuthorization`、无 `wx.requirePrivacyAuthorize`。契约依据：`governance/S4_ARCHIVE_DOCUMENT_SCHEMA_v1_DRAFT.md:113`「`consent:true` 才生成/调 AI」 |

**闭环统计：3 全闭（N1/N5/N6）+ 2 半闭（N2/N3）+ 3 OPEN（N4/N7/N8）。**

---

## 3. 冻结契约逐项对照

| 契约（来源） | 实测 | 判定 |
|---|---|:---:|
| 七页 IA 不得增减（PRD:27/136/297） | 6 路由，缺 Input/Transparency，today/terms 越界 | ❌ |
| P0 事实限 6 类，藏干/十神/纳音/星座等不入 P0 | 全仓可见层零命中；五行仅 `literal_count`（`lib/insight.js:62`） | ✅ |
| `ArchiveInput → ArchiveDocument → AIInsight`，跳 doc 即违规（PRD:154） | 云函数只收 `event.facts`（`cf:227`），无 doc 落库、无 hash 核验 | ❌ |
| insight 缓存键 = `docHash + promptVer + model`（PRD:170） | `insightCacheKey` = facts 的 FNV 变体（`lib/insight.js:75-86`），键不含 promptVer/model；本地缓存只存 `sections/limitations`（`result.js:30-39`） | ❌ |
| Guard 失败重试**恰 1 次**后 `fallback:true`（PRD:154） | `cf:242` `for (attempt<2)` → `:275` fallback:true；客户端二次 Guard `lib/insight.js:167` | ✅ |
| Guard 必检 schema/hash/数值未改/evidence/禁词/完整性（PRD:154） | 有 schema/evidence/禁词/invented_ganzhi（`cf:156-180`）；**hash 与「数值未改」无实现**（无 doc 可比对） | ⚠️ |
| 目录单向依赖 `miniprogram→shared`、`cloudfunctions→engine\|insight→shared` | **形式 ✅**（无任何违规 import）；**实质 ❌**：`engine/` 仅 `lib/types.ts` 1 文件、`insight/` 空目录 0 文件（且 git 未跟踪）、`shared/` 仅测试与 `scripts/crosscheck.mjs` 引用，**生产链路零使用** | ❌ |
| 计算范围 1900-01-31 ~ 2100 | 测试 #65-70：1900-01-01/2100-12-31 可算，1899/2101 抛错 | ✅ |
| `_openid` 隔离 / 注销即删 / 级联删除 insights | 无云数据库调用（全仓 `cloud.database|collection(` 零命中）；`history.js:20` 仅 `wx.getStorageSync` | ❌ |
| **性能：Engine P95 <3s、AI 8s 降级、首屏 <1.5s（PRD:170/289）** | `result.js:9` `INSIGHT_TIMEOUT_MS = 65000`；`cf config.json` `timeout: 60` → **AI 侧最坏 65 秒才降级**；首屏与 Engine P95 本轮未实测 | ❌ **（V3 新发现）** |
| golden 对拍 100% | 143/143 含 ST1-5、A1-A18、ZI/TA/DG/CD 矩阵 | ✅ |

---

## 4. 安全与合规专项

### 4.1 密钥与敏感信息

- ✅ 全仓扫描 `sk-*` / `api[_-]?key` / `appsecret` / `aes[_-]?key` / `BEGIN PRIVATE KEY` / `password=`：**零命中**（唯一命中是 V1 报告里描述扫描规则的行）。
- ✅ **前端零密钥**：云函数用 `@cloudbase/node-sdk` 的 `ai.createModel`，凭据由云环境托管（`cf:18-31`）；模型 id 走 `process.env.INSIGHT_MODEL || 'deepseek-v4-flash'`。
- ⚠️ 硬编码**非密钥**标识：`miniprogram/app.js:6` `cloudEnvId: 'cloud1-d5ggz0479e06a5688'`、`miniprogram/project.config.json:5` `appid: wxd58dc3b769e05f93` → 提报时须与此完全一致（V2 记录的 AppID 切换已在 `6ba4c03` 提交固化 ✅）。
- ✅ `.gitignore` 覆盖 `.env*`、`**/appid*.json`、`*.pem`、`*.key`、`project.private.config.json`、`dist-test/`、`.tmp/`。

### 4.2 禁词与内容安全（**本轮最重发现**）

| 层 | 扫描结果 |
|---|---|
| wxml 静态可见层 | ✅ **0 命中**（预测/排盘/算命/八字/命理/运势/吉凶/纳音/大运/合婚/择日/开运/改命） |
| 页面 js 可见字符串 | ✅ 仅 `terms.js:3` 注释 |
| **lib 动态模板文案（会被渲染）** | ❌ **2 处**，见下 |
| 云函数 fallback 文案 | ⚠️ `cf:282` `['不含预测与判定']` —— 该分支 sections 为空，会落到 `result.wxml:94-98` 的 else 文案，**limitations 不渲染**，暂不外显 |
| 代码注释 / Guard 词表 / prompt | ✅ 非可见层，语义豁免（D-001 §3） |

**两处会真实显示给用户与审核的文案：**

1. `miniprogram/lib/insight.js:151` → `content: "…传统**排盘**采用真太阳时，故与钟表时间可能不同。"` → 渲染于 `result.wxml:87`
2. `miniprogram/lib/insight.js:161` → `limitations: ['仅解释客观历法事实', '不含**预测**、判定或建议', '云端 AI 未启用时使用本地规则文本']` → 渲染于 `result.wxml:91`

**触发条件**：本地规则降级路径 —— 云未初始化 / 模型未开通 / 额度不足 / 65s 超时 / Guard 拦截，**任一命中即渲染**。审核人员在无云环境或未开通 AI 的账号上点「生成历法文化解读」**必然看到**这两句。

**加重因素（防护也失效）**：
- `BANNED_WORDS`（`lib/insight.js:22-29` 与 `cf` 同口径）**不含「预测」「排盘」**；
- 服务端 `guard()` 只拼 `sections` 的 title+content 做禁词扫描（`cf:159-164`），**不扫描 `limitations`**；
- 客户端 `validateInsight` 同样只扫 sections 文本（`lib/insight.js:173-176`）。

**判定：V2 的 N3 未真正闭环。** 本仓库自己的既往教训（MEMORY）与 `作品说明.md:170` 都写明「内容安全按关键词命中，**否定句式同样违规**」——当前两处正是该模式。

### 4.3 隐私与权限

- ✅ `app.json` `permission["scope.writePhotosAlbum"].desc` 正确；`requiredPrivateInfos` 已按 `8b6f044` 正确移除（该字段只接受 8 个定位类 API）。
- ❌ **无隐私协议授权处理**：无 `__usePrivacyCheck__`、无 `onNeedPrivacyAuthorization`/`wx.requirePrivacyAuthorize`。基础库 3.6.2 下相册写入属隐私接口，**平台侧未配置「用户隐私保护指引」或端侧未做授权弹窗会导致真机调用失败/审核驳回**（属平台侧 + 端侧双查项）。
- ❌ **无 consent 勾选**（见 N8）：输入页没有任何「已阅读并同意」控件，与 S-4 schema `consent:true 才生成/调 AI` 的协议层要求不符。

---

## 5. 工程卫生

| 项 | 实测 | 判定 |
|---|---|:---:|
| git 状态 | `main` @ `702a142`，71 commits，remote → `github.com/ldohgfsdu/suanming-preview.git`；仅 2 个 docs 未提交 | ✅ |
| 主包体积 | **452 KB**（不含云函数）/ 465 KB（含）；云函数 12 KB | ✅ 远低于 2MB |
| **参赛材料量化声明** | `作品说明.md:4` HEAD `e046ce9`（67 commits）、`:150/:217` **116/116**、`:89/:155` **559 KB**；`提报操作单.md:110` 同三项；`参赛申报操作手册.md:19` 与 `报名自查清单.md:12` **114/114** | ❌ **全部过期**（实际 143/143、71 commits、452 KB、HEAD `702a142`） |
| 五目录声明 | `README.md:7` 称承载五目录；`insight/` **0 文件且 git 未跟踪**（空目录不入库）、`engine/` 仅 1 文件 | ⚠️ 文档与实现漂移 |
| README 门禁数字 | `README.md:55-56` 仍停在 107/107 与 63 commits | ⚠️ 滞后 |
| 忽略规则 | `dist-test/ .tmp/ kotlin-ref/out/ node_modules/ project.private.config.json` 全部 `!!` 忽略 | ✅ |
| CI | `.github/workflows/ci.yml` 定义完整（Node 18.20.4 + TZ=UTC + LANG=C.UTF-8 + build:check + test:unit）；**云端是否真跑通无本地证据** | ⚠️ |
| 测试与源码同步 | 门禁内含 `_clean-dist` + 重编译，`dist-test` 每次重建 | ✅ |

> 体积口径说明：`作品说明` 自称 559 KB 无法在当前工作树复现（三口径实测 452/465 KB）。差异可能源于 DevTools 打包口径，**提交前须用工具实测值刷新**，否则与「防初审打脸」（`493c2e4`）目标自相矛盾。

---

## 6. 治理纪律

| 项 | 状态 |
|---|---|
| 阻断登记表 `governance/PHASE0_BLOCKER_REGISTER.md` | 文件头仍写「**全部 14 项初始化为 OPEN**」，且 B-1 描述（微信开发者工具未装 / Node 22 / TS 未装）**已与现实不符**（工具链已落地、门禁 node18 可跑）→ 登记表**状态失真**，需一次性刷新或标注「以证据为准」 |
| B-2 / B-3 / B-6、S-1…S-9 | 仍 OPEN；D-002 anchor 绑定修正、Room `v11→v12` 漂移**承接 10-04 报告待裁决**，本轮无新进展 |
| 门禁-功能顺序 | 「先功能后门禁」争议延续：功能已到 AI 云链路 + 参赛材料，而 Day 8 协议评审等门禁无关闭证据（V1/V2 已记录，需主人裁决为 Gate breach 或顺延） |
| D-005 双轨分离 | `engine/` 迁移第一动作（`miniprogram/lib → engine/` 边界设计）**仍未开始**；`miniprogram/lib` 现 14 文件 ~1660 行，赛后移植退化为重写的风险进一步放大 |
| 未提交项 | 仅 2 个 docs（属工作记录，非代码），建议随手提交避免与提报版本混淆 |

---

## 7. 新增风险（本报告首发现，V2 未覆盖）

| # | 风险 | 等级 | 证据 / 说明 |
|---|---|---|---|
| **V3-1** | **动态文案可见层禁词 2 处**（`排盘`/`预测`），Guard 词表不含二者且不扫 limitations | **P0（提审红线）** | `lib/insight.js:151/:161` → `result.wxml:87/:91`；降级路径必现 |
| **V3-2** | **AI 超时 65s 违反 PRD 冻结红线「AI 8s 降级」**（差 8 倍），用户最长白等 65 秒 | **P1（契约+体验）** | `result.js:9` = 65000；`cf config.json` timeout 60；PRD:170/289 |
| **V3-3** | 参赛对外材料量化声明整体过期（116/116、114/114、67 commits、559 KB、HEAD `e046ce9`） | **P1（提审可信度）** | `作品说明.md:4/89/150/154/155/217`、`提报操作单.md:110`、`参赛申报操作手册.md:19`、`报名自查清单.md:12` |
| **V3-4** | `作品说明.md:170` 自称「**连否定句式也不出现禁用词**」，与自身 `:14/:106/:115` 及小程序动态文案直接矛盾 | **P2（材料自洽）** | 逐条见 §4.2 |
| **V3-5** | 云函数双副本 + 根目录无 `project.config.json`，改根副本不会部署（现 SHA 一致，漂移风险） | P2 | §2 N7 |
| **V3-6** | consent 缺失（S-4 要求 `consent:true` 才生成/调 AI） | P2 | §2 N8 |
| **V3-7** | 无隐私协议授权处理（端侧 + 平台侧双缺），相册接口真机/审核风险 | P1（真机/提审） | §4.3 |
| **V3-8** | `engine/` 1 文件、`insight/` 0 文件、`shared/` 生产零使用 —— 架构空壳化较 V2 无变化，D-005 移植障碍加剧 | P1（架构） | §3 目录行 |
| **V3-9** | 阻断登记表状态失真（B-1 描述过期、14 项恒 OPEN） | P2 | §6 |
| **V3-10** | `archive.js:6` 陈旧注释仍写「日柱纳音」 | P3 | 代码清理项 |

---

## 8. 单一可执行下一步

**只做一件事：修 V3-1（动态禁词），一次改动同时封掉 Guard 与文案两端。**

具体三步（局部、零回归风险、门禁可立即验证）：

1. `miniprogram/lib/insight.js:151`：「传统排盘采用真太阳时」→ 改为不出现禁词的表述，如「传统历法换算采用真太阳时」；
2. `miniprogram/lib/insight.js:161`：「不含预测、判定或建议」→ 改为「不含任何判定或建议」（去掉「预测」二字本身）；
3. `lib/insight.js:22-29` 的 `BANNED_WORDS` **补入 `预测`、`排盘`**，并让客户端 `validateInsight` 与云函数 `guard()` 的扫描范围**把 `limitations` 一并纳入**（`lib/insight.js:173-176`、`cf:159-164`），使新增用例可被 I3 类零禁词测试锁死。

完成后跑 `node scripts/run-gate.mjs` 应仍为 143/143（或新增断言后更多）。**顺手项（同一次提交可选）**：删 `archive.js:6` 陈旧纳音注释、提交那 2 个 docs。

**为什么它排第一**：V3-1 是唯一「审核必然看到、且项目自己已把该模式定性为违规」的问题；V3-2/V3-3 次之但涉及契约与材料刷新，可在 V3-1 落地后按顺序处理。

---

## 9. 方法与证据索引

- 门禁：`node18 scripts/run-gate.mjs`（本次实测，未引用旧结论）。
- 禁词：对 `miniprogram/**/*.wxml|js|json|wxss` 分层正则扫描；动态文案回溯到 `result.wxml` 绑定点确认是否真实渲染。
- 契约：逐条对照 PRD:27/136/154/170/289/297、`HASH_CONTRACT_V1`、`S4_ARCHIVE_DOCUMENT_SCHEMA_v1_DRAFT:113`。
- 密钥/隐私：模式扫描 + `scripts/check-appjson-privacy.mjs`（门禁内置）。
- git/体积：`git status/log/ls-files`、按目录三口径字节统计。

*—— 全面审查报告 V3 · 2026-10-07 · 只读产出，未改动任何工程源码 ——*
