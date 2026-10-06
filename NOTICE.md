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

**承诺：收到任何权利人异议，立即删除对应文件并从 `index.json` 移除该条目。**
