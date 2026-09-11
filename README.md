# Suanming Preview · 东方时间文化档案微信小程序

> 独立仓库（S-7 裁决：独立承载，非子目录）。
> 产品事实源：见父目录 `preview-docs/` 冻结文档体系与 `governance/`。
> 本仓库**不做**算命 / 预测 / 吉凶 / 运势 / 合婚择日等（PRD §1.2 / §13 P2 Never）。

本仓库是 Suanming Preview 的**工程实现仓库**，承载 `miniprogram / cloudfunctions / engine / insight / shared` 五目录与 CI。

## 目录职责（Handbook §3 未来逻辑目录，依赖方向单向）

```
miniprogram  ──────────→ shared
cloudfunctions ──→ engine ──→ shared
            └──→ insight ─→ shared
（engine 与 insight 不得互依；Cloud Function 编排两者）
```

| 目录 | 职责 | 禁止 |
|---|---|---|
| `miniprogram/` | 原生小程序页面、六组件、Token、本地缓存、云函数调用适配 | 历法算法、模型 SDK、密钥、事实修正 |
| `cloudfunctions/` | API、openid 鉴权、校验、限流、编排、脱敏 | 页面表现、Core 变体、绕过 Guard |
| `engine/` | TS 确定性历法迁移、trace、ArchiveDocument、规范化 hash | AI、网络、用户历史推理、数据库 |
| `insight/` | 知识源、prompt、模型适配、Guard、缓存键、fallback | ArchiveInput 裸数据、历法重算、无来源文案 |
| `shared/` | 跨层 schema、类型、错误码、版本标识、规范化约定 | 密钥、页面状态、数据库客户端、重复算法 |

## 工具链（固定版本，B-1）

- Node **18.20.4** + npm **10.7.0**（`.nvmrc` / `engines` 双固定）
- Git：portable 2.55.0（`scripts/setup-env.ps1`）
- TypeScript **5.4.5**（精确锁定，禁止浮动范围）

### 使用方式

```powershell
# 1. 加载项目工具链到当前 shell（Node/Git 已由本地安装，不在系统 PATH）
powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1

# 2. 安装依赖 + 全门禁（typecheck + lint + build + unit）
npm install
npm run test:all
```

## 治理红线

- 未修改 Core（`bazi-core-1.3`）、未改冻结文档、未初始化云环境与真机。
- hash 契约 `hash-contract-v1`；schema `archive-document-schema-v1`（S-4）；solar 3 值（S-9）。
- 任何新增协议/依赖按 Governance / ADR 流程，不自行扩张。

## 里程碑记录（见 docs/）

- 2026-09-05：本地工具链落地（Node 18 + Git + TS 5.4.5），独立仓库建立，五目录骨架 + 版本/枚举协议 + 最小 CI 门禁跑通（4 单测全绿）。
- 2026-09-11：核心与边界完善——修复 1900/2100 极值归档崩溃；节气精度验证（2024 全年 24/24 同日、分钟级）；补全基础功能（性别 / 五行条形 / 本地历史 / 今日天时独立页 / 全年节气历 / canvas 归档卡片 / 分享）；禁用词全量 0 命中；黄金对拍统一为「月/闰强断言 + 边界日 ±1 容差」诚实口径。
- 2026-09-11：体验与门禁收官——首页滚动根因（wxml 多余闭合标签不平衡）修复 + 生成后自动滚动到结果；首页今日卡实时化「距下节气倒计时 + 月相月龄」；今日独立页新增十二时辰表（五鼠遁）与下拉刷新；农历边界日在结果卡明示「朔日 ±1 天」；computeArchive 全范围健壮性冒烟（17 例）入测试；文档新增《报名自查清单》；修复 test:all 未跑 mjs 套件的门禁漏洞，一键可复现 64/64 全绿（TS 编译 28 + mjs 36）。
- 2026-09-11：终验收官——全站深色模式（darkmode + theme.json + CSS 变量，一套变量管明暗）；修复季/节气页历来缺 terms.wxss 与「12/24 节气」截断，补全为 24 节气分钟级；今日/节气/关于页支持微信分享（含 ?year 深链）；QA 全绿（64/64 单测、lunar 黄金 20/20、禁用词 0 实质命中、主包 226KB<2MB、5 页 wxml 平衡）。

