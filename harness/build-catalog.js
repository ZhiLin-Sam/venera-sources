'use strict';
/**
 * 汇总器：把多个上游源仓库合并成本仓库的 `index.json` + `sources/mirror/**` 镜像。
 *
 * 为什么要有生成脚本而不是手写 index.json：57 条清单里有 15 个 key 跨仓库重复，
 * 去重必须**按宿主自己的版本比较规则**决定谁赢，且要可复算、可复核、可重跑。
 *
 * 去重规则（与宿主一致，见 doc/api/comic_source.zh.md:354 与 parser.dart:24）：
 *   前 3 段按整数比较；第 4 段只特判字面量 "hotfix"，否则按字典序。
 *   版本高者胜；**同版本时主目录（venera-configs）优先**。
 *
 * 用法：
 *   node harness/build-catalog.js \
 *     --venera-configs <已克隆目录> \
 *     --venera-comic-source <已克隆目录>
 *
 * 只会写：index.json、sources/mirror/**、docs/mirror-provenance.md
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIRROR_DIR = path.join(ROOT, 'sources', 'mirror');

const { loadSource } = require('./runtime');
const { HOST_STUBS } = require('./validate-sources');

/**
 * 读取脚本**自身**声明的元数据；失败返回 {}，由清单兜底并进报告。
 *
 * 为什么必须这么做：上游清单的 version 会与实际脚本不符（实测 3 处，其中
 * copy_manga 是清单 1.6.7 / 脚本 1.6.6）。宿主用清单版本与已装版本比较来决定是否更新，
 * 清单虚高会导致「永远提示有更新、装完还是旧版」的循环。
 */
function scriptMeta(file) {
  try {
    const s = loadSource(file, { routes: [], globals: HOST_STUBS }).source;
    return { key: s.key, version: s.version, name: s.name };
  } catch (_) {
    return {};
  }
}

/** 自有源：不参与去重，永远由本仓库维护。 */
const OWN_SOURCE = {
  key: 'ehentai',
  name: 'E-Hentai / ExHentai',
  fileName: 'sources/ehentai.js',
  description: '本仓库维护（夹具驱动回归测试保护）；当前基于 venera-configs ehentai.js 1.2.0',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    out[k] = argv[i + 1];
  }
  return out;
}

/** 宿主规则，不是 SemVer。 */
function compareSemVer(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  for (let i = 0; i < 3; i += 1) {
    const x = parseInt(pa[i] || '0', 10);
    const y = parseInt(pb[i] || '0', 10);
    if (x !== y) return x - y;
  }
  const sa = pa[3] || '';
  const sb = pb[3] || '';
  if (sa === sb) return 0;
  if (sa === 'hotfix') return 1;
  if (sb === 'hotfix') return -1;
  return sa < sb ? -1 : 1;
}

function loadCatalog(dir, label) {
  const indexFile = path.join(dir, 'index.json');
  if (!fs.existsSync(indexFile)) throw new Error(`${label}: 缺少 index.json (${indexFile})`);
  const entries = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  if (!Array.isArray(entries)) throw new Error(`${label}: index.json 不是数组`);
  return entries.map((e) => ({ ...e, repo: label, repoDir: dir }));
}

