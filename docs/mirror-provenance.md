# 镜像来源与去重决策（生成物，勿手改）

由 `node harness/build-catalog.js` 生成。

## 上游

| 目录 | 上游仓库 | 条目数 | 许可证 |
|---|---|---|---|
| `sources/mirror/venera-configs/` | https://github.com/venera-app/venera-configs | 33 | **无**（仓库内无 LICENSE 文件，返回 404） |
| `sources/mirror/venera_comic_source/` | https://github.com/handahao666-boop/venera_comic_source | 40 | **无**（GitHub API `license` 为 null） |

镜像文件总数：73（两仓库各自完整镜像，不合并、不覆盖）

## 去重决策（key 重复 16 组）

| key | 采纳 | 版本 | 未采纳 | 版本 | 依据 |
|---|---|---|---|---|---|
| `Komiic` | venera_comic_source | 1.0.8 | venera-configs | 1.0.3 | 版本更高 |
| `ManHuaGui` | venera-configs | 1.2.1 | venera_comic_source | 1.2.1 | 同版本或更低，主目录优先 |
| `baozi` | venera-configs | 1.1.6 | venera_comic_source | 1.1.6 | 同版本或更低，主目录优先 |
| `ccc` | venera-configs | 1.0.1 | venera_comic_source | 1.0.1 | 同版本或更低，主目录优先 |
| `comic_walker` | venera-configs | 1.0.1 | venera_comic_source | 1.0.1 | 同版本或更低，主目录优先 |
| `comick` | venera-configs | 1.2.0 | venera_comic_source | 1.2.0 | 同版本或更低，主目录优先 |
| `copy_manga` | venera-configs | 1.4.2 | venera-configs | 1.4.1 | 同版本或更低，主目录优先 |
| `copy_manga` | venera_comic_source | 1.6.6 | venera-configs | 1.4.2 | 版本更高 |
| `goda` | venera-configs | 1.2.1 | venera_comic_source | 1.2.1 | 同版本或更低，主目录优先 |
| `manga_dex` | venera-configs | 1.2.0 | venera_comic_source | 1.1.1 | 同版本或更低，主目录优先 |
| `manhuaren` | venera-configs | 1.0.0 | venera_comic_source | 1.0.0 | 同版本或更低，主目录优先 |
| `manwaba` | venera_comic_source | 1.1.3 | venera-configs | 1.0.3 | 版本更高 |
| `mycomic` | venera-configs | 1.1.0 | venera_comic_source | 1.1.0 | 同版本或更低，主目录优先 |
| `shonen_jump_plus` | venera-configs | 1.1.1 | venera_comic_source | 1.1.1 | 同版本或更低，主目录优先 |
| `ykmh` | venera_comic_source | 1.0.6 | venera-configs | 1.0.0 | 版本更高 |
| `zaimanhua` | venera-configs | 1.0.2 | venera_comic_source | 1.0.2 | 同版本或更低，主目录优先 |

## 上游清单版本与实际脚本不符（已按脚本纠正，4 处）

本仓库的 `index.json` 一律采用**脚本自身**声明的 key/version。

| 上游目录 | 文件 | 清单 key | 清单 version | 脚本 key | 脚本 version |
|---|---|---|---|---|---|
| venera-configs | `ehentai.js` | `ehentai` | 1.1.8 | `ehentai` | **1.2.0** |
| venera-configs | `manwaba.js` | `manwaba` | 1.0.2 | `manwaba` | **1.0.3** |
| venera-configs | `lanraragi.js` | `lanraragi` | 1.1.0 | `lanraragi` | **1.2.0** |
| venera_comic_source | `copy_manga.js` | `copy_manga` | 1.6.7 | `copy_manga` | **1.6.6** |

清单虚高的风险举例：`copy_manga` 清单写 1.6.7 而脚本是 1.6.6，
宿主以清单版本与已装版本比较 → 永远认为有更新，装完仍是 1.6.6，形成更新循环。

## 许可证提醒

两个上游仓库都**没有声明任何许可证**（默认 = 保留所有权利）。
本目录只是本地私有镜像，用于个人研究与离线回归测试；
若要公开分发，必须逐一取得授权或改为在 `index.json` 中引用上游原始地址（`url` 字段）。
