# 来源与授权状态（必须读）

本仓库涉及**四方**代码，授权状态各不相同，其中**两项尚未解决**。
当前仓库为**私有**、`package.json` 标记 `UNLICENSED`：在授权澄清前**不授予任何许可、不对外发布**。

## 1. 本仓库自有代码（`harness/`、`tests/`、`docs/`）

作者自有（`harness/` 与 `tests/` 为原创；`docs/research/` 为调研产物）。

## 2. 自有源 `sources/ehentai.js`

- 基线来源：`https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/ehentai.js`
- 版本：`1.2.0`，`minAppVersion 1.5.3`；抓取时间 2026-10-05
- 固定副本另存于 `sources/upstream/ehentai.js`（只读，作 `git diff` 对照基线）
- **授权状态：未声明。** 已核实 `venera-app/venera-configs`：
  - `README.md` 通篇未提许可证；
  - `LICENSE` 路径返回 **HTTP 404**（仓库内没有许可证文件）；
  - 按默认著作权规则，「无许可证」= **保留所有权利**，不等于可以自由再分发。

因此该文件（以及在其基础上优化的版本）是**衍生作品**，可再分发性继承同一未决问题。

## 3. ⚠️ 镜像的两个上游源仓库（`sources/mirror/**`，共 73 个文件）

| 目录 | 上游仓库 | 文件数 | 许可证 |
|---|---|---|---|
| `sources/mirror/venera-configs/` | `venera-app/venera-configs` | 33 | **无**（仓库内无 `LICENSE`，返回 404） |
| `sources/mirror/venera_comic_source/` | `handahao666-boop/venera_comic_source` | 40 | **无**（GitHub API `license` 字段为 `null`） |

- 两个上游都是**完整原样镜像**，未做任何修改（仅文件名→路径分层，避免同名覆盖）。
- 两者**都没有声明任何许可证** → 默认保留所有权利 → 本仓库作为其镜像**不得公开分发**。
- `index.json` 是从这些镜像生成的清单（57 条，16 组重复 key 已按宿主规则去重）。
- 逐条来源与去重决策见 `docs/mirror-provenance.md`（生成物）。

## 4. 待用户决策（阻塞公开发布）

在把本仓库转为**公开**之前，必须三选一：

- **A（授权最干净，推荐）**：`index.json` 改用 `url` 字段**引用上游原始地址**，
  仓库只分发清单与自有源，不再复制他人代码。宿主规范支持此形态
  （`url` 优先于 `fileName`，见 `doc/api/comic_source.zh.md` §7）。
- **B**：逐一联系各源作者取得分发授权后再公开镜像。
- **C**：保持私有，仅作个人使用与离线回归测试。

在选定之前，仓库维持 `private: true` + `UNLICENSED`。

## 5. 夹具 `fixtures/cn-sxj/`（33 个文件，2.6 MB）

- 来源：`Ehviewer_CN_SXJ/app/src/test/resources/com/hippo/ehviewer/client/parser/`
- 上游仓库：`https://github.com/xiaojieonly/Ehviewer_CN_SXJ`，根 `LICENSE` = **GPL-3.0**
- 内容性质：E-Hentai / ExHentai 页面的**静态抓取副本**，仅用于离线解析回归。
- 这些夹具在上游仓库中已属公开发布内容；本仓库沿用**仅作测试样本**的用途，
  不含任何凭证、Cookie 或用户数据。

## 6. 运行环境依赖

- 宿主：`https://github.com/CyrilPeng/Venera-Next`（**GPL-3.0**）
- 解析经验来源：`https://github.com/xiaojieonly/Ehviewer_CN_SXJ`（**GPL-3.0**）
- 测试工具：`jsdom`（MIT，仅 devDependency）

本仓库对上述项目的引用均为**分析、兼容性测试与镜像**目的；除 `sources/mirror/**` 与
`sources/upstream/**` 明确标注的副本外，未复制其源代码。