function main() {
  const args = parseArgs(process.argv);
  const specs = [
    { label: 'venera-configs', dir: args['venera-configs'] },
    { label: 'venera_comic_source', dir: args['venera-comic-source'] },
  ];
  for (const s of specs) {
    if (!s.dir) throw new Error(`缺少参数 --${s.label.replace(/_/g, '-')}`);
    if (!fs.existsSync(s.dir)) throw new Error(`目录不存在: ${s.dir}`);
  }

  const catalogs = specs.map((s) => ({ ...s, entries: loadCatalog(s.dir, s.label) }));

  // 1) 全部镜像：每个上游条目的文件都原样复制，保留仓库分层，避免同名覆盖。
  const mirrored = [];
  const versionFixes = [];
  for (const c of catalogs) {
    const destDir = path.join(MIRROR_DIR, c.label);
    fs.mkdirSync(destDir, { recursive: true });
    for (const e of c.entries) {
      const src = path.join(c.dir, e.fileName);
      if (!fs.existsSync(src)) throw new Error(`${c.label}: 条目 ${e.key} 的文件不存在: ${e.fileName}`);
      const dest = path.join(destDir, e.fileName);
      fs.copyFileSync(src, dest);

      // 以**脚本自身**的 key/version 为准（见 scriptMeta 的说明），清单只提供 name/描述。
      const meta = scriptMeta(dest);
      if (meta.key && meta.version && (meta.key !== e.key || meta.version !== e.version)) {
        versionFixes.push({
          repo: c.label,
          fileName: e.fileName,
          listKey: e.key,
          listVersion: e.version,
          scriptKey: meta.key,
          scriptVersion: meta.version,
        });
      }
      mirrored.push({
        ...e,
        key: meta.key || e.key,
        version: meta.version || e.version,
        mirrorPath: path.posix.join('sources/mirror', c.label, e.fileName),
      });
    }
  }

  // 2) 按 key 去重：版本高者胜，同版本主目录优先。
  const byKey = new Map();
  const decisions = [];
  for (const e of mirrored) {
    const prev = byKey.get(e.key);
    if (!prev) {
      byKey.set(e.key, e);
      continue;
    }
    const cmp = compareSemVer(e.version, prev.version);
    const winner = cmp > 0 ? e : prev;
    const loser = cmp > 0 ? prev : e;
    byKey.set(e.key, winner);
    decisions.push({ key: e.key, winner, loser, reason: cmp > 0 ? '版本更高' : '同版本或更低，主目录优先' });
  }

  // 3) 自有源覆盖同名 key，并写成清单。
  const entries = [...byKey.values()]
    .map((e) => ({
      key: e.key,
      name: e.name,
      version: e.version,
      fileName: e.mirrorPath,
      description: `镜像自 ${e.repo}（上游原样，未修改）`,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const own = entries.find((e) => e.key === OWN_SOURCE.key);
  if (!own) throw new Error(`汇总结果里没有 ${OWN_SOURCE.key}，无法接管`);
  Object.assign(own, OWN_SOURCE);

  fs.writeFileSync(path.join(ROOT, 'index.json'), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  // 4) 来源与去重决策存档（生成物，便于复核）。
  const lines = [];
  lines.push('# 镜像来源与去重决策（生成物，勿手改）');
  lines.push('');
  lines.push('由 `node harness/build-catalog.js` 生成。');
  lines.push('');
  lines.push('## 上游');
  lines.push('');
  lines.push('| 目录 | 上游仓库 | 条目数 | 许可证 |');
  lines.push('|---|---|---|---|');
  lines.push('| `sources/mirror/venera-configs/` | https://github.com/venera-app/venera-configs | ' + catalogs[0].entries.length + ' | **无**（仓库内无 LICENSE 文件，返回 404） |');
  lines.push('| `sources/mirror/venera_comic_source/` | https://github.com/handahao666-boop/venera_comic_source | ' + catalogs[1].entries.length + ' | **无**（GitHub API `license` 为 null） |');
  lines.push('');
  lines.push(`镜像文件总数：${mirrored.length}（两仓库各自完整镜像，不合并、不覆盖）`);
  lines.push('');
  lines.push(`## 去重决策（key 重复 ${decisions.length} 组）`);
  lines.push('');
  if (!decisions.length) {
    lines.push('无重复 key。');
  } else {
    lines.push('| key | 采纳 | 版本 | 未采纳 | 版本 | 依据 |');
    lines.push('|---|---|---|---|---|---|');
    for (const d of decisions.slice().sort((a, b) => (a.key < b.key ? -1 : 1))) {
      lines.push(
        `| \`${d.key}\` | ${d.winner.repo} | ${d.winner.version} | ${d.loser.repo} | ${d.loser.version} | ${d.reason} |`,
      );
    }
  }
  lines.push('');
  lines.push(`## 上游清单版本与实际脚本不符（已按脚本纠正，${versionFixes.length} 处）`);
  lines.push('');
  if (!versionFixes.length) {
    lines.push('无。');
  } else {
    lines.push('本仓库的 `index.json` 一律采用**脚本自身**声明的 key/version。');
    lines.push('');
    lines.push('| 上游目录 | 文件 | 清单 key | 清单 version | 脚本 key | 脚本 version |');
    lines.push('|---|---|---|---|---|---|');
    for (const v of versionFixes) {
      lines.push(
        `| ${v.repo} | \`${v.fileName}\` | \`${v.listKey}\` | ${v.listVersion} | \`${v.scriptKey}\` | **${v.scriptVersion}** |`,
      );
    }
    lines.push('');
    lines.push('清单虚高的风险举例：`copy_manga` 清单写 1.6.7 而脚本是 1.6.6，');
    lines.push('宿主以清单版本与已装版本比较 → 永远认为有更新，装完仍是 1.6.6，形成更新循环。');
  }
  lines.push('');
  lines.push('## 许可证提醒');
  lines.push('');
  lines.push('两个上游仓库都**没有声明任何许可证**（默认 = 保留所有权利）。');
  lines.push('本目录只是本地私有镜像，用于个人研究与离线回归测试；');
  lines.push('若要公开分发，必须逐一取得授权或改为在 `index.json` 中引用上游原始地址（`url` 字段）。');
  lines.push('');
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'mirror-provenance.md'), lines.join('\n'), 'utf8');

  console.log(`镜像文件: ${mirrored.length}`);
  console.log(`清单条目: ${entries.length}（含自有 ${OWN_SOURCE.key}）`);
  console.log(`去重决策: ${decisions.length} 组`);
  console.log(`版本纠正（按脚本为准）: ${versionFixes.length} 处`);
  const repos = {};
  for (const e of entries) {
    const r = e.fileName.startsWith('sources/mirror/venera-configs') ? 'venera-configs' : e.fileName === OWN_SOURCE.fileName ? 'own' : 'venera_comic_source';
    repos[r] = (repos[r] || 0) + 1;
  }
  console.log(`清单来源分布: ${JSON.stringify(repos)}`);
}

if (require.main === module) main();

module.exports = { compareSemVer, OWN_SOURCE };
