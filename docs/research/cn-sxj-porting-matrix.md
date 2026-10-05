# EhViewer_CN_SXJ 站点抓取能力 → Venera `ehentai.js` 可移植性矩阵

- 调研对象：`C:\Users\Samso\Desktop\projectD03\EHviewer\Ehviewer_CN_SXJ\`（只读，未做任何修改）
- 版本线索：`app/build.gradle` → `versionName "2.0.2.5"`
- 调研方式：静态阅读源码 + 夹具结构比对（**未编译、未跑 Gradle、未联网**）
- 所有论断带 `文件:行`；相对路径以 `app/src/main/java/com/hippo/ehviewer/` 或 `app/src/test/...` 为前缀给出。
- 解析器实际数量：**23 个**（`client/parser/*.java`，非任务描述里的 24；见 §F 说明）

---

## 0. 架构速览（决定"什么能被 JS 搬走"）

```
EhClient.Task(AsyncTask) ──> EhEngine(静态方法, 每站一个 GET/POST) ──> XxxParser(纯字符串/JSON)
                                     │                                        │
                                     ├── OkHttpClient (cookieJar/cache/dns)   └── Jsoup / org.json / java.util.regex
                                     ├── EhRequestBuilder (Chrome UA + Referer/Origin)
                                     └── EhUrl (域名/端点常量)
```

- **纯解析层**（`parser/*.java` 的绝大多数）只依赖 `String` + `Jsoup` + `org.json` + `java.util.regex`，是最容易平移到 JS 的一层。
- **请求层**（`EhEngine`）依赖 OkHttp 的 `Call/RequestBody/MultipartBody/Headers`，JS 里等价物是 `fetch/XMLHttpRequest`，但**部分行为（cookie jar、连接池、DNS over HTTPS、TLS 指纹）无法 1:1 复刻**。
- **状态层**（`EhDB` / `Settings` / `SpiderInfo` / 下载引擎）依赖 Android SQLite / SharedPreferences / 本地文件，是 JS 源脚本搬不动的部分。

`EhClient` 的方法枚举即"站点能力清单"：`client/EhClient.java:45-72`（`METHOD_SIGN_IN`=0 … `METHOD_GET_EDIT_COMMENT`=29），
派发点 `client/EhClient.java:156-215` —— 这一张 switch 就是 A 表的能力总目。

---

## A. 能力矩阵

> 说明：**JS 价值** 面向"用 JS 重写 Venera 源 `ehentai.js`"这个具体目标：
> **高** = 直接决定源能否工作；**中** = 显著提升体验；**低** = 锦上添花或 Venera 侧已由框架承担。
> 判据里的正则/选择器均为**原文照抄**（`\\` 在 Java 源码里是转义，下表已还原为 regex 字面量语义）。

### A.1 画廊列表（list / search / tag / uploader）—— 4 种变体

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 1 | 列表条目容器定位 | `client/parser/GalleryListParser.java:202-210` | `Elements es`（每条一个 `Element`） | `class="itg"`；若 `tagName=="table"` 取 `itg.child(0).children()`，否则 `itg.children()` | 任意列表页 | 高 | 需要分「table 型」与「div 型」两条分支，判据是 `itg.tagName()` |
| 2 | **Minimal** 变体（`gltm`） | `client/parser/GalleryListParser.java:339-372` | `thumb`(`data-src` 优先→`src`)、`thumbWidth/Height`、`pages` | `class="glthumb"` → `div:nth-child(1)>img`；`height:(\d+)px;width:(\d+)px`；`div:nth-child(2)>div:nth-child(2)>div:nth-child(2)` 内 `(\d+) page` | 列表页 `?f_search=…` / `/tag/…` / `/uploader/…` | 高 | 3 层 `nth-child` 硬编码，站点改版即碎；JS 侧建议用「找含 `page` 文本的兄弟 div」兜底 |
| 3 | **MinimalPlus** 变体 | `client/parser/GalleryListParser.java:461-473` | `tgList`（`title` 属性数组，如 `parody:kantai collection`） | `JsoupUtils.getElementsByClass(e,"gt")` 的 `eachAttr("title")` + `"gtl"` 同理 | 同上（站点开关 `lt`=鼠标悬停标签） | 中 | 与 Minimal 共用 `glthumb` 分支，仅多 `gt`；判据纯属性，JS 好搬 |
| 4 | **Extended** 变体（`glte`） | `client/parser/GalleryListParser.java:374-396, 423-443` | `thumb`(`img src`)、`uploader`、`pages` | 缩略图：`class="gl1e"`（回退 `gl3t`）内 `img`；上传者/页数：`class="gl3e"` 的 `children[3]`/`children[4]` | 站点设置 `dm`=扩展布局 | 高 | **索引式取值**（3/4）而非语义选择器，站点增删列即错位 |
| 5 | **Compat** 变体（`gltc`） | `client/parser/GalleryListParser.java:329-372, 419-443` | 分类(`cn`/`cs`)、`glthumb` 缩略图、上传者+页数合并 | `class="glhide"`（此时 `uploaderIndex=0,pagesIndex=1`） | 站点设置 `dm`=兼容布局 | 高 | 与 Minimal 共用 `glthumb`，差异只在 `glhide` 里两列的位置；**这是 2024+ e-hentai 默认布局，最该优先支持** |
| 6 | **Thumbnail / 大图流** 变体（`gld`） | `client/parser/GalleryListParser.java:375-396, 444-454` | `thumb`、`pages` | 缩略图 `class="gl3t"` 内 `img`；页数 `class="gl5t"` → `div:nth-child(2)>div:nth-child(2)` | 站点设置 `dm`=缩略图布局 | 中 | `gl5t` 的 `nth-child` 又一套；且此布局是 **div 流**不是 table |
| 7 | 条目标题 / gid / token | `client/parser/GalleryListParser.java:288-327` + `client/parser/GalleryDetailUrlParser.java:31-35` | `title`、`gid`、`token` | `class="glname"` 内（或父级）`a[href]` → `(\d+)/([0-9a-f]{10})(?:[^0-9a-f]|$)`；标题取最深层子节点文本 | `https://e-hentai.org/g/1392268/7ff56437fa/` | 高 | `glname` 常与 `gl3m`/`gl4e` 等共类（`class="gl3m glname"`），JS 必须用 class 词表匹配而非全等 |
| 8 | 条目分类 | `client/parser/GalleryListParser.java:329-337` + `client/EhUtils.kt:87-100` | `category`(int) | `class="cn"`，无则 `class="cs"`；文本 → `CATEGORY_STRINGS` 匹配 | 同上 | 中 | 分类表 `client/EhUtils.kt:72-84` 需整体翻译成 JS 常量 |
| 9 | 条目上传时间 / 收藏槽位 | `client/parser/GalleryListParser.java:398-407` | `posted`、`favoriteSlot` | `id="posted_<gid>"`；`background-color:rgba\((\d+),(\d+),(\d+),` 与 10 色表比对（`:57-68`） | 同上 | 中 | 10 色 RGB 表必须逐字搬；无 `posted_` 时回退本地 DB（JS 无此能力） |
| 10 | 条目评分 | `client/parser/GalleryListParser.java:242-265, 411-417` | `rating`(float)、`rated`(bool) | `class="ir"` 的 `style` 里两个 `\d+px`；`rate=5-num1/16`，`num2==21` 则 `.5`；已评：`hasClass("irr"/"irg"/"irb")` | 同上 | 中 | 反直觉算法，必须原样移植（`num1/16` 是整数除法） |
| 11 | 列表分页（pages / nextPage） | `client/parser/GalleryListParser.java:83-91, 172-186` | `pages`、`nextPage` | `class="ptt"` → `child(0).child(0).children()`，倒数第 2 个 `.text()` 为总页数；最后一个节点的首子 `a[href]` 里 `page=(\d+)` | 列表页 | 高 | `es.size()-2` 的负索引；JS 需 `Math.max(0, len-2)` 保护 |
| 12 | 搜索导航四向链接 | `client/parser/GalleryListParser.java:106-136` | `firstHref`/`prevHref`/`nextHref`/`lastHref` | `class="searchnav"` 内 `id="uFirst"`/`"uprev"`/`"unext"`/`"ulast"` 的 `href` | 搜索/收藏列表 | 中 | 无 `ptt` 时才走这条分支，JS 需两套分页模型并存 |
| 13 | 结果计数文案 | `client/parser/GalleryListParser.java:49-55, 138-170` | `resultCount`(string) | `class="searchtext"` 文本 + `Found .* results`；`"thousands"`→`"1,000+"`；`"about"`→`<n>+` | 搜索列表 | 低 | 文案本地化脆弱，JS 里建议只做 best-effort |
| 14 | 空结果 / 无命中 | `client/parser/GalleryListParser.java:187-200, 219-229` | `pages=0`、空列表；否则抛 `ParseException("No gallery")` | `No hits found</p>`；`You do not have any watched tags`；空列表时读 `class="itg gltc"` → `child(0).child(1).child(0).text()` 判定 | 列表页 | 高 | **判据字符串是英文原文**，Venera 若要支持多语言站点需原样保留英文匹配 |
| 15 | 缩略图 URL 归一化（补全 3 段路径） | `client/EhUrl.java:290-318` | 修正后的 `thumb` | 末三段满足 `last.startsWith(third) && last.startsWith(second, third.length())` → `getThumbUrlPrefix()+third+"/"+second+"/"+last` | 任意缩略图 | 中 | 前缀选择：`client/EhUrl.java:85-86, 280-288`（`https://ehgt.org/` vs `https://exhentai.org/t/`，**当前实现恒定返回 `ehgt.org`**） |
| 16 | 缩略图分辨率改写 | `client/EhUtils.kt:181-201` | `thumb` | `url.lastIndexOf('_')` / `lastIndexOf('.')` 之间替换为 `250` 或 `300` | 任意缩略图 | 低 | 依赖用户设置 `Settings.getThumbResolution()`；Venera 侧一般不需要 |
| 17 | 列表标签简表 | `client/parser/GalleryListParser.java:461-473` | `simpleTags`(`String[]`)、`tgList`(`ArrayList<String>`) | `class="gt"` / `class="gtl"` 的 `title` 属性 | 列表页 | 中 | 与「详情页 tbody 解析」共用 `parseTagGroups`（`:313-323`） |
| 18 | 列表→API 补全（tags/pages/rated 缺失时） | `client/EhEngine.java:209-260, 301-358` | 回填 `title/titleJpn/category/thumb/uploader/posted/rating/tags/filecount` | POST JSON `{"method":"gdata","gidlist":[[gid,token],…],"namespace":1}` → `gmetadata[].{gid,title,title_jpn,category,thumb,uploader,posted,rating,tags[],filecount}` | `https://e-{ex}hentai.org/api.php` | **高** | **一次最多 25 条**（`EhEngine.java:304`），JS 需自行分批；返回 `posted` 是 unix 秒需 ×1000 |

### A.2 画廊详情页

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 19 | 详情页 gid/token/apiuid/apikey | `client/parser/GalleryDetailParser.java:71, 146-158` | `gid`、`token`、`apiUid`、`apiKey` | `var gid = (\d+);.+?var token = "([a-f0-9]+)";.+?var apiuid = ([\-\d]+);.+?var apikey = "([a-f0-9]+)";`（`DOTALL`） | `{host}/g/{gid}/{token}/` | **高** | 这是后续所有 `api.php` 调用的前置凭据，**必须拿到**；`DOTALL` 等价 `[\s\S]` |
| 20 | 标题 / 日文标题 / 分类 / 上传者 | `client/parser/GalleryDetailParser.java:188-223` | `title`、`titleJpn`、`category`、`uploader` | `class="gm"` 下 `id="gn"` / `id="gj"` / `id="gdc"`（内 `cn`→`cs`） / `id="gdn"` | 同上 | 高 | 无 |
| 21 | 详情元信息行 | `client/parser/GalleryDetailParser.java:225-240, 325-371` | `posted`/`parent`/`visible`/`language`/`size`/`pages`/`favoriteCount` | `id="gdd"` → `child(0).child(0).children()`，每行 `children[0].text()` 做前缀开关：`Posted`/`Parent`/`Visible`/`Language`/`File Size`/`Length`/`Favorited` | 同上 | 高 | `Favorited` 值三种形态：`Never`→0、`Once`→1、否则取首个空格前的数 |
| 22 | 评分与评分人数 | `client/parser/GalleryDetailParser.java:242-267` | `ratingCount`、`rating` | `id="rating_count"`；`id="rating_label"` 文本，`"Not Yet Rated"`→`-1.0`，否则取**第一个空格之后**的部分 | 同上 | 中 | 「第一个空格之后」对 `Rating: 4.5` 与 `4.5` 都成立，但语义脆 |
| 23 | 是否已收藏 / 收藏夹名 | `client/parser/GalleryDetailParser.java:269-279` | `isFavorited`、`favoriteName` | `id="gdf"`；文本 == `Add to Favorites` 则未收藏 | 同上 | 中 | 依赖英文原文比对 |
| 24 | 新版（同人志新版本）列表 | `client/parser/GalleryDetailParser.java:284-312` | `newVersions[]{versionUrl, versionName}` | `id="gnd"` 的子元素 `absUrl("href")`，名称与时间来自 `textNodes()` 与子节点配对 | 同上 | 低 | 依赖 `absUrl`（需要 base URI），JS 里要自己拼 |
| 25 | 封面缩略图 | `client/parser/GalleryDetailParser.java:74, 176-186, 315-323` | `thumb` | `class="gm"` → `id="gd1"` 的 `child(0)` `style`：`width:(\d+)px; height:(\d+)px.+?url\((.+?)\)` | 同上 | 中 | 从 CSS 里抠 URL，注意 `url()` 内可能带引号/空格 |
| 26 | 种子入口与数量 | `client/parser/GalleryDetailParser.java:72, 160-167` | `torrentUrl`、`torrentCount` | `<a[^<>]*onclick="return popUp\('([^']+)'[^)]+\)">Torrent Download \((\d+)\)</a>` | `https://exhentai.org/gallerytorrents.php?gid=…&t=…` | 中 | 正则对 `\n` 与空白敏感（真实页面里 `Torrent\n Download (5)` 能匹配是因为字符类宽容）；URL 需 `unescapeXml` |
| 27 | 归档入口 | `client/parser/GalleryDetailParser.java:73, 87, 169-174` | `archiveUrl` | `PATTERN_ARCHIVE`：`<a[^<>]*onclick="return popUp\('([^']+)'[^)]+\)">Archive Download</a>`；另有 `PATTERN_ARCHIVE_DOWNLOAD`（`:87`） | `https://exhentai.org/archiver.php?gid=…&token=…` | 中 | 页面把 `Archive\n Download` 折行，正则里 `>Archive Download</a>` 能匹配说明前导空白被 `[^)]+\)` 吃掉；JS 建议先归一化空白 |
| 28 | 错误态：Offensive / Pining / Unavailable | `client/parser/GalleryDetailParser.java:98-122` | 三类异常 | `"<p>(And if you choose to ignore this warning, you lose all rights to complain about it in the future.)</p>"`；`"<p>This gallery is pining for the fjords.</p>"`；`"This gallery is unavailable"` | 详情页 | 高 | 必须给出可读消息而不是"解析失败" |
| 29 | 错误态：通用站点报错 | `client/parser/GalleryDetailParser.java:70, 124-128`（同 `client/parser/MyTagLitParser.java:19`、`client/parser/TopListParser.java:27`） | 抛出文本 | `<div class="d">\n<p>([^<]+)</p>` | 任意页 | 高 | `\n` 硬编码，JS 里用 `\r?\n` 更稳 |
| 30 | 标签组（命名空间 + 标签） | `client/parser/GalleryDetailParser.java:373-465` | `tags: GalleryTagGroup[]{groupName, tags[]}` | DOM 路径：`id="taglist"` → `child(0).child(0).children()`；每组 `child(0).text()` 去掉末尾 `:` 作命名空间，`child(1).children()` 文本为标签；标签含 `\|` 时截断（英文译名） | 详情页 | **高** | 正则版（`:75-76`）只允许 `[\w\s]`，**不支持中文/`-`/`.` 标签**；JS 应走 DOM 版 |
| 31 | 评论区条目 | `client/parser/GalleryDetailParser.java:467-545` | `id`、`voteUpAble/Ed`、`voteDownAble/Ed`、`editable`、`voteState`、`score`、`time`、`user`、`comment`(html)、`lastEdited` | `id="cdiv"` → `class="c1"`；`id` 取 `previousElementSibling().attr("name")` 去掉首字符；`class="c4"` 子元素文本 `Vote+`/`Vote-`/`Edit`；`class="c7"` 投票态；`class="c5"` 首子为分数；`class="c3"` 时间 `Posted on … by:`；`class="c6"` 为正文 HTML；`class="c8"` 为最后编辑 | 详情页 | **高** | 依赖「前一个兄弟节点的 `name` 属性」这一非常规结构；时间格式 `dd MMMMM yyyy, HH:mm`（**UTC**，见 `:92-96`）在 JS 里要手写月名映射 |
| 32 | 评论「显示全部」判定 | `client/parser/GalleryDetailParser.java:564-577` | `hasMore`(bool) | `id="chd"` 子树中任意元素 `text().equals("click to show all")` | 详情页 `?hc=1` | 中 | 需要全树遍历（JSoup `NodeTraversor`），JS 里是 `querySelectorAll('*')` |
| 33 | 预览图页数（两种） | `client/parser/GalleryDetailParser.java:616-642` | `previewPages` | DOM：`class="ptt"` → `child(0).child(0).children()` 倒数第 2 个；正则：`<td[^>]+><a[^>]+>([\d,]+)</a></td><td[^>]+>(?:<a[^>]+>)?&gt;(?:</a>)?</td>` | 详情页 | 中 | 双路径，Venera 侧只需一条 |
| 34 | 总页数 | `client/parser/GalleryDetailParser.java:78, 647-660` | `pages` | `<tr><td[^<>]*>Length:</td><td[^<>]*>([\d,]+) pages</td></tr>` | 详情页 | 中 | 在 `newPage.html`/`spiderInfo.html` 上都成立 |
| 35 | 预览图集合（Normal，4 种历史形态） | `client/parser/GalleryDetailParser.java:79-80, 725-796` | `[{position,imageUrl,xOffset,yOffset,width,height,pageUrl}]` | 依次尝试：`SMALL_PREVIEW`、`NORMAL_PREVIEW_NEW`、`SMALL_PREVIEW_WITH_LABEL`、`NORMAL_PREVIEW_NEW_WITH_LABEL`、最后旧版 `NORMAL_PREVIEW`（`:80`）；容器先 `class="gt200"` 再 `class="gt100"`（`:662-685`） | 详情页 | 中 | **五种正则的级联**，是最大的"污垢"来源；Venera 侧只需要最新的 `_NEW_WITH_LABEL` 系列 + 一件兜底 |
| 36 | 预览图集合（Large） | `client/parser/GalleryDetailParser.java:85-86, 694-720` | `[{index,imageUrl,pageUrl}]` | `LARGE_PREVIEW_NEW`：`<a href="(.+?)">[^<>]*<div title="Page (\d+):[^<>]*\((.+?)\)[^<>]*0 0[^<>]*>`；旧版 `LARGE_PREVIEW`：`<div class="gdtl".+?<a href="(.+?)"><img alt="([\d,]+)".+?src="(.+?)"` | 详情页 | 中 | 若站点设置 `ts=l`（大预览）才走这条 |
| 37 | `spiderInfo.html` 兼容路径 | `client/parser/GalleryDetailParser.java:139-141` | `SpiderInfoPages`、`SpiderInfoPreviewPages`、`SpiderInfoPreviewSet` | 同 33/34/35 的**纯正则**版本 | 详情页 | 低 | 为了兼容历史夹具而保留，JS 不必移植 |

### A.3 画廊页 / token / 图库 API

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 38 | 画廊页（HTML）：图片直链 + showkey + skipHathKey + 原图 | `client/parser/GalleryPageParser.java:27-31, 33-58` | `imageUrl`、`showKey`、`skipHathKey`、`originImageUrl` | `<img[^>]*src="([^"]+)" style`；`var showkey="([0-9a-z]+)";`；`onclick="return nl\('([^\)]+)'\)`；`<a href="([^"]+)fullimg([^"]+)">` | `{host}/s/{pToken}/{gid}-{index+1}` | **高** | `imageUrl && showKey` 二者缺一即 `ParseException`（`:53-57`）——**JS 必须实现同样的硬失败**，否则会拿到空图 |
| 39 | 画廊页（API）：showpage | `client/parser/GalleryPageApiParser.java:29-32, 34-79` | `imageUrl`、`skipHathKey`、`otherImageUrl`、`originImageUrl` | POST JSON `{"method":"showpage","gid","page"(1-based),"imgkey","showkey"}`；响应 `i3` 里 `<img[^>]*src="([^"]+)" style`；`i6` 里 `onclick="return nl\('([^\)]+)'\)` 与 `<a href="#" onclick="prompt\('Copy the URL below.', '([^"]+)'\)`；`i7`（可能 null）里 `<a href="([^"]+)fullimg([^"]+)">` | `{host}/api.php` | **高** | 响应含 `error` 字段时抛 `ParseException`（`:40-42`）；`i7` 为 null 时回退 `i6`（`:60-65`）——这个分支必须保留 |
| 40 | 详情 token 获取 | `client/parser/GalleryTokenApiParser.java:25-43` | `token` | POST JSON `{"method":"gtoken","pagelist":[[gid,gtoken,page+1]]}` → `tokenlist[0].token`，失败读 `tokenlist[0].error` | `{host}/api.php` | 中 | 用于列表中拿到的 token 失效时重取 |
| 41 | 图库数据 API（gdata） | `client/parser/GalleryApiParser.java:31-60` | 见 #18 | `gmetadata[].gid/title/title_jpn/category/thumb/uploader/posted/rating/tags/filecount` | `{host}/api.php` | **高** | `posted` 为 unix 秒；`tags` 已是 `namespace:tag` 形式字符串数组 |
| 42 | 画廊详情 URL 解析 | `client/parser/GalleryDetailUrlParser.java:31-35, 43-61` | `gid`、`token` | strict：`https?://(?:exhentai\.org|e-hentai\.org|lofi\.e-hentai\.org)/(?:g\|mpv)/(\d+)/([0-9a-f]{10})`；loose：`(\d+)/([0-9a-f]{10})(?:[^0-9a-f]\|$)` | 用户粘贴的 URL | **高** | Venera 源的 `getInfo`/URL 解析常要这个；**token 固定 10 位小写 hex** |
| 43 | 画廊页 URL 解析 | `client/parser/GalleryPageUrlParser.java:30-34, 42-61` | `gid`、`pToken`、`page`(0-based) | strict：`https?://(?:…)/s/([0-9a-f]{10})/(\d+)-(\d+)`；loose：`([0-9a-f]{10})/(\d+)-(\d+)` | `…/s/7b87643838/530350-1` | 中 | `page` 做了 `-1`，注意与 `getPageUrl` 的 `+1`（`client/EhUrl.java:195-197`）对称 |
| 44 | 列表 URL → 查询对象 | `client/parser/GalleryListUrlParser.java:32-133` | `category`、`keyword`、`mode` | 路径前缀 `/uploader/`、`/tag/`、`/<纯数字>`；host 必须在 `{exhentai.org, e-hentai.org, lofi.e-hentai.org}` | 列表页 URL | 低 | 面向"从 URL 反推搜索条件"，JS 源一般不需要 |

### A.4 收藏夹

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 45 | 未登录检测 | `client/parser/FavoritesParser.java:52-54` | 抛 `EhException(need_sign_in)` | `This page requires you to log on.</p>` | `favorites.php` | 高 | 英文原文硬编码 |
| 46 | 10 个收藏目录 + 计数 | `client/parser/FavoritesParser.java:62-72` | `catArray[10]`、`countArray[10]` | `class="ido"` → `class="fp"`（**必须恰好 11 个**，`AssertUtils.assertEquals(11, fps.size())` `:66`）；前 10 个：`child(0).text()`=计数、`child(2).text()`=目录名 | `{host}/favorites.php?favcat=0…9` | **高** | 硬断言 11 个；JS 里应改成 `>=10` 容错并单独处理 `fp fps`（当前无选中目录时） |
| 47 | 收藏排序 | `client/parser/FavoritesParser.java:73-84` | `favOrder` | `class="searchnav"` → 第一个 `<select>` → `getElementsByAttribute("selected")` 的 `value` | 同上 | 低 | 只在收藏页出现 |
| 48 | 收藏夹列表主体 | `client/parser/FavoritesParser.java:91-103` | 直接复用 `GalleryListParser.parse(d, body, MODE_NORMAL)` | — | 同上 | **高** | **复用列表解析器**是这里最大价值：JS 只需一个 `parseGalleryList()` |
| 49 | 收藏 URL 构造 | `client/data/FavListUrlBuilder.java:111-135` | URL | `favcat=0..9`；关键词时追加 `f_search`、`sn=on`、`st=on`、`sf=on`；分页 `page` | `{host}/favorites.php?favcat=…` | 中 | 关键词搜索的 3 个 `on` 参数容易漏 |
| 50 | 添加/删除单个收藏 | `client/EhEngine.java:654-700` | 无返回值（靠异常） | POST 表单 `favcat`(`favdel` 表示删除 / `0`-`9`)、`favnote`、`submit=Apply Changes`、`update=1` | `{host}/gallerypopups.php?gid=…&t=…&act=addfav` | 中 | `dstCat==-1` → `favdel`，`:656-663`；`note` 上限 250 字符（`:652` 注释） |
| 51 | 批量改收藏夹 / 批量删除 | `client/EhEngine.java:711-759` | 返回更新后的 `FavoritesParser.Result` | POST 表单 `ddact`(`delete` 或 `fav0`…`fav9`)、`modifygids[]`(可重复)、`apply=Apply` | 收藏页 URL 本身 | 中 | `ddact` 命名与单条的 `favcat` **不一致**（`favdel` vs `delete`），易踩 |
| 52 | 批量添加（循环单条） | `client/EhEngine.java:702-709` | — | 对 `gidArray` 逐个调 `addFavorites` | — | 低 | 无批量接口，N 次请求 |

### A.5 种子 / 归档 / 排行榜 / 首页 / 用户

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 53 | 种子列表 | `client/parser/TorrentParser.java:28-30, 32-57` | `[{url,name,posted}]` | 先切块 `<form\b[^>]*>.*?</form>`（`DOTALL`），块内 `<td colspan="5">\s*&nbsp;\s*<a href="([^"]+)"[^<]*>([^<]+)</a></td>`；时间 `<span[^>]*>\s*Posted:\s*</span>\s*<span>([^<]+)</span>` | `{host}/gallerytorrents.php?gid=…&t=…` | 中 | **URL 要砍掉 `?p=`**（`:42-46`），否则 torrent 不可再分发 |
| 54 | 归档列表（格式 + `or` 参数） | `client/parser/ArchiveParser.java:38-40, 43-59` | `or`(string)、`[{res,name}]` | `<form id="hathdl_form" action="[^"]*?or=([^=\"]*?)" method="post">`；条目 `<a href="[^"]*" onclick="return do_hathdl\('([0-9]+|org)'\)">([^<]+)</a>` | `{host}/archiver.php?gid=…&token=…[&or=…]` | 中 | `or` 从 form action 里抠，跨页时必须回填 |
| 55 | 归档（H@H）页面数据 | `client/parser/ArchiveParser.java:61-99` | `funds`、`originalCost/Size/Url`、`resampleCost/Size/Url` | DOM 硬索引：`document.childNode(2).childNode(3).childNode(1)`，E 站与 EX 站**结构不同**（`:64-96` 两大分支） | 同上 | 低 | 纯 position 路径，站点改版即碎；Venera 侧价值低 |
| 56 | 触发归档下载 + H@H 客户端检测 | `client/EhEngine.java:896-942, 109` | 抛 `NoHAtHClientException` | POST 表单 `hathdl_xres=<res>`；响应体匹配 `(You must have a H@H client assigned to your account to use this feature\.)` | `{host}/archiver.php?gid=…&token=…&or=…` | 中 | H@H 属于用户侧基础设施，JS 源里应作为可读错误抛出 |
| 57 | 归档下载链接二次跳转 | `client/EhEngine.java:944-1001` | `downloadUrl` | 响应里 `document.location = "(.*)"` → 跟随 → `ArchiveParser.parseArchiverDownloadUrl`：`href="(.*)">Click Here To Start Downloading`；最终 `"https://" + host + path` | archiver 二次跳转 | 中 | 需要 `response.request().url().host`（跟随后的最终域名），JS 里是 `res.url` |
| 58 | 排行榜 TopList | `client/parser/TopListParser.java:22-27, 30-65, 67-94` | `title` + 7 类 × {allTime, pastYear, pastMonth, yesterday} 各 10 项 `{value, href}` | `class="ido"` 的 `children[0,1,3,5,7,9,11,13]`（第 0 个是标题，其余为 7 个榜单）；每榜 `children[1..4].child(1).child(0)`，内含 `class="tun"` 的 `child(0)` → `text` / `href` | `{host}/toplist.php?<follow>`；`ListUrlBuilder.build()` `:658-671` | 中 | **`children` 的奇数索引是硬编码**；且 `client/EhUrl.java:234-247` 里 EX 站排行榜被注释禁用（"里站没排行榜入口"） |
| 59 | TopList URL 构造 | `client/data/ListUrlBuilder.java:658-671` | URL | `?` + `mFollow`；`p` 仅在 `0<mPageIndex<200` 时追加，否则返回哨兵 `127.0.0.1:8888`（`:669`） | `toplist.php` | 低 | 哨兵值是"故意失败"技巧，JS 别照抄 |
| 60 | 首页数据（图像配额/GP/Moderation Power） | `client/parser/EhHomeParser.java:20-21, 32-55, 57-99` | `used`、`total`、`resetCost`、`fromGalleryVisits`、`fromTorrentCompletions`、`fromArchiveDownloads`、`fromHentaiAtHome`、`currentModerationPower` | `class="homebox"` 的 `[0]`/`[2]`/`[4]`；配额正则（新）`<p>You are currently at <strong>(.+?)</strong> towards your account limit of <strong>(.+?)</strong>.</p>\n<p>You can reset your image quota by spending <strong>(.+?)</strong> GP.</p>`；旧版 `:20` | `{host}/home.php` | 中 | 三个 `homebox` 的**固定下标** `0/2/4`；两套配额文案 |
| 61 | 重置图像配额 | `client/EhEngine.java:1437-1471` | 返回新的 `HomeDetail` | POST 表单 `reset_imagelimit=Reset Limit` → 复用 `EhHomeParser.parse` | `{host}/home.php` | 低 | 消耗 GP，慎用 |
| 62 | 事件页（Event Pane） | `client/parser/EhEventParse.java:11-49` | 事件 HTML 片段 | `document.getElementById("eventpane")` → `.html()` | 详情页/首页响应里内嵌 | 中 | 详情页与首页都会调用（`client/EhEngine.java:381-384`、`:1425-1428`）——JS 源可忽略，但对"升级提示"有信息价值 |
| 63 | 新闻页 | `client/EhEngine.java:1374-1402` + `client/data/EhNewsDetail.java` | `EhNewsDetail(html)` | 无解析，只包一层 | `https://e-hentai.org/news.php`（`client/EhUrl.java:49, 254-256`） | 低 | 纯 HTML 直出 |
| 64 | 我的标签 / watched 列表 | `client/parser/MyTagLitParser.java:19, 21-54, 56-92` | `[{userTagId, tagName, watched, hidden, color, tagWeight}]` | `id="usertags_outer"` 的 `children`（跳过 `[0]`）；每个 `div`：`id` 去掉前 7 字符为主键；`#tagpreview<id>` 的 `title`=标签名；`#tagwatch<id>`/`#taghide<id>` 的 `checked`；`#tagcolor<id>` 的 `placeholder`；`#tagweight<id>` 的 `value` | `{host}/mytags`（`client/EhUrl.java:79-80, 166-174`）；watched 用 `watched`（`:82-83`） | 中 | `id` 前缀长度 7（`usertag_`? 实为 `substring(7)`，`:59`）与 `UserTag.getId()` 的 `substring(8)`（`client/data/userTag/UserTag.java:73`）**不一致**——移植时只信其中一条 |
| 65 | 添加标签到 watched | `client/data/userTag/TagPushParam.java:18-32` | — | form-urlencoded：`usertag_action=add&tagname_new=…[&taghide_new=on][&tagwatch_new=on]&tagcolor_new=…&tagweight_new=10&usertag_target=0` | `{host}/mytags` | 中 | 固定 `tagweight_new=10`（硬编码，`:31`）；`getEncodeTagName()` 的 `replace` **未赋值**（`:37-38`，实为 no-op bug），JS 里应真正编码 |
| 66 | 删除/批量改标签 | `client/data/userTag/UserTag.java:77-84` | — | `usertag_action=mass&tagname_new=&tagcolor_new=&tagweight_new=<w>&modify_usertags[]=<id>&usertag_target=0` | 同上 | 中 | `modify_usertags%5B%5D` 已手工 URL 编码，JS 用 `URLSearchParams` 时注意别二次编码 |
| 67 | 重置筛选状态（Reset Limit 之外） | `client/EhEngine.java:1437-1471` | 同 #61 | 同上 | `home.php` | 低 | — |

### A.6 登录 / 身份 / 用户资料 / 论坛

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 68 | 用户名密码登录 | `client/EhEngine.java:170-207` + `client/parser/SignInParser.java:27-44` | 登录用户名 | POST 表单 `UserName`、`PassWord`、`submit=Log me in`、`CookieDate=1`、`temporary_https=off`（`:172-177`）；成功 `<p>You are now logged in as: (.+?)<`；失败 `(?:<h4>The error returned was:</h4>\s*<p>(.+?)</p>)\|(?:<span class="postcolor">(.+?)</span>)` | `https://forums.e-hentai.org/index.php?act=Login&CODE=01`（`client/EhUrl.java:47`） | 中 | Referer/Origin 必须是 `forums.e-hentai.org`（`:179-180`）；Venera 里通常是直接填 Cookie，此接口价值中等 |
| 69 | Cookie 登录态（三件套） | `client/EhCookieStore.java:32-34, 53-57` | — | `ipb_member_id`、`ipb_pass_hash`、`igneous`；`hasSignedIn()` 只校验前两个 | 任意域名 | **高** | EX 站需要 `igneous`；Venera 源的"Cookie 登录"直接对应这三个键 |
| 70 | 内容警告 cookie 注入 | `client/EhCookieStore.java:36-43, 87-112` | — | 对 `e-hentai.org` 强制注入 `nw=1`（`Key_CONTENT_WARNING`/`CONTENT_WARNING_NOT_SHOW`，`client/EhConfig.java:202, 526-531`），同时**剥离**响应里的 `nw` 与 `uconfig` | `e-hentai.org` | 中 | `uconfig` cookie 会被剥离（`:101-103`），意味着站点布局偏好由 App 自行拼 URL 表达 |
| 71 | 用户资料（头像 / 显示名） | `client/parser/ProfileParser.java:34-56` | `displayName`、`avatar` | `id="profilename"` → `child(0).text()`；头像取 `profilename.nextElementSibling().nextElementSibling().child(0).attr("src")`，相对路径补 `EhUrl.URL_FORUMS` | `https://forums.e-hentai.org/` | 中 | **两次 `nextElementSibling()`** 是极脆的定位；`parseNew`（`:58-87`）走 `id="userlinks"` → `child(0).child(0).child(0).text()` |
| 72 | 论坛入口（拿真实资料页 URL） | `client/parser/ForumsParser.java:28-38` | URL | `id="userlinks"` → `child(0).child(0).child(0)` 的 `href` | `https://forums.e-hentai.org/` | 中 | 与 #71 的 `parseNew` 是两条并行实现，说明站点改过版；JS 里都要兜 |
| 73 | 我的收藏（无 Task 版） | `client/EhEngine.java:591-616` | `FavoritesParser.Result` | 同 #48 | `favorites.php` | 低 | 与 `getFavorites`（`:618-648`）重复，区别是不做 API 补全 |

### A.7 API 写操作（评论 / 评分 / 投票）

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据（选择器 / 正则原文） | 端点或 URL 形态 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 74 | 评分 | `client/EhEngine.java:424-464` + `client/parser/RateGalleryParser.java:31-43` | `rating`、`ratingCount` | POST JSON `{"method":"rategallery","apiuid","apikey","gid","token","rating":ceil(rating*2)}`（`:433`）→ `rating_avg`、`rating_cnt` | `{host}/api.php` | 中 | `rating` 是 **1..10 的整数**（`ceil(x*2)`） |
| 75 | 评论投票 | `client/EhEngine.java:1060-1100` + `client/parser/VoteCommentParser.java:32-40` | `id`、`score`、`vote`、`expectVote` | POST JSON `{"method":"votecomment","apiuid","apikey","gid","token","comment_id","comment_vote"}` → `comment_id`、`comment_score`、`comment_vote` | `{host}/api.php` | 中 | 无 |
| 76 | 取回可编辑评论 | `client/EhEngine.java:511-551` + `client/parser/GetEditCommentParser.java:34-55` | `id`、`comment` | POST JSON `{"method":"geteditcomment","apiuid","apikey","gid","token","comment_id"}` → `comment_id`、`editable_comment`（HTML 片段里 `textarea[name=commenttext_edit]` 的 `wholeText()`） | `{host}/api.php` | 低 | 返回的是 HTML 片段里再抠 textarea |
| 77 | 发表 / 编辑评论 | `client/EhEngine.java:466-509` | `GalleryCommentList` | POST form-urlencoded：新建 `commenttext_new=<text>`；编辑 `commenttext_edit=<text>` + `edit_comment=<id>`（`:468-474`）；错误判定 `#chd + p` 的文本（`:498-501`）；成功后复用 `GalleryDetailParser.parseComments(document)` | 详情页 URL（`referer=url`） | 中 | 是**表单**不是 API；错误选择器 `#chd + p` 很特别 |
| 78 | 图像搜索 | `client/EhEngine.java:1102-1201` | `GalleryListParser.Result` | multipart：`sfile`(文件，字段名带 `size="40"`)、可选 `fs_similar`/`fs_covers`/`fs_exp`=`on`、`f_sfile=File Search`；302 时跟随 `Location` 再请求一次（`:1172-1182`）；结果复用 `GalleryListParser.parse` | `https://upld.e-hentai.org/image_lookup.php` / `https://upld.exhentai.org/upld/image_lookup.php`（`client/EhUrl.java:63-64, 258-267`） | 低 | 需要 multipart 上传 + 手动跟随 302；Venera 源里极少用 |

### A.8 过滤 / 标签库（本地能力）

| # | 能力名 | Java 文件:行 | 具体提取字段 | 判据 | 端点 | JS 价值 | 移植难点 |
|---|---|---|---|---|---|---|---|
| 79 | 标题/上传者/标签/命名空间过滤 | `client/EhFilter.java:32-35, 151-280` | 布尔 | 标题 `contains`（小写化）；上传者 `equals`；标签 `namespace:name` 双向解析后逐段比（`:189-224`）；命名空间只比前缀（`:247-260`） | 无（本地 DB `EhDB.getAllFilter()` `:52`） | 中 | 配置来源是 SQLite；JS 侧可改为源设置项 |
| 80 | 标签汉化库 | `client/EhTagDatabase.java:60-99` | `tag → 中文` | 二进制格式：`readInt()` 长度 + UTF-8 正文，行内 `\r` 分隔，中文为 Base64（`:68-73, 94-99`） | 本地 assets + 远程（需 `okhttp`） | 低 | 自带二进制格式 + Base64 + 本地缓存，**不属于站点抓取能力**，JS 里另找方案 |

**A 表行数：80 行。**

---

## B. 夹具清单

目录：`app/src/test/resources/com/hippo/ehviewer/client/parser/`（**33 个文件、无子目录**）
测试源码：`app/src/test/java/com/hippo/ehviewer/client/parser/*.java`（6 个）

### B.0 关键发现：**大部分夹具是孤儿，且 11 个引用指向不存在的文件名**

- `GalleryListParserTest.java:37-47` 引用的文件名为 `GalleryListParserTest{EMinimal,EMinimalPlus,ECompat,EExtended,EThumbnail,ExMinimal,ExMinimalPlus,ExCompat,ExExtended,ExThumbnail}.GalleryTopListEX.html`，
  但磁盘上只有 `GalleryListParserTest…html`（**没有 `.GalleryTopListEX` 这一段**）——`app/src/test/resources/.../parser/` 实际列表见下表。这 10 个 `getResourceAsStream` 会返回 `null`。
- `GalleryPageParserTest.java:37` 引用 `GalleryPageParserTest.GalleryTopListEX.html`，磁盘上只有 `GalleryPageParserTest.html` —— 同样失效。
- 也就是说：**除 `GalleryPageApiParserTest.json` 和 `torrentList.html` 外，解析器测试目前无法真正跑通**（未运行 Gradle 验证，依据是文件名逐一比对）。
- `GalleryTopListEX.html`（200095 B）**是一份"画廊列表"页面（`class="itg gltc"`），不是排行榜**；真正的排行榜夹具是 `GalleryTopList.html` 与 `TopListGallary.html`（含 `class="tun"`）。这个命名是历史遗留的坑。

### B.1 逐文件清单

| 相对路径（`app/src/test/resources/com/hippo/ehviewer/client/parser/`） | 字节数 | 对应解析器 / 测试 | 相对其他变体的结构性差异（作为回归样本的价值） |
|---|---|---|---|
| `ArchiveDownloadDialog.html` | 4852 | `ArchiveParser.parse`（无测试） | 唯一含 `<form id="hathdl_form" … or=…>` 的样本 → 覆盖 #54 的 `PATTERN_FORM` + `do_hathdl(...)` 条目正则 |
| `EhNews.html` | 121190 | `EhEngine.getEhNews` → `EhNewsDetail`（无解析、无测试） | 含 `id="eventpane"`，是 `EhEventParse` 的真实样本（虽然该夹具名义上用于新闻） |
| `EhUconfig.html` | 94680 | 无解析器（由 `ui/UConfigActivity.java:85-135` 用 WebView 处理） | 含 `profile_form`/`profile_action`/`profile_name`/`profile_set`/`imgload`/`uh`/`co` 等表单域，是**无法用纯解析搬走**的样本 |
| `EmptyGalleryList.html` | 11233 | `GalleryListParser`（无专职测试；参照 `EmptyGalleryList` 命名） | 唯一触发 `GalleryListParser.java:219-229` 「`No gallery`」兜底路径的样本：`<table class="itg gltc">` 只有表头 + 一行 `colspan=4` 的 "No unfiltered results in this page range…"。**JS 侧必测样本** |
| `FavoritesListParser.html` | 500918 | `FavoritesParser.parse`（无测试） | 唯一含 `class="fp"`(×11，最后一个是 `fp fps`) + `class="searchnav"` + `id="uprev"/"unext"/"ulast"` 的样本；同时内嵌完整列表主体（`class="itg"`+`glname`），是 #46/#47/#48 的唯一依据 |
| `GalleryDetail.html` | 78127 | `GalleryDetailParser.parse`（无测试） | **EX 站详情页**：有 `var gid/token/apiuid/apikey`（3101249 / 7fb0ea5a0e / 4596468 / 71ecdd05c929c7fdcd61）、`id="gdd"`、`id="taglist"`、`id="cdiv"`、`class="gt200"`、`id="rating_label"`、`id="gdf"`；`onclick="return popUp(...)"` 同时含 Archive 与 Torrent(5) 两种入口。**覆盖 #19-#35 最全的一份**。注意：`class="c1"` 出现 2 次但**不带 `name` 属性**，与 `GalleryDetailParser.java:473-477` 期望的「前兄弟节点 `name` 属性」不一致 → 该夹具对评论 id 的回归价值有限 |
| `GalleryListParserNew3.html` | 137166 | 无测试 | `class="itg gltc"` + `class="searchnav"`（**无 `class="ptt"`**）→ 覆盖 #12 的 searchnav 分支与 #13 的 `searchtext` |
| `GalleryListParserTestECompat.html` | 64771 | `GalleryListParserTest`（**测试引用的名字多 `.GalleryTopListEX` 一段，实际取不到**） | E 站 + `<table class="itg gltc">`，行标记 `<td class="gl1c glcat">`/`gl2c`/`gl3c glname`/`gl4c glhide`；分类用 `cn`；含 `class="gt"`(121) |
| `GalleryListParserTestEExtended.html` | 54302 | 同上 | E 站 + `<table class="itg glte">`，行标记 `gl1e`(250px 宽缩略图)/`gl2e`/`gl3e`(上传者+页数)/`gl4e glname`；标签在 `class="gtl"`(28) 带 `title`；**无 `glthumb`**；每个 `<tr>` 带 `data-new="1"` |
| `GalleryListParserTestEMinimal.html` | 57146 | 同上 | E 站 + `<table class="itg gltm">`，行标记 `gl1m glcat`/`gl2m`(含 `glthumb`)/`gl3m glname`/`gl5m glhide`/`gl6m`；分类用 `cs`；**标签数 0**（`gt` 不出现）；`<td class="gl5m glhide">` 提供上传者 |
| `GalleryListParserTestEMinimalPlus.html` | 58026 | 同上 | 与 EMinimal **逐字节同构**，唯一差异是有 5 处 `class="gt" title="…"` → 专门用来验证 #17「MinimalPlus = Minimal + 少量标签」 |
| `GalleryListParserTestEThumbnail.html` | 40693 | 同上 | E 站 + **div 流** `<div class="itg gld">`（非 `<table>`），行标记 `gl1t`/`gl4t glname`/`gl3t`(缩略图)/`gl5t`(分类+时间+页数)；**覆盖 `itg.tagName()!="table"` 分支**（`GalleryListParser.java:206-210`） |
| `GalleryListParserTestExCompat.html` | 63440 | 同上 | 同 ECompat，但 host 为 `exhentai.org`、缩略图 `https://exhentai.org/t/…`、**无 `data-new`、无 `glnew`**；分类 `cn` |
| `GalleryListParserTestExExtended.html` | 53231 | 同上 | 同 EExtended 的 EX 版；上传者名可能是中文 URL 编码（`%E5%AE%9E%E8%B7%B5%E6%A2%A6%E6%83%B3`）→ **回归价值：非 ASCII uploader** |
| `GalleryListParserTestExMinimal.html` | 55529 | 同上 | 同 EMinimal 的 EX 版；缩略图 `https://exhentai.org/t/7c/de/…`（三段路径） |
| `GalleryListParserTestExMinimalPlus.html` | 56409 | 同上 | 同 EMinimalPlus 的 EX 版 |
| `GalleryListParserTestExThumbnail.html` | 39159 | 同上 | 同 EThumbnail 的 EX 版，但**多一个 `class="gl6t"` 里放标签**（`<div class="gt" style="color:#f1f1f1;border-color:#1357df;…" title="language:chinese">`）→ 覆盖带内联样式的标签 |
| `GalleryListUploader.html` | 124328 | 无测试 | `class="itg gltc"`，来自 `/uploader/…` 列表 → 与普通搜索列表同构，价值在于**回归 uploader 关键词列表** |
| `GalleryPageApiParserTest.json` | 2532 | `GalleryPageApiParserTest`（**唯一文件名匹配的 HTML/JSON 夹具之一**） | showpage API 的 JSON 响应：`i3`/`i5`/`i6`/`i7` 四键。断言（`GalleryPageApiParserTest.java:42-44`）：`imageUrl`=`http://69.30.203.46:60111/h/…/Valentines_2019_002.jpg`、`skipHathKey`=`15151-430636`、`originImageUrl`=`https://e-hentai.org/fullimg.php?gid=1366222&page=3&key=puxxvyg98a4` |
| `GalleryPageParserTest.html` | 4513 | `GalleryPageParserTest`（**测试引用名多 `.GalleryTopListEX` 一段，实际取不到**） | 画廊页 HTML：`<img id="img" src="http://108.6.41.160:2688/h/…/10.jpg" style="width:1280px;height:87…"`、`var showkey="…"`、`onclick="return nl(...)"`、`fullimg.php`。断言（`GalleryPageParserTest.java:42-45`）：`imageUrl`、`skipHathKey=26664-430636`、`originImageUrl`、`showKey=ghz0e5m98a4` |
| `GalleryTopList.html` | 96097 | 无测试 | **真排行榜**：含 `class="tun"` + `class="ido"`，无 `class="itg"` → `TopListParser` 的唯一有效样本（#58） |
| `GalleryTopListEX.html` | 200095 | 被 `GalleryListParserTest` / `GalleryPageParserTest` 的**错误文件名**间接提及 | 实为**画廊列表**页（`class="itg gltc"`，含 `glname`/`509`）→ **命名误导**；可当作"另一份 Compat 列表"样本 |
| `Home.html` | 9193 | `EhHomeParser`（无测试） | `class="homebox"` 存在，但**不含 `You are currently at`**（未登录或更早的首页）→ 覆盖 `EhHomeParser.java:40-42` 的「`homeBoxes.isEmpty()` 直接返回」路径 |
| `HomePageNew.html` | 10503 | `EhHomeParser`（无测试） | 含**新版**配额文案：`You are currently at <strong>538</strong> towards your account limit of …` → 覆盖 `PATTERN_IMAGE_LIMIT_NEW`（`EhHomeParser.java:21`） |
| `ImageSearch.html` | 15467 | `GalleryListParser`（经 `EhEngine.imageSearch`，无测试） | `class="itg glte"`（Extended 变体）+ `class="searchnav"` + `class="searchtext"` + `id="unext"` → **图像搜索结果的唯一样本** |
| `LoginProfile.html` | 236116 | `ProfileParser` / `ForumsParser`（无测试） | 内容为论坛页；匹配到的是 `userlinks&quot;`（**HTML 实体转义后的形态**）→ 与 `ForumsParser.java:31-33` 期望的真实 `id="userlinks"` 节点**不符**；对 `ProfileParser.parseNew`（`:58-87`，先做 `\\u003C`→`<` 等反转义，`:60-63`）才是有效样本 |
| `MyHomePage.html` | 9941 | `EhHomeParser`（无测试） | 含**旧版**配额文案：`You are currently at <strong>4672</strong> towards a limit of <strong>5000</strong>.</p>` → 覆盖 `PATTERN_IMAGE_LIMIT`（`EhHomeParser.java:20`） |
| `MyTagList.html` | 40821 | `MyTagLitParser`（无测试） | 唯一含 `id="usertags_outer"` 的样本（#64） |
| `newPage.html` | 166435 | `GalleryDetailParser`（无测试） | 详情页，含 `class="gdtm"`(普通预览) + `id="gnd"`(新版) + `id="cdiv"`/`class="c1"` + `id="taglist"` → **比 `GalleryDetail.html` 更"现代"**：`GalleryDetail.html` 缺 `id="gnd"`、预览用的是 `gt200` 而这里用 `gdtm` |
| `spiderInfo.html` | 19880 | `GalleryDetailParser.parse(String)` 正则路径（无测试） | 详情页 + `class="gdtm"`（无 `gt200`/`gt100`）→ 专门覆盖 `parsePreviewSet(String)` 与那 4 条 `parseXXX(String)` 纯正则路径（#33/#34/#35/#37） |
| `test.html` | 116207 | 无测试 | `class="itg gltc"`，最"标准"的一份 Compat 列表页 |
| `TopListGallary.html` | 207669 | `TopListParser`（无测试） | 含 `class="itg gltc"` **和** `class="tun"` → 最大的一份榜单页；与 `GalleryTopList.html`（无 itg）互补 |
| `torrentList.html` | 7921 | `TorrentParserTest`（**唯一文件名匹配的 HTML 夹具之一**） | 两个 `<form method="post">` 块。断言（`TorrentParserTest.java:46-53`）：2 条；`posted` 均为 `2026-04-26 05:14`；URL 已去掉 `?p=`（`https://ehtracker.org/get/3905209/<hash>.torrent`）；名称一含 `Part 2`、一含 `1280x` |

**B 夹具数量：33 个文件。**

### B.2 `{E,Ex} × {Minimal, MinimalPlus, Extended, Compat}` 8 个后缀的确切含义

用「第一个条目的 DOM 骨架」说话（E 站四份实物摘录，Ex 站除 host 外同构）：

| 后缀 | 容器 | 分类节点 | 缩略图节点 | 上传者/页数节点 | 标签节点 | 实例差异 |
|---|---|---|---|---|---|---|
| `Minimal` | `<table class="itg gltm">` | `<td class="gl1m glcat"><div class="cs ct9" onclick=…>Non-H</div>` | `<div class="glthumb" id="it…"><div><img style="height:353px;width:250px;top:-6px" src=…></div>`（页数在其后第 3 层 div：`<div>26 pages</div>`） | `<td class="gl5m glhide"><div><a href="…/uploader/maverih345456">…</a></div>` | **无**（`class="gt"` 出现 0 次） | 57146 B |
| `MinimalPlus` | 同 Minimal | 同 Minimal | 同 Minimal | 同 Minimal | **有**，少量：`<div class="gt" title="parody:kantai collection">…`（5 处） | 58026 B（比 Minimal 大 880 B，恰好是 5 个标签 div） |
| `Extended` | `<table class="itg glte">` | `<div class="cn ct9" …>` 内嵌于 `gl3e` | **无 `glthumb`**；`<td class="gl1e" style="width:250px"><div …><a href=…><img style="height:353px;width:250px" src=…></a></div>` | `<div class="gl3e">` 的第 4/5 个子节点（`<a href="…/uploader/…">`、`<div>26 pages</div>`） | `<div class="gtl" title="parody:kantai collection">`（28 处，**`gtl` 而非 `gt`**） | 54302 B |
| `Compat` | `<table class="itg gltc">` | `<td class="gl1c glcat"><div class="cn ct9" …>Non-H</div>` | `<div class="glthumb" id="it…">`（同 Minimal） | `<td class="gl4c glhide"><div><a href="…/uploader/…">…</a></div><div>26 pages</div>`（**上传者与页数合并进同一 `glhide`**） | `<div class="gt" title="parody:kantai collection">`（121 处） | 64771 B |

- **E vs Ex**：`E` 用 `e-hentai.org` + 缩略图 `https://ul.ehgt.org/…` + 时间 div 带 `class="glnew"`；`Ex` 用 `exhentai.org` + 缩略图 `https://exhentai.org/t/{2}/{2}/…` + **无 `glnew`、无 `data-new`**。二者共同点：`class="glname"` 都是**多类名之一**（`gl3m glname` / `gl4e glname` / `gl4c glname` / `gl4t glname`）。
- 解析器对这四类的判定顺序（`GalleryListParser.java:339-454`）是**先 `glthumb`（Minimal/MinimalPlus/Compat），再 `gl1e`→`gl3t`（Extended/Thumbnail），再 `glhide`→`gl3e`（上传者/页数），再 `gl5t`（Thumbnail 页数）** —— 也就是说 parser 并没有用 `itg` 上的 `gltm/gltc/glte/gld` 类名做分发，而是靠**元素级特征逐个试探**。JS 重写时可以选择更稳的路线：**先读 `itg` 的第二个类名直接分发**。
- `Thumbnail` 后缀（E/Ex 各一份）**不在** `{E,Ex}×{Minimal,MinimalPlus,Extended,Compat}` 这 8 个里，是第 5 种布局（`gld` div 流），测试里却被同样断言 `uploader == null`（`GalleryListParserTest.java:104-106`）——说明 thumbnail 布局**不暴露上传者**，与 `glhide`/`gl3e` 两条路径的假设一致。

---

## C. 反封与容错

> 全部判据均为源码原文照抄。**注意：CN_SXJ 这份 fork 里没有指数退避、没有 IP 封禁提示、没有请求间隔限速器**（见 C.9 的 UNKNOWN）。

### C.1 HTTP 509（带宽超限）

| 环节 | 位置 | 判据原文 |
|---|---|---|
| 509 图识别（URL 后缀白名单） | `spider/SpiderQueen.java:115-118` | `"/509.gif"`、`"/509s.gif"`（`URL_509_SUFFIX_ARRAY`） |
| HTML 路径检测 | `spider/SpiderQueen.java:1240-1250` | `StringUtils.endsWith(result.imageUrl, URL_509_SUFFIX_ARRAY)` → `notifyGet509(index)` + `throw new Image509Exception()` |
| API 路径检测 | `spider/SpiderQueen.java:1252-1262` | 同上 |
| 异常类型 | `client/exception/Image509Exception.java:19-23` | `extends EhException`，`super("509")` |
| 面向用户的文案 | `spider/SpiderQueen.java:1308-1310`、`:1340-1342` | `throw new Image509Exception()` → `error = GetText.getString(R.string.error_509)` |
| 字符串资源 | `app/src/main/res/values/strings.xml:178` | `<string name="error_509">509</string>` |
| 向 UI 通知 | `spider/SpiderQueen.java:342-346`（`notifyGet509`）→ `download/DownloadManager.java:1084-1091` → `:1224-1229` → `:1483-1485`（`void onGet509();`） | — |
| **重要缺口** | 全仓 `grep` `509` 只在 `SpiderQueen`/`Image509Exception`/`DownloadManager`/`strings.xml` 命中 | **列表页/详情页的 509 没有被识别**——只有"图片直链变成 `/509.gif`"这一种信号被处理 |

**可移植结论（高价值）**：JS 侧只需两条：
1. `parseGalleryPage()` 返回的 `imageUrl` 若以 `/509.gif` 或 `/509s.gif` 结尾 → 抛 "509 带宽超限"；
2. 展示给用户时提示切换到 `e-hentai.org`（这也正是 `kokomade_tip` 的语义，`strings.xml:194`）。

### C.2 IP 封禁

**未找到实现。** 检索范围与结果：
- `grep -i "IpBan|IpBanned|ip_banned|temporarily banned|too many"` 于 `app/src/main/java/**/*.java` → **0 命中**（`509`/`banned` 相关仅命中 `EhX509TrustManager`，那是 TLS 证书类，与带宽 509 无关）。
- `PiningException`（`client/exception/PiningException.java:22`，`super("pining for the fjords")`）是**内容下架**信号，不是封禁。
- 唯一沾边的是 `EhEngine.java:293-295`：`if (code == 200 && url.equals("https://exhentai.org/") && body.isEmpty())` → `customErrorString = R.string.error_igneous_wrong`，文案 `strings.xml:188` = `"Wrong igneous\nmake sure you have permission and re-login"` —— 这是 **EX 站权限/igneous 失效**（表现为 200 + 空 body），可视为"权限类封锁"的实际处理。

`UNKNOWN:` 客户端是否依赖上游 CDN/IP 层面的封禁提示。已查：`app/src/main/java/com/hippo/ehviewer/` 全量 grep（`temporarily banned`、`ip_banned`、`too many`）；未查：站点真实返回体（无网络访问）。推断 JS 侧应自行加一条「响应体含 `Your IP address has been temporarily banned` → 提示换 IP/降速」的兜底，但这**在 CN_SXJ 里没有原型可抄**。

### C.3 Sad Panda / 权限不足

| 环节 | 位置 | 判据原文 |
|---|---|---|
| 三个响应头联合判定 | `client/EhEngine.java:99-101` | `SAD_PANDA_DISPOSITION = "inline; filename=\"sadpanda.jpg\""`；`SAD_PANDA_TYPE = "image/gif"`；`SAD_PANDA_LENGTH = "9615"` |
| 判定与抛出 | `client/EhEngine.java:123-128` | `SAD_PANDA_DISPOSITION.equals(headers.get("Content-Disposition")) && SAD_PANDA_TYPE.equals(headers.get("Content-Type")) && SAD_PANDA_LENGTH.equals(headers.get("Content-Length"))` → `throw new EhException("Sad Panda")` |
| kokomade（"今回はここまで" / 当日额度用尽） | `client/EhEngine.java:103, 130-133`；`strings.xml:194` | 常量 `KOKOMADE_URL = "https://exhentai.org/img/kokomade.jpg"`；`body.contains(KOKOMADE_URL)` → `throw new EhException("今回はここまで\n\n" + GetText.getString(R.string.kokomade_tip))`；tip = `"Settings->Eh->Gallery Site->e-hentai"` |
| 收藏页未登录 | `client/parser/FavoritesParser.java:52-54`；`strings.xml:868` | `body.contains("This page requires you to log on.</p>")` → `EhException(need_sign_in)` |
| 详情页不可用 | `client/parser/GalleryDetailParser.java:98-122` | `OFFENSIVE_STRING`（预告警告页）、`PINING_STRING`（`<p>This gallery is pining for the fjords.</p>`）、`UNAVAILABLE_STRING`（`This gallery is unavailable`） |
| 排行榜同样的三态 | `client/parser/TopListParser.java:22-44` | 同 `OFFENSIVE_STRING` / `PINING_STRING` + `PATTERN_ERROR` |
| 通用站点报错 | `client/parser/GalleryDetailParser.java:70` / `MyTagLitParser.java:19` / `TopListParser.java:27` | `<div class="d">\n<p>([^<]+)</p>` → 直接抛出捕获文本 |

**可移植结论（高价值）**：`doThrowException()`（`client/EhEngine.java:117-158`）是一个**统一的"响应体检"入口**，顺序为：
`call.isCanceled()` → Sad Panda 三头 → kokomade body → `ParseException` 细分（无 `<` 则当纯文本错误 / 空 body / 存盘后抛通用错误，`:135-146`）→ `EhException` 原样抛（`:147-149`）→ `code>=400` 抛 `StatusCodeException`（`:151-153`）。JS 源里照这个顺序做一次收敛，可以一次性解决大部分"页面不对劲"的收尾。

### C.4 404 与其它 HTTP 状态

| 位置 | 判据 |
|---|---|
| `client/EhEngine.java:151-153` | `if (code >= 400) { throw new StatusCodeException(code); }` |
| `client/EhEngine.java:117-121` | 最优先判定取消：`if (call.isCanceled()) throw new CancelledException();` |
| 例外：图片搜索手工处理 302 | `client/EhEngine.java:1172-1182`：`if (code == 302) { request = new EhRequestBuilder(response.headers().get("Location"), referer).build(); … }` |
| 例外：图片下载用不跟随重定向的 client | `EhApplication.java:479-485`（`followRedirects(false)` + `callTimeout(20s)`），在 `SpiderQueen.java:1380-1392` 里**把 `location` 头当作原图直链**：`targetImageUrl = response.header("location");` |

**注意**：`EhEngine` 的"体检"只有在**解析抛异常之后**才会执行（每个方法都是 `try { … parser.parse(body) } catch (Throwable e) { throwException(...) }`），所以 4xx 若还带着可解析的 HTML，会先走解析路径。JS 侧建议**先判状态码**再解析（更安全）。

### C.5 H@H 节点 / skipHathKey 重试

这是全仓最完整的"重试"实现，位置 `spider/SpiderQueen.java:1265-1400`（`downloadImage`）：

| 环节 | 行 | 行为 |
|---|---|---|
| 外层重试上限 | `:1275` | `for (int i = 0; i < 5; i++) { … }` —— **固定 5 次，无退避** |
| skipHathKey 累积 | `:1266-1267, 1296-1305` | `List<String> skipHathKeys = new ArrayList<>(5)`；每次成功的 HTML 抓取后 `if (!TextUtils.isEmpty(skipHathKey))` → 已存在则 `leakSkipHathKey = true`（即「同一个 key 反复出现 = 站点不再放行，必须跳出」）；为空也置 `leakSkipHathKey = true` |
| 把 key 拼回 URL | `:1221-1238` | `?nl=<key>` 或 `&nl=<key>` |
| showKey 缓存与失效 | `:147, 1280-1307, 1344-1347` | `AtomicReference<String> showKey`；API 返回 `ParseException("Key mismatch")` → `showKey.compareAndSet(localShowKey, null); continue;` **强制换新 showKey 再试** |
| 强制回退 HTML 路径 | `:1271, 1590-1593` | 图片下载抛 `IOException` → `forceHtml = true`，下一轮不走 showKey 缓存 |
| 原图（fullimg）取 `Location` | `:1366-1392` | `Settings.getDownloadOriginImage()` 为真时，请求 `fullimg` 并把 `location` 头当直链；失败 → `error = "GP不足/Insufficient GP"` |
| 原图 URL 也要带 `nl` | `:1374-1378` | `targetImageUrl + "?nl=" + skipHathKey` 或 `&nl=…` |
| H@H 客户端缺失 | `client/EhEngine.java:109, 936-939` + `client/exception/NoHAtHClientException.java` | 响应体匹配 `(You must have a H@H client assigned to your account to use this feature\.)` → `throw new NoHAtHClientException("No H@H client")` |

**可移植结论（高价值）**：JS 源里把 `skipHathKey` 当作"每次图片直链必须重新取、且只能用一个 key 换一张图"的一次性令牌，并保留「同一 key 复现即放弃」的判定——这直接对应 e-hentai 的 H@H 防爬机制，漏掉会导致大量空图。

### C.6 多域名与 DNS over HTTPS

| 环节 | 位置 | 内容 |
|---|---|---|
| 域名常量 | `client/EhUrl.java:37-39` | `exhentai.org` / `e-hentai.org` / `lofi.e-hentai.org` |
| 站点切换 | `client/EhUrl.java:92-100`（`getHost()`）、`:102-114`、`:116-134`、`:136-154`、`:156-174`、`:218-227`、`:258-267` | 所有 `getXxxUrl()` 都按 `Settings.getGallerySite()`（`Settings.java:421`）在 E/EX 之间切；**例外**：`getHomeUrl()` 恒返回 `HOME_E`（`:102-104`）、`getTopListUrl()` 恒返回 `URL_TOP_LIST_E`（`:234-247`，EX 分支被注释并附言"里站没排行榜入口？？？妈的绝了"）、`getEhNewsUrl()` 恒 E（`:253-256`）、`getThumbUrlPrefix()` 恒 `ehgt.org`（`:280-288`） |
| 内置 IP 表（E 站） | `client/EhHosts.java:51-82` | `e-hentai.org`→6 个 IP（含重复的 `104.20.18.168`）、`repo.e-hentai.org`、`forums.e-hentai.org`、`upld.e-hentai.org`、`ehgt.org`（含 3 个 IPv6）、`raw.githubusercontent.com` |
| 内置 IP 表（EX 站） | `client/EhHosts.java:84-114` | `exhentai.org` 12 个 `178.175.x.x`、`upld.exhentai.org`、`s.exhentai.org`（注意 `s.` 前缀域名 —— 与图片服务器相关） |
| 自定义 hosts 优先 | `client/EhHosts.java:141-153` | `hosts.getList(hostname)`（来自 `Hosts` 本地表）非空则直接用 |
| IP 随机化 | `client/EhHosts.java:144, 150, 157, 163` | `Collections.shuffle(inetAddresses, new Random(System.currentTimeMillis()))` |
| DoH | `client/EhHosts.java:120-128, 154-160` | `DnsOverHttps` 指向 `https://77.88.8.1/dns-query`（Yandex DNS），`builder.post(true)`；仅在 `Settings.getDoH()`（`Settings.java:1366`）为真时启用 |
| 系统 DNS 兜底 | `client/EhHosts.java:161-170` | `InetAddress.getAllByName(hostname)`，并专门捕获 `NullPointerException` → `UnknownHostException("Broken system behaviour for dns lookup of " + hostname)` |
| 代理 | `EhApplication.java:430, 497` | `proxySelector(getEhProxySelector(application))` |

