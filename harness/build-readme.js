'use strict';
/**
 * README 生成器：从 `index.json` 生成极简主页（整仓订阅链接 + 逐源单项地址）。
 *
 * 为什么 README 也要生成：逐源地址清单是 **60 行的生成物**，手写必然在
 * 下次汇总（`build-catalog.js`）后悄悄过期。`tests/source-repo.test.js` 会核对
 * README 的单项源表与 `index.json` 一致，两者不同步会直接测试失败。
 *
 * 用法：
 *   node harness/build-readme.js
 *
 * 只会写：README.md
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.json');
const OUT = path.join(ROOT, 'README.md');

/** 单项源地址的基准：与订阅清单同一套 jsDelivr 地址。 */
const SRC_BASE = 'https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/';

function build(entries) {
  const rows = entries
    .map((e) => `| ${String(e.name).replace(/\|/g, '\\|')} | \`${e.key}\` | ${e.version} | ${SRC_BASE}${e.fileName} |`)
    .join('\n');

  return `# venera-sources

给 **Venera / Venera-Next** 用的源目录：一条订阅装齐 **${entries.length} 个源**。

## 整仓订阅

三行依次为 **主地址 / gcore 备用 / fastly 备用**（换域名即可，路径不变）：

\`\`\`text
https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
https://gcore.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
https://fastly.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
\`\`\`

CDN 有缓存，推送后可能延迟；刷新方法见 [docs/endpoint-measurement.md](docs/endpoint-measurement.md)。

## 单个源

在 Venera 的「漫画源」页选「添加源文件/URL」，复制下表对应一行的地址即可。

<details>
<summary>展开 ${entries.length} 个源的单项地址</summary>

| 源 | key | 版本 | 单项地址 |
|---|---|---|---|
${rows}

</details>

来源与授权：[NOTICE.md](NOTICE.md) · 维护规约：[AGENTS.md](AGENTS.md) ·
决策与证据：[docs/DECISIONS.md](docs/DECISIONS.md)
`;
}

function main() {
  const entries = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  if (!Array.isArray(entries) || !entries.length) throw new Error('index.json 为空或不是数组');
  const md = build(entries);
  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`README.md: ${entries.length} 个源的单项地址，${Buffer.byteLength(md)} B`);
}

if (require.main === module) main();

module.exports = { build, SRC_BASE };
