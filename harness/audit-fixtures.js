'use strict';
/**
 * 夹具覆盖审计：把"有哪些真实页面样本"和"哪些已经被真正断言"对照出来。
 * 用途：每次站点改版补样本后，一眼看出哪些解析路径仍处于无保护状态。
 *
 * 覆盖情况来自 harness/fixtures.js 里的 COVERAGE 显式登记，不扫描测试源码
 * （扫描会因名字前缀与通用词产生假阳性，见那里的注释）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { FIXTURE_DIR, listFixtures, EXPECTED, CONTAINER, COVERAGE } = require('./fixtures');

const rows = listFixtures().map((file) => {
  const base = file.replace(/\.(html|json)$/, '');
  const bytes = fs.statSync(path.join(FIXTURE_DIR, file)).size;
  const oracle = EXPECTED[base];
  const mode = oracle ? oracle.mode : '-';
  return {
    fixture: file,
    kb: (bytes / 1024).toFixed(1),
    mode,
    container: oracle && CONTAINER[mode] ? CONTAINER[mode] : '-',
    expect: oracle && oracle.galleries !== null && oracle.galleries !== undefined ? String(oracle.galleries) : '-',
    coverage: COVERAGE[base] || '-',
  };
});

const w = (s, n) => String(s).padEnd(n);
console.log(`${w('fixture', 40)} ${w('KB', 7)} ${w('mode', 10)} ${w('expect', 7)} coverage`);
console.log('-'.repeat(84));
for (const r of rows) {
  console.log(`${w(r.fixture, 40)} ${w(r.kb, 7)} ${w(r.mode, 10)} ${w(r.expect, 7)} ${r.coverage}`);
}

const parseCovered = rows.filter((r) => r.coverage === 'parse').length;
const structural = rows.filter((r) => r.coverage === 'structural').length;
const unprotected = rows.filter((r) => r.coverage === '-').length;

console.log('-'.repeat(84));
console.log(
  `fixtures: ${rows.length}   parse 断言: ${parseCovered}   仅结构断言: ${structural}   无保护: ${unprotected}`,
);
if (unprotected > 0) {
  console.log('\n无保护夹具（站点改版不会报警）：');
  for (const r of rows.filter((x) => x.coverage === '-')) console.log(`  - ${r.fixture}`);
}
