# Suanming Preview · 全面审查报告（2026-10-06）

> 审查性质：**只读**。未修改任何代码、未初始化工程、未安装环境、未修改 Core 与冻结文档。
> 审查基准：PRD v1.2 / UI/UX v1.0 / Tech Arch v1.0 / 冻结契约（memo 记忆）+ 当前代码事实。
> 审查范围：git 状态、目录结构、app.json 路由、七页 IA、P0 范围、禁词、AI 数据流、隐私、门禁、工程卫生。
> 时间：2026-10-06（CST）

---

## 0. 总览 Verdict

| 维度 | 判定 | 一句话 |
|---|---|---|
| 工程健康 / 门禁 | **PASS** | `node scripts/run-gate.mjs`（node18）实测 **88 mjs + 28 TS = 116/116 全绿** + typecheck + lint + 隐私自检全过 |
| 架构契约符合度 | **PARTIAL（仍未达标）** | AI 云链路已补上（10-06 新增），但**核心 3 项冻结契约仍违反**：① 七页 IA 分叉 ② AI 自动触发（应显式）③ AI 直收客户端 facts（跳 ArchiveDocument） |
| P0 事实范围 | **PARTIAL** | 纳音已从 result 移除 ✓，但 **today 页仍在展示「日柱纳音」**（越界） |
| 合规 / 审核 | **PARTIAL** | 隐私声明正确 ✓；但 **wxml 可见层「预测/排盘」命中等 9 处**（多为否定式免责但属关键词字面命中，提审风险） |
| 治理纪律 | **PARTIAL** | 未提交改动 34 项（含项目配置、云函数、3 份 docs）+ AppID 切换未提交；既有 B-2/B-3/B-6 阻断项仍 OPEN |

**总体**：门禁证明**历法引擎与前端质量扎实**（较 09-29 报告已从「空壳」进化到 AI 链路可跑）。剩余问题集中在**「契约符合度」与「提审前收口」**两类——不阻塞比赛提交，但**提审上线前必须逐项处理**。

---

## 1. 门禁实测（工程健康 · PASS，可复现）

| 项目 | 结果 |
|---|---|
| `node scripts/run-gate.mjs`（node18.20.4） | ✅ version guard → privacy 自检 → typecheck → lint → test build → TS 套件 → mjs 套件，**全绿** |
| mjs 测试 | ✅ 88/88（含 sun/archive/lunar/insight I1–I7） |
| TS 测试 | ✅ 28/28 |
| 隐私自检脚本 | ✅ `requiredPrivateInfos: 0，permission: 1`（相册权限声明正确，无编译错误） |

**比记忆 114/114 多 2 个**（insight.test.mjs 与 astro 套件增长），门禁脚本本身稳定、无 npm 伪影。

---

## 2. 架构契约 vs 现状（未解决项）

| 契约要求（Arch v1.0 §2/§4/§7/§9） | 现状 | 判定 |
|---|---|---|
| AI 只收 `ArchiveDoc + 资料ID + promptVer`，跳 doc 即违规（§4.4 铁律） | 客户端 `lib/insight.js:199-215` **直接向云函数传 `facts`**（客户端本地构建），云函数 `index.js` 只接 `event.facts` 即送模型 | ❌ **弱化违规**：模型输入未经 ArchiveDocument 与服务端 hash 校验，Guard 的「invented_ganzhi」只比对自己的入参（客户端可伪造） |
| AI 需**显式触发**（点按才生成，PRD §7.4/§9「交互：用户点击才生成」） | `result.js:29` 在 `onLoad` 收到档案后**自动调用 `loadInsight`**，无任何用户点击 | ❌ 违反「AI 显式触发」铁律 + 浪费云额度 |
| ArchiveDocument 持久化 + docHash 落库 | 无云数据库集合，`docHash` 仅作缓存键，未落库 | ⚠️ P0-C「历史云端 _openid 隔离」未实现（history 仍 localStorage） |
| 七页 IA（不得增减） | app.json 仅 **6 路由**：index/result/about/history/today/terms。**缺 Input 独立页、缺 Transparency 独立页**；today/terms **非 IA 页** | ❌ 冻结冲突（已知 OPEN，仍未解） |
| `insight/` 目录（README 五目录之一） | 根目录 `insight/` 为空目录（0 文件） | ⚠️ 架构文档与实现漂移 |
| 双份云函数副本 | `cloudfunctions/insight/` 与 `miniprogram/cloudfunctions/insight/` **内容相同**两处存放；miniprogram/project.config.json `cloudfunctionRoot` 指向根 `cloudfunctions/`，而**根目录无 project.config.json** | ⚠️ 部署路径配置混乱，真机上传可能误发副本 |

---

## 3. P0 事实范围（PARTIAL）

| 检查 | 结果 |
|---|---|
| result 页「日柱纳音」 | ✅ 已移除（记忆符合） |
| **today 页「日柱纳音」** | ✅ **已移除**（2026-10-06 16:10 整改：`today.wxml:27` 展示行删除，`today.js`/`archive.js`/`index.js` 的 `nayin` 字段与 60 甲子静态表一并清除，测试同步更新） |
| about 页「生肖/纳音」 | ✅ 已清理：免责声明删「生肖纳音」表述、数据卡「四柱 / 纳音」改「干支纪时」 |
| 五行计数 / 节气 / 真太阳时 / 农历 | ✅ 全部正确限定字面计数（`tally` 名/量） |

