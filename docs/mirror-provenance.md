# 镜像来源与去重决策（生成物，勿手改）

由 `node harness/build-catalog.js` 生成。

## 上游

| 目录 | 上游仓库 | 条目数 | 许可证 |
|---|---|---|---|
| `sources/mirror/venera-configs/` | https://github.com/venera-app/venera-configs | 33 | **无**（仓库内无 LICENSE 文件，返回 404） |
| `sources/mirror/venera_comic_source/` | https://github.com/handahao666-boop/venera_comic_source | 40 | **无**（GitHub API `license` 为 null） |

镜像文件总数：73（两仓库各自完整镜像，不合并、不覆盖）

## 去重决策（重复 key 15 组 / 落选文件 16 个）

两个数字口径不同：一个 key 可能被丢过多次（如 `copy_manga` 有 3 个候选）。
| key | 采纳 | 版本 | 未采纳 | 版本 | 依据 |
|---|---|---|---|---|---|
| `Komiic` | venera_comic_source | 1.0.8 | venera-configs | 1.0.3 | 版本更高 |
| `ManHuaGui` | venera-configs | 1.2.1 | venera_comic_source | 1.2.1 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `baozi` | venera-configs | 1.1.6 | venera_comic_source | 1.1.6 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `ccc` | venera-configs | 1.0.1 | venera_comic_source | 1.0.1 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `comic_walker` | venera_comic_source | 1.0.1 | venera-configs | 1.0.1 | 人工覆盖 → 采用 venera_comic_source：两边 version 都是 1.0.1；vc 侧缺 han 侧的 _refreshingToken 并发保护、updateAppVersion()、服务端 upgrade_required 处理（本机实测 vc 侧三项标记全无） |
| `comick` | venera-configs | 1.2.0 | venera_comic_source | 1.2.0 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `copy_manga` | venera-configs | 1.4.2 | venera-configs | 1.4.1 | 版本更高（venera-configs 侧） |
| `copy_manga` | venera_comic_source | 1.6.6 | venera-configs | 1.4.2 | 版本更高 |
| `goda` | venera-configs | 1.2.1 | venera_comic_source | 1.2.1 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `manga_dex` | venera-configs | 1.2.0 | venera_comic_source | 1.1.1 | 版本更高（venera-configs 侧） |
| `manhuaren` | venera-configs | 1.0.0 | venera_comic_source | 1.0.0 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `manwaba` | venera_comic_source | 1.1.3 | venera-configs | 1.0.3 | 版本更高 |
| `mycomic` | venera-configs | 1.1.0 | venera_comic_source | 1.1.0 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |
| `shonen_jump_plus` | venera_comic_source | 1.1.1 | venera-configs | 1.1.1 | 人工覆盖 → 采用 venera_comic_source：两边 version 都是 1.1.1；han 侧 latestVersion 默认值 4.5.24 高于 vc 的 4.0.24（:13）。注意该字段运行时会从站点响应自我刷新（:42），所以影响小于 comic_walker，但仍应取新值 |
| `ykmh` | venera_comic_source | 1.0.6 | venera-configs | 1.0.0 | 版本更高 |
| `zaimanhua` | venera-configs | 1.0.2 | venera_comic_source | 1.0.2 | 同版本且内容一致（行尾规范化后）→ 主目录优先 |

## 人工覆盖（同版本 + 内容不同，2 处）

两边 `version` 相同时宿主**不会**推更新，所以这类冲突不能靠"主目录优先"决定：
选错意味着用户长期停留在较差的那份，且永远收不到提示。

| key | 采纳 | 理由 |
|---|---|---|
| `comic_walker` | venera_comic_source | 两边 version 都是 1.0.1；vc 侧缺 han 侧的 _refreshingToken 并发保护、updateAppVersion()、服务端 upgrade_required 处理（本机实测 vc 侧三项标记全无） |
| `shonen_jump_plus` | venera_comic_source | 两边 version 都是 1.1.1；han 侧 latestVersion 默认值 4.5.24 高于 vc 的 4.0.24（:13）。注意该字段运行时会从站点响应自我刷新（:42），所以影响小于 comic_walker，但仍应取新值 |

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

两个上游仓库都**没有声明任何许可证**（默认 = 保留所有权利），本目录是其衍生镜像。
若本仓为公开仓库，这些文件即属**公开再分发**，责任由本仓承担；
收到权利人异议应即删除对应文件。更保守的替代形态是 `subscription/index.json`
（只含清单 + `url` 指向上游，不含他人代码）。
另：字节级比对前请先统一行尾 —— 本机 `core.autocrlf=true` 会把镜像文件的行尾规范化。
