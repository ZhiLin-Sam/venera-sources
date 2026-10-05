# 来源与授权状态（必须读）

本仓库涉及三方代码，授权状态**各不相同**，其中一项**尚未解决**。

## 1. 本仓库自有代码（`harness/`、`tests/`、`docs/`）

作者自有。当前 `package.json` 标记为 `UNLICENSED` / `private: true`，
即在授权问题澄清前**不授予任何许可、不对外发布**（见第 3 节）。

## 2. 被改造的源脚本 `sources/upstream/ehentai.js`

- 来源：`https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/ehentai.js`
- 版本：`1.2.0`，`minAppVersion 1.5.3`
- 抓取时间：2026-10-05
- **授权状态：未声明。** 已核实 `venera-app/venera-configs` 仓库：
  - `README.md` 通篇未提许可证；
  - `LICENSE` 路径返回 **HTTP 404**，即仓库内没有许可证文件；
  - 按默认著作权规则，「无许可证」= 保留所有权利，并不等于可以自由再分发。

因此 `sources/ehentai.js`（在上游基础上优化的版本）**是该文件的衍生作品**，
其可再分发性继承同一未决问题。

## 3. 待用户决策（阻塞公开发布）

在把这个仓库推到公开远端**之前**，需要二选一：

- **A（推荐）**：不公开分发上游脚本本体。本仓库只发布**补丁 + 测试 + 文档**，
  由使用者自行从上游拉取 `ehentai.js` 后应用补丁；或
- **B**：向 `venera-configs` 维护者确认源脚本的授权意向（或索取书面许可）后再公开分发。

在 A/B 落地前，仓库维持 `private: true` + `UNLICENSED`。

## 4. 夹具 `fixtures/cn-sxj/`

- 来源：`Ehviewer_CN_SXJ/app/src/test/resources/com/hippo/ehviewer/client/parser/`（33 个文件）
- 上游仓库：`https://github.com/xiaojieonly/Ehviewer_CN_SXJ`，根 `LICENSE` = **GPL-3.0**
- 内容性质：E-Hentai / ExHentai 页面的**静态抓取副本**，用于离线解析回归。
- 注意：这些夹具在上游仓库中已属公开发布内容；本仓库沿用**仅作测试样本**的用途，
  不再分发页面内容本身，也不含任何凭证或用户数据。

## 5. 运行环境依赖

- 宿主：`https://github.com/CyrilPeng/Venera-Next`（**GPL-3.0**）
- 参考实现：`https://github.com/xiaojieonly/Ehviewer_CN_SXJ`（**GPL-3.0**）
- 测试工具：`jsdom`（MIT，仅 devDependency）

本仓库对上述项目的引用均为**分析与兼容性测试**目的，未复制其源代码。
