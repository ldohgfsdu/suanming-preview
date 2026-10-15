# `engine/` —— 目标分层（迁移中）

## 当前状态

只有一个文件：

```
engine/lib/types.ts   — ArchiveDocument/ArchiveInput 运行期类型定义（S-4 v1 冻结，镜像 shared/protocol）
```

**这里没有历法计算实现。** 生产历法引擎全部位于 `miniprogram/lib/`。

## 与冻结职责的差距

《Suanming Preview Technical Architecture Specification v1.0》冻结：

> `engine/` — TS 确定性历法、trace、ArchiveDocument、规范化 hash

| 冻结职责 | 当前实际所在 |
|---|---|
| JDN / 节气 / 干支 / 真太阳时 / 农历 / 朔望 | `miniprogram/lib/{engine,archive,lunar,lunarReverse,solarlon,sun,chinadst,civilTime}.js` |
| trace | **未实现**（`TimeTraceEntry` 类型已定义，无产出方） |
| ArchiveDocument | 类型在 `engine/lib/types.ts` + `shared/domain/archiveDocument.ts`，无构造器 |
| 规范化 hash | `shared/hash/*.ts`（已有，但生产链路未调用） |

## `lib/types.ts` 的特殊性

它是**运行期类型/构造器**，`docHash` 不在本文件算（见 `shared/hash`）。
文件头注释已声明这一点，不要在这里重复实现 hash。

命名风格注意：本文件用 snake_case（面向小程序侧运行时），
而 `shared/domain/archiveDocument.ts` 用 camelCase（面向 TS 契约层）。
差异由 `shared/domain` 的 scope 组装负责转成 ASCII snake_case key。
这是**有意的双轨命名**，不是疏漏，但合并成一个物理源时必须统一。

## 迁移约束（重新立项前必读）

1. Engine 迁移方案在《Technical Architecture Spec》里对比过 A/B/C，
   最终选 **B：重写 TS + golden 对拍验收**。不接受黑盒移植。
2. 迁移期必须保证「新旧实现同输入同输出」—— 对拍基准是
   `tests/unit/{core-port,astronomy-audit,solar-terms-accuracy}.test.mjs`。
3. 迁移完成后 `miniprogram/lib/` 的历法文件应删除，而不是留作「fallback」，
   否则双事实源会让精度问题无法定位。
4. `CALCULATION_BASELINE_V1.md` 与 `CALCULATION_BASELINE_CHANGE_PROTOCOL.md`
   对计算口径有单独约束，改算法口径前必须先读后者（九步流程）。

## 相关文档

- `../wiki/04-历法引擎详解.md`
- `../wiki/06-共享契约层.md`
- `../governance/HASH_CONTRACT_V1.md`
