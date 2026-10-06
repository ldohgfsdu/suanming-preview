// 健壮性冒烟：computeArchive 在全范围（1900–2100 极值/闰日/历史/今日）不崩溃且输出自洽。
import assert from 'node:assert';
import { computeArchive } from '../../miniprogram/lib/archive.js';

const SPAN = 116.4; // 北京
const CASES = [
  [1900, 1, 1], [1900, 12, 31], [2100, 1, 1], [2100, 12, 31],
  [2000, 2, 29], [2024, 2, 29], [1900, 2, 28], [2100, 2, 28],
  [2020, 5, 23], [2024, 2, 10], [2023, 3, 22], [1949, 10, 1], [1997, 7, 1],
  [1980, 6, 15], [2033, 12, 22], [2050, 7, 7], [2026, 9, 11],
];

let pass = 0, fail = 0;
for (const [y, m, d] of CASES) {
  try {
    const f = computeArchive(y, m, d, 0, SPAN);
    assert.ok(f, `computeArchive(${y}-${m}-${d}) 应返回`);
    assert.ok(f.four && f.four.year && f.four.year.ganz, `四柱年柱齐全 ${y}-${m}-${d}`);
    assert.ok(f.four.day && f.four.day.ganz, `日柱齐全 ${y}-${m}-${d}`);
    assert.ok(f.tally, `五行 ${y}-${m}-${d}`);
    assert.ok(f.term && f.term.next, `下节气 ${y}-${m}-${d}`);
    assert.ok(f.moon && f.moon.name, `月相 ${y}-${m}-${d}`);
    pass++;
  } catch (e) {
    console.log(`FAIL ${y}-${m}-${d}: ${e.message}`);
    fail++;
  }
}
console.log(`archive robustness smoke: pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);