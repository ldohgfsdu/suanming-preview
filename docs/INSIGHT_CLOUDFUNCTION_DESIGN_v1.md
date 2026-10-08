# INSIGHT 云函数最小设计 v1（比赛轨）

> 状态：**设计稿，待主人批准**（未写实现）
> 日期：2026-10-04　轨道：**比赛轨**（受 D-005 双轨分离约束）
> 模型接入：**微信云开发 CloudBase 内置 AI**（官方提供，非第三方自申请 key）
> 契约骨架：对齐本体 `D:\02_Suanming（四柱排盘）\docs\AI_ENGINE_CONTRACT.md`（该契约标注「后端 / 模型调用：未实现」「AI Output Guard：未实现」）

---

## 0. 结论先行

| 判定项 | 结论 |
|---|---|
| 是否补 AI | ✅ 补——本届主题「与 AI 共生」，当前作品零 AI，与主题冲突 |
| 用哪个模型 | ✅ 云开发内置 AI（`app.ai().model('hunyuan-pro')`），key 由平台托管，**前端零密钥** |
| 能否直接端到端验证 | ❌ **不能**——云环境未初始化（平台侧未执行） |
| 因此的交付形态 | ✅ **本地降级路径先行且可演示**，AI 路径叠加其上（见 §7） |
| 语义范围 | 只做**文化解释**；禁预测 / 吉凶 / 运势 / 大运 / 喜用 / 十神断语（R2 红线） |

**本设计同时是本体 AI 契约的首个实现探路**：契约骨架与失败阶梯**共享**，Prompt Pack 与 Guard 清单**分离**（比赛轨精简版）。成果可上行给本体（D-005 允许：golden 与实现经验上行）。

---

## 1. 数据流（铁律：不得跳过 ArchiveDocument）

```text
小程序输入页
  → 本地 engine 计算 → ArchiveDocument（docHash / algorithmVersion / schemaVersion）
  → 云函数 insight（携带 docHash + 结构化字段）
  → Prompt Pack（比赛轨版）
  → 模型（CloudBase AI）
  → Output Guard（比赛轨清单）
  → AIInsight（严格 JSON）→ 结果页展示
```

**禁止**：客户端直传拼接展示串或"裸八字"字符串作为唯一依据（本体契约 §5 同款禁令；H-1 事实层禁存拼接串）。

---

## 2. 模型接入（官方 API）

```js
const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const app = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV })
await app.ai().model('hunyuan-pro').call({ messages, temperature, maxTokens })
```

- **零密钥落地**：模型凭据由云开发环境托管，小程序端与仓库**均不出现任何 key**
- 环境变量：`env` 用 `cloud.DYNAMIC_CURRENT_ENV`，不写死环境 ID
- 依赖声明：`package.json` 必须显式声明 `wx-server-sdk` / `@cloudbase/node-sdk`（参考包此处为空，属缺陷，不得复刻）

---

## 3. 入参契约

```json
{
  "action": "interpret",
  "docHash": "<sha256>",
  "schemaVersion": "archive-document-v1",
  "algorithmVersion": "bazi-core-1.3",
  "facts": { "pillars": {...}, "solarTerm": {...}, "solarTime": {...}, "lunar": {...}, "wuxing": {...} },
  "locale": "zh-CN",
  "promptVer": "insight-prompt-v2"
}
```

- `facts` **只含 P0 六类**（时间 / 节气 / 干支 / 太阳时间 / 农历 / 五行字面计数）
- **不含**：十神、藏干权重、纳音以外的神煞、空亡、大运流年、喜用——这些属 R2 禁倒灌项

---

## 4. Prompt Pack（比赛轨专用，精简版）

系统提示词的硬约束（逐条可机检）：

1. 只解释**已给出的结构化事实**，不得补算、不得改四柱
2. 只输出**文化/历法知识**，不输出预测、吉凶、运势、宜忌、行为建议
3. 不把字面五行数量等同旺衰
4. 不出现「算命 / 预测 / 吉凶 / 运势 / 大运 / 流年 / 喜用 / 合婚 / 择日」
5. 未知或不确定时输出"无法判定"，**不得**补全或替用户选择流派
6. 不得出现医疗、投资、法律、婚恋决策类结论

> 与本体差异：本体 Prompt Pack 按术数分域（Bazi / Ziwei / Liuyao…）；**比赛轨只有一域且只用历法口径**。

---

## 5. 输出契约（严格 JSON，对齐本体 `interpretation-1.0` 的裁剪版）

