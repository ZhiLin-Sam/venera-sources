# 决策与证据日志

本文件记录**为什么这么做**，以及支撑每条结论的可复核证据。凡涉及夹具的结构性事实，
均由 `tests/harness.test.js` 自动断言钉住，不靠人工记忆。

---

## D1 测试台用 jsdom，而不用 linkedom / cheerio

上游源的选择器大量写成 `table.itg.gltm > tbody > tr`、`table.itg.glte > tbody > tr`，
而页面的 HTML 源码里 `<table>`/`<tr>` 之间**未必显式写出 `<tbody>`**。

宿主侧真实实现是 Dart `package:html`，它执行完整的 HTML5 树构造算法，会**按规范隐式插入 `<tbody>`**。
所以测试台也必须用同样实现该算法的引擎，否则选择器直接命中 0 行，测试会变成假绿。

- 选择：`jsdom`（实现 HTML5 解析算法）
- 排除：`linkedom`（宽松解析，tbody 行为不一致）
- 断言：`tests/harness.test.js` → "jsdom 按 HTML5 规则隐式补 tbody"

## D2 oracle = 「承载画廊链接的行数」，不是总行数

初始版本我把「总行数 == 解析条数」当报警等式，结果 10 个变体全红。逐项推导后发现两个陷阱：

| 变体 | 行容器 | 总行数 | 表头行 | **承载画廊链接的行** |
|---|---|---|---|---|
| E/Ex Minimal | `table.itg.gltm > tbody > tr` | 26 | 1（`TH×6`） | **25** |
| E/Ex MinimalPlus | `table.itg.gltm > tbody > tr` | 26 | 1 | **25** |
| E/Ex Compat | `table.itg.gltc > tbody > tr` | 26 | 1（`TH×4`） | **25** |
| E/Ex Extended | `table.itg.glte > tbody > tr` | 25 | 0 | **25** |
| E/Ex Thumbnail | `div.gl1t` | 25 | 0 | **25** |

两个陷阱：

1. **表头行**：Minimal/Compat 的 tbody 首行是 `<tr>` 表头，所以 `总行数 = 画廊数 + 1`。
2. **嵌套表格**：用 `t.querySelectorAll('tbody > tr')` 会连单元格里嵌套表格的行一起数到
   （Extended 因此被误量成 105/110 行）；只有**直接子代**选择器 `table.itg.glte > tbody > tr`
   才是真实条目行 = 25。这条差异已由测试钉住。

结论：报警等式改为
**「承载画廊链接的行数 == 解析成功条数」**，即 `countGalleryRows()` 与 `res.comics.length` 相等。
这个 oracle 还具备自校准能力——站点改版后链接行本身会变化，而硬编码常量不会。

## D3 CN_SXJ 的列表解析测试是**死测试**，没有可继承的 oracle

`app/src/test/java/com/hippo/ehviewer/client/parser/` 下 3 个测试类共引用 13 个夹具，
其中 **11 个指向磁盘上不存在的文件**：

```
GalleryListParserTest.java  → GalleryListParserTest{E,Ex}{Minimal,MinimalPlus,Compat,Extended,Thumbnail}.GalleryTopListEX.html   ×10  不存在
GalleryPageParserTest.java  → GalleryPageParserTest.GalleryTopListEX.html                                                         ×1   不存在
GalleryPageApiParserTest.java → GalleryPageApiParserTest.json                                                                     ✓ 存在
TorrentParserTest.java        → torrentList.html                                                                                   ✓ 存在
```

被引用的名字里带**两个点**（`.<名字>.GalleryTopListEX.html`）。全仓扫描
`app/src/test/resources` 下匹配 `*.*.html` 的文件数 = **0**；精确 `Test-Path` 其中任一名字 = `False`。

因此 `GalleryListParserTest` 会在 `Okio.source(null)` 处抛 NPE —— **它从未真正执行过**。
连带后果：磁盘上那 10 个变体夹具 + `GalleryPageParserTest.html` **不被任何测试引用**。

这直接决定了本项目的做法：**oracle 必须自建**（见 D2），不能沿用上游断言。
`GalleryListParserTest.java:79` 的 `assertEquals(25, ...)` 仍是一条独立旁证——它与我方
按链接行统计出的 25 恰好一致，两条互不依赖的证据同时指向 25，可信。

## D4 核心缺陷：逐行 `catch(e) {}` 把改版变成静默的 0 条

上游源在列表解析的四个模式里各自包了空的 `catch`：

```
sources/upstream/ehentai.js:298-299   compact 模式
sources/upstream/ehentai.js:321-323   thumbnail 模式
sources/upstream/ehentai.js:350-352   extended 模式
sources/upstream/ehentai.js:376-378   minimal 模式
```

