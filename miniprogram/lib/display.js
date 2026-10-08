/**
 * miniprogram/lib/display.js — 全站「时间 / 数值」统一格式化入口（单一事实源）。
 *
 * 目标：同一数据在不同页面表达一致，避免各页面各自 toFixed / 自行拼串。
 * 分两层：用户层（自然语言、设备本地时区）与 技术层（UTC、更高精度、供关于页/说明）。
 *
 * 时区规则（统一，不硬编码任何时区）：
 *   - 节气时刻在算法内以 UTC ISO 字符串 ("YYYY-MM-DDTHH:MM:SSZ") 存在。
 *   - 用户层一律按「设备本地时区」用 new Date(utc) 本地化展示（中国用户即 UTC+8，但不写死）。
 *   - 技术层保留原始 UTC 文本（供 about 与其他说明）。
 * 所有函数为确定性的纯函数；不读 wx、不读 this。
 */

function pad(n, w) { return String(n).padStart(w == null ? 2 : w, '0'); }

function parseUtc(utc) {
  if (!utc) return null;
  const d = new Date(utc);
  return isNaN(d.getTime()) ? null : d;
}

/** 用户层：节气时刻 → 设备本地 `M月D日 HH:MM`（主界面）。 */
export function fmtTermDate(utc) {
  const d = parseUtc(utc);
  if (!d) return '—';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 用户层：带年份的本地时间 `YYYY-MM-DD HH:MM`。 */
export function fmtTermLong(utc) {
  const d = parseUtc(utc);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 技术层：保留原始 UTC 文本 `UTC YYYY-MM-DD HH:MM`（关于页/说明）。 */
export function fmtTermUtc(utc) {
  if (!utc) return '—';
  return `UTC ${utc.slice(0, 16).replace('T', ' ')}`;
}

/** 用户层：距某节气剩时间 → 自然语言 `X天X小时` / `X小时X分` / `X分钟` / `已到`。 */
export function fmtDaysLeft(days) {
  if (days == null || !isFinite(days)) return '—';
  if (days <= 0.001) return '已到';
  const totalH = days * 24;
  const hh = Math.floor(totalH);
  const mm = Math.round((totalH - hh) * 60);
  if (hh <= 0) return `${mm} 分钟`;
  if (hh < 24) return `${hh} 小时 ${mm} 分`;
  return `${Math.floor(hh / 24)} 天 ${hh % 24} 小时`;
}

/** 技术层：据下节气剩余天数（精确两位）`4.51 天`，供需要高精度的上下文。 */
export function fmtDaysLeftTechnical(days) {
  if (days == null || !isFinite(days)) return '—';
  return `${Number(days).toFixed(2)} 天`;
}

/** 用户层：月朔望月龄展示 `1.6 天`。 */
export function fmtAgeDays(ageDays) {
  if (ageDays == null || !isFinite(ageDays)) return '—';
  return `${Number(ageDays).toFixed(1)} 天`;
}

/** 用户层：经纬度坐标，统一到小数点后 1 位（地名为主，数字弱化）。 */
export function fmtCoord(lng, lat) {
  const l = (v) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(1));
  return { lng: l(lng), lat: l(lat), sep: ' · ' };
}

/** 用户层：单一经度值（东经），统一 1 位小数。 */
export function fmtLng(lng) {
  return lng == null || !isFinite(lng) ? '—' : `东经 ${Number(lng).toFixed(1)}°`;
}

/** 用户层：真太阳时修正量（分钟），统一 1 位小数并带符号。 */
export function fmtTrueSolarMinutes(offsetMinutes) {
  if (offsetMinutes == null || !isFinite(offsetMinutes)) return '—';
  return `${offsetMinutes >= 0 ? '+' : ''}${Number(offsetMinutes).toFixed(1)} 分钟`;
}

/** 用户层：日出/日落短时分（沿用算法返回的 HH:MM）。 */
export function fmtClockTime(hhmm) {
  return hhmm || '—';
}