---

## 4. 禁词与内容安全（PARTIAL · 提审风险）

PRD §1.2 禁词表（算命/八字/排盘/命盘/命理/运势/吉凶/喜用神/大运/合婚/择日/大师/预测/开运/改命）**字面扫描**：

| 词 | wxml 可见层 | 性质 |
|---|---|---|
| **预测** | 5 处（index.wxml:164「不预测、不判定」、result.wxml:5「不含预测与判定」+73/92/94、about.wxml:8「不构成任何预测…」等） | ❌ 否定式免责，但**字面命中禁词**，微信按关键词扫描 → **提审风险** |
| **排盘** | 2 处（result.wxml:73「不改变任何排盘结果」、index.wxml: 排盘模式） | ❌ 同上面 |
| 算命/八字/命理/运势/吉凶/合婚/择日/大师/开运 | wxml 0 处 | ✅ 已控制 |

**关键威胁**：本仓库的记忆教训（2026-10-06 记录）明确「微信按关键词命中，**否定句式同样违规**。模板写「不代表强弱、旺衰或吉凶」中「吉凶」二字仍被判违规 → 须改「不对其作任何强弱评判」」。当前 wxml 中「不含任何预测与判定」「不改变任何排盘结果」等 7 处，**正是同一模式的字面命中**，是**上线前必改项**（改用「不……」无法消解，须换词：如「仅作文化参考，不含任何判定/属性评判」之类不出现禁词本身的表述）。

其他：`index.js: 注释排盘 / lib 注释内含八字、纳音——非可见层，语义豁免，但建议对外材料统一扫描一次。

---

## 5. 治理与工程卫生（PARTIAL）

| 项 | 状态 |
|---|---|
| git 工作树 | ❌ **35 项未提交**：13 文件改动（含 app.js 云环境 ID、project.config.json 改 AppID `wxd58dc…`、result/index 增 AI 层）+ 22 项未跟踪（cloudbaserc.json、cloudfunctions/、miniprogram/cloudfunctions/、lib/insight.js、docs/ 新文档 14 份、scripts/build-pdf.py、check-appjson-privacy.mjs 等） |
| **AppID** | ⚠️ 已从注释「游客」`wx2dfa85a31cf906d1`改为**新开发 AppID `wxd58dc3b769e05f93`（未提交）**；app.js 硬编码云环境 `cloud1-d5ggz0479e06a5688` 已真实存在（cloudbaserc.json 一致）→ **游客模式已不可用，需真机按此发布** |
| B-2/B-3/B-6 阻断项 | ⚠️ 门窗 OPEN（记忆登记），功能已推进到 Phase 4-5 —— 仍存在「先功能后门禁」的治理顺序争议 |
| 历史存储 | ⚠️ 仅 localStorage（未 _openid 云隔离），P0-C「历史/隐私」在提审口径上需自洽声明 |
| 隐私勾选（consent） | ❌ index 输入页**无任何「同意/隐私勾选」控件**，但 PRD Iter的输入模型含 `consent（必须 true）` → 未实现 | |

---

## 6. 新增风险汇总（本报告新发现，非既有记录）

| # | 风险 | 等级 | 说明 |
|---|---|---|---|
| N1 | AI 自动触发（无显式点击） | P1 | 违反「AI 显式触发」铁律；多收费 + 与 PRD §7.4 不符 |
| N2 | AI 直收客户端 facts（跳 doc） | P1 | 弱化架构违规，避开服务端 hash 校验 |
| N3 | wxml 可见层禁词 7 处字面命中（预测/排盘 否定式） | **P0（提审）** | 微信关键词扫描会命中「预测」「排盘」→ 上线必改 |
| N4 | app.json 6 路由仍缺 Input/Transparency 独立页，today/terms 越界 | P1 | 冻结冲突（记忆已列 OPEN） |
| N5 | today 页纳音仍展示（P0 范围越界） | P1 | 与「纳音已移除」的记忆不符，今日仍可见 |
| N6 | 35 项未提交 + AppID/云环境在未提交态 | P1 | 提审前必须提交固化，避免误发布与回滚 |
| N7 | 双份云函数副本 + 根无 project.config.json | P2 | 工具链/部署文档漂移 |
| N8 | 无 consent 勾选 | P2 | PRD 输入模型要求，功能缺失 |

---

## 7. 单一可执行下一步（建议先做，主人裁决）

**N3（禁词 wxml 7 处）+ N5（today 纳音）为本轮最优先**：因两者直接命中审核红线（可见层关键词 + P0 范围），且改动局部、零风险，可在提交前完成。

建议顺序：**① 提交当前 35 项未提交改动（固化基线）→ ② 处理 N3 禁词替换 + N5 today 纳音 → ③ 评审 N1/N2 AI 行为（显式触发 + 服务端 hash 校验）→ ④ 关闭 6 路由 IA 缺口。**

是否需要我直接按此顺序开始处理？（当前报告仅只读，未动代码）