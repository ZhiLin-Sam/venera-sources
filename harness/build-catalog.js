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

/**
 * 人工覆盖表：**同版本 + 内容不同**时必须显式判定。
 *
 * 为什么不能靠"主目录优先"：两边 version 相同时宿主永远不会给用户推更新（它比较的就是版本号），
 * 于是选错 = 用户长期停留在较差的那份，**而且永远收不到提示**。每条都要写明理由，供复核。
 */
const WINNER_OVERRIDES = {
  comic_walker: {
    repo: 'venera_comic_source',
    why:
      '两边 version 都是 1.0.1；vc 侧缺 han 侧的 _refreshingToken 并发保护、updateAppVersion()、' +
      '服务端 upgrade_required 处理（本机实测 vc 侧三项标记全无）',
  },
  shonen_jump_plus: {
    repo: 'venera_comic_source',
    why:
      '两边 version 都是 1.1.1；han 侧 latestVersion 默认值 4.5.24 高于 vc 的 4.0.24（:13）。' +
      '注意该字段运行时会从站点响应自我刷新（:42），所以影响小于 comic_walker，但仍应取新值',
  },
};

/**
 * 语义冗余（同一站点的不同 key）：旧版**不再列入清单**，但文件仍保留在镜像里（可随时恢复）。
 *
 * 与 WINNER_OVERRIDES 的区别：那个是"同 key 选哪一份"，这个是"两个 key 其实是同一站点"。
 * 不处理的话，用户会在源列表里看到同一站点的两个条目，不知道该装哪个。
 * 判据与证据见 docs/redundancy-strategy.md（L2）。
 */
const SUPERSEDED_KEYS = {
  ikmmh: {
    supersededBy: 'ikmmh_v2',
    why:
      '同一站点：两者都暴露 base_url 设置且三要素相同，实现相似度 78.6%；ikmmh_v2 是 v3.0.0 重写版，' +
      'ikmmh v1.0.6 已过时。旧文件保留在镜像中，仅不列入清单（需恢复时删掉此条即可）。',
  },
};