后果：站点改版 → 选择器失配 → 每行抛异常被吞 → **返回 0 条，且不报错**，
用户只看到"空列表"，你没有任何信号。这是"抗改版"要解决的**第一性问题**。

本项目的应对分两层：
1. **测试层（已落地）**：把「链接行数 == 解析条数」做成断言，静默丢失立刻变红（D2）。
2. **代码层（Phase 3）**：解析路径改为可上报「跳过几行、首个原因是什么」。
   见 `AGENTS.md` §2.3 —— 在本仓库禁止新增静默 `catch`。

## D5 基线锁定

`sources/ehentai.js` 初始内容 = `sources/upstream/ehentai.js`，**SHA256 一致**（已验证）。
在动任何解析逻辑前，44 条测试全绿，即"上游行为"是被记录的起点；
之后每一处优化都能用 `git diff sources/` 精确对照。

## D6 宿主私有伪头

上游把 `'http_client': 'dart:io'` 当请求头传给 `Network.get` / `Network.sendRequest`
（`sources/upstream/ehentai.js:1337, 1351` 原文注释：*"The server is uncomfortable with the default client"*）。
这不是 HTTP 头，而是**只在特定宿主生效的私有约定**。测试台会把它记进
`diagnostics.hostPrivateHeaders`，供 Phase 3 断言"不得散落在业务逻辑中"（`AGENTS.md` §2.4）。

## D7 授权状态未决（阻塞公开发布）

`venera-app/venera-configs` **没有许可证文件**（`LICENSE` → HTTP 404），README 亦未声明授权。
按默认著作权规则 = 保留所有权利，因此 `ehentai.js` 的再分发性未决。
在此之前仓库维持 `private: true` + `UNLICENSED`。详见 `NOTICE.md`。

## D8 夹具只读

33 个夹具是站点某时刻的静态抓取副本（总 2.6 MB），是判据的唯一真相来源。
需要新样本时**新增**文件，永不覆盖旧文件（`AGENTS.md` §2.1）。

## D9 ⚠️ 列表夹具停在 2019 年——本套测试对"今天的站点"没有证据力

按夹具内的日期字符串统计（`\b(19|20)\d{2}-\d{2}-\d{2}\b` 的年份极值）：

| 夹具 | 条目日期范围 |
|---|---|
| `GalleryListParserTest{E,Ex}{Minimal,MinimalPlus,Compat,Extended,Thumbnail}` ×10 | **2017 – 2019** |
| `GalleryListParserNew3` | 2007 – 2023 |
| `test` | 2021 |
| `GalleryListUploader` | 2021 |
| `GalleryTopListEX` | 2021 |
| `GalleryDetail` | 2024 |
| `TopListGallary` | 2024 |
| `FavoritesListParser` | 2007 – 2024 |
| `newPage` | 2022 – 2023 |
| `torrentList` | **2026** |

结论必须说清楚：**44 条测试全绿，只证明"能解析 2019 年的列表布局"**，
它不能证明上游源能解析今天的列表页。这些夹具的价值有两个边界：

1. **能挡住回归**：任何改动若破坏 2019 布局的兼容性，会立刻变红。这是真实保护。
2. **挡不住改版**：站点若在 2019 年之后改过列表 DOM，本套测试**不会**知道 ——
   因为样本本身就是旧的，解析器在那个成功路径上依然是绿的。

因此 Phase 1.5（见 README 阶段计划）的优先级高于继续堆测试：
**先补"当前站点"的样本**，否则整套报警器是装在旧世界里的。
捕获当前样本的做法：用 App 或 `harness/capture` 拉一次真实页面并按日期冻结成新夹具
（**新增**文件，不覆盖旧样本），然后让 oracle 同时覆盖新旧两代布局。

## D10 覆盖登记必须是显式声明，不能扫描测试源码

`npm run audit` 最初用「测试源码里是否出现该夹具名」判断覆盖，产生两类假阳性：

- **前缀包含**：`GalleryListParserTestEMinimal` ⊂ `GalleryListParserTestEMinimalPlus`；
- **通用词**：`test` 是 `test.html` 的 basename，几乎出现在每个测试文件里，于是被判成"已断言"。

改为 `harness/fixtures.js` 里的 `COVERAGE` 显式登记（`parse` / `structural`），
审计表与真实覆盖一一对应。**不要**把这段改回文本扫描。

## D11 宿主运行时契约（已逐条本地核验）

上游没有可用的离线测试手段，所以本项目的测试台必须自己复刻宿主契约。
下列事实均已在本机 `Venera-Next` 源码里核实，不是转述。

### 全局对象

