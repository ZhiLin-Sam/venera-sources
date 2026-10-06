'use strict';
/**
 * 源目录体检器：汇总/镜像一批源之前，先确认每个源**能被宿主加载**且元数据合规。
 *
 * 两级结论：
 *   阻断（✗）——一定会导致导入失败或行为异常：
 *     加载失败 / 缺少 name,key,version / key 不合规 / version 不合规 / **minAppVersion 为空**
 *   告警（!）——只能作为线索，需人工判断：
 *     引用了宿主不存在的全局 / 使用了新于 ES2022 的特性 / url 形态可疑
 *
 * minAppVersion 为空是**硬阻断**：宿主基类默认 ""，compareSemVer 会对 "" 调 int.parse
 * 并抛 FormatException，而报错完全不指向该字段（doc/api/comic_source.zh.md:25）。
 *
 * 用法：
 *   node harness/validate-sources.js <目录> [--json]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSource } = require('./runtime');
const { findAbsentGlobals, findTooNew } = require('./code-scan');

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[.-].+)?$/;

/** 万能桩：审计模式下补齐宿主其余全局，避免因"某个 UI 成员不在"而误判源有问题。 */
function universalStub(label) {
  const handler = {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString') return () => `[stub ${label}]`;
      if (prop === Symbol.toStringTag) return 'Stub';
      return universalStub(`${label}.${String(prop)}`);
    },
    apply: () => universalStub(`${label}()`),
    construct: () => universalStub(`new ${label}()`),
  };
  return new Proxy(function () {}, handler);
}

const HOST_STUBS = {
  UI: universalStub('UI'),
  APP: universalStub('APP'),
  Convert: universalStub('Convert'),
  Image: universalStub('Image'),
  ComicDetails: universalStub('ComicDetails'),
  Comment: universalStub('Comment'),
  ComicPage: universalStub('ComicPage'),
  log: () => {},
  fetch: async () => universalStub('fetch()'),
  compute: async (fn) => (typeof fn === 'function' ? fn() : undefined),
  createUuid: () => '00000000-0000-0000-0000-000000000000',
  randomInt: () => 0,
  randomDouble: () => 0,
  setClipboard: () => {},
  getClipboard: () => '',
  sendMessage: () => universalStub('sendMessage()'),
  appVersion: '1.17.0',
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
  clearInterval: () => {},
};

function validateFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  const result = {
    file: path.basename(file),
    ok: false,
    name: null,
    key: null,
    version: null,
    minAppVersion: null,
    url: null,
    blocking: [],
    advisory: [],
  };

  const absentHits = findAbsentGlobals(code);
  if (absentHits.length) result.advisory.push(`疑似宿主不存在的全局: ${absentHits.join(', ')}`);
  const tooNew = findTooNew(code);
  if (tooNew.length) result.advisory.push(`新于 ES2022: ${tooNew.join(', ')}`);

  try {
    const rt = loadSource(file, { routes: [], globals: HOST_STUBS });
    const s = rt.source;
    result.ok = true;
    result.name = s.name ?? null;
    result.key = s.key ?? null;
    result.version = s.version ?? null;
    result.minAppVersion = s.minAppVersion ?? null;
    result.url = s.url ?? null;
  } catch (e) {
    result.blocking.push(`加载失败: ${e.message}`);
    return result;
  }

  if (!result.name) result.blocking.push('缺少 name');
  if (!result.key) result.blocking.push('缺少 key');
  else if (!KEY_RE.test(result.key)) result.blocking.push(`key 不合规: ${result.key}`);
  if (!result.version) result.blocking.push('缺少 version');
  else if (!VERSION_RE.test(result.version)) result.blocking.push(`version 不合规: ${result.version}`);
  if (!result.minAppVersion) {
    result.blocking.push('minAppVersion 为空（宿主导入时抛 FormatException，且报错不指向该字段）');
  } else if (!VERSION_RE.test(result.minAppVersion)) {
    result.blocking.push(`minAppVersion 不合规: ${result.minAppVersion}`);
  }
  if (result.url && /github\.com\/[^/]+\/[^/]+\/blob\//.test(result.url)) {
    result.advisory.push('url 指向 GitHub 文件展示页（文档 §1 禁止，应填原始下载地址）');
  }
  return result;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('用法: node harness/validate-sources.js <目录> [--json]');
    process.exit(2);
  }
  const asJson = process.argv.includes('--json');
  const files = fs
    .readdirSync(target)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => path.join(target, f));
  const rows = files.map(validateFile);

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const w = (s, n) => String(s ?? '').padEnd(n);
    console.log(`${w('file', 34)} ${w('key', 22)} ${w('ver', 8)} ${w('minApp', 8)} 结论`);
    console.log('-'.repeat(112));
    for (const r of rows) {
      const mark = r.blocking.length ? `✗ ${r.blocking.join(' | ')}` : r.advisory.length ? `! ${r.advisory.join(' | ')}` : '✓';
      console.log(`${w(r.file, 34)} ${w(r.key, 22)} ${w(r.version, 8)} ${w(r.minAppVersion, 8)} ${mark}`);
    }
  }

  const byKey = {};
  for (const r of rows) if (r.key) (byKey[r.key] ||= []).push(r.file);
  const dup = Object.entries(byKey).filter(([, v]) => v.length > 1);
  const blocked = rows.filter((r) => r.blocking.length).length;
  const advised = rows.filter((r) => !r.blocking.length && r.advisory.length).length;

  if (!asJson) {
    console.log('-'.repeat(112));
    console.log(
      `sources: ${rows.length}   加载失败: ${rows.filter((r) => !r.ok).length}   阻断: ${blocked}   告警: ${advised}`,
    );
    if (dup.length) {
      console.log('\n⚠ 重复 key（宿主只会装一份，汇总时必须二选一）：');
      for (const [key, list] of dup) console.log(`  ${key}: ${list.join(', ')}`);
    }
  }
  process.exitCode = blocked ? 1 : 0;
}

if (require.main === module) main();

module.exports = { validateFile, HOST_STUBS, universalStub };
