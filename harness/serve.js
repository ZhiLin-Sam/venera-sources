'use strict';
/**
 * 静态服务：把本仓库按 HTTP 暴露出来，用于**本机调通订阅机制**。
 *
 * 存在的理由：宿主取源列表是**匿名、无法自定义请求头**的请求
 * （`source_repositories.dart:206` 只带 `{'cache-time': 'no'}`），
 * 所以私有仓库的 raw 地址匿名取不到（实测 HTTP 404）；而 token 不能塞进 URL，
 * 因为 `app_dio.dart:155` 会把 `response.realUri` 原文写进 App 日志。
 *
 * 于是"先调通"阶段用本机静态服务：App 直接访问 http://127.0.0.1:8899/index.json，
 * 相对路径（sources/mirror/**）也由同一个服务提供，与真实订阅的代码路径完全一致，
 * 且对外零暴露、不需要 token。
 *
 * 用法：
 *   node harness/serve.js [--port 8899] [--host 0.0.0.0] [--root <目录>]
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

const NEVER_SERVE = new Set(['.git', 'node_modules', 'tmp']);

function createStaticServer(root) {
  const rootResolved = path.resolve(root);
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://placeholder').pathname);
    } catch (_) {
      res.writeHead(400).end('bad request');
      return;
    }
    const rel = pathname.replace(/^\/+/, '');
    // 不暴露 .git / node_modules 等；并防目录穿越
    if (rel.split('/').some((seg) => NEVER_SERVE.has(seg))) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    const file = path.resolve(path.join(rootResolved, rel));
    if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'content-length': data.length,
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return out;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const port = Number(args.port || 8899);
  const host = args.host || '0.0.0.0';
  const root = args.root || path.join(__dirname, '..');
  const server = createStaticServer(root);
  server.listen(port, host, () => {
    console.log(`静态服务已启动，根目录: ${root}`);
    console.log('');
    console.log('把下面任一地址填进 App 的「漫画源列表」：');
    console.log(`  本机   http://127.0.0.1:${port}/index.json`);
    for (const ip of lanAddresses()) console.log(`  局域网 http://${ip}:${port}/index.json`);
    console.log('');
    console.log('清单里的相对路径（sources/mirror/**）由同一服务解析，无需额外配置。');
    console.log('按 Ctrl+C 停止。');
  });
}

module.exports = { createStaticServer, lanAddresses };