```json
{
  "outputVersion": "insight-1.0",
  "docHash": "<sha256>",
  "model": "hunyuan-pro",
  "promptVer": "insight-prompt-v2",
  "sections": [
    { "id": "s1", "title": "节气与干支", "contentType": "FACT", "content": "...", "evidenceIds": ["e1"] },
    { "id": "s2", "title": "五行字面分布", "contentType": "FACT", "content": "...", "evidenceIds": ["e2"] }
  ],
  "limitations": ["不含预测与判定"],
  "usedEvidenceIds": ["e1", "e2"],
  "fallback": false
}
```

- `contentType`：`FACT` | `CULTURAL_CONTEXT`（**不含** `STRUCTURAL_JUDGEMENT` / `TRADITIONAL_IMAGERY` 这类判断型）
- 无百分制置信度（禁伪精确）

---

## 6. Output Guard（比赛轨清单）

| # | 检查 |
|---|---|
| 1 | JSON Schema 合法 |
| 2 | `usedEvidenceIds` 全部存在于入参 facts |
| 3 | 未修改任何四柱 / 干支 / 节气值 |
| 4 | 未引入入参不存在的事实（大运、流年、十神、神煞等） |
| 5 | 未出现禁词集合中的任一字符串 |
| 6 | 未出现预测、吉凶、宜忌、行为建议句式 |
| 7 | 未把五行字面计数等同旺衰 |
| 8 | `limitations` 非空 |

---

## 7. 失败阶梯（对齐本体 §7，落到 Preview 铁律）

1. **修复提示重试恰好 1 次**（不得更多）
2. **规则模板降级** → 返回 `{ fallback: true }`
3. **仅展示档案**（AI 不展示；档案主链路不受影响）

**关键现实约束**：云环境未初始化（平台侧未执行）→ 上云路径**无法在本机端到端验证**。
因此交付顺序为：

- **第一步（必须）**：本地实现**规则模板降级路径**——确定性、可复现、可演示，作为默认可用路径
- **第二步（可选）**：接入 CloudBase AI，AI 成功则覆盖降级文本

这样作品同时满足：有 AI 位（命中主题）· 本地可演示（不依赖平台侧）· 符合「AI 失败不阻断主链路」。

---

## 8. 缓存键

```text
docHash + promptVer + model        （Preview 铁律固定三项）
```

> 与本体目标键 `factsHash + factSchemaVersion + interpretationRuleVersion + promptVersion + modelName + locale + detailLevel` 的关系：比赛轨取其核心三项；本体键为超集。共享语义一致，不冲突。

---

## 9. 与本体契约的对齐 / 差异（D-005 双轨表）

| 项 | 本体契约 | 比赛轨本设计 | 关系 |
|---|---|---|---|
| AI 不得重排盘 / 不得发明事实 | ✅ | ✅ | **共享** |
| 输入必须是结构化文档 + hash | ✅ | ✅ | **共享** |
| 输出严格 JSON | `interpretation-1.0` | `insight-1.0`（裁剪） | 骨架共享 |
| Output Guard | 12 条（含十神/合化/旺衰） | 8 条（禁预测版） | **分离** |
| 失败阶梯 | 4 级 | 3 级（合并为重试1次→降级→仅档案） | 骨架共享 |
| 缓存键 | 7 因子 | 3 因子（子集） | 共享 |
| Prompt Pack | 按术数分域 | 单域·历法口径 | **分离** |
| API Key | 仅后端 | 云平台托管（零密钥） | 共享 |

---

## 10. 不做的事（边界，防止范围蔓延）

- 不做多轮对话 / 追问（属本体 Conversation Runtime，R4 禁止在比赛轨声称）
- 不做记忆、不做用户画像（属本体 Memory Runtime）
- 不做 provider 抽象之外的多模型 A/B（比赛轨只用官方一个模型）
- 不因本设计修改 `CALCULATION_BASELINE_V1` 与任何 golden 期望值（R3）

---

## 11. 验收标准

1. `insight` 云函数入参校验：缺 `docHash` / `schemaVersion` 直接拒绝
2. Guard 8 条全过；任一失败触发失败阶梯
3. 降级路径**本地可跑、可复现**（无云环境亦能演示）
4. 仓库内与小程序端**零密钥命中**（grep 可验证）
5. 全域禁词扫描：新增文案零命中

---

## 12. 待主人确认（两处）

1. **云环境是否仍不初始化？** 若维持"平台侧不做"，则本设计只落地第 1 步（本地降级路径），AI 调用代码可写但标注"未端到端验证"。
2. **语义裁剪是否认可？** 即比赛轨 AI 只解释历法文化、不给任何判断——这会让"AI 解读"在评审看来偏克制，但这是过审的必要条件。
