'use strict';
/**
 * 静态代码扫描（务实版）：给"这个源能不能在宿主里跑"提供线索。
 *
 * 存在的理由：宿主 `sendMessage` 的 dispatch **没有 default 分支**（js_engine.dart:179-263），
 * 拼错 API 名或不存在的全局不会报错，只会静默拿到 null。静态扫描是唯一的早期信号。
 *
 * **已知局限（务必知道）**：
 *  - `stripNonCode` 是字符级剥离，不认识正则字面量。若正则里含引号，可能误剥后续代码；
 *  - 只认 `const/let/var/function/class` 形式的局部声明，函数参数同名仍会误报。
 * 因此扫描结果是**告警**，不是判据；判据永远是"能否加载 + 夹具测试"。
 */
const { TOO_NEW } = require('./es2022-guard');

/**
 * 宿主确实不存在的全局。注意不能只看名字是否出现：
 *  - `XMLHttpRequest` 常作为请求头**值**出现（'x-requested-with': 'XMLHttpRequest'）；
 *  - `localStorage` 常被当作局部变量名（const localStorage = this.loadData("_localStorage")）；
 *  - `atob` 常出现在注释里（"venera 运行时不支持 atob"）。
 * 所以必须先剥离注释与字符串，再排除已声明的同名局部标识符。
 */
const ABSENT_GLOBALS = [
  'http_get',
  'http_post',
  'http_download',
  'localStorage',
  'sessionStorage',
  'btoa',
  'atob',
  'XMLHttpRequest',
  'GM_xmlhttpRequest',
  'document',
  'window',
  'require',
];

/** 把注释与字符串/模板串替换成等长空白（保留位置感），用于避免误报。 */
function stripNonCode(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === '/' && d === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (c === '/' && d === '/') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = n;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === c) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += ' '.repeat(Math.min(j, n) - i);
      i = Math.min(j, n);
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** @returns {string[]} 真正以全局身份出现、且宿主不存在的名字。 */
function findAbsentGlobals(code) {
  const stripped = stripNonCode(code);
  return ABSENT_GLOBALS.filter((name) => {
    if (!new RegExp(`\\b${name}\\b`).test(stripped)) return false;
    // 同名局部声明 -> 不是全局引用
    if (new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`).test(stripped)) return false;
    return true;
  });
}

/** @returns {string[]} 命中的、新于 ES2022 的特性说明。 */
function findTooNew(code) {
  const stripped = stripNonCode(code);
  return TOO_NEW.filter(([re]) => re.test(stripped)).map(([, label]) => label);
}

module.exports = { ABSENT_GLOBALS, stripNonCode, findAbsentGlobals, findTooNew };
