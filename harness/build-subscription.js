'use strict';
/**
 * 订阅清单生成器：产出**只含 `url` 引用**的 index.json。
 *
 * 为什么要单独做一份，而不是直接用仓库里那份 `index.json`：
 *
 *  1. 宿主取源列表时是**匿名且无法自定义请求头**的请求
 *     （`source_repositories.dart:206` 只带 `{'cache-time': 'no'}`，没有任何鉴权头），
 *     所以私有仓库的 raw 地址匿名取不到（实测 **HTTP 404**）；
 *  2. 把 token 塞进 URL 不可接受：`app_dio.dart:155` 会把
 *     `response.realUri.toString()` **原文写进 App 日志**（请求头有打码，URL 没有），
 *     用户报 bug 时会把 token 一起贴出来；
 *  3. 因此订阅清单必须**匿名可达**，而它一旦公开，就**不能包含任何第三方代码**
 *     （上游两个仓库都没有许可证）。
 *
 * 结论：订阅清单里每个条目都用 `url` 指向**上游公开地址**（jsDelivr），
 * 私有仓库的镜像只用于本地离线测试。这样公开分发的只有几百字节的清单。
 *
 * 用法：
 *   node harness/build-subscription.js --venera-configs <A> --venera-comic-source <B> [--verify] [--own-ehentai-url <U>]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSource } = require('./runtime');
const { HOST_STUBS } = require('./validate-sources');
const { compareSemVer } = require('./build-catalog');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'subscription', 'index.json');

/**
 * 上游仓库 → jsDelivr 地址前缀。
 * 清单里的 `url` 必须是**原始下载地址**，不能是 GitHub 文件展示页
 * （doc/api/comic_source.zh.md §1 明令禁止）。
 */
const UPSTREAMS = [
  {
    label: 'venera-configs',
    dir: null,
    cdn: 'https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/',
  },
  {
    label: 'venera_comic_source',
    dir: null,
    cdn: 'https://cdn.jsdelivr.net/gh/handahao666-boop/venera_comic_source@main/',
  },
];

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    if (['verify'].includes(key)) {
      out.flags.add(key);
      continue;
    }
    out[key] = argv[i + 1];
    i += 1;
  }
  return out;
}

/** 读脚本自身声明的元数据（清单版本一律以脚本为准，理由见 build-catalog.js）。 */
function scriptMeta(file) {
  try {
    const s = loadSource(file, { routes: [], globals: HOST_STUBS }).source;
    return { key: s.key, version: s.version, name: s.name };
  } catch (_) {
    return {};
  }
}

function build(upstreamDirs) {
  const byKey = new Map();
  const corrections = [];

  for (const spec of UPSTREAMS) {
    const dir = upstreamDirs[spec.label];
    if (!dir) throw new Error(`缺少参数 --${spec.label.replace(/_/g, '-')}`);
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    if (!Array.isArray(catalog)) throw new Error(`${spec.label}: index.json 不是数组`);

    for (const entry of catalog) {
      const file = path.join(dir, entry.fileName);
      if (!fs.existsSync(file)) throw new Error(`${spec.label}: 缺少文件 ${entry.fileName}`);
      const meta = scriptMeta(file);
      const key = meta.key || entry.key;
      const version = meta.version || entry.version;
      if (meta.version && meta.version !== entry.version) {
        corrections.push({ repo: spec.label, fileName: entry.fileName, list: entry.version, script: meta.version });
      }
      const candidate = {
        key,
        name: entry.name || meta.name || key,
        version,
        url: spec.cdn + entry.fileName,
        description: `来自 ${spec.label} 的上游原样文件（本清单不复制代码）`,
        repo: spec.label,
      };
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, candidate);
        continue;
      }
      if (compareSemVer(candidate.version, prev.version) > 0) byKey.set(key, candidate);
    }
  }
  return { entries: [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1)), corrections };
}

async function verify(entries, concurrency = 8) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      let outcome = 'ok';
      let status = 0;
      try {
        let res = await fetch(entry.url, { method: 'HEAD', redirect: 'follow' });
        if (!res.ok) res = await fetch(entry.url, { method: 'GET', redirect: 'follow' });
        status = res.status;
        if (!res.ok) outcome = 'fail';
      } catch (e) {
        outcome = 'error';
        status = String(e.message).slice(0, 60);
      }
      results.push({ key: entry.key, url: entry.url, outcome, status });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return results.sort((a, b) => (a.key < b.key ? -1 : 1));
}

async function main() {
  const args = parseArgs(process.argv);
  const { entries, corrections } = build({
    'venera-configs': args['venera-configs'],
    venera_comic_source: args['venera-comic-source'],
  });

  // 自有源：默认仍指向上游（授权最干净）。发布自有版本后再用 --own-ehentai-url 覆盖。
  const own = entries.find((e) => e.key === 'ehentai');
  if (own && args['own-ehentai-url']) {
    own.url = args['own-ehentai-url'];
    own.description = '本仓库维护的 ehentai 源（夹具回归测试保护）';
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const cleaned = entries.map((e) => ({
    key: e.key,
    name: e.name,
    version: e.version,
    url: e.url,
    description: e.description,
  }));
  fs.writeFileSync(OUT, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');

  console.log(`订阅条目: ${cleaned.length}`);
  console.log(`全部使用 url 引用（清单不含任何第三方代码）`);
  console.log(`版本纠正: ${corrections.length} 处`);
  if (own) console.log(`ehentai 指向: ${own.url}`);

  if (args.flags.has('verify')) {
    console.log('\n匿名可达性校验（HEAD，失败降级 GET）…');
    const results = await verify(cleaned);
    const bad = results.filter((r) => r.outcome !== 'ok');
    for (const r of bad) console.log(`  ✗ ${r.key}  ${r.status}  ${r.url}`);
    console.log(`校验完成: ${results.length - bad.length}/${results.length} 匿名可达`);
    if (bad.length) process.exitCode = 1;
  }
}

if (require.main === module) main();
