# CloudBase 接入完成 · AI 根因诊断报告

> 2026-10-06　|　按官方 `docs.cloudbase.net/skill.md` 执行
> **结论：接入已完成；AI 接不上的根因已定位，是「个人版套餐」限制，不是代码问题**

---

## 一、CloudBase 接入状态（Skill 验收标准）

| 验收项 | 状态 | 证据 |
|---|---|---|
| Node 工具链 | ✅ | v22.22.2（≥18） |
| 插件安装 | ⚠️ | 仓库克隆成功，但**无匹配 IDE**（WorkBuddy 不在支持的六种之列）→ 按 §3.C 走内置连接器，**未手写 MCP JSON** |
| CLI 安装 | ✅ | `@cloudbase/cli` **3.8.5**（内置要求 ≥3.8.5，恰好达标） |
| 登录 | ✅ | `tcb env list` 成功返回环境 |
| 环境绑定 | ✅ | `tcb env use cloud1-d5ggz0479e06a5688` |
| 云函数部署 | ✅ | `tcb fn deploy insight` 成功（域命令，非 `tcb deploy`） |
| 云函数配置 | ✅ | timeout **60s** / Nodejs16.13 / 256MB / `INSIGHT_MODEL=deepseek-v4-flash` |

**环境信息**
```
Environment ID : cloud1-d5ggz0479e06a5688
Package Version: 个人版
Status         : Normal
Expiration     : 2027-04-06
Region         : ap-shanghai（国内站）
```

新增文件：`suanming-preview/cloudbaserc.json`（声明 `functions[]`，`tcb fn deploy` 会读取）

---

## 二、AI 接不上的真正根因

### 排查链条

```
错误码 -501001invalid wx openapi access_token
    ↓ 查官方错误码页
「云调用鉴权失败，未从小程序端触发使用云调用的云函数」
    ↓ 说明 CLI 调用路径不适用，改查环境侧
DescribeEnvPostpayPackage → EnvPostpayPackageNum: 0   ← 无任何 AI 资源包
DescribeAIModels → GroupName="cloudbase" 的 Models: []  ← 文本模型一个都没启用
UpdateAIModel→ 当前环境的套餐不支持，请升级到标准版及以上套餐← 硬阻断
```

### 🔴 根因

**环境是「个人版」套餐，不支持 AI 大模型能力。**

这不是代码问题——三处证据：
1. `UpdateAIModel` 明确返回「当前环境的套餐不支持，请升级到标准版及以上套餐」
2. `EnvPostpayPackageNum: 0` —— 无 Token Credits 资源包
3. `cloudbase` 分组 `Models: []` —— 无法启用任何模型

（顺带发现：`hunyuan-image` 分组**有**模型，所以图片能调、文本不能。）

### 修复后的当前状态

代码已改为**官方正确姿势**并部署，调用链已打通：

| 步骤 | 修复前 | 修复后 |
|---|---|---|
| SDK | `cloud.openapi.ai.generateText()` | `@cloudbase/node-sdk` 的 `app.ai().createModel('cloudbase')` |
| 模型 id | `hunyuan-pro`（**已下线的旧名**） | `deepseek-v4-flash`（在`DescribeManagedAIModelList` 中确认存在） |
| GroupName | 无（写错概念） | `cloudbase`（主托管分组） |
| 错误 | `ai.createModel is not a function` | **429** ← 已进入模型服务，仅剩额度阻断 |

---

## 三、要让AI 真正生效，只差一步

### 方案 A（推荐）：升级环境套餐

1. 云开发控制台 → 环境 `cloud1-d5ggz0479e06a5688` → 「**升级**」
2. 选**标准版**及以上
3. 升级后我执行：
   ```bash
   tcb api tcb UpdateAIModel --body '{"EnvId":"cloud1-d5ggz0479e06a5688","GroupName":"cloudbase","Models":[{"Model":"deepseek-v4-flash","EnableMCP":true}]}'
   ```
4. 领 Token 资源包 → AI 立即可用

> 💡 个人版升级通常有免费/低价档位，且**大赛期间可关注成长计划**（10亿 Token + 6 个月云环境）。

### 方案 B（零成本兜底）：保持现状

**当前代码已有完整的本地降级路径**——「本地规则」文本照常展示，功能不受影响，只是文案非AI 生成。

提审时这仍可接受：作品本身是**确定性历法引擎**，AI 只是加分项。

---

## 四、我修正的三处代码错误

| # | 错误 | 正确 |
|---|---|---|
| 1 | 用了 `cloud.openapi.ai.generateText()` | 云函数侧须用 `@cloudbase/node-sdk` 的 `app.ai()` |
| 2 | 模型 id 写 `hunyuan-pro` | `deepseek-v4-flash`（`hunyuan-pro` 已不在模型清单中） |
| 3 | `tcbApp.ai` 当属性用 | `app.ai()` 是**方法**，须调用 |

**依赖**：`wx-server-sdk` + `@cloudbase/node-sdk@^3.16.0`

---

## 五、沉淀的可复用命令

```bash
export PATH="/c/Users/42899/AppData/Roaming/npm:$PATH"

# 查环境 / 绑定
tcb env list
tcb env use cloud1-d5ggz0479e06a5688

# 云函数：用域命令，**不要**用 tcb deploy
tcb fn deploy insight --dir "./miniprogram/cloudfunctions/insight" --install-dependency true
tcb fn detail insight
tcb fn log insight
tcb fn invoke insight --params '<json>'

# 调任意云 API（注意：service 与 action 是位置参数）
tcb api tcb DescribeEnvPostpayPackage --body '{"EnvId":"cloud1-d5ggz0479e06a5688"}'
tcb api tcb DescribeAIModels --body '{"EnvId":"cloud1-d5ggz0479e06a5688"}'
tcb api tcb DescribeManagedAIModelList --body '{"EnvId":"cloud1-d5ggz0479e06a5688"}'
```

**要点**
- `tcb fn deploy` 默认找 `functions/`，本项目须用 `--dir`
- 交互确认用 `echo y |` 灌入（**不要用 `yes`**，会灌太多卡死）
- `cloudbaserc.json` 的键是 `functions[]`（数组），不是 `function.<name>`
- 部署前需先 `tcb login`（会话有效期约 5 分钟，链接会失效）

---

## 六、建议的下一步（按优先级）

### 1️⃣ 提交小程序备案（最高优先，与AI 无关）
管局审核 1–20 工作日，是 10-17 提报的**唯一不可压缩项**。今天就该交。

### 2️⃣ 决定 AI 路线
- 升级套餐 → 我立刻启用模型并复测（10 分钟内完成）
- 或保持降级 → 先提报，AI 作为后续迭代

### 3️⃣ 领大赛 1B Token
先完成赛事报名（不要求作品上线）→ https://contest.weixin.qq.com/eventDetails?id=4598379302114656257
再领：https://chatapi.weixin.qq.com/

### 4️⃣ 真机全流程验证
深色模式 / 精确到分选时/ 解读区块 / 保存相册 / 6 个页面
