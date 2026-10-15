// tests/unit/culture-data.test.mjs — 传统文化科普知识库的完整性、禁词与一致性测试。
//
// 背景：科普内容直接面向微信审核与终端用户，且 PRD §1.2 禁词全域生效（否定句式同样违规）。
// 本测试充当「内容 Guard」：数据写错、关联断链、表格错列、禁词漏网都在此处拦截，
// 与 insight 的 Guard 失败重试机制同一思想——宁可测试挂，不可内容带病上线。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CULTURE_ENTRIES,
  CULTURE_CATEGORIES,
  cultureCategoryOf,
  cultureEntryById,
  cultureRelated,
  cultureSearch,
  culturePanelOf,
  cultureToggle,
} from '../../miniprogram/lib/culture-data.js';
import { GANS, ZHIS } from '../../miniprogram/lib/engine.js';

// PRD §1.2 全域禁用词（名称 / 简介 / 页面 / 海报 / 说明 PDF 均不得出现）
const FORBIDDEN = [
  '算命', '八字', '排盘', '命盘', '命理', '运势', '吉凶', '喜用神',
  '大运', '合婚', '择日', '大师', '预测', '开运', '改命',
];

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

const STRINGS = CULTURE_ENTRIES.flatMap((e) => allStrings(e));

test('CD1 条目 id 唯一且必填字段非空', () => {
  const ids = new Set();
  for (const e of CULTURE_ENTRIES) {
    assert.ok(e.id && !ids.has(e.id), `id 缺失或重复：${e.id}`);
    ids.add(e.id);
    for (const f of ['name', 'category', 'summary', 'definition', 'origin', 'source']) {
      assert.ok(typeof e[f] === 'string' && e[f].trim().length > 0, `${e.id}.${f} 为空`);
    }
  }
});

test('CD2 分类合法，且每个分类至少有条目', () => {
  const catIds = new Set(CULTURE_CATEGORIES.map((c) => c.id));
  for (const e of CULTURE_ENTRIES) {
    assert.ok(catIds.has(e.category), `${e.id} 分类 ${e.category} 未定义`);
  }
  for (const c of CULTURE_CATEGORIES) {
    assert.ok(CULTURE_ENTRIES.some((e) => e.category === c.id), `分类 ${c.id} 下没有条目`);
  }
});

test('CD3 关联目标全部存在，且每条至少有一个关联与出处', () => {
  for (const e of CULTURE_ENTRIES) {
    assert.ok(Array.isArray(e.relations) && e.relations.length >= 1, `${e.id} 没有关联概念`);
    for (const rel of e.relations) {
      assert.ok(cultureEntryById(rel.id), `${e.id} 关联了不存在的 ${rel.id}`);
      assert.ok(rel.text && rel.text.trim(), `${e.id} → ${rel.id} 缺少关联说明`);
    }
  }
});

test('CD4 表格列数与表头一致，行非空', () => {
  for (const e of CULTURE_ENTRIES) {
    if (!e.table) continue;
    const { head, rows } = e.table;
    assert.ok(head.length >= 2 && rows.length >= 2, `${e.id} 表格过小`);
    for (const row of rows) {
      assert.equal(row.length, head.length, `${e.id} 表格行列数不一致：${JSON.stringify(row)}`);
      for (const cell of row) assert.ok(String(cell).trim().length > 0, `${e.id} 表格存在空单元格`);
    }
  }
});

test('CD5 禁词扫描：全部字符串字段不得出现 PRD §1.2 禁用词（含否定句式）', () => {
  const bad = [];
  for (const s of STRINGS) {
    for (const w of FORBIDDEN) {
      if (s.includes(w)) bad.push(`命中「${w}」：${s.slice(0, 40)}…`);
    }
  }
  assert.deepEqual(bad, [], `科普内容触雷：\n${bad.join('\n')}`);
});

