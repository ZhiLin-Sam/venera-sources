'use strict';
/**
 * ES2022 兼容守卫。
 *
 * 宿主 JS 引擎是 QuickJS-NG，可确证语法下界为 **ES2022**（依据：assets/init.js 自身在每次引擎
 * 初始化时整体求值，且用到 `??`、`?.`、类字段、async/await）。
 * Node.js（本项目的测试环境）比它宽松，因此"测试绿、App 挂"是真实风险，
 * 必须用静态检查把新于 ES2022 的特性拦下来。
 */
const TOO_NEW = [
  [/\bObject\s*\.\s*groupBy\b/, 'Object.groupBy (ES2024)'],
  [/\bMap\s*\.\s*groupBy\b/, 'Map.groupBy (ES2024)'],
  [/\bPromise\s*\.\s*withResolvers\b/, 'Promise.withResolvers (ES2024)'],
  [/\bArray\s*\.\s*fromAsync\b/, 'Array.fromAsync (ES2024)'],
  [/\.findLast\s*\(/, 'Array.prototype.findLast (ES2023)'],
  [/\.findLastIndex\s*\(/, 'Array.prototype.findLastIndex (ES2023)'],
  [/\.toSorted\s*\(/, 'Array.prototype.toSorted (ES2023)'],
  [/\.toReversed\s*\(/, 'Array.prototype.toReversed (ES2023)'],
  [/\.toSpliced\s*\(/, 'Array.prototype.toSpliced (ES2023)'],
  [/\.with\s*\(/, 'Array.prototype.with (ES2023)'],
  [/\bstructuredClone\b/, 'structuredClone (QuickJS 不保证提供)'],
  [/^\s*import\s/m, 'ESM import（宿主求值的是脚本，不支持模块语法）'],
  [/^\s*export\s/m, 'ESM export'],
  [/\brequire\s*\(/, 'CommonJS require'],
];

/** @returns {string[]} 命中的特性说明；空数组表示合规。 */
function findTooNew(code) {
  return TOO_NEW.filter(([re]) => re.test(code)).map(([, label]) => label);
}

module.exports = { TOO_NEW, findTooNew };
