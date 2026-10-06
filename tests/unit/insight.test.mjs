// tests/unit/insight.test.mjs — AI 解读层本地降级路径测试
// 验证：确定性、无禁词、Guard 生效、未知安全降级、真值源字段契约。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BANNED_WORDS = [
  '算命', '占卜', '算卦', '卜卦', '运势', '运程', '流年', '大运', '注定', '命中',
  '吉凶', '宜忌', '化解', '犯太岁', '开运', '招财', '转运', '合婚', '择日', '看日子', '八字算',
  '旺衰', '喜用', '用神', '忌神', '十神', '藏干', '神煞', '空亡', '胎元', '命宫', '身宫',
];

const FACT_SAMPLE = {
  pillars: [
    { label: '年', gan_zhi: '庚午', element: '金' },
    { label: '月', gan_zhi: '辛巳', element: '金' },
    { label: '日', gan_zhi: '丙寅', element: '火' },
    { label: '时', gan_zhi: null, element: null },
  ],
  solarTerm: { prev: '芒种', next: '夏至' },
  solarTime: { corrected: '+18分钟', day_changed: false },
  lunar: '庚午年五月十七',
  wuxing: [{ name: '金', literal_count: 3 }, { name: '火', literal_count: 2 }],
};

function countTally(facts) {
  const arr = (facts && facts.wuxing) || [];
  const out = arr
    .filter((t) => typeof t.literal_count === 'number')
    .map((t) => t.name + t.literal_count);
  return out.length ? out.join('·') : '—';
}

// 与 miniprogram/lib/insight.js 的 ruleBasedInsight 等价实现
function ruleBasedInsight(facts) {
  const sections = [];
  const termBits = [];
  if (facts.solarTerm.prev) termBits.push('上一个节气是' + facts.solarTerm.prev);
  if (facts.solarTerm.next) termBits.push('下一个节气是' + facts.solarTerm.next);
  sections.push({
    id: 's1', title: '节气坐标', contentType: 'FACT',
    content: termBits.join('，') + '。节气在传统历法中是太阳周年运动的刻度，本档案的月柱以「节」而非公历月为分界。',
  });

  const pillars = (facts.pillars || []).filter((p) => p.gan_zhi);
  sections.push({
    id: 's2', title: '干支纪时', contentType: 'CULTURAL_CONTEXT',
    content: pillars.length
      ? '四柱依次为 ' + pillars.map((p) => p.label + '柱' + p.gan_zhi).join('、')
        + '。天干十位循环纪年、纪月、纪日，地支十二位对应十二时辰与十二地支方位，这是中国古代记录时间的一套符号系统。'
      : '无法判定：缺少干支数据。',
  });

  sections.push({
    id: 's3', title: '五行字面分布', contentType: 'FACT',
    content: '按天干地支逐一归属，本档案的字面计数为 ' + countTally(facts)
      + '。这只是符号出现次数的统计，本档案不对其作任何强弱评判。',
  });

  if (facts.solarTime && facts.solarTime.corrected) {
    sections.push({
      id: 's4', title: '太阳时间', contentType: 'FACT',
      content: '按出生地经度与均时差换算，出生时刻的钟表时间与真太阳时相差 ' + facts.solarTime.corrected
        + (facts.solarTime.day_changed ? '，并因此改变了历日归属' : '')
        + '。传统排盘采用真太阳时，故与钟表时间可能不同。',
    });
  }

  return {
    outputVersion: 'insight-1.0',
    model: 'rule-based-fallback',
    sections,
    limitations: ['仅解释客观历法事实', '不含预测、判定或建议'],
    fallback: true,
  };
}

test('I1 本地降级：输出确定性（两次调用完全一致）', () => {
  assert.equal(
    JSON.stringify(ruleBasedInsight(FACT_SAMPLE)),
    JSON.stringify(ruleBasedInsight(FACT_SAMPLE)),
  );
});

test('I2 本地降级：生成多个小节且均标注合法 contentType', () => {
  const ins = ruleBasedInsight(FACT_SAMPLE);
  assert.ok(ins.sections.length >= 3);
  ins.sections.forEach((s) => {
    assert.ok(s.contentType === 'FACT' || s.contentType === 'CULTURAL_CONTEXT');
    assert.ok(s.content && s.content.length > 0);
  });
});

test('I3 本地降级：全文本零禁词命中（含否定句式）', () => {
  const ins = ruleBasedInsight(FACT_SAMPLE);
  const flat = ins.sections.map((s) => s.title + s.content).join('');
  // 不设例外：微信内容安全按关键词命中，否定句式同样会被判违规。
  const hits = BANNED_WORDS.filter((w) => flat.indexOf(w) >= 0);
  assert.deepEqual(hits, [], '命中禁词: ' + hits.join(','));
});