test('CD6 与引擎常量一致：天干地支表首列 = engine.js 的 GANS / ZHIS', () => {
  const tg = cultureEntryById('tiangan');
  const dz = cultureEntryById('dizhi');
  assert.deepEqual(tg.table.rows.map((r) => r[0]), GANS, '十天干表与 engine GANS 不一致');
  assert.deepEqual(dz.table.rows.map((r) => r[0]), ZHIS, '十二地支表与 engine ZHIS 不一致');
  // 节气表 24 行且黄经以 15° 递增（立春 315° 起）
  const jq = cultureEntryById('jieqi');
  assert.equal(jq.table.rows.length, 24, '节气表应为 24 行');
  jq.table.rows.forEach((row, i) => {
    const lon = parseInt(String(row[1]).replace('°', ''), 10);
    assert.equal(lon, (315 + i * 15) % 360, `${row[0]} 黄经应为 ${(315 + i * 15) % 360}°`);
  });
});

test('CD7 检索：名称 / 关键词 / 正文命中，多词按「与」组合，空词返回全部', () => {
  assert.equal(cultureSearch('').length, CULTURE_ENTRIES.length, '空关键词应返回全部');
  assert.equal(cultureSearch('   ').length, CULTURE_ENTRIES.length, '纯空白应返回全部');

  const byName = cultureSearch('五行');
  assert.equal(byName[0].id, 'wuxing', '名称完全匹配应排首位');

  const byKw = cultureSearch('生肖');
  assert.ok(byKw.some((e) => e.id === 'shengxiao'), '关键词应命中生肖条目');

  const byBody = cultureSearch('七十二候');
  assert.ok(byBody.some((e) => e.id === 'jieqi'), '正文命中应可检索');

  const and = cultureSearch('节气 立春');
  assert.ok(and.length > 0 && and.every((e) => JSON.stringify(e).includes('立春')), '多词应为「与」语义');

  assert.deepEqual(cultureSearch('不存在的词xyz'), [], '无效应返回空数组');
});

test('CD8 关联解析返回名称与跳转 id', () => {
  const wxEntry = cultureEntryById('wuxing');
  const rels = cultureRelated(wxEntry);
  assert.ok(rels.length >= 2);
  for (const r of rels) {
    assert.ok(r.name && r.id, '关联解析结果应含 id 与名称');
    assert.equal(r.id, cultureEntryById(r.id).id);
  }
  assert.deepEqual(cultureRelated(null), []);
});

test('CD9 cultureCategoryOf / cultureEntryById 边界', () => {
  assert.equal(cultureCategoryOf('foundation').name, '基础概念');
  assert.equal(cultureCategoryOf('nope'), null);
  assert.equal(cultureEntryById('bagua').name, '八卦');
  assert.equal(cultureEntryById('__missing__'), null);
});

test('CD10 就地科普面板：culturePanelOf 只吐展示字段，未知 id 为 null', () => {
  const panel = culturePanelOf('wuxing');
  const entry = cultureEntryById('wuxing');
  assert.equal(panel.id, 'wuxing');
  assert.equal(panel.name, entry.name);
  assert.equal(panel.definition, entry.definition, '定义必须与知识库同源');
  assert.equal(panel.summary, entry.summary);
  // 面板刻意不带 sections/table 等长字段——就地展开只给摘要与定义，
  // 更深的内容留给「读完整科普」，避免把详情页内容塞进每一处锚点
  assert.equal(panel.sections, undefined);
  assert.equal(panel.table, undefined);
  assert.equal(culturePanelOf('__missing__'), null);
  assert.equal(culturePanelOf(''), null);
});

test('CD11 开关语义 cultureToggle：展开 / 收起 / 切换 / 死链返回 null', () => {
  // 展开
  const open = cultureToggle('', 'jieqi');
  assert.equal(open.cultureOpenId, 'jieqi');
  assert.equal(open.cultureOpen.name, cultureEntryById('jieqi').name);
  // 再点同一条目 → 收起（合法状态，不是 null）
  const close = cultureToggle('jieqi', 'jieqi');
  assert.deepEqual(close, { cultureOpenId: '', cultureOpen: null });
  // 切换
  const swap = cultureToggle('jieqi', 'nongli');
  assert.equal(swap.cultureOpenId, 'nongli');
  assert.notEqual(swap.cultureOpen.definition, open.cultureOpen.definition);
  // 死链与空 id → null（调用方保持原状，不得误收起或误展开）
  assert.equal(cultureToggle('jieqi', ''), null);
  assert.equal(cultureToggle('jieqi', undefined), null);
  assert.equal(cultureToggle('jieqi', '__missing__'), null);
  assert.equal(cultureToggle('jieqi', 'ganzhi'), null, 'ganzhi 是历史死链 id，必须返回 null');
});