**可移植结论（中高价值）**：
- JS 源**可以**照搬「多 IP + 随机挑选 + 失败换下一个」的思路（Venera 侧可用自定义 `dns`/`fetch` 重试实现），但 **IPv6 字面量、内置 IP 表会过期**，建议做成可配置而不是硬编码。
- `s.exhentai.org`（`EhHosts.java:100-113`）说明**图片直链域名与站点域名是分开的**；JS 里不要假设图片一定在 `exhentai.org` 上（`GalleryPageParser` 抓到的 `imageUrl` 常常是 `http://<H@H 节点IP>:<port>/h/...`，见 `GalleryPageParserTest.html` 断言 `http://108.6.41.160:2688/h/…`）。

### C.7 并发与限速

| 环节 | 位置 | 内容 |
|---|---|---|
| 请求线程池 | `client/EhClient.java:79` | `mRequestThreadPool = IoThreadPoolExecutor.Companion.getInstance()`（全局共享） |
| 下载并发 | `spider/SpiderQueen.java:179, 186-188, 664` | `mWorkerMaxCount = clamp(Settings.getMultiThreadDownload(), 1, 10)`（`Settings.java:868`）；`new ThreadPoolExecutor(mWorkerMaxCount, mWorkerMaxCount, 0, SECONDS, new LinkedBlockingDeque<>(), …)`；`for (; mWorkerCount < mWorkerMaxCount; mWorkerCount++)` 起 worker |
| **下载后限速** | `spider/SpiderQueen.java:189, 1583-1588` | `mDownloadDelay = Settings.getDownloadDelay()`（`Settings.java:1391`）；**成功下载一张后** `updatePageState(index, STATE_FINISHED); Thread.sleep(mDownloadDelay);` —— 是"每张图之间的固定延迟"，**不是令牌桶/自适应** |
| 预加载窗口 | `spider/SpiderQueen.java:180, 615` | `mPreloadNumber = clamp(Settings.getPreloadImage(), 0, 100)`；`for (int i = index + 1, n = index + 1 + mPreloadNumber; …)` |
| 解码并发 | `spider/SpiderQueen.java:107, 182-184` | `DECODE_THREAD_NUM = 2` |
| 连接池 | `EhApplication.java:386-390` | `new ConnectionPool(10, 5, TimeUnit.MINUTES)`（10 个空闲连接、保活 5 分钟） |
| 超时（API 类） | `EhApplication.java:395-398` | `connectTimeout/readTimeout/writeTimeout = 10s`，`callTimeout` 被注释掉 |
| 超时（图片类） | `EhApplication.java:482-485` | `connect/read/write/callTimeout = 20s`，且 `followRedirects(false)` |
| 超时（原图直链） | `spider/SpiderQueen.java:1380-1381` | `callTimeout(30, TimeUnit.SECONDS)` |
| 超时（图片下载） | `spider/SpiderQueen.java:414-415` | `callTimeout(mDownloadTimeout, SECONDS)`，来源 `Settings.getDownloadTimeout()`（`Settings.java:1558`） |
| OkHttp 自动重试 | `EhApplication.java:400` | `retryOnConnectionFailure(true)`（**只重试连接层失败，不重试 5xx/解析失败**） |