/** 行尾规范化后比较内容：本机 core.autocrlf=true，同一文件在不同检出里可能是 CRLF 或 LF。 */
function sameContent(a, b) {
  const norm = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  return norm(a.absPath) === norm(b.absPath);
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
        absPath: dest,
      });
    }
  }

  // 2) 按 key 去重。版本高者胜；**同版本时不能盲信"主目录优先"** ——
  //    实测存在"同版本 + 内容不同"、且落选方才是修复版的情况。因为版本号相同，
  //    宿主永远不会给用户推更新，所以这类冲突必须走人工覆盖表；
  //    **未登记的冲突直接中止**，绝不允许静默选错。
  const byKey = new Map();
  const decisions = [];
  const overridesUsed = [];
  const unresolved = [];
  for (const e of mirrored) {
    const prev = byKey.get(e.key);
    if (!prev) {
      byKey.set(e.key, e);
      continue;
    }
    const cmp = compareSemVer(e.version, prev.version);
    let winner;
    let loser;
    let reason;
    if (cmp > 0) {
      winner = e;
      loser = prev;
      reason = '版本更高';
    } else if (cmp < 0) {
      winner = prev;
      loser = e;
      reason = `版本更高（${prev.repo} 侧）`;
    } else if (sameContent(prev, e)) {
      winner = prev;
      loser = e;
      reason = '同版本且内容一致（行尾规范化后）→ 主目录优先';
    } else {
      const override = WINNER_OVERRIDES[e.key];
      if (!override) {
        unresolved.push(
          `${e.key}: ${prev.repo}/${prev.fileName} 与 ${e.repo}/${e.fileName} 同为 v${e.version} 但内容不同`,
        );
        winner = prev;
        loser = e;
        reason = '⚠ 未登记的同版本冲突（本应中止）';
      } else {
        winner = prev.repo === override.repo ? prev : e;
        loser = winner === prev ? e : prev;
        reason = `人工覆盖 → 采用 ${override.repo}：${override.why}`;
        overridesUsed.push({ key: e.key, repo: override.repo, why: override.why });
      }
    }
    byKey.set(e.key, winner);
    decisions.push({ key: e.key, winner, loser, reason });
  }
  if (unresolved.length) {
    throw new Error(
      '发现未登记的"同版本 + 内容不同"冲突，已中止以免静默选错：\n  ' +
        unresolved.join('\n  ') +
        '\n请核对两份实现后，在 harness/build-catalog.js 的 WINNER_OVERRIDES 登记取哪一侧及理由，再重跑。',
    );
  }

  // 2b) 语义冗余：同一站点的不同 key（L2）。旧版只从清单里摘掉，镜像文件保留。
  const superseded = [];
  for (const [key, info] of Object.entries(SUPERSEDED_KEYS)) {
    if (byKey.has(key) && byKey.has(info.supersededBy)) {
      superseded.push({ key, dropped: byKey.get(key), kept: info.supersededBy, why: info.why });
      byKey.delete(key);
    }
  }

  // 3) 自有源覆盖同名 key，并写成清单。
  const entries = [...byKey.values()]
    .map((e) => ({
      key: e.key,
      name: e.name,
      version: e.version,
      fileName: e.mirrorPath,
      description: `镜像自 ${e.repo}（上游内容原样；行尾经 Git 规范化）`,
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
  const dupKeyCount = new Set(decisions.map((d) => d.key)).size;
  lines.push(`## 去重决策（重复 key ${dupKeyCount} 组 / 落选文件 ${decisions.length} 个）`);
  lines.push('');
  lines.push('两个数字口径不同：一个 key 可能被丢过多次（如 `copy_manga` 有 3 个候选）。');
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
  lines.push(`## 语义冗余（同站不同 key，从清单摘除 ${superseded.length} 条）`);
  lines.push('');
  if (!superseded.length) {
    lines.push('无。');
  } else {
    lines.push('这些条目与另一个 key 指向**同一站点**，同时列出会让用户不知道该装哪个；');
    lines.push('旧版文件仍保留在镜像中，需要时可从本表恢复（删掉 `SUPERSEDED_KEYS` 对应条目即可）。');
    lines.push('');
    lines.push('| 摘除 | 版本 | 保留 | 理由 |');
    lines.push('|---|---|---|---|');
    for (const s of superseded) {
      lines.push(`| \`${s.key}\` | ${s.dropped.version} | \`${s.kept}\` | ${s.why} |`);
    }
  }
  lines.push('');
  lines.push(`## 人工覆盖（同版本 + 内容不同，${overridesUsed.length} 处）`);
  lines.push('');
  if (!overridesUsed.length) {
    lines.push('无。');
  } else {
    lines.push('两边 `version` 相同时宿主**不会**推更新，所以这类冲突不能靠"主目录优先"决定：');
    lines.push('选错意味着用户长期停留在较差的那份，且永远收不到提示。');
    lines.push('');
    lines.push('| key | 采纳 | 理由 |');
    lines.push('|---|---|---|');
    for (const o of overridesUsed) lines.push(`| \`${o.key}\` | ${o.repo} | ${o.why} |`);
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
  lines.push('两个上游仓库都**没有声明任何许可证**（默认 = 保留所有权利），本目录是其衍生镜像。');
  lines.push('若本仓为公开仓库，这些文件即属**公开再分发**，责任由本仓承担；');
  lines.push('收到权利人异议应即删除对应文件。更保守的替代形态是 `subscription/index.json`');
  lines.push('（只含清单 + `url` 指向上游，不含他人代码）。');
  lines.push('另：字节级比对前请先统一行尾 —— 本机 `core.autocrlf=true` 会把镜像文件的行尾规范化。');
  lines.push('');
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'mirror-provenance.md'), lines.join('\n'), 'utf8');

  console.log(`镜像文件: ${mirrored.length}`);
  console.log(`清单条目: ${entries.length}（含自有 ${OWN_SOURCE.key}）`);
  console.log(`去重决策: ${decisions.length} 次判定（重复 key ${new Set(decisions.map((d) => d.key)).size} 组）`);
  console.log(`人工覆盖（同版本内容不同）: ${overridesUsed.length} 处`);
  console.log(`语义冗余摘除（同站不同 key）: ${superseded.length} 条`);
  console.log(`版本纠正（按脚本为准）: ${versionFixes.length} 处`);
  const repos = {};
  for (const e of entries) {
    const r = e.fileName.startsWith('sources/mirror/venera-configs') ? 'venera-configs' : e.fileName === OWN_SOURCE.fileName ? 'own' : 'venera_comic_source';
    repos[r] = (repos[r] || 0) + 1;
  }
  console.log(`清单来源分布: ${JSON.stringify(repos)}`);
}

if (require.main === module) main();

module.exports = { compareSemVer, OWN_SOURCE, WINNER_OVERRIDES, SUPERSEDED_KEYS };
