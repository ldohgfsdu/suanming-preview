// tests/unit/display.test.mjs — 统一格式化模块 display.js 的确定性测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtTermUtc, fmtTermLong, fmtTermDate, fmtDaysLeft, fmtDaysLeftTechnical,
  fmtAgeDays, fmtTrueSolarMinutes, fmtLng,
} from '../../miniprogram/lib/display.js';

test('fmtTermUtc 保留原始 UTC 文本（技术层）', () => {
  assert.equal(fmtTermUtc('2026-09-07T14:42:00Z'), 'UTC 2026-09-07 14:42');
  assert.equal(fmtTermUtc(''), '—');
  assert.equal(fmtTermUtc(null), '—');
});

test('fmtTermLong / fmtTermDate 按设备本地时区转换（与 new Date 结果一致）', () => {
  const utcStr = '2026-09-07T14:42:00Z';
  const d = new Date(utcStr);
  // 与同环境 new Date(utc).get… 逐项一致，避免硬编码任何时区。
  const expLong =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  assert.equal(fmtTermLong(utcStr), expLong);
  const expDate = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  assert.equal(fmtTermDate(utcStr), expDate);
});

test('fmtTermLong 对非法输入回退', () => {
  assert.equal(fmtTermLong('not-a-date'), '—');
});

test('fmtDaysLeft 自然语言档位一致（首页/结果页共用）', () => {
  assert.equal(fmtDaysLeft(9.51), '9 天 12 小时');
  assert.equal(fmtDaysLeft(0.95), '22 小时 48 分');
  assert.equal(fmtDaysLeft(0.002), '3 分钟');
  assert.equal(fmtDaysLeft(0.0001), '已到');
  assert.equal(fmtDaysLeft(null), '—');
  assert.equal(fmtDaysLeft(NaN), '—');
});

test('fmtDaysLeftTechnical 精确两位', () => {
  assert.equal(fmtDaysLeftTechnical(9.5123), '9.51 天');
  assert.equal(fmtDaysLeftTechnical(null), '—');
});

test('fmtAgeDays 朔望月龄统一一位小数', () => {
  assert.equal(fmtAgeDays(1.634), '1.6 天');
  assert.equal(fmtAgeDays(null), '—');
});

test('fmtTrueSolarMinutes 带符号一位小数', () => {
  assert.equal(fmtTrueSolarMinutes(14.336), '+14.3 分钟');
  assert.equal(fmtTrueSolarMinutes(-6.4), '-6.4 分钟');
  assert.equal(fmtTrueSolarMinutes(null), '—');
});

test('fmtLng 统一一位小数并加东经', () => {
  assert.equal(fmtLng(116.4074), '东经 116.4°');
  assert.equal(fmtLng(null), '—');
});