**可移植结论（高价值）**：JS 源应实现「并发上限（≤10）+ 每次成功请求后的固定延迟」，而不是"一眼扫完整个画廊"。这也是 `Settings` 里 `getDownloadDelay` 存在的唯一理由。

### C.8 重试与退避

| 位置 | 行为 | 是否有退避 |
|---|---|---|
| `EhApplication.java:400` | `retryOnConnectionFailure(true)` | 否（OkHttp 内置的路线重试） |
| `spider/SpiderQueen.java:1275` | `for (int i = 0; i < 5; i++)` | **否，固定 5 次立即重试** |
| `spider/SpiderQueen.java:1344-1347` | `Key mismatch` → 清 showKey → `continue` | 否 |
| `spider/SpiderQueen.java:1590-1593` | `IOException` → `forceHtml = true` → 下一轮 | 否 |
| 全仓 `grep -i "backoff"` | **0 命中** | — |

`UNKNOWN:` 是否存在指数退避策略。已查：`app/src/main/java/com/hippo/` 全量 grep（`retry`/`Retry`/`backoff`/`Backoff`），命中项除上述外均为 UI 的 `RETRY_TYPE_CLICK`（`widget/LoadImageView.java:63-65` 等）与 GL 的 EGL 重试（`lib/glview/view/GLRootView.java:653-703`），与站点抓取无关。

