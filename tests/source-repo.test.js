'use strict';
/**
 * 源仓库契约测试：保证"这个仓库作为 Venera 源仓库被添加"时不会因为低级错误而导入失败。
 *
 * 契约事实来源（均已在本机 Venera-Next 源码核实，见 docs/DECISIONS.md D11）：
 *  - index.json 是 **JSON 数组**，不是对象；
 *  - 条目必填 key / name / version；脚本侧 key 须匹配 ^[a-zA-Z_][a-zA-Z0-9_]*$；
 *  - version 须形如 ^\d+\.\d+\.\d+(?:[.\-].+)?$（宿主是自研 compareSemVer，不是 SemVer）；
 *  - url 优先于 fileName，二者取其一；相对路径以**列表 URL**为基准；
 *  - **同一 key 不会安装多份**（文档 §7），所以清单里的 key 必须唯一；
 *  - 源脚本 minAppVersion **省略即导入失败**（基类默认 ""，compareSemVer 对 "" 调 int.parse），
 *    且报错完全不指向该字段。
 *  - JS 引擎是 QuickJS-NG，可确证语法下界 ES2022；Node 24 比它宽松，
 *    故用静态扫描作告警（已知局限见 harness/code-scan.js）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSource } = require('../harness/runtime');
const { HOST_STUBS } = require('../harness/validate-sources');
const { findAbsentGlobals, findTooNew } = require('../harness/code-scan');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.json');
const SOURCE = path.join(ROOT, 'sources', 'ehentai.js');

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[.-].+)?$/;

function readIndex() {
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  assert.ok(Array.isArray(raw), 'index.json 必须是 JSON 数组（宿主按列表解析）');
  assert.ok(raw.length > 0, '至少要有一个源条目');
  return raw;
}

test('index.json 条目字段合法', () => {
  for (const entry of readIndex()) {
    assert.ok(entry.key, `缺少 key: ${JSON.stringify(entry)}`);
    assert.match(entry.key, KEY_RE, `key 不合规: ${entry.key}`);
    assert.ok(entry.name, `缺少 name: ${entry.key}`);
    assert.ok(entry.version, `缺少 version: ${entry.key}`);
    assert.match(entry.version, VERSION_RE, `version 不合规: ${entry.version}`);
    assert.ok(entry.fileName || entry.url, `key=${entry.key} 必须至少有 fileName 或 url 之一`);
  }
});

test('index.json 的 key 唯一（宿主同一 key 只装一份，重复即缺陷）', () => {
  const seen = new Map();
  const dup = [];
  for (const entry of readIndex()) {
    if (seen.has(entry.key)) dup.push(`${entry.key}（${seen.get(entry.key)} 与 ${entry.fileName}）`);
    else seen.set(entry.key, entry.fileName);
  }
  assert.deepEqual(dup, [], `重复 key: ${dup.join(', ')}`);
});

test('index.json 每个 fileName 都存在，且 key/version 与脚本元数据一致', () => {
  const problems = [];
  for (const entry of readIndex()) {
    if (!entry.fileName) continue;
    const target = path.join(ROOT, entry.fileName);
    if (!fs.existsSync(target)) {
      problems.push(`${entry.key}: 文件不存在 ${entry.fileName}`);
      continue;
    }
    let script;
    try {
      script = loadSource(target, { routes: [], globals: HOST_STUBS }).source;
    } catch (e) {
      problems.push(`${entry.key}: 加载失败 ${e.message}`);
      continue;
    }
    if (script.key !== entry.key) problems.push(`${entry.key}: 脚本 key=${script.key} 不一致`);
    if (script.version !== entry.version) {
      problems.push(`${entry.key}: version 不一致（index=${entry.version} script=${script.version}）`);
    }
    if (!script.minAppVersion) problems.push(`${entry.key}: minAppVersion 为空，宿主导入会失败`);
  }
  assert.deepEqual(problems, [], `清单与脚本不一致 ${problems.length} 处:\n  ${problems.join('\n  ')}`);
});

test('清单规模：已汇总多个上游仓库', () => {
  const entries = readIndex();
  assert.ok(entries.length >= 50, `汇总条目应有 50+，实际 ${entries.length}`);
  for (const dir of ['venera-configs', 'venera_comic_source']) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'sources', 'mirror', dir)),
      `缺少镜像目录 sources/mirror/${dir}`,
    );
  }
});

test('自有源元数据契约：minAppVersion 非空，name/key/version 齐备', () => {
  const s = loadSource(SOURCE, { routes: [], globals: HOST_STUBS }).source;
  for (const field of ['name', 'key', 'version', 'minAppVersion']) {
    assert.ok(s[field], `源脚本缺少 ${field}`);
  }
  assert.match(s.key, /^[a-zA-Z_][a-zA-Z0-9_]*$/, '脚本身份的 key 不允许数字开头');
  assert.match(s.minAppVersion, VERSION_RE, `minAppVersion 不合规: ${s.minAppVersion}`);
});

test('自有源没有以全局身份使用宿主不存在的 API', () => {
  const hits = findAbsentGlobals(fs.readFileSync(SOURCE, 'utf8'));
  assert.deepEqual(hits, [], `使用了宿主不存在的全局 API: ${hits.join(', ')}`);
});

test('自有源 ES2022 兼容守卫', () => {
  const found = findTooNew(fs.readFileSync(SOURCE, 'utf8'));
  assert.deepEqual(found, [], `使用了新于 ES2022 的特性，App 内会失败: ${found.join(', ')}`);
});

test('subscription/index.json（对外发布的那份）与 index.json 一致且全部走 url', () => {
  const subFile = path.join(ROOT, 'subscription', 'index.json');
  if (!fs.existsSync(subFile)) return; // 未生成时跳过
  const sub = JSON.parse(fs.readFileSync(subFile, 'utf8'));
  const main = readIndex();
  assert.ok(Array.isArray(sub), 'subscription/index.json 必须是数组');

  const subByKey = new Map(sub.map((e) => [e.key, e]));
  assert.equal(subByKey.size, sub.length, 'subscription/index.json 的 key 必须唯一');

  for (const entry of sub) {
    assert.ok(entry.url, `subscription 条目必须用 url（key=${entry.key}）`);
    assert.ok(!entry.fileName, `subscription 条目不应带 fileName（key=${entry.key}）`);
    const mainEntry = main.find((m) => m.key === entry.key);
    assert.ok(mainEntry, `subscription 有 main 清单里没有的 key: ${entry.key}`);
    assert.equal(
      entry.version,
      mainEntry.version,
      `${entry.key}: 两份清单版本不一致（sub=${entry.version} main=${mainEntry.version}）`,
    );
  }
  for (const entry of main) {
    assert.ok(subByKey.has(entry.key), `main 有 subscription 没有的 key: ${entry.key}`);
  }
});
