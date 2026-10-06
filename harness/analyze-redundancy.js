'use strict';
/**
 * 冗余分析：为"去重 / 精简 / 合并"策略提供**客观事实**，不替代人工判定。
 *
 * 输出三层信号：
 *  A. 内容完全相同的文件（跨仓库镜像重复）—— 纯去重，零代码改动；
 *  B. 同一站点的不同 key（规范化站名相同）—— 需判定"留新/留全/合并"；
 *  C. 同一宿主域集合的不同 key —— 站点的更强证据（站名可能拼写不同）。
 *
 * 另外为每个源提取：key / version / minAppVersion，以及 `settings` 里**已有哪些可配置项**
 * —— 这是判断"变体是否只差一个硬编码参数、可合并为一个源 + 设置项"的关键依据。
 *
 * 用法：node harness/analyze-redundancy.js [--json]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSource } = require('./runtime');
const { HOST_STUBS } = require('./validate-sources');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'sources', 'mirror');

/** 站名规范化：去掉版本号 / 修复标记 / 变体后缀，用于"同站不同 key"的粗分组。 */
function normalizeSite(name) {
  return String(name)
    .toLowerCase()
    .replace(/\.js$/, '')
    .replace(/_(fixed|dual|multi_accounts|split|hosts|configurable|development|log|v\d+|\d+)$/g, '')
    .replace(/(fixed|dual|multiaccounts|splithosts|configurable)/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

/** 从源码里抓出提及的宿主域（去 www.、去端口）。 */
function hostSet(code) {
  const hosts = new Set();
  const re = /https?:\/\/([a-zA-Z0-9.-]+)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const h = m[1].toLowerCase().replace(/^www\./, '');
    if (h.includes('.')) hosts.add(h);
  }
  return [...hosts].sort();
}

function describe(file) {
  const code = fs.readFileSync(file, 'utf8');
  const out = {
    file: path.basename(file),
    repo: path.basename(path.dirname(file)),
    rel: path.posix.join('sources/mirror', path.basename(path.dirname(file)), path.basename(file)),
    bytes: Buffer.byteLength(code),
    // 先统一行尾再算 sha：本机 core.autocrlf=true，同一文件在不同检出里可能是 CRLF 或 LF，
    // 直接按原始字节算会把"内容一致"误判成"内容不同"（实测因此把 8 组缩成 1 组）。
    sha: crypto.createHash('sha256').update(code.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12),
    hosts: hostSet(code),
    key: null,
    version: null,
    minAppVersion: null,
    name: null,
    settings: [],
  };
  try {
    const s = loadSource(file, { routes: [], globals: HOST_STUBS }).source;
    out.key = s.key;
    out.version = s.version;
    out.minAppVersion = s.minAppVersion;
    out.name = s.name;
    out.settings = s.settings ? Object.keys(s.settings) : [];
  } catch (e) {
    out.loadError = e.message;
  }
  return out;
}

function main() {
  const files = [];
  for (const repo of fs.readdirSync(MIRROR)) {
    const dir = path.join(MIRROR, repo);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
      files.push(describe(path.join(dir, f)));
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(files, null, 2));
    return;
  }

  // A. 内容完全相同的文件
  const bySha = new Map();
  for (const f of files) (bySha.get(f.sha) || bySha.set(f.sha, []).get(f.sha)).push(f);
  const sameContent = [...bySha.values()].filter((g) => g.length > 1);

  // B. 同站名不同 key
  const bySite = new Map();
  for (const f of files) {
    const site = normalizeSite(f.key || f.file);
    (bySite.get(site) || bySite.set(site, []).get(site)).push(f);
  }
  // C. 同宿主域集合不同 key
  const byHosts = new Map();
  for (const f of files) {
    if (!f.hosts.length) continue;
    const sig = f.hosts.join('|');
    (byHosts.get(sig) || byHosts.set(sig, []).get(sig)).push(f);
  }

  const distinctKey = (g) => new Set(g.map((f) => f.key || f.file)).size;
  const groups = (map) =>
    [...map.entries()].filter(([, g]) => g.length > 1 && distinctKey(g) > 1);

  console.log(`镜像文件: ${files.length}   涉及仓库: ${new Set(files.map((f) => f.repo)).size}`);
  console.log(`加载失败: ${files.filter((f) => f.loadError).length}`);

  console.log(`\n=== A. 内容完全相同（sha 相同）: ${sameContent.length} 组 ===`);
  for (const g of sameContent) console.log(`  ${g[0].sha}  ${g.map((f) => `${f.repo}/${f.file}`).join('  ==  ')}`);

  console.log(`\n=== B. 同站名不同 key: ${groups(bySite).length} 组 ===`);
  for (const [site, g] of groups(bySite)) {
    console.log(`  [${site}]`);
    for (const f of g) {
      console.log(
        `    ${f.key ?? '?'} v${f.version ?? '?'}  ${f.repo}/${f.file}  settings=[${f.settings.join(',')}]  hosts=${f.hosts.length}`,
      );
    }
  }

  console.log(`\n=== C. 同宿主域集合不同 key: ${groups(byHosts).length} 组 ===`);
  for (const [sig, g] of groups(byHosts)) {
    console.log(`  [${sig}]`);
    for (const f of g) console.log(`    ${f.key ?? '?'} v${f.version ?? '?'}  ${f.repo}/${f.file}`);
  }

  const totalRedundant = new Set([
    ...sameContent.flat().map((f) => f.rel),
    ...groups(bySite).flatMap(([, g]) => g.map((f) => f.rel)),
    ...groups(byHosts).flatMap(([, g]) => g.map((f) => f.rel)),
  ]);
  console.log(`\n参与冗余嫌疑的文件: ${totalRedundant.size} / ${files.length}`);
}

if (require.main === module) main();

module.exports = { normalizeSite, hostSet, describe };
