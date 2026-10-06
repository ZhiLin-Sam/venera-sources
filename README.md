# venera-sources

给 **Venera / Venera-Next** 用的**私有漫画源目录仓库**：汇总 **57 个源**，
同时用**真实页面夹具 + 离线运行时**给解析层装上"站点改版报警器"。

- 宿主：`CyrilPeng/Venera-Next`（活跃维护，1.17.0+228）
- 解析经验来源：`xiaojieonly/Ehviewer_CN_SXJ`（Android 原生，抓取逻辑最厚）
- **本仓库是私有的、且不含任何许可证**（上游两个源仓库都没有 LICENSE）——
  只作个人使用与离线测试，**不要公开分发**。见 [NOTICE.md](NOTICE.md)

## 用法

在 Venera-Next 里「漫画源 → 漫画源列表」填入本仓库 `index.json` 的地址
（私库需用带 token 的 raw 地址，或本地文件导入）。清单是标准源仓库格式（JSON 数组），
`fileName` 相对路径以列表 URL 为基准。

## 汇总了什么

| 来源 | 条目 | 位置 | 许可证 |
|---|---|---|---|
| 自有（本项目维护，夹具回归保护） | 1 | `sources/ehentai.js` | 见 NOTICE |
| `venera-app/venera-configs` 镜像 | 33 个文件 | `sources/mirror/venera-configs/` | **无**（仓库内无 LICENSE，404） |
| `handahao666-boop/venera_comic_source` 镜像 | 40 个文件 | `sources/mirror/venera_comic_source/` | **无**（GitHub API `license` = null） |

- **镜像文件 73 个**，两个上游**各自完整**镜像，分层存放，不合并、不覆盖同名文件。
- **清单条目 57 条**：73 个文件里有 **16 组重复 key**，按宿主规则去重后得 57 条。
- 去重规则与宿主一致（`compareSemVer`，**不是 SemVer**）：前 3 段按整数比，
  第 4 段只特判 `"hotfix"`，否则字典序；**版本高者胜，同版本时 `venera-configs` 优先**。
- 完整来源与逐条去重决策：[docs/mirror-provenance.md](docs/mirror-provenance.md)（生成物）。

### 刷新镜像

```powershell
git clone --depth 1 https://github.com/venera-app/venera-configs            <A>
git clone --depth 1 https://github.com/handahao666-boop/venera_comic_source <B>
node harness/build-catalog.js --venera-configs <A> --venera-comic-source <B>
```

汇总器只写 `index.json`、`sources/mirror/**`、`docs/mirror-provenance.md`，可反复重跑。

## ⚠️ 已修正上游清单的 4 处错误

上游 `index.json` 的 `version` 会与实际投递的脚本不符。宿主用清单版本与已装版本比较来决定
是否更新，因此**清单虚高会导致「永远提示有更新、装完还是旧版」的循环**。本仓库一律
**以脚本自身声明的 key/version 为准**：

| 上游 | 文件 | 清单 | 脚本 | 风险 |
|---|---|---|---|---|
| `venera-configs` | `ehentai.js` | 1.1.8 | **1.2.0** | 不提示更新 |
| `venera-configs` | `manwaba.js` | 1.0.2 | **1.0.3** | 不提示更新 |
| `venera-configs` | `lanraragi.js` | 1.1.0 | **1.2.0** | 不提示更新 |
| `venera_comic_source` | `copy_manga.js` | 1.6.7 | **1.6.6** | **更新循环** |

## 汇总体检

```powershell
node harness/validate-sources.js <源目录>
```

实测两个上游共 **73 个源：加载失败 0、阻断 0、告警 1**。
唯一告警是 `venera-configs/hitomi.js:795` 的 `Array.prototype.toReversed()`（ES2023）——
说明"语法下界 ES2022"不等于"上界 ES2022"，该源能否运行取决于运行时的实际实现。

体检器区分两级：**阻断**（一定会导入失败：加载失败 / 缺 name,key,version / 格式不合规 /
`minAppVersion` 为空）与**告警**（需人工判断的线索）。

## 夹具回归测试台

```
$ npm test
ℹ tests 51   pass 51   fail 0
```

- 离线运行时复刻宿主注入的 `Network` / `Cookie` / `HtmlDocument` / `Comic` / `ComicSource`；
  `HtmlDocument` 用 jsdom（完整 HTML5 树构造、隐式补 `<tbody>`），
  因为上游选择器写成 `table.itg.* > tbody > tr`，宽松解析器会命中 0 行、测试变假绿。