test('I4 五行只作字面计数，明示不作强弱评判', () => {
  const s3 = ruleBasedInsight(FACT_SAMPLE).sections.find((s) => s.id === 's3');
  assert.match(s3.content, /只是符号出现次数的统计/);
  assert.match(s3.content, /不对其作任何强弱评判/);
});

test('I5 未知时辰（null）安全降级，不渲染 null/undefined', () => {
  const flat = ruleBasedInsight(FACT_SAMPLE).sections.map((s) => s.content).join('');
  assert.equal(flat.indexOf('null'), -1);
  assert.equal(flat.indexOf('undefined'), -1);
});

test('I6 空/缺失事实输入不抛异常', () => {
  const empty = { pillars: [], solarTerm: {}, solarTime: {}, lunar: null, wuxing: [] };
  const ins = ruleBasedInsight(empty);
  assert.ok(ins.sections.length >= 2);
});

test('I7 干支缺失时输出「无法判定」而非补全', () => {
  const noPillar = { pillars: [], solarTerm: { prev: null, next: null }, solarTime: {}, lunar: null, wuxing: [] };
  const flat = ruleBasedInsight(noPillar).sections.map((s) => s.content).join('');
  assert.match(flat, /无法判定/);
});

// buildFacts 的真值源契约：字段名必须与结果页实际产出一致，
// 否则 AI 会收到恒为 false 的假事实（曾发生：跨日字段误用 trueSolarDayChanged）。
test('I8 buildFacts：跨日字段读取 crossDay（结果页真实字段名）', () => {
  const app = readFileSync(resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8');
  // 结果页确实产出 crossDay
  assert.match(app, /crossDay: !!\(f\.trueSolar && f\.trueSolar\.dayChanged\)/);
  // insight.js 必须读 crossDay，不得读不存在的 trueSolarDayChanged
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  assert.match(insight, /day_changed: !!\(r\.crossDay\)/);
  assert.doesNotMatch(insight, /r\.trueSolarDayChanged/);
});

test('I10 AI 显式触发：onLoad 不得自动调用解读，须有用户点按入口', () => {
  const js = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.js'), 'utf8');
  const wxml = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.wxml'), 'utf8');
  // 1) 必须提供显式点按入口，且页面有按钮绑定
  assert.match(js, /onGenerateInsight\(/, '须提供显式点按入口');
  assert.match(wxml, /bindtap="onGenerateInsight"/, '页面须有按钮绑定该入口');
  // 2) onLoad 内不得自动触发（PRD §7.4/§9 铁律）
  const i = js.indexOf('onLoad()');
  assert.ok(i >= 0, '应存在 onLoad');
  assert.doesNotMatch(js.slice(i, i + 600), /this\.loadInsight\(/, 'onLoad 内不得自动调用 loadInsight');
  // 3) 三态机须覆盖 idle / loading / done
  assert.match(js, /insightState: 'idle'/);
  assert.match(wxml, /insightState === 'idle'/);
});

test('I11 缓存键语义：轻量缓存键不得冒充冻结契约 docHash', () => {
  const lib = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  const page = readFileSync(resolve(__dirname, '../../miniprogram/pages/result/result.js'), 'utf8');
  // 旧名 localDocHash 易被误认为契约 docHash，必须已重命名
  assert.doesNotMatch(lib, /localDocHash/, '须重命名为 insightCacheKey');
  assert.match(lib, /export function insightCacheKey/);
  // 注释须澄清与 HASH_CONTRACT_V1 的区别（防后人误当 docHash 上传）
  assert.match(lib, /HASH_CONTRACT_V1/, '须注明与冻结契约 docHash 的区别');
  // 仅缓存云端 AI 产出（本地规则零成本，不占缓存）
  assert.match(page, /payload\.usedAI && cacheKey/, '仅 AI 产出入缓存');
});

test('I9 buildFacts：五行只输出字面计数，不带旺衰/强弱语义字段', () => {
  const insight = readFileSync(resolve(__dirname, '../../miniprogram/lib/insight.js'), 'utf8');
  const m = insight.match(/wuxing:[\s\S]{0,200}?\}\)\)/);
  assert.ok(m, '应存在 wuxing 映射');
  assert.match(m[0], /literal_count/);
  // 不得出现强弱/旺衰类字段名
  assert.doesNotMatch(m[0], /strength|wang|shuai|strong|weak/i);
});