# AI 接不上 · 排查指引

> 2026-10-06 更新　|　我改了调用方式，现在按顺序验证

---

## 我改了什么

**原写法有问题**（我的责任）：

```js
// ❌ 旧写法：需额外装 @cloudbase/node-sdk，兼容性不确定
const tcb = require('@cloudbase/node-sdk');
const tcbApp = tcb.init({ env: cloud.DYNAMIC_CURRENT_ENV });
await tcbApp.ai().model('hunyuan-pro').call({ messages, ... });
```

**新写法（微信官方通道）**：

```js
// ✅ 只需 wx-server-sdk，无需任何额外 SDK
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

await cloud.openapi.ai.generateText({
  model: 'hunyuan-pro',
  messages: [...],
  temperature: 0.3,
  maxTokens: 1200,
});
```

依赖已精简为**只需 `wx-server-sdk`**，并已重新部署成功（4.4 KB）。

---

## 三个必做的动作（按顺序）

### 动作 1 · 云函数超时 → 60 秒（**最关键**）

你截图那个页面 →点 `insight` 行的「**版本与配置**」→ 找「**超时时间**」→ 改 **60** → 保存

> ⚠️ 时限仍是 3 秒的话，模型必然被掐断。**3 秒跑不完大模型。**

### 动作 2 · 开通 AI 能力

你截图左栏有个「**AI**」→ 点进去 → 确认**混元/大模型能力已开通**

如果显示未开通，**开通它**。没开通的话`cloud.openapi.ai.generateText` 会直接报
`AI_MODEL_DISABLED` 或 `AI_MODEL_NOT_FOUND`。

### 动作 3 · 看真实报错（我已加透传）

之前错误被吞掉，你只能看到"本地规则"。现在**云端失败原因会一路传回客户端**。

打开开发者工具的 **Console**，重新生成一次档案，看这行：

```
[insight] 走本地规则降级，原因：<真实原因>
```

---

## 原因对照表（Console 里会显示）

| 显示的原因 | 含义 | 怎么办 |
|---|---|---|
| `openapi_AI_MODEL_DISABLED` | 模型未启用 | 云开发控制台 → AI → 开通混元模型 |
| `openapi_AI_MODEL_NOT_FOUND` | 找不到模型分组 | 同上，确认模型名/开通 |
| `openapi_EXCEED_TOKEN_QUOTA_LIMIT` | 额度不足 | 领 Token（见下方）或开通成长计划 |
| `AI_CHANNEL_NOT_ALLOWED` | 调用通道受限 | 确认从**云函数**调用（不是前端直连） |
| `cloud_fallback:...` | 云端已降级 | 看后半段的具体原因 |
| `timeout` | 超时 | 动作 1 没做或没生效 |
| `error:-501000` 之类 | 通用云函数错误 | 看**云函数日志** |

---

## 云端日志（能看到完整堆栈）

你截图那个页面顶部有「**日志**」标签 → 点开 → 触发一次生成 → 看最新一条

我加了这条日志：
```
[insight] 模型调用失败：<真实错误>
```

---

## 还是不行？用「云端测试」直接验证

你截图每行有「**云端测试**」按钮 → 点它 → 填入参：

```json
{
  "action": "interpret",
  "docHash": "test-doc-hash-0001",
  "schemaVersion": "archive-document-v1",
  "promptVer": "insight-prompt-v1",
  "locale": "zh-CN",
  "facts": {
    "pillars": [
      { "label": "年", "gan_zhi": "庚午", "element": "金" },
      { "label": "月", "gan_zhi": "辛巳", "element": "金" },
      { "label": "日", "gan_zhi": "丙寅", "element": "火" }
    ],
    "solarTerm": { "prev": "芒种", "next": "夏至" },
    "solarTime": { "corrected": "+18分钟", "day_changed": false },
    "lunar": "庚午年五月十七",
    "wuxing": [
      { "name": "金", "literal_count": 3 },
      { "name": "火", "literal_count": 2 }
    ]
  }
}
```

点运行，看返回：
- `sections` 有内容 → 云函数**完全正常**，问题在客户端
- `fallback: true` + `reason` → 按对照表处理

---

## 领 Token（解决额度问题）

### 大赛官方 1B Token
1. 先完成**赛事报名**（https://contest.weixin.qq.com/eventDetails?id=4598379302114656257）
2. 领Token：https://chatapi.weixin.qq.com/

### 小程序成长计划（推荐）
后台 →「**行业能力**」→「**小程序成长计划**」→「**参与计划**」→ 选已有环境
可领：混元文本 **10 亿 Token** · **6 个月**免费云开发环境

---

## 快速自检清单

- [ ] 云函数超时改成 **60 秒**（版本与配置里）
- [ ] 云开发 **AI 能力已开通**（左栏 AI）
- [ ] 云函数已重新部署（我已做，4.4 KB）
- [ ] Console 看过`[insight]` 的真实原因
- [ ] 云函数「日志」标签看过有无报错
- [ ] 必要时用「云端测试」手动验证

---

**把 Console 里 `[insight] 走本地规则降级，原因：xxx` 那一行发我，我能直接定位。**