### C.9 C 章小结：JS 侧应抄的 5 条检查（按优先级）

1. **统一响应体检**（`client/EhEngine.java:117-158`）：取消 → Sad Panda 三头 → kokomade URL → 空 body → `code>=400`。
2. **509 后缀白名单**（`spider/SpiderQueen.java:115-118, 1242-1259`）：`/509.gif`、`/509s.gif`。
3. **skipHathKey 一次性令牌 + 同 key 复现即放弃**（`spider/SpiderQueen.java:1266-1305`）。
4. **`var gid/token/apiuid/apikey` 四元组**（`client/parser/GalleryDetailParser.java:71`）——拿到它才能用 `api.php` 的所有写操作。
5. **列表页 `class="itg"` 分 table/div 两形态**（`client/parser/GalleryListParser.java:202-210`）。

---

## D. 不可移植清单

以下能力**无法**（或不应）搬进一个纯 JS 源脚本。判据为"依赖的具体 Android/Java 设施"。

| # | 不可移植项 | 位置 | 依赖 | 为什么搬不走 | JS 侧替代 |
|---|---|---|---|---|---|
| D1 | OkHttp Call/RequestBody/MultipartBody 体系 | `client/EhEngine.java:79-87`（imports）、`:332-335`、`:1120-1154` | `okhttp3.*` | 请求构造、表单、multipart、拦截器链都是 Java 对象模型 | `fetch` + `FormData` 可覆盖 90%；multipart 的 `Content-Disposition` 手工头（`:1123-1147`）需改用 `FormData.append` |
| D2 | CookieJar 持久化 | `client/EhCookieStore.java:30, 46` | `com.hippo.network.CookieRepository` + Android SQLite（`"okhttp3-cookie.db"`） | 是 SQLite 后端的 Cookie 仓库，非内存 | Venera 侧由框架的 cookie 存储承担 |
| D3 | WebView ↔ OkHttp Cookie 双向同步 | `EhApplication.java:413-429`（网络拦截器里写 `CookieManager`）、`ui/UConfigActivity.java:85-135`、`ui/MyTagsActivity.java:77`、`ui/scene/sign/CookieSignInScene.java:280-298` | `android.webkit.CookieManager` / `WebView` | 站点设置页（`uconfig`）**只有 WebView 能提交**；`UConfigActivity` 甚至靠注入 JS 点 `#apply`（`:129-135`） | 无。JS 源只能**读**当前设置的效果，不能改站点设置 |
| D4 | 本地数据库（收藏/过滤/标签/历史） | `client/parser/GalleryListParser.java:406`（`EhDB.containLocalFavorites`）、`client/parser/GalleryDetailParser.java:559`（`EhDB.inBlackList`）、`client/EhFilter.java:52`（`EhDB.getAllFilter`）、`EhDB.java:640, 671` | `android.database.sqlite` + `dao/*` | 解析流程里**内联了 DB 查询**，不是纯函数 | JS 侧需把这些查询改为可选注入；否则 `parseGalleryList` 不是纯函数 |
| D5 | 标签汉化库（自定义二进制格式 + 本地缓存） | `client/EhTagDatabase.java:60-99`、`:30-58` | 本地文件 IO + `okhttp` + SHA/缓存 | 自带 `readInt()` 长度前缀 + Base64 行格式，且按需下载 | 另找数据源；不要试图解析这个二进制 |
| D6 | 全量下载引擎（SpiderQueen + SpiderDen + SpiderInfo + StreamPipe） | `spider/SpiderQueen.java`（1909 行）、`spider/SpiderDen.java`、`spider/SpiderInfo.java:50-58`、`client/wifi/*` | 线程池、优先级线程、本地文件系统、`UniFile`、`OutputStreamPipe` | 真正的"批量下载+断点续传+本地目录管理"；规模远超"源脚本" | Venera 自带下载管理；源脚本只需提供"取到图片直链" |
| D7 | 位图解码 / OpenGL 渲染 / 图片查看器 | `lib/glview/view/GLRootView.java:653-703`、`ui/scene/gallery/*` | OpenGL ES、`Bitmap`、`libjpeg-turbo`（`app/src/main/cpp/jni/libjpeg-turbo`） | 全部是渲染层 | 无关 |
| D8 | 图像缓存与预加载（Conaco + ImageBitmapHelper） | `EhApplication.java:550-559` | `Conaco`、内存/磁盘缓存 | Android 专有缓存框架 | 框架侧 |
| D9 | SharedPreferences / Settings 全局态 | `EhApplication.java:431`（`Settings.getDF()`）、`:500-497`、`client/EhConfig.java:794-820` | `android.content.SharedPreferences` | 解析器里到处直接读 `Settings.*`（如 `GalleryDetailParser.java:715` 的 `Settings.getFixThumbUrl()`、`ArchiveParser.java:64` 的 `Settings.getGallerySite()`） | JS 里改成显式参数/配置对象 |
| D10 | `AsyncTask` / `SimpleHandler` / 主线程约束 | `client/EhClient.java:95, 153, 224`、`SpiderQueen.java:196`（`OSUtils.checkMainLoop()`） | `android.os.AsyncTask`、Looper | 生命周期与线程模型 | `async/await` |
| D11 | Android `TextUtils`/`Log`/`Pair`/`Uri` 等 | `EhEngine.java:21-23`、`client/EhRequestBuilder.java:19`（`android.net.Uri`） | Android SDK | 平台类 | 逐点替换 |
| D12 | TLS 指纹伪装 / 自定义 TrustManager | `EhApplication.java:431-468, 498-534`（Conscrypt、`EhSSLSocketFactory`、`EhX509TrustManager`） | `Conscrypt`、`SSLSocketFactory` | 目的是让 TLS 指纹更像浏览器/绕过中间盒 | JS 无法控制 TLS 指纹 |
| D13 | 图片解密/水印移除之类 C++ 层 | `app/src/main/cpp/` | NDK | — | — |
| D14 | Wi-Fi 直传（PC↔手机） | `client/wifi/ConnectThread.java`、`WiFiFrame*.java`、`ui/wifi/WiFiServerActivity.java:390` | 原生 Socket | 纯 App 功能 | 无关 |
| D15 | 「登录后同步标签到本地并入库」 | `sync/GalleryListTagsSyncTask.java:26-45` | `ExecutorService` + `EhDB` + `dao/GalleryTags` | **注意**：`executeFunction()` 的函数体已被整段注释掉（`:32-44`），当前是 **no-op** —— 移植时不要为它设计任何逻辑 | 无 |