宿主**只注入两个全局**：`sendMessage` 与 `appVersion`；其余全部由 `assets/init.js`（1533 行）
用 `sendMessage({method:...})` 拼装。源脚本真正能用的是：

`Network.*`、`Convert.*`、`HtmlDocument`、`UI.*`、`APP.*`、`Image`、`log`、`console`、
`setTimeout`、`setInterval`、`compute`、`createUuid`、`randomInt`、`randomDouble`、
`setClipboard`、`getClipboard`、`fetch` + 4 个数据构造器。

**不存在**（用了就是静默失败）：`http_get`、`http`、`html`、`document`、`localStorage`、
`base64`、`crypto`、`setting`、`toast`、`sleep`、`GM_*`、`require`、`import`。

### 三个"魔法头"

它们不是 HTTP 头，是宿主内部约定（已核验）：

| 伪头 | 语义 | 证据 |
|---|---|---|
| `cache-time` | `no` 绕过缓存 / `long` 长缓存 | `lib/network/cache.dart:92-105,151` |
| `prevent-parallel` | `'true'` 时串行化请求 | `lib/network/app_dio.dart:205-209` |
| `http_client` | `'dart:io'` 换底层客户端 | `lib/foundation/js_engine.dart:283` |

`harness/runtime.js` 的 `HOST_MAGIC_HEADERS` 会把它们记进 `diagnostics.hostPrivateHeaders`，
供后续断言"不得散落在业务逻辑中"（`AGENTS.md` §2.4）。

### 脚本无法控制的两件事

- **重定向**：硬编码 `limited(5)`，脚本无法改。
- **超时**：硬编码 15s，脚本无法设。
  重试由宿主做且次数有限（读路径最多 2 次额外重试；图片 5 次但需 `onLoadFailed` 配合）。

### JS 引擎 = QuickJS-NG，语法下界 ES2022

`init.js` 自身在每次引擎初始化时整体求值，且使用了 `??`、`?.`、类字段、`async/await`
→ 可确证下界为 **ES2022**。`import`/`export`/`require`/顶层 `await` 明确不可用。

**这构成本项目的一个真实陷阱**：Node 24 比 QuickJS-NG 宽松，用 ES2023+ 特性会「测试绿、App 挂」。
因此 `tests/source-repo.test.js` 有专门的 **ES2022 静态守卫**（禁 `findLast`/`toSorted`/`Object.groupBy`/
`Promise.withResolvers`/`structuredClone`/ESM 语法等）。新增代码前先看那条测试。

### HTML 解析面

Dart `package:html` 0.15.7，仅 **CSS 选择器**（无 XPath、**无 `getAttribute`**），
元素在 Dart 侧以整数句柄存放、同时打开的文档上限 8。

已知宿主缺陷：**`HtmlNode.toElement()` 是死接口** —— `init.js:986` 发 `node_toElement`，
而 `js_engine.dart:467` 收的是 `node_to_element` → 永不匹配 → `:486` 直接 `return null`。
但 `doc/api/js.zh.md:70` 仍把它列为可用 API。**本项目的源脚本不得使用 `toElement()`。**

### 导入失败的两个坑

1. **`minAppVersion` 省略 = 导入失败**：`init.js:1152` 基类默认 `""`
   → `parser.dart:205` 用 `""` 调 `compareSemVer`
   → `parser.dart:31` 的 `int.parse("")` 抛 `FormatException`，
   而报错信息**完全不指向该字段**。已由 `tests/source-repo.test.js` 断言非空。
2. **`sendMessage` 的 dispatch 没有 `default` 分支**（`js_engine.dart:179-263`）：
   拼错任何 API 名都不会报错，只会静默拿到 `null`。
   → 这就是本仓库必须坚持"**响亮失败**"（`harness/runtime.js` 未匹配路由即抛错）的根本原因。

### index.json 规范（本仓库 `index.json` 即按此写）

- **JSON 数组**，不是对象。
- 条目必填 `key` / `name` / `version`；`key` 须匹配 `^\w+$`；
  `version` 须匹配 `^\d+\.\d+\.\d+(?:[.\-].+)?$`。
- `url` 优先于 `fileName`，二者取其一；`description` 可选。
- **相对路径基准 = 跟随重定向后的最终响应 URL**，即 `response.realUri`
  （`source_import.dart:99`、`source_repositories.dart:213` 均为 `response.realUri.toString()`）。
- 版本比较是**自研 `compareSemVer`**（`parser.dart:24`）：前 3 段按整数比，第 4 段只特判字面量
  `"hotfix"`，否则按字典序 —— **它不是 SemVer**。
- 注意两侧 `key` 正则不一致：catalog 的 `^\w+$` 允许数字开头，脚本侧不允许。

