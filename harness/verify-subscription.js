'use strict';
/**
 * 端到端验证「订阅机制」本身：严格按宿主的行为走一遍，而不是只做静态检查。
 *
 * 宿主真实行为（已核实）：
 *  1. 取清单：`source_repositories.dart` 用 `Network.get(url, {'cache-time':'no'})`
 *     —— **匿名、无鉴权头**；
 *  2. 相对路径基准：`parseCatalog(response.data!, baseUrl: response.realUri.toString())`
 *     —— 即**跟随重定向后的最终 URL**，等价于 JS 的 `new URL(fileName, listUrl)`；
 *  3. 逐个下载脚本并按 key / version / minAppVersion 判定（`parser.dart`）。
 *
 * 本脚本把 1–3 全部真跑一遍：取清单 → 按最终 URL 解析每个 fileName → 下载 →
 * 用同一个沙箱载入脚本 → 校验元数据与清单一致。
 *
 * 用法：
 *   # 自动起本机静态服务再验证（阶段一：先调通）
 *   node harness/verify-subscription.js --serve-port 8899
 *   # 验证已经可匿名访问的真实地址（阶段二：公开之后）
 *   node harness/verify-subscription.js --base https://cdn.jsdelivr.net/gh/<user>/<repo>@main/index.json
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSource } = require('./runtime');
const { HOST_STUBS } = require('./validate-sources');
const { createStaticServer } = require('./serve');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].replace(/^--/, '');
    if (key === 'keep') {
      out.flags.add(key);
      continue;
    }
    out[key] = argv[i + 1];
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  let server = null;
  let listUrl = args.base;

  if (args['serve-port']) {
    const port = Number(args['serve-port']);
    server = createStaticServer(ROOT);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    listUrl = `http://127.0.0.1:${port}/index.json`;
    console.log(`已在 127.0.0.1:${port} 起本机静态服务（仅用于本次验证）`);
  }
  if (!listUrl) throw new Error('需要 --serve-port <端口> 或 --base <清单 URL>');

  console.log(`取清单: ${listUrl}`);
  const listRes = await fetch(listUrl, { redirect: 'follow' });
  if (!listRes.ok) throw new Error(`清单取不到: HTTP ${listRes.status}`);
  const finalUrl = listRes.url; // 与宿主 response.realUri 语义一致
  const entries = await listRes.json();
  if (!Array.isArray(entries)) throw new Error('清单不是 JSON 数组');
  console.log(`清单最终 URL: ${finalUrl}`);
  console.log(`条目数: ${entries.length}\n`);

  const problems = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sub-'));
  let ok = 0;

  for (const entry of entries) {
    const target = new URL(entry.fileName || entry.url, finalUrl).toString();
    let res;
    try {
      res = await fetch(target, { redirect: 'follow' });
    } catch (e) {
      problems.push(`${entry.key}: 下载异常 ${String(e.message).slice(0, 60)} <- ${target}`);
      continue;
    }
    if (!res.ok) {
      problems.push(`${entry.key}: 下载失败 HTTP ${res.status} <- ${target}`);
      continue;
    }
    const body = await res.text();
    if (body.trim().length === 0) {
      problems.push(`${entry.key}: 脚本内容为空 <- ${target}`);
      continue;
    }

    const tmpFile = path.join(tmpDir, `${entry.key}.js`);
    fs.writeFileSync(tmpFile, body, 'utf8');
    let script;
    try {
      script = loadSource(tmpFile, { routes: [], globals: HOST_STUBS }).source;
    } catch (e) {
      problems.push(`${entry.key}: 载入失败 ${String(e.message).slice(0, 80)}`);
      continue;
    }
    if (script.key !== entry.key) problems.push(`${entry.key}: 脚本 key=${script.key} 与清单不符`);
    else if (script.version !== entry.version) {
      problems.push(`${entry.key}: 版本不符（清单 ${entry.version} / 脚本 ${script.version}）`);
    } else if (!script.minAppVersion) problems.push(`${entry.key}: minAppVersion 为空，宿主导入会失败`);
    else ok += 1;
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`订阅机制验证: ${ok}/${entries.length} 通过`);
  if (problems.length) {
    console.log(`\n问题 ${problems.length} 处：`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exitCode = 1;
  } else {
    console.log('全部条目：可匿名取到、可载入、key/version 与清单一致、minAppVersion 非空。');
  }

  if (server && !args.flags.has('keep')) server.close();
}

if (require.main === module) main();
