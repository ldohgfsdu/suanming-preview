/**
 * shared/hash/fingerprint.ts
 * ---------------------------------------------------------------------------
 * HASH_CONTRACT_V1 §6.3 / B-6：环境指纹中登记 Unicode/ICU 版本。
 * 即使 NFC 对合法输入退化为恒等变换，仍须记录宿主 Unicode 能力版本，作为关闭证据之一。
 */

/** 读取当前 Node/ICU 的 Unicode 版本（NFC 归一化工具幂等性所依赖的宿主能力）。 */
export function unicodeVersion(): string {
  // Node 通过 process.versions.unicode 暴露 ICU Unicode 版本；无则回退 'n/a'
  return (process.versions as Record<string, string> & { unicode?: string }).unicode ?? 'n/a';
}

export interface EnvFingerprint {
  node: string;
  unicode: string;
  icu: string;
  tz: string;
  lang: string;
  lcAll: string;
  hashContract: string;
}

/** B-6 环境侧指纹：供 CI 与本地记录，证明运行环境固定。 */
export function fingerprint(hashContract = 'hash-contract-v1'): EnvFingerprint {
  return {
    node: process.version,
    unicode: unicodeVersion(),
    icu: (process.versions as Record<string, string> & { icu?: string }).icu ?? unicodeVersion(),
    tz: process.env.TZ ?? 'n/a',
    lang: process.env.LANG ?? 'n/a',
    lcAll: process.env.LC_ALL ?? 'n/a',
    hashContract,
  };
}