**D 条目数：15。**

---

## E. 给 Venera `ehentai.js` 的落地优先级（一句话版）

| 优先级 | 必做 | 依据 |
|---|---|---|
| P0 | `itg` 两形态分发 + `glthumb`/`gl1e`/`gl3t`/`glhide`/`gl3e`/`gl5t` 六节点试探 | `GalleryListParser.java:202-454` |
| P0 | `glname` 的**多类名匹配** + `gid/token` 正则 `(\d+)/([0-9a-f]{10})` | `GalleryListParser.java:288-303`、`GalleryDetailUrlParser.java:34-35` |
| P0 | 详情页 `var gid/token/apiuid/apikey` | `GalleryDetailParser.java:71` |
| P0 | 画廊页 `img src` + `var showkey` + `showkey` 缺失即硬失败；`/509.gif` 检测 | `GalleryPageParser.java:27-31, 53-57`、`SpiderQueen.java:115-118` |
| P0 | showpage API（`i3`/`i6`/`i7`，`i7` 可空） | `GalleryPageApiParser.java:34-79` |
| P1 | `gdata` 批量补全（≤25/批） | `EhEngine.java:301-358` |
| P1 | skipHathKey 一次性令牌 + 同 key 复现放弃 | `SpiderQueen.java:1266-1305` |
| P1 | 统一响应体检（Sad Panda / kokomade / 空 body / 4xx） | `EhEngine.java:117-158` |
| P2 | 收藏夹 10 目录 + 计数（注意 11 个 `fp`） | `FavoritesParser.java:62-72` |
| P2 | 评论区（`c1`+前兄弟 `name`、`c3..c8`，UTC 时间格式） | `GalleryDetailParser.java:467-545` |
| P3 | 种子 / 归档 / 排行榜 / 首页 | `TorrentParser.java`、`ArchiveParser.java`、`TopListParser.java`、`EhHomeParser.java` |

