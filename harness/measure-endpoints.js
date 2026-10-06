'use strict';
/**
 * 订阅端点可达性实测。
 *
 * 为什么需要它：本项目的订阅清单用**相对路径**（`fileName: sources/mirror/...`），
 * 基准是"清单最终 URL"。所以**只要清单地址本身走哪条线路，57 个源脚本就自动走同一条线路** ——
 * 这就是"国内可访问优先"的实现方式，清单内容一个字都不用改。
 * 但哪条线路在国内真的通、多快，**只能实测**，而且必须在**关掉代理**的条件下测。
 *
 * 本工具因此做三件事：
 *   1. 控制探针判定"测量是否有效"：baidu 必通（国内基线）、google 应不通（若通说明还在走代理）；
 *   2. 对每个候选 host 同时测「清单」与「一个源脚本」，验证该 host 上的相对路径解析是否成立；
 *   3. 多次采样取中位数，避免单次抖动误导。
 *
 * 用法：
 *   node harness/measure-endpoints.js [--repo ZhiLin-Sam/venera-sources] [--samples 3] [--json]
 * 私有仓未公开时会得到 404，这是预期结果；可用 --repo venera-app/venera-configs 先验证 host 本身。
 */
const dns = require('node:dns').promises;

const DEFAULT_REPO = 'ZhiLin-Sam/venera-sources';
/**
 * 相对路径探针候选：不同仓库布局不同 ——
 * 本仓脚本在 `sources/` 下，上游 `venera-configs` 放在仓库根。取第一个能通的。
 */
const PROBE_FILES = ['sources/ehentai.js', 'ehentai.js'];

/** 每个候选：host 说明 + 清单 URL 模板 + 源文件 URL 模板 */
const HOSTS = [
  {
    id: 'jsdelivr',
    label: 'jsDelivr 主域',
    note: '国内常用；分支引用有 CDN 缓存',
    manifest: (r) => `https://cdn.jsdelivr.net/gh/${r}@main/index.json`,
    file: (r, pf) => `https://cdn.jsdelivr.net/gh/${r}@main/${pf}`,
  },
  {
    id: 'jsdelivr-fastly',
    label: 'jsDelivr Fastly',
    note: '备用域，绕主域 DNS 层面问题',
    manifest: (r) => `https://fastly.jsdelivr.net/gh/${r}@main/index.json`,
    file: (r, pf) => `https://fastly.jsdelivr.net/gh/${r}@main/${pf}`,
  },
  {
    id: 'jsdelivr-gcore',
    label: 'jsDelivr Gcore',
    note: '备用域',
    manifest: (r) => `https://gcore.jsdelivr.net/gh/${r}@main/index.json`,
    file: (r, pf) => `https://gcore.jsdelivr.net/gh/${r}@main/${pf}`,
  },
  {
    id: 'raw',
    label: 'GitHub raw（源站）',
    note: '更新最快，但国内常被干扰',
    manifest: (r) => `https://raw.githubusercontent.com/${r}/main/index.json`,
    file: (r, pf) => `https://raw.githubusercontent.com/${r}/main/${pf}`,
  },
  {
    id: 'ghfast',
    label: 'ghfast.top（第三方代理）',
    note: '路径前缀式反代；第三方，可用性与隐私自担',
    manifest: (r) => `https://ghfast.top/https://raw.githubusercontent.com/${r}/main/index.json`,
    file: (r, pf) => `https://ghfast.top/https://raw.githubusercontent.com/${r}/main/${pf}`,
  },
  {
    id: 'ghproxy',
    label: 'gh-proxy.com（第三方代理）',
    note: '同上',
    manifest: (r) => `https://gh-proxy.com/https://raw.githubusercontent.com/${r}/main/index.json`,
    file: (r, pf) => `https://gh-proxy.com/https://raw.githubusercontent.com/${r}/main/${pf}`,
  },
];

const CONTROLS = [
  { id: 'baidu', label: 'baidu.com（国内基线，应通）', url: 'https://www.baidu.com/' },
  { id: 'google', label: 'google.com（应不通；若通说明仍在走代理）', url: 'https://www.google.com/generate_204' },
];

function parseArgs(argv) {
  const out = { samples: 3 };
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].replace(/^--/, '');
    if (key === 'json') {
      out.json = true;
      continue;
    }
    out[key] = argv[i + 1];
    i += 1;
  }
  return out;
}

