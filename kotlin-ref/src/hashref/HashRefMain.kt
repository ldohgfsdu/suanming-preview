// HashRefMain.kt
// HASH_CONTRACT_V1 · Kotlin(JVM) 参考实现 + F-1..F-5 fixture，单文件自包含。
// 与 shared/hash TS 侧产出同一 docHash（§14 跨语言一致性）。
// 无第三方依赖：JDK MessageDigest / Normalizer + 手写 canonical JSON。
//
// 输出 `key\tvalue\tbyteLen\tcanonical` 行，供 scripts/crosscheck.mjs 对拍。
package hashref

import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest
import java.text.Normalizer
import java.util.LinkedHashMap

// ---------------- 参与 hash 的树 ----------------
sealed class HVal {
    data class HI(val v: Long) : HVal()
    data class HS(val v: String) : HVal()
    data class HB(val v: Boolean) : HVal()
    object HNull : HVal()
    data class HArr(val items: List<HVal>) : HVal()
    data class HObj(val map: Map<String, HVal>) : HVal()
}

// ---------------- §6 白名单 + NFC ----------------
private fun whitelisted(cp: Int): Boolean = (cp in 0x0020..0x007e) || (cp in 0x4e00..0x9fff)

fun normalize(input: String): String {
    var i = 0
    while (i < input.length) {
        val cp = input.codePointAt(i)
        if (!whitelisted(cp)) {
            throw IllegalArgumentException("HASH_CHAR_OUT_OF_SET: 字符 U+${cp.toString(16).uppercase().padStart(4, '0')}")
        }
        i += Character.charCount(cp)
    }
    val normalized = Normalizer.normalize(input, Normalizer.Form.NFC)
    if (Normalizer.normalize(normalized, Normalizer.Form.NFC) != normalized) {
        throw IllegalArgumentException("HASH_NFC_UNSTABLE")
    }
    return normalized
}

// ---------------- §10 canonical JSON ----------------
private fun esc(s: String): String {
    val sb = StringBuilder("\"")
    s.forEach { ch ->
        when (ch.code) {
            0x22 -> sb.append("\\\"")
            0x5c -> sb.append("\\\\")
            0x08 -> sb.append("\\b")
            0x09 -> sb.append("\\u")
            0x0a -> sb.append("\\n")
            0x0c -> sb.append("\\f")
            0x0d -> sb.append("\\r")
            else -> if (ch.code < 0x20) sb.append("\\u%04x".format(ch.code)) else sb.append(ch)
        }
    }
    return sb.append('"').toString()
}

private fun canonicalize(v: HVal): String = when (v) {
    is HVal.HI -> v.v.toString()
    is HVal.HS -> esc(v.v)
    is HVal.HB -> v.v.toString()
    HVal.HNull -> "null"
    is HVal.HArr -> v.items.joinToString(",", "[", "]") { canonicalize(it) }
    is HVal.HObj -> {
        val keys = v.map.keys.toList().sorted()
        keys.joinToString(",", "{", "}") { k -> esc(k) + ":" + canonicalize(v.map.getValue(k)) }
    }
}

// ---------------- §7.3 DEC 量化 ----------------
object Quantize {
    private val POW10 = longArrayOf(1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000)
    fun q(value: Double, d: Int): Long {
        if (d !in 0..9) throw IllegalArgumentException("HASH_DEC_RANGE: d=$d")
        if (!value.isFinite()) throw IllegalArgumentException("HASH_RAW_FLOAT")
        val neg = value < 0 || value.compareTo(-0.0) == 0
        val scale = BigDecimal(POW10[d])
        val abs = BigDecimal.valueOf(Math.abs(value))
        var scaled = abs.multiply(scale).setScale(0, RoundingMode.HALF_UP)
        if (neg) scaled = scaled.negate()
        return scaled.toLong()
    }
}

// ---------------- §11/§12 hash ----------------
class HashOutcome(val value: String, val byteLength: Int, val canonical: String, val javaVersion: String)

fun hashValue(root: HVal): HashOutcome {
    val canonical = canonicalize(root)
    val bytes = canonical.toByteArray(Charsets.UTF_8)
    val hex = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it) }
    return HashOutcome("sha256:$hex", bytes.size, canonical, System.getProperty("java.version"))
}

// ---------------- builders ----------------
fun obj(vararg kvs: Pair<String, HVal>): HVal.HObj {
    val m = LinkedHashMap<String, HVal>(kvs.size * 2)
    for ((k, v) in kvs) m[k] = v
    return HVal.HObj(m)
}

fun s(v: String): HVal.HS = HVal.HS(normalize(v))
fun i(v: Long): HVal.HI = HVal.HI(v)
private val NullV: HVal.HNull = HVal.HNull

fun fmt(h: HashOutcome): String = "${h.value}\t${h.byteLength}\t${h.canonical}"

// ---------------- F-1..F-5 ----------------
fun runFixtures(): String {
    val out = StringBuilder()

    val f1 = obj(
        "hash_contract_version" to s("hash-contract-v1"),
        "schema_version" to s("archive-document-1.0"),
        "algorithm_version" to s("bazi-core-1.3"),
        "input_hash" to s("sha256:abcd1234"),
        "year_pillar" to obj("gan" to s("甲"), "zhi" to s("子")),
    )
    out.append("F1-doc=").append(fmt(hashValue(f1))).append('\n')

    val f2 = obj(
        "eot_seconds_scaled6" to i(-3716584),
        "lon_diff_seconds" to i(-120),
    )
    out.append("F2-int=").append(fmt(hashValue(f2))).append('\n')

    val f3 = obj(
        "lon_diff_seconds" to i(Quantize.q(-3.7165835, 6)),
        "boundary_flag" to i(0),
    )
    out.append("F3-dec=").append(fmt(hashValue(f3))).append('\n')

    val p = "hash_contract_version"
    val f4n = obj(p to s("hash-contract-v1"), "hour_pillar" to NullV)
    val f4e = obj(p to s("hash-contract-v1"), "hour_pillar" to s(""))
    val f4o = obj(p to s("hash-contract-v1"))
    out.append("F4-null=").append(fmt(hashValue(f4n))).append('\n')
    out.append("F4-empty=").append(fmt(hashValue(f4e))).append('\n')
    out.append("F4-omit=").append(fmt(hashValue(f4o))).append('\n')

    fun neg(label: String, input: String) {
        val r = runCatching { normalize(input) }
        out.append(label).append('=')
            .append(if (r.isSuccess) "ACCEPTED(应拒绝!)" else "REJECTED::${r.exceptionOrNull()?.message ?: ""}")
            .append('\n')
    }
    neg("F5-fullwidth", "\uFF21")
    neg("F5-compat", "\uF900")
    neg("F5-accent", "e\u0301")

    return out.toString()
}

fun main() {
    // 显式使用 UTF-8 输出，避免 Windows 平台默认编码（如 GBK）破坏跨语言对拍的字节流
    val out = java.io.PrintStream(System.out, true /*autoFlush*/, "UTF-8")
    out.print(runFixtures())
}