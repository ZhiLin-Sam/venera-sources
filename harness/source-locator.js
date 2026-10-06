'use strict';
/**
 * 源脚本定位器。
 *
 * 本仓库（testkit）**刻意不包含任何源脚本** —— 只托管夹具、离线运行时与测试。
 * 因此解析回归测试需要使用者**自带源**，找不到时应当**跳过**并给出可操作的说明，
 * 而不是失败（失败会被误读成"代码坏了"）。
 *
 * 查找顺序：
 *   1. 环境变量 `EHTAI_SOURCE`（相对路径按仓库根解析）
 *      —— 设为 `none` / `off` 时**强制"无源"**，用于验证跳过路径与 CI
 *   2. `<repo>/sources/ehentai.js`（使用者自行放入）
 *   3. `../venera-ehentai-source/sources/ehentai.js`（本项目的开发期布局：两仓并排时自动找到）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** 强制关闭源查找的取值，便于确定性地测试"无源"行为。 */
const DISABLED = new Set(['none', 'off', '0', 'false']);

function candidates() {
  if (process.env.EHTAI_SOURCE && DISABLED.has(process.env.EHTAI_SOURCE.trim().toLowerCase())) {
    return [];
  }
  const list = [];
  if (process.env.EHTAI_SOURCE) list.push(path.resolve(ROOT, process.env.EHTAI_SOURCE));
  list.push(path.join(ROOT, 'sources', 'ehentai.js'));
  list.push(path.join(ROOT, '..', 'venera-ehentai-source', 'sources', 'ehentai.js'));
  return list;
}

/** @returns {string|null} 找到的源脚本绝对路径；没有则 null。 */
function resolveSource() {
  for (const candidate of candidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const SKIP_REASON =
  '未提供源脚本，已跳过。用法：设 EHTAI_SOURCE=<ehentai.js 路径>，或把脚本放到 sources/ehentai.js。' +
  '本仓库刻意不包含源（见 README「为什么不放源」）。';

module.exports = { resolveSource, candidates, SKIP_REASON, ROOT };