async function once(url, timeoutMs = 20000) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    const body = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, ms: Date.now() - started, bytes: body.byteLength };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String(e.message).slice(0, 50) };
  } finally {
    clearTimeout(timer);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

async function sample(url, samples) {
  const runs = [];
  for (let i = 0; i < samples; i += 1) runs.push(await once(url));
  return {
    url,
    status: runs.map((r) => r.status).join('/'),
    ok: runs.filter((r) => r.ok).length,
    samples: runs.length,
    ms: median(runs.map((r) => r.ms)),
    bytes: runs.find((r) => r.ok)?.bytes ?? 0,
    error: runs.find((r) => r.error)?.error,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const repo = args.repo || DEFAULT_REPO;
  const samples = Number(args.samples || 3);

  const hosts = [repo, 'venera-app/venera-configs'].filter((v, i, a) => a.indexOf(v) === i);
  const result = { repo, samples, controls: [], dns: {}, hosts: [] };

  for (const c of CONTROLS) result.controls.push({ ...c, ...(await sample(c.url, 1)) });
  for (const host of ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'raw.githubusercontent.com', 'ghfast.top', 'gh-proxy.com', 'gitee.com']) {
    try {
      // 必须用 OS 解析器（getaddrinfo）：在系统代理/TUN 环境下，
      // c-ares 的直连 DNS 查询会整片超时，而 OS 解析器正常工作 —— 否则这一列全是假 FAIL。
      result.dns[host] = (await dns.lookup(host, { all: true })).map((a) => a.address).join(', ');
    } catch (e) {
      result.dns[host] = `FAIL: ${String(e.code || e.message)}`;
    }
  }
  for (const h of HOSTS) {
    const entry = { id: h.id, label: h.label, note: h.note, manifest: null, file: null };
    for (const r of hosts) {
      // 采样数对两个仓库一视同仁：私有仓未公开时全是 404，真正有信息量的恰恰是旁证仓，
      // 只给它 1 次样本会让排序抖动（实测 Fastly 78ms vs 378ms 就是噪声）。
      const n = r === repo ? samples : Number(args['probe-samples'] ?? samples);
      const m = await sample(h.manifest(r), n);
      // 源文件路径随仓库布局变化，逐个候选试，取第一个能通的作为该 host 的"相对路径是否成立"证据
      let f = null;
      let probePath = null;
      for (const pf of PROBE_FILES) {
        const attempt = await sample(h.file(r, pf), n);
        if (!f || attempt.ok > f.ok) {
          f = attempt;
          probePath = pf;
        }
        if (attempt.ok === n) break;
      }
      f.probePath = probePath;
      if (r === repo) {
        entry.manifest = m;
        entry.file = f;
      } else {
        entry.probeRepo = r;
        entry.probeManifest = m;
        entry.probeFile = f;
      }
    }
    result.hosts.push(entry);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const baidu = result.controls.find((c) => c.id === 'baidu');
  const google = result.controls.find((c) => c.id === 'google');
  console.log('=== 测量有效性判定 ===');
  console.log(`  baidu : ${baidu.status}  ${baidu.ms}ms  ${baidu.ok ? '通' : '不通'}（国内基线）`);
  console.log(`  google: ${google.status}  ${google.ms}ms  ${google.ok ? '通' : '不通'}`);
  let verdict;
  if (baidu.ok && google.ok) verdict = '⚠ 仍在走代理（或直连国际线路）→ 本组数据不能代表国内直连';
  else if (baidu.ok && !google.ok) verdict = '✅ 直连国内环境 → 本组数据有效';
  else verdict = '⚠ 网络异常 → 数据不可用';
  console.log(`  结论: ${verdict}`);

  console.log('\n=== DNS ===');
  for (const [h, v] of Object.entries(result.dns)) console.log(`  ${h.padEnd(26)} ${v}`);

  console.log(`\n=== 端点实测（仓库 ${repo}；samples=${samples}）===`);
  console.log('  host                   | 清单                         | 源脚本相对路径');
  for (const e of result.hosts) {
    const m = e.manifest;
    const f = e.file;
    const fmt = (x) => (x ? `${x.status} ${x.ok}/${x.samples} ${x.ms}ms`.padEnd(28) : '-'.padEnd(28));
    console.log(`  ${e.label.padEnd(22)} | ${fmt(m)} | ${fmt(f)}`);
  }
  console.log('\n  说明：若"清单"200 但"源脚本相对路径"404，则该 host 不能用于订阅；');
  console.log('        私有仓未公开时两者都会是 404（预期）。');
  const withProbe = result.hosts.filter((e) => e.probeManifest);
  if (withProbe.length) {
    console.log(`\n  旁证（公开仓库 ${withProbe[0].probeRepo}）：`);
    for (const e of withProbe) {
      console.log(
        `    ${e.label.padEnd(22)} ${e.probeManifest.status} ${e.probeManifest.ms}ms  |  ${e.probeFile.status} ${e.probeFile.ms}ms`,
      );
    }
  }
}

if (require.main === module) main();

module.exports = { HOSTS, CONTROLS, sample };
