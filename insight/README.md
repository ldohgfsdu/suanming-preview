# `insight/` —— 目标分层占位（尚未成为生产模块）

## 当前状态

**空目录。没有任何 `.js` / `.ts` 生产文件。**

## 为什么是空的

《Suanming Preview Technical Architecture Specification v1.0》冻结了五目录分层，
其中 `insight/` 的目标职责是：

> AI 知识源、prompt、模型适配、Guard、缓存

但 README §迁移状态（2026-10-08 V4 closure）明确说明：
`engine/`、`insight/`、`shared/` 仍是目标分层，**尚未完全取代
`miniprogram/lib/` 的生产实现**。

实际生产中，这部分职责由以下两处承担：

| 冻结职责 | 当前实际所在 |
|---|---|
| prompt / 模型适配 / Guard / 缓存 / 限流 | `cloudfunctions/insight/index.js` |
| 事实抽取、本地规则降级、缓存键、客户端 Guard | `miniprogram/lib/insight.js` |
| 知识源方向（禁词表、证据 ID、口径） | 上述两文件 + `tests/unit/insight-contract.test.mjs` |

也就是说：**该模块已实现，只是物理上还没搬进这个目录。**

## 接手须知

1. 不要因为「目录存在且为空」而推断「有模块在等接线」—— 代码在别处，已在生产。
2. 不要在这里新建文件当作「补全架构」。搬迁前必须先有一轮迁移方案
   （对标 `engine/` 从 `miniprogram/lib/` 迁出时的 golden 对拍验收），
   否则会出现「两套并存但只有一套在跑」的双事实源。
3. 迁移前建议先读：
   - `../docs/INSIGHT_CLOUDFUNCTION_DESIGN_v1.md`
   - `../wiki/05-AI解读层与云函数.md`
   - `../governance/D-005_DUAL_TRACK_SEPARATION_v1.md`（比赛轨/本体轨边界）

## 相关未闭项

见 `README.md` §治理与未闭项第 1、3 条。