---

## F. UNKNOWN 与已查范围

| # | UNKNOWN | 已查 | 未查原因 |
|---|---|---|---|
| F1 | 任务描述里的"24 个解析器" | `client/parser/` 实际 **23** 个 `.java`（`ArchiveParser`、`EhEventParse`、`EhHomeParser`、`FavoritesParser`、`ForumsParser`、`GalleryApiParser`、`GalleryDetailParser`、`GalleryDetailUrlParser`、`GalleryListParser`、`GalleryListUrlParser`、`GalleryPageApiParser`、`GalleryPageParser`、`GalleryPageUrlParser`、`GalleryTokenApiParser`、`GetEditCommentParser`、`MyTagLitParser`、`ParserUtils`、`ProfileParser`、`RateGalleryParser`、`SignInParser`、`TopListParser`、`TorrentParser`、`VoteCommentParser`） | 差额无法解释；若把 `client/EhUtils.kt`（Kotlin，含 `getCategory`/`handleThumbUrlResolution`）算作"解析器"则为 24 | — |
| F2 | IP 封禁的处理位置与判据字符串 | 全仓 grep `IpBan|IpBanned|ip_banned|temporarily banned|too many`（`app/src/main/java/**/*.java`）→ 0 命中 | 无网络访问，无法取得站点真实封禁页 |
| F3 | 是否存在指数退避 | 全仓 grep `retry|Retry|backoff|Backoff` | 未见任何 `sleep`-based backoff；`SpiderQueen.java:1275` 是固定 5 次 |
| F4 | `GalleryListParserTest` / `GalleryPageParserTest` 引用的 `.GalleryTopListEX.html` 文件是否存在 | 逐文件比对目录（`Get-ChildItem -Force`，33 个文件，无子目录、无隐藏项）→ 不存在 | 未运行 Gradle，无法确认测试是否被 `build.gradle` 的某种 `sourceSets` 重映射（`app/build.gradle` 里 `sourceSets` 整段被注释） |
| F5 | 「签到 / 每日奖励」能力 | 全仓 grep `签到|check.?in|daily|bonus|GetBonus|hathperks` → 0 命中 | **该能力在本 fork 中不存在**，不是遗漏 |
| F6 | `client/parser/GalleryListParser.java` 的 `int mode` 参数实际作用 | 通读 `parse(String, int)`（`:93-101`）与 `parse(Document, String, int)`（`:103-240`），**方法体内从未引用 `mode`**；调用方 `EhEngine.java:284, 1186` 传 `MODE_NORMAL` | 该参数当前是死参数（历史遗留，原版应为 Minimal/Extended 布局开关）。JS 侧不需要它 |
| F7 | 站点当前（2026）真实 DOM 是否仍与夹具一致 | 全部夹具时间戳为 2019 年前后（如 `GalleryListParserTest*.html` 条目日期 `2019-04-03`），且 `torrentList.html` 断言里出现 `2026-04-26` | 无网络访问，无法抓取实时页面；**这本身是最重要的风险提示：夹具至少在列表布局上比现状落后 7 年** |

