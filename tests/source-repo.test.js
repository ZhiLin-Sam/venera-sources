'use strict';
/**
 * 源仓库契约测试：保证"这个仓库作为 Venera 源仓库被添加"时不会因为低级错误而导入失败。
 *
 * 契约事实来源（均由 Venera-Next 源码核实，见 docs/DECISIONS.md D11）：
 *  - index.json 是 **JSON 数组**，不是对象；
 *  - 条目必填 key / name / version；key 必须匹配 ^\w+$；
 *  - version 须形如 ^\d+\.\d+\.\d+(?:[.\-].+)?$（宿主用的是自研 compareSemVer，不是 SemVer）；
 *  - url 优先于 fileName，二者取其一；相对路径以**列表 URL** 为基准解析；
 *  - 源脚本的 minAppVersion **省略即导入失败**（基类默认 ""，compareSemVer 会对 "" 调 int.parse），
 *    且报错完全不指向该字段——所以这里必须显式断言非空。
 *  - JS 引擎是 QuickJS-NG，可确证语法下界 ES2022。Node 24 比它宽松，
 *    因此这里用静态守卫拦住 ES2023+ 特性，避免"测试绿、App 挂"。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSource } = require('../harness/runtime');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.json');
const SOURCE = path.join(ROOT, 'sources', 'ehentai.js');

const KEY_RE = /^\w+$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[.\-].+)?$/;

test('index.json 是数组且条目字段合法', () => {
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  assert.ok(Array.isArray(raw), 'index.json 必须是 JSON 数组（宿主按列表解析）');
  assert.ok(raw.length > 0, '至少要有一个源条目');

  for (const entry of raw) {
    assert.ok(entry.key, `缺少 key: ${JSON.stringify(entry)}`);
    assert.match(entry.key, KEY_RE, `key 不合规: ${entry.key}`);
    assert.ok(entry.name, `缺少 name: ${entry.key}`);
    assert.ok(entry.version, `缺少 version: ${entry.key}`);
    assert.match(entry.version, VERSION_RE, `version 不合规: ${entry.version}`);
    assert.ok(
      entry.fileName || entry.url,
      `key=${entry.key} 必须至少有 fileName 或 url 之一`,
    );
  }
});

test('index.json 引用的脚本文件真实存在，且 key/version 与脚本元数据一致', () => {
  const entries = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  for (const entry of entries) {
    if (!entry.fileName) continue;
    const target = path.join(ROOT, entry.fileName);
    assert.ok(fs.existsSync(target), `fileName 指向不存在的文件: ${entry.fileName}`);

    const rt = loadSource(target, { routes: [] });
    assert.equal(rt.source.key, entry.key, `脚本 key 与 index.json 不一致（${entry.key}）`);
    assert.equal(
      rt.source.version,
      entry.version,
      `脚本 version 与 index.json 不一致（index=${entry.version} script=${rt.source.version}）`,
    );
  }
});

test('源脚本元数据契约：minAppVersion 非空，name/key/version 齐备', () => {
  const rt = loadSource(SOURCE, { routes: [] });
  for (const field of ['name', 'key', 'version', 'minAppVersion']) {
    assert.ok(rt.source[field], `源脚本缺少 ${field}`);
  }
  assert.match(rt.source.key, /^[a-zA-Z_][a-zA-Z0-9_]*$/, '脚本身份的 key 不允许数字开头');
  assert.match(rt.source.minAppVersion, VERSION_RE, `minAppVersion 不合规: ${rt.source.minAppVersion}`);
});

test('源脚本没有声明已废弃/不存在的全局 API', () => {
  const code = fs.readFileSync(SOURCE, 'utf8');
  // 这些名字在 Venera-Next 里完全不存在（subagent 全仓正则零命中），用了就是静默失败：
  // 宿主 sendMessage 的 dispatch 没有 default 分支，拼错只会拿到 null 而不报错。
  const absent = [
    'http_get',
    'http_post',
    'http_download',
    'localStorage',
    'sessionStorage',
    'btoa',
    'atob',
    'GM_xmlhttpRequest',
    'XMLHttpRequest',
  ];
  const hits = absent.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
  assert.deepEqual(hits, [], `使用了宿主不存在的 API: ${hits.join(', ')}`);
});

test('ES2022 兼容守卫：不得使用 QuickJS-NG 下界之上的特性', () => {
  const code = fs.readFileSync(SOURCE, 'utf8');
  const tooNew = [
    [/\bObject\s*\.\s*groupBy\b/, 'Object.groupBy (ES2024)'],
    [/\bMap\s*\.\s*groupBy\b/, 'Map.groupBy (ES2024)'],
    [/\bPromise\s*\.\s*withResolvers\b/, 'Promise.withResolvers (ES2024)'],
    [/\bArray\s*\.\s*fromAsync\b/, 'Array.fromAsync (ES2024)'],
    [/\.findLast\s*\(/, 'Array.prototype.findLast (ES2023)'],
    [/\.findLastIndex\s*\(/, 'Array.prototype.findLastIndex (ES2023)'],
    [/\.toSorted\s*\(/, 'Array.prototype.toSorted (ES2023)'],
    [/\.toReversed\s*\(/, 'Array.prototype.toReversed (ES2023)'],
    [/\.toSpliced\s*\(/, 'Array.prototype.toSpliced (ES2023)'],
    [/\.with\s*\(/, 'Array.prototype.with (ES2023)'],
    [/\bstructuredClone\b/, 'structuredClone (QuickJS 不保证提供)'],
    [/^\s*import\s/m, 'ESM import（宿主求值的是脚本，不支持模块语法）'],
    [/^\s*export\s/m, 'ESM export'],
    [/\brequire\s*\(/, 'CommonJS require'],
  ];
  const found = [];
  for (const [re, label] of tooNew) {
    if (re.test(code)) found.push(label);
  }
  assert.deepEqual(found, [], `使用了新于 ES2022 的特性，App 内会失败: ${found.join(', ')}`);
});