- 10 个列表变体 × 3 类断言（条数 / 不得静默丢失 / 字段完整）+ 空列表 + 测试台自检
  + 源仓库契约（57 条清单逐一核对）+ 自有源的全局/ES2022 守卫。

**报警等式**（不依赖硬编码常量，拿夹具自身结构对照）：

> **页面中承载画廊链接的行数 == 解析成功条数**

两边不等 = 有行被静默丢弃 = 立刻失败并报出丢了几条。它针对的是上游源的真实缺陷：
`sources/upstream/ehentai.js:298 / 321 / 350 / 376` 四处**空的 `catch`**，
站点一改版就"页面有 25 个画廊、结果 0 条、还不报错"。

### ⚠️ 已知边界：夹具年代

10 个列表变体夹具的条目日期是 **2017–2019**（见 [docs/DECISIONS.md](docs/DECISIONS.md) D9）。
这套绿灯证明的是「**能解析 2019 年的列表布局**」，**不代表能解析今天的站点**。

## 目录

| 路径 | 说明 |
|---|---|
| `index.json` | **分发入口**：57 条清单（生成物，由汇总器写入） |
| `sources/ehentai.js` | 自有源（本项目维护，当前 = 上游 1.2.0，作改前基线） |
| `sources/upstream/ehentai.js` | 上游基线固定副本，只读 |
| `sources/mirror/**` | 两个上游仓库的完整镜像（73 个文件，原样未改） |
| `fixtures/cn-sxj/` | 33 个真实页面夹具（2.6 MB），黄金样本，只读 |
| `harness/runtime.js` | 离线运行时：宿主全局 + 夹具路由（未匹配即抛错） |
| `harness/build-catalog.js` | 汇总器：镜像 + 去重 + 生成 `index.json` 与来源存档 |
| `harness/validate-sources.js` | 体检器：批量检查源能否加载、元数据是否合规 |
| `harness/code-scan.js` | 静态扫描（去注释/字符串，排除局部声明），结果只作告警 |
| `harness/fixtures.js` | 夹具登记、oracle、行容器、覆盖登记 |
| `tests/` | `node:test` 回归测试（51 条） |
| `docs/DECISIONS.md` | **为什么这么做** + 可复核证据（含 12 条决策） |
| `docs/mirror-provenance.md` | 镜像来源与去重决策（生成物） |
| `docs/research/` | 调研产物：CN_SXJ 移植矩阵（80 条能力）、Venera-Next 运行时 API 契约（1124 行） |

## 快速开始

```powershell
npm install
npm test                         # 51 条回归测试
npm run audit                    # 夹具覆盖审计
node harness/validate-sources.js sources/mirror/venera-configs
```

改 `sources/ehentai.js` 后必须 `npm test` 全绿才提交（[AGENTS.md](AGENTS.md) §3）。

## 阶段计划

| 阶段 | 目标 | 状态 |
|---|---|---|
| **1** | 夹具驱动回归测试台 + 锁定上游基线 | ✅ 51 测试 |
| **1b** | 汇总多源为私有目录仓库（镜像 + 去重 + 体检 + 发布） | ✅ 57 条清单 |
| **1.5** | **补当前站点样本**（新增夹具，不覆盖旧样本），让 oracle 覆盖新旧两代布局 | ⏭ 下一步 |
| **2** | 功能补齐：把 CN_SXJ 有、上游源没有的能力搬进自有源（排行榜 / 详情页字段 / 归档 / 评论投票 / 高级搜索 / tag 命名空间） | 待办 |
| **3** | 反封与稳健：509 检测 + `skipHathKey` 一次性令牌重试、统一响应体检（Sad Panda / kokomade / 空 body）、IP 封禁识别、多域名灾备、把静默 `catch` 改为可上报「跳过几行、首个原因」 | 待办 |

## 授权

上游两个源仓库**都没有声明任何许可证**（默认 = 保留所有权利），本仓库是其**衍生镜像**，
因此当前为**私有仓库** + `package.json` 标记 `UNLICENSED`。
若要公开分发，必须先逐一取得授权，或改为在 `index.json` 中用 `url` 字段引用上游原始地址
（那样只需分发清单、不必复制他人代码）。详见 [NOTICE.md](NOTICE.md)。