---

## G. 附：本次调研直接引用的文件清单（便于复核）

**主源码（`app/src/main/java/com/hippo/ehviewer/`）**
`client/EhClient.java`、`client/EhEngine.java`、`client/EhUrl.java`、`client/EhHosts.java`、`client/EhCookieStore.java`、`client/EhRequest.java`、`client/EhRequestBuilder.java`、`client/EhConfig.java`、`client/EhFilter.java`、`client/EhTagDatabase.java`、`client/EhUtils.kt`、
`client/parser/*.java`（23 个全部）、
`client/data/ListUrlBuilder.java`、`client/data/FavListUrlBuilder.java`、`client/data/userTag/TagPushParam.java`、`client/data/userTag/UserTag.java`、
`client/exception/*.java`、
`spider/SpiderQueen.java`、`spider/SpiderInfo.java`、`download/DownloadManager.java`、`sync/GalleryListTagsSyncTask.java`、`EhApplication.java`、`Settings.java`、`EhDB.java`、`ui/UConfigActivity.java`、`ui/MyTagsActivity.java`、`network/UrlBuilder.java`

**测试（`app/src/test/`）**
`java/.../parser/GalleryListParserTest.java`、`GalleryDetailUrlParserTest.java`、`GalleryPageApiParserTest.java`、`GalleryPageParserTest.java`、`GalleryPageUrlParserTest.java`、`TorrentParserTest.java`

**夹具（`app/src/test/resources/com/hippo/ehviewer/client/parser/`）**：上表 B.1 的 33 个文件全部清点（含字节数）。

**构建脚本**：`app/build.gradle`（`testNamespace`、`testImplementation robolectric:4.2.1`、`sourceSets` 被注释）
