# AI 接入 · 最终解法（计费模式切换）

> 2026-10-06　|　**根因已 100% 确认：不是套餐档次，是计费模式**

---

## 决定性结论

腾讯云官方价格文档「AI」能力行：

| | 个人版 | 标准版 | 企业版 | 企业高级版 |
|---|---|---|---|---|
| **CloudBase 内置模型调用** | **支持** | 支持 | 支持 | 支持 |

**个人版本来就支持内置模型调用**——所以 `UpdateAIModel` 报的「套餐不支持」是误导性表述。

真正的原因在同一张表的脚注：

> ⚠️ **2026年6月17日后，如需使用内置模型请切换至[资源点计费](https://cloud.tencent.com/document/product/876/127357)**

以及 CLI 的确认：

```bash
$ tcb env info cloud1-d5ggz0479e06a5688
i Environment [cloud1-d5ggz0479e06a5688] is not in resource-point billing mode
```

**你的环境是旧配额制计费，而内置大模型必须走资源点计费。**

所以正解不是「升到 199 的标准版」，而是**切换计费模式**（个人版 19.9 元/月即可）。

---

## 你要做的（控制台操作，5 分钟）

1. 打开 **https://tcb.cloud.tencent.com/dev**
2. 选环境 `cloud1-d5ggz0479e06a5688`
3. 进入「**套餐用量**」页
   > 或直接：https://tcb.cloud.tencent.com/dev#/env/package-usage/basic
4. 找「**计费模式**」→ 切换为「**资源点计费**」
5. 若提示需先升级套餐，选**个人版 19.9 元/月**（**不需要** 199 的标准版）

> 💡 资源点计费下有**免费额度**（免费体验版 3000 点/月），大概率够整个比赛期用。
> 切换后立刻生效，不影响已有云函数。

---

## 切换后我做这三步

```bash
# 1. 验证已切换
tcb env info cloud1-d5ggz0479e06a5688
# 期望：不再出现 "not in resource-point billing mode"

# 2. 启用模型
tcb api tcb UpdateAIModel --body '{
  "EnvId":"cloud1-d5ggz0479e06a5688",
  "GroupName":"cloudbase",
  "Models":[{"Model":"deepseek-v4-flash","EnableMCP":true}]
}'

# 3. 复测云函数
tcb fn invoke insight --params '<测试入参>'
# 期望：sections 有内容，fallback: false
```

代码侧**已全部就绪**（已按官方正确姿势改完并部署）：
- `app.ai().createModel('cloudbase')` + `model: 'deepseek-v4-flash'`
- timeout 60s / Nodejs16.13 / `INSIGHT_MODEL=deepseek-v4-flash`
- 错误已透传，可直接看到失败原因

---

## 已排除的两条路

### ❌ 大赛 Coding Plan Token（chatapi.weixin.qq.com）

腾讯云官方明确限制：

> **严禁 API 调用**：仅限在编程工具（Claude Code、CodeBuddy、OpenClaw 等）中使用，
> 禁止以 API 调用的形式用于自动化脚本、**自定义应用程序后端**或任何非交互式批量调用场景。
> 违规可能导致**订阅被暂停或 API Key 被封禁**。

小程序云函数 = 自定义应用程序后端 → 属于禁止场景。
**风险不对称**：Token 被封 → 评审现场演示时 AI 失效 → 比没有 AI 更糟。

### ❌ 升到标准版 199 元/月

不是必要条件。个人版 + 资源点计费即可。
（升配费用按天折算约 6 元/天，但没必要花这个钱）

---

## 兜底：若暂不切换

代码已有完整降级路径，「本地规则」文本照常展示，**功能不受影响**。
提审话术建议：

> AI 解读能力已实现（含Prompt Pack 与输出 Guard），因开发环境资源点计费未开通，
> 当前演示使用本地规则文本；开通后自动切换为云端模型生成。

这反而体现**工程严谨**（AI 只解释事实、失败自动降级、不阻断主链路）。

---

## 时间线建议

| 优先级 | 事项 | 说明 |
|---|---|---|
| 🔴 1 | **提交小程序备案** | 管局 1–20 工作日，唯一不可压缩项，与 AI 无关 |
| 🟡 2 | 切换资源点计费 | 5 分钟操作，之后我 10 分钟完成模型启用 |
| 🟢 3 | 领大赛 1B Token | 用于**本地开发**（Cursor/CodeBuddy），合法且有用 |
| ⚪ 4 | 真机全流程验证 | 深色模式 / 精确到分 / 解读区块 / 保存相册 |
