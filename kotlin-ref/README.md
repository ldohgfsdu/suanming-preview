# Kotlin(JVM) 参考实现 — HASH_CONTRACT_V1 跨语言对拍

本目录是 HASH_CONTRACT_V1 docHash 的 **Kotlin(JVM) 参考实现**，用于与 `shared/hash`（TypeScript）
对同一逻辑文档产出**同一 docHash**，作为 **B-6**（跨语言 hash 一致性）关闭的核心证据。

## 文件
- `src/hashref/HashRefMain.kt` — 单文件自包含实现（无第三方依赖，仅 JDK 原生）。
- `build.ps1` — `kotlinc` 编译为 `out/hash-ref.jar`。
- `../../scripts/crosscheck.mjs` — 一键对拍 TS vs Kotlin。
- `out/hash-ref.jar` — 编译产物（加入 `.gitignore`，不入库）。

## 规约对齐（与 TS 侧逐条一致）
- §5  显式 UTF-8（`toByteArray(Charsets.UTF_8)`），无 BOM。
- §6  NFC（`java.text.Normalizer`）+ 白名单（ASCII 可打印 / CJK 统一表意 U+4E00-9FFF），原始串先行拒绝越界。
- §7  INT 用 `Long`；DEC 用 `Quantize.q`（`BigDecimal` + HALF_UP，远离零点对称）。
- §10 canonical JSON：无空白、ASCII key 升序、保留 null、禁 undefined、非 ASCII 原样不转义。
- §11 SHA-256（`MessageDigest`），输出 `sha256:` + 64 位小写 hex。
- §12 `-0` 归一为 `0`。

## 复现步骤
1. `npm run test:build`（生成 TS 侧 `dist-test`）。
2. `powershell -File kotlin-ref/build.ps1`（需 `~/.workbuddy/binaries/jdk` + `kotlinc`）。
3. `node scripts/crosscheck.mjs` → 期望全部 `PASS`。

## 已登记结果（B-6 证据，2026-09-xx）
Kotlin 与 TS 在 F-1..F-4 六类 fixture 上 hash 与 canonical 全一致。
F-5 负向（全角 / CJK 兼容表意 / 组合锐音符）两侧均被 P-3 拒绝。