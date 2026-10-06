# 冗余收敛策略：去重 / 精简 / 合并

> **性质**：只读调研产物（不改任何现有文件、不改任何源脚本）。
> **基线**：`index.json` 57 条；`sources/mirror/venera-configs/` 33 文件 + `sources/mirror/venera_comic_source/` 40 文件 = 73 文件。
> **复核命令**见 [附录 A](#附录-a-复现命令)；与既有文档的口径差异（含 **2 处更正**）见 [附录 B](#附录-b-与既有文档的口径差异)。
> **判定不了的事**统一登记在 [附录 C](#附录-c-unknown-清单)，不在正文里含糊其辞。

---

## 0. 摘要：一句话结论

**这个清单已经按 key 去重过了，可再减的条目只有一个，而且那个是有损的。**

真正的问题不是"条目太多"，而是**三件记录与判据的事**：

1. `harness/analyze-redundancy.js` 的"内容完全相同"判据按**原始字节**算 sha（`analyze-redundancy.js:53`），
   而两个镜像的换行风格不一致（`venera-configs` 侧 29/33 文件是 LF，`venera_comic_source` 侧 40/40 是 CRLF），
   于是 **8 组实质相同的文件只报出 1 组** → 见 §1 的 L0。
2. 有 **2 组"同 key + 同版本 + 内容不同"**（`comic_walker`、`shonen_jump_plus`）：
   版本号无法区分，靠"同版本主目录优先"（`harness/build-catalog.js:141-146`）静默选了 `venera-configs` 那份，
   而**落选的那份才是修好的那份** → 见 §2.1。
3. `venera-configs` 上游自身有 **1 处同 key 内碰撞**（`copy_manga` vs `copy_manga_multi_accounts`），
   结果是"拷贝漫画M"这个多账号变体**永远装不上**，我们的清单里也没有它 → 见 §2.1 与 §2.4。

| 层 | 判据 | 候选组数 | 本地可机械执行 | 是否改代码 | `index.json` 条目净减少 |
|---|---|---:|---:|---|---:|
| **L0** | 内容同一（跨仓，EOL 归一后） | **8 组 / 16 文件** | 8 组（仅修台账与镜像说明） | 否 | **0**（已去重） |
| **L1** | 同 key（多镜像指向同一源） | **15 组 / 16 个落选文件** | 15 组（`build-catalog.js` 已执行） | 否 | **0**（已去重） |
| **L2** | 同站不同 key | **1 组**（`ikmmh` / `ikmmh_v2`） | 1 组（可选：从清单摘掉 vc 那份） | 否 | **−1**（可选、有损） |
| **L3** | 参数型变体（用 `settings` 吸收） | **3 处差异点** | **0 处** | **是**（= 衍生作品） | 0 |
| **L4** | 功能型变体（保留 + 标注） | **3 组** | 0 组（需改 key 才能共存） | **是** | 0（或 +1） |

> "净减少"= 执行建议后 `index.json` 的条目数变化。**强制、无损的净减少 = 0；可选的净减少 = −1（57 → 56）。**
> 详见 §4 的量化推导。

---

## 1. 分层策略（L0 → L4）

顺序不是随意的：**L0/L1 是"同一份东西被搬了两次"，L2 是"同一站点的两代人"，L3 要动别人的代码，L4 承认差异并只做标注。**
不可逆性和责任依次上升，所以**必须按 L0 → L4 逐层判定，前一层能判掉的不要带到下一层**。

### 1.0 通用前提：判据必须是三级，不能只有一级

单看"原始字节 sha 不同"会把 EOL 差异误判成内容差异（当前就误判了 7 组）。判定内容同一性必须同时看：

| 判据 | 实现方式 | 能回答什么 | 已知盲点 |
|---|---|---|---|
| **D1 原始 sha256** | `crypto.createHash` over `fs.readFileSync`（`analyze-redundancy.js:53`） | 字节级是否一致 | **受换行风格污染**（本仓实测 7 组假阴性） |
| **D2 EOL 归一 sha256** | 先把 `\r\n` 换成 `\n` 再算 sha | 文本内容是否一致（推荐作为 L0 判据） | 不认"只差空白/缩进" |
| **D3 去注释去空白后的 60-gram Jaccard** | 状态机剥注释 → 去空白 → 60 字符滑窗集合求交并比 | 两份实现有多像（跨 key 也能用） | 阈值是经验值；共享框架代码会导致 30% 左右的基础相似度（实测 `copy_manga` vs `hot_manga` = 33.5%） |

**实测校准**（本仓 73 文件全量两两比对，D3 > 0.30 共 17 对）：真正的"同一份东西"落在 **100.0%**；
"改了一处的同一份"落在 **98.9%**；"同一站点的两代实现"落在 **62%–79%**；
"同一站点但已重写"落在 **2.9%–45%**。所以：

- **L0 用 D2 = 相等**（不要用 D1）
- **L1 用 key 相等 + D2 或 D3 定性**（讲清是"同一份"还是"分叉"）
- **L2/L3/L4 用 D3 分级**：≥60% 视为同源分叉，<60% 视为独立实现

### L0 内容同一（跨仓 sha 相同）

| 项 | 内容 |
|---|---|
| **判据** | 两个不同镜像目录下的文件，**D2（EOL 归一 sha256）相等**。D3 通常为 100.0%。 |
| **处理动作** | 两份都**照旧保留在 `sources/mirror/<repo>/`**（镜像完整性是"可复核"的前提，见 `AGENTS.md` §1"镜像永不修改"）；但**只在清单里出现一次**，并在 `docs/mirror-provenance.md` 追加一行"该文件在 X 仓与 Y 仓字节等价（EOL 归一）"作为**镜像痕迹**。 |
| **是否改代码** | **否**。不碰任何 `.js`，不动 `index.json`（这一层已经被 `build-catalog.js` 做完了）。 |
| **风险** | 极低。唯一风险是"把 EOL 差异当成内容差异"而漏判（当前正在发生），以及反过来把"只差 BOM/尾随空行"当成真差异。 |
| **本仓实测** | **8 组**（清单见 §2.1 表 A）。工具当前只报 1 组。 |

> **为什么不该删掉落选的那一份？** 因为 `sources/mirror/**` 的用途是"上游在某一时刻的快照 + 可离线复核"，
> 而 `index.json` 的用途是"给 App 用的清单"。两者职责不同：删镜像会让"去重决策"变成不可复核的口头结论。

### L1 同 key（多镜像源指向同一个源）

| 项 | 内容 |
|---|---|
| **判据** | 两个候选的**脚本自身声明的 `key` 相同**（`loadSource(...).source.key`，不是上游清单里的 key）。 |
| **处理动作** | **按脚本自身 `version` 取高**；同版本时按"主目录优先"（`venera-configs` 在前，见 `harness/build-catalog.js:88-91` 的 `specs` 顺序 + `:141-146` 的 `cmp > 0 ? e : prev`）。**必须把落选方、双方版本、依据写进 `docs/mirror-provenance.md`**（`build-catalog.js:165-192` 已实现）。 |
| **是否改代码** | **否**。 |
| **风险** | ①**同版本 + 内容不同**时"主目录优先"是一次**没有语义依据的抛硬币**（本仓 2 组，见 §2.1 表 B）；②上游清单版本与脚本版本不一致会制造**更新循环**（`copy_manga` 上游清单 1.6.7 / 脚本 1.6.6，见 `docs/mirror-provenance.md:41-47`），故版本一律以脚本为准。 |
| **本仓实测** | **15 组 / 16 个落选文件**（`copy_manga` 组有 3 个候选，故落选文件数比组数多 1）。 |

> **口径校正**：`docs/mirror-provenance.md:14` 与 `docs/DECISIONS.md:242` 写的"16 组"是**判定次数/落选文件数**，
> **不是去重 key 数**。去重 key 数是 **15**（`harness/build-catalog.js:5` 的注释写的正是 15）。
> 三个数字都自洽：73 − 57 = 16 个落选文件；15 个重复 key；16 次两两判定。建议在文档里统一成"15 个重复 key / 16 个落选文件"。

### L2 同站不同 key

| 项 | 内容 |
|---|---|
| **判据** | ①**规范化站名**相同——去掉 `_v2`/`_fixed_vNNN`/`_dual`/`_split` 等后缀后一致（`analyze-redundancy.js:25-32`）；②**非 CDN 宿主域有交集**（站点的强证据）；③**D3 ≥ 60%**（实现同源）。三者中 ①② 需同时成立，③ 用于分级。 |
| **处理动作** | 二选一，**必须显式记录**：<br>**(a) 留新**：清单里只留新 key，旧 key 不再列出，但**镜像文件保留**，并在 `DESCRIPTIONS`/台账里写明"旧实现见 `sources/mirror/...`，与 `<新 key>` 同站"；<br>**(b) 留全但标注**：两个 key 都留（宿主允许，见 §3.3），在**新的那条的 `description` 里写明"与 `<旧 key>` 同一站点的不同实现，<差异一句话>"**。 |
| **是否改代码** | **否**。改的是清单与文档，脚本一个字不动。 |
| **风险** | **(a) 有损**：丢掉的那份是"站点改版时的备用实现"；**(b) 无损但**用户会看到两个同名源，且**版本号不可横向比较**（`ikmmh` v1.0.6 vs `ikmmh_v2` v3.0.0 的 3.0.0 是作者自定的，不代表比 1.0.6 强 3 个迭代）。 |
| **本仓实测** | **1 组**：`ikmmh`（vc, 1.0.6）vs `ikmmh_v2`（han, 3.0.0），D3 = **78.6%**。 |

### L3 参数型变体 → 用 `settings` 吸收

| 项 | 内容 |
|---|---|
| **判据** | 两份实现**实质相同但差一个硬编码值**（域名、主机列表、是否多账号、UA/版本常量）。分级标准：**D3 必须高**（同一份代码），否则不是"参数差异"而是"两份实现"。 |
| **处理动作（模板）** | 见下方"具体做法"。 |
| **是否改代码** | **是。这是改写他人代码，产出的是衍生作品（derivative work）。** |
| **风险** | ①**授权**：两个上游仓库都**没有声明任何许可证**（`docs/mirror-provenance.md:9-10`、`docs/DECISIONS.md` D7 = 默认保留所有权利），改写会让"私有镜像"变成"我改的版本"，再分发时你是作者而不是搬运者，责任和授权问题都被放大；<br>②**维护**：参数化后上游再更新，你得手工把上游的新逻辑重新并进来，否则这个源就永久停在你的分叉上；<br>③**回归**：`AGENTS.md` §1 明确 `sources/mirror/**` 是"上游原样，永不修改"，L3 一旦执行就必须把产物放到 `sources/`（自有源区）而不是 `sources/mirror/`，**镜像区的纯净性不能被破坏**。 |
| **本仓实测** | **3 处参数差异点，可机械合并的 0 处**（见 §2.5）。原因是唯一"域名差异"的那一组（`manwaba`）两份实现 D3 只有 **2.9%**，已经分叉，不属于 L3。 |

#### L3 具体做法（模板 —— 只在决定"真的要分叉"时使用）

以 `manwaba` 的域名差异为例（`venera-configs/manwaba.js:19` 的 `api = "https://mwuu.cc/api"`、
`:395` 的 `imageSource: "https://tu.mhttu.cc"`，对上 `venera_comic_source/manwaba_fixed_v113.js:8` 的
`api = "https://manwali.cc/api"`、`:49` 把旧图床正则改写为 `https://tu.mwzu.cc`）。
若要让"一份代码吃两个域名组"，动作是：

1. **确定落点**：产物写进 `sources/`（自有源区），**绝不写进 `sources/mirror/`**；`key` 必须换新（例如 `manwaba_merged`），
   因为宿主规定"**更新脚本若返回不同 key 会被拒绝，不能用更新把一个源替换成另一个源**"
   （`Venera-Next/doc/api/comic_source.zh.md:353`）。
2. **加设置项**（字段规则见 `comic_source.zh.md:295-329`：`settings` 放在源类里，读取一律用 `this.loadSetting("键名")`，禁止用 `saveData("setting", ...)` 覆盖）：

   ```javascript
   settings = {
     // 键名：只用 ^[a-zA-Z_][a-zA-Z0-9_]*$ 形态，与既有键不冲突
     domain_group: {
       title: "域名组",            // 标题会被 App 翻译；同时要进 translation 词典
       type: "select",             // 判据类型：域名组是有限枚举 → select
       options: [
         { value: "new", text: "manwali.cc / tu.mwzu.cc" },
         { value: "old", text: "mwuu.cc / tu.mhttu.cc" }
       ],
       default: "new"              // 默认取"当前仍可用"的那一组
     },
     // 若某个域名是开放集合（站点频繁换域名），才用 input + validator
     api_host: {
       title: "API 主机",
       type: "input",
       validator: "^[a-z0-9.-]+$",  // 正则字符串或 null（comic_source.zh.md:325）
       default: "manwali.cc"
     }
   };
   translation = {
     zh_CN: { "域名组": "域名组", "API 主机": "API 主机" },
     zh_TW: { "域名组": "網域組", "API 主機": "API 主機" },
     en: {}                          // 词典键固定为 zh_CN / zh_TW / en（comic_source.zh.md:327）
   };
   ```

3. **改哪一处常量**：把类里的硬编码常量改成读取设置，共 4 处
   （对照 `manwaba_fixed_v113.js` 的实际行号）：

   | 原位置 | 原值 | 改成 |
   |---|---|---|
   | `manwaba_fixed_v113.js:8` | `api = "https://manwali.cc/api"` | `get api() { return \`https://${this.loadSetting("api_host")}/api\`; }` |
   | `manwaba_fixed_v113.js:13` / `:55` / `:233` | `"Referer": "https://manwali.cc/"` | `"Referer": \`https://${this.loadSetting("api_host")}/\`` |
   | `manwaba_fixed_v113.js:49` | 硬编码把旧图床正则改写成 `https://tu.mwzu.cc` | 图床基址改为 `this.loadSetting("image_host")`，正则只做"旧主机名 → 新基址"的重写 |
   | `manwaba.js:395`（落选那份） | `imageSource: "https://tu.mhttu.cc"` | 并入上面同一个 `image_host` 设置，作为 `domain_group = "old"` 时的默认值 |

4. **必须同时做的事**：`minAppVersion` 显式填实际验证过的最低版本（**省略即导入失败**，见 `comic_source.zh.md:25` 与 `docs/DECISIONS.md` D11）；
   跑 `npm test`；把"这是衍生作品、基于 X 仓 Y 文件 Z 版本"写进源注释与 `NOTICE.md`。

> **再次明确**：上面这份模板是"如果你决定分叉"的完整操作说明，**不是本策略推荐现在就做的动作**。
> 本仓当前对这 3 处参数差异的推荐动作全部是**"不改"**（见 §2.5、§4）。

### L4 功能型变体（保留 + 在 `description` 里标注）

| 项 | 内容 |
|---|---|
| **判据** | 实现或能力**实质不同**：多账号体系、双站点/双域名后端、可配置主机、不同的章节模型。D3 通常 < 60%，且差异集中在**能力面**而不是常量面。 |
| **处理动作** | **两者都保留**，在各自 `description` 里写明差异，避免用户以为是重复。**若两者同 key**，则当前清单只能装一个 —— 这就是 L4 的硬边界（见 §2.4 的 `copy_manga_multi_accounts`）。 |
| **是否改代码** | 视为"要保留"时不改；**若要在清单里同时提供两个同 key 变体，则必须改 key（= 改代码 = 衍生作品）**，理由同 L3（`comic_source.zh.md:353`）。 |
| **风险** | 不改：用户看到"像重复"的两个源（认知成本）。改 key：授权 + 维护 + 上游分叉（与 L3 同）。 |
| **本仓实测** | **3 组**（`copy_manga` / `copy_manga_multi_accounts`、`komiic` / `komiic_dual`、`manwaba` / `manwang`），其中 **2 组需要在 `description` 里加标注**，1 组无需动作。 |

---

## 2. 逐组裁定表

> 所有 `key`/`version`/`settings`/`hosts` 数值来自 `harness/analyze-redundancy.js` 的实际加载结果；
> 相似度来自 D3（去注释去空白 60-gram Jaccard）；`影响条目数` = 执行建议后 `index.json` 的增减。

### 2.1 同 key 组（15 组 / 16 个落选文件）

**表 A — L0：EOL 归一后内容同一（8 组，D3 = 100.0%）**

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| `ccc` vc `ccc.js` ↔ han `ccc.js` | L0 | 原始 sha 相同（`d7db634cd6a6`，`node harness/analyze-redundancy.js`），D3 = 100.0% | 只留一份（已在 `index.json:45-50` 实现）；台账登记"两仓字节等价" | 否 | 0 |
| `baozi` vc ↔ han | L0 | D2 归一 sha 均 `6ccb52e7734e`；原始 sha 不同（`6ccb52e7734e` LF / `cea31d4f0a83` CRLF）；D3 = 100.0% | 同上 | 否 | 0 |
| `comick` vc ↔ han | L0 | D2 均 `8e775b238141`；D3 = 100.0% | 同上 | 否 | 0 |
| `goda` vc ↔ han | L0 | D2 均 `dc94b8d5074e`；D3 = 100.0% | 同上 | 否 | 0 |
| `ManHuaGui` vc ↔ han | L0 | D2 均 `a5bf6c633e0c`（两者 `version` 都是 1.2.1，`manhuagui.js:7`）；D3 = 100.0% | 同上 | 否 | 0 |
| `manhuaren` vc ↔ han | L0 | D2 均 `6ec9b7ca3f84`；D3 = 100.0% | 同上 | 否 | 0 |
| `mycomic` vc ↔ han | L0 | D2 均 `85432d15a15e`；D3 = 100.0% | 同上 | 否 | 0 |
| `zaimanhua` vc ↔ han | L0 | D2 均 `96b89df7bcda`；D3 = 100.0% | 同上 | 否 | 0 |

> 这 8 组就是 §0 说的"误判"：`git ls-files --eol` 显示 `venera-configs/baozi.js` 是 `w/lf`、
> `venera_comic_source/baozi.js` 是 `w/crlf`，而 `git config core.autocrlf` = `true` —— 换行风格是**本机检出产物**，
> 不是上游内容差异。**D1 判据在这里给出的是假阴性，不能用作 L0 判据。**

**表 B — L1：同 key + 同版本 + 内容不同（2 组：版本号无法区分，靠"主目录优先"抛硬币）**

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| `comic_walker` vc（采纳）vs han（落选） | **L1（同版本分叉）** | 两边 `version = "1.0.1"`（`comic_walker.js:4`）；D3 = **62.3%**。差异是**han 侧修好了**：<br>· `latestVersion` vc `"1.4.13"`（`:11`）→ han `"1.6.4"`（`:15`）<br>· han 新增并发保护 `_refreshingToken`（`:19`、`:57`、`:71`）<br>· han 新增 `updateAppVersion()` 启动时拉 App Store 版本（`:35-45`）<br>· han 处理服务端 `upgrade_required` 并在重试后仍失败时抛可读错误（`:95`、`:134`） | **把采纳方改成 han**（在 `build-catalog.js` 的同版本判定里加入"内容更全者优先"或列出人工覆盖表）；<br>若暂不改，必须在台账里**显式标注"当前采纳的是旧实现，han 侧为修复版"** | 否 | 0 |
| `shonen_jump_plus` vc（采纳）vs han（落选） | **L1（同版本分叉）** | 两边 `version = "1.1.1"`（`:4`）；D3 = **98.9%**；**唯一差异**是 `latestVersion`：vc `"4.0.24"`（`:13`）vs han `"4.5.24"`（`:13`） | 同上：版本号相同而内容更新的那份应被采纳 | 否 | 0 |

> **这 2 组是本仓最值得动手的地方**：`index.json` 现在指向的是**旧的那份**，
> 而且因为"版本号相同"，**用户永远不会收到更新提示**（宿主用清单版本与已装版本比较）。
> 这不是"冗余"，是**静默降级**。

**表 C — L1：同 key + 版本不同（5 组，规则已正确执行）**

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| `Komiic`：vc `komiic.js` v1.0.3 ↔ han `komiic_dual.js` v1.0.8 | L1 | `komiic.js:9` = 1.0.3（settings `[]`，hosts `komiic.com`）；`komiic_dual.js:19` = 1.0.8（settings `["base_url"]`，hosts `komiic.com` + `komiic.cc`）；D3 = 43.5% | 已采纳 han（`index.json:9-15`）。**胜者是超集**（多一个域名 + `base_url` 设置），无需动作 | 否 | 0 |
| `copy_manga`：vc `copy_manga.js` v1.4.2、vc `copy_manga_multi_accounts.js` v1.4.1、han `copy_manga.js` v1.6.6 | L1 + **L4** | 三者 key 全为 `copy_manga`（`copy_manga.js:5`、`copy_manga_multi_accounts.js:5`）；版本见 `:7` / `:7` / `:4`；多账号版 settings 多出 `sub_accounts`、`login_sub_accounts`、`clear_sub_accounts`（`copy_manga_multi_accounts.js`）；D3：vc↔han = 44.5%、vc↔多账号 = **57.7%**、多账号↔han = 30.4% | 已采纳 han v1.6.6（`index.json:66-71`）。**多账号变体不在清单里**，见 §2.4 | 否 | 0 |
| `manga_dex`：vc v1.2.0 ↔ han v1.1.1 | L1 | vc `manga_dex.js:11` = 1.2.0；han `manga_dex.js:11` = 1.1.1（两边 `:9` 是 `key` 行）；D3 = 58.6% | 已采纳 vc（`index.json:220-225`），版本高者胜，正确 | 否 | 0 |
| `manwaba`：vc `manwaba.js` v1.0.3 ↔ han `manwaba_fixed_v113.js` v1.1.3 | L1 | `manwaba.js:11` = 1.0.3（hosts `mwuu.cc`、`tu.mhttu.cc`）；`manwaba_fixed_v113.js:5` = 1.1.3（hosts `manwali.cc`、`tu.mwzu.cc`）；**D3 仅 2.9% → 两份实现已分叉** | 已采纳 han（`index.json:241-246`），正确。**不做 L3 合并**（见 §2.5） | 否 | 0 |
| `ykmh`：vc `ykmh.js` v1.0.0 ↔ han `youku.js` v1.0.6 | L1 | 两者 key 都是 `ykmh`（`ykmh.js:4`、`youku.js:4`），类名都是 `YKMHSource`；版本 `ykmh.js:5` = 1.0.0 / `youku.js:5` = 1.0.6；**D3 仅 12.4%**（vc 17773 有效字符 vs han 10694）→ han 是重写，不是补丁；han 多一个后端主机 `js.haotuyk.top` | 已采纳 han（`index.json:381-386`，展示名"优酷漫画 (修复版)"），正确。**注意 han 那份的自更新地址指向 vc 的旧文件**，见 §3.2 | 否 | 0 |

### 2.2 同站不同 key（L2，1 组）

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| `ikmmh`（vc `ikmmh.js` v1.0.6）vs `ikmmh_v2`（han `ikmmh_v2.js` v3.0.0） | **L2** | · `name` 都是"爱看漫"（`ikmmh.js:714`、`ikmmh_v2.js:757`）<br>· 主站同为 `ikmmh.com`（vc 的 `cdn.jsdelivr.net` 来自 `/** @type {import('./_venera_.js')} */` 这类 JSDoc 行，非站点域）<br>· `settings` 同为一个 `base_url`，**三要素完全相同**：title"站点地址（必须能在本机浏览器直接访问）"、`type: "input"`、`validator: "^https?://[^/]+/?$"`、`default: "https://www.ikmmh.com"`（`ikmmh.js:752-757`、`ikmmh_v2.js:795-800`）<br>· `ikmmh_v2.js` 文件头自述"v3.0.0（**三版本合并稳定版**）"<br>· **D3 = 78.6%**（同源分叉，不是两份独立实现） | **推荐 (b) 留全 + 标注**：两个 key 都留（宿主允许，见 §3.3），把 `ikmmh_v2` 的 `description` 改成"爱看漫新一代实现（作者自述为三版本合并稳定版）；旧实现 `<key=ikmmh>` 为同站另一实现，可作改版备用"；<br>**不推荐 (a) 摘掉 `ikmmh`**：D3 = 78.6% 说明两者仍有 21% 的不同代码，A/B 互为备用是有价值的，而节省的只是 1 条清单 | 否 | **0（推荐方案）** / −1（若选 (a)） |

> 判定 `ikmmh` 与 `ikmmh_v2` 属同一站点的**唯一直接证据是"同名 + 同主站 + 同设置项三要素 + 78.6% 同源代码"**，
> 而**不是**宿主域集合判据 —— 后者在本仓有已知误报（见 §2.4）。

### 2.3 文件名 / 清单里带 `fixed` / `vN` 的 6 个文件：核查结论

用户点名的 6 个文件，逐个核对"`index.json` 的 version 是否就是脚本自身版本"：

| 文件 | 文件名暗示 | 脚本自身声明（证据） | `index.json` | 结论 |
|---|---|---|---|---|
| `gfmh.js` | 无版本 | `gfmh.js:20` `key = "GfmhApp"`、`:21` `version = "1.3.0"`、`:22` `minAppVersion = "1.6.0"` | `index.json:3-8` key `GfmhApp` / 1.3.0 | **一致，无告警** |
| `dongman_la_fixed_v101.js` | `fixed_v101` | `:14` key `dongman_la`、`:15` version `1.0.1` | `index.json:80-85` key `dongman_la` / 1.0.1 | **一致**（"v101"= 1.0.1，作者的命名压缩） |
| `dongmanmanhua.js` | 无 | `:10` key `dongmanmanhua`、`:11` version **`1.0.6`**；但文件头注释 `:2` 写"版本: **1.0.0**" | `index.json:87-92` 1.0.6 | **字段一致**；**文件头注释是陈旧的，不可作为判据** |
| `mojoin_fixed_v107.js` | `fixed_v107` | `:11` key `mojoin_v2`、`:12` version **`1.0.7`**；文件头注释 `:2` 写"v**1.0.5**" | `index.json:276-281` key `mojoin_v2` / 1.0.7 | **字段一致**；同样**注释陈旧** |
| `manhuauo_fixed_v2.js` | `fixed_v2` | `:16` key `manhuauo_banana_v2`、`:17` version `1.0.3` | `index.json:234-239` key `manhuauo_banana_v2` / 1.0.3 | **一致** |
| `guazi_manhua_v1.1.0.js` | `v1.1.0` | `:4` key `guazimanhua`、`:5` version **`1.0.4`** | `index.json:115-120` key `guazimanhua` / **1.0.4** | **一致**：清单跟随脚本(1.0.4)，**文件名里的 v1.1.0 是错的** |
| `rumanhua_fixed_v16.js` | `fixed_v16` | `:3` key **`rumanhua_fixed_v15`**、`:4` version **`1.2.8`** | `index.json:332-337` key **`rumanhua_fixed_v15`** / 1.2.8 | **一致**：文件名 v16 / key 里 v15 / 字段 1.2.8 **三者互不相同**，但清单严格跟随脚本 → 正确 |

**结论**：这 7 个"文件名里带版本/fixed"的文件**没有一处清单与脚本不一致**。
机器校验的结果也是干净的：`npm test` 51/51 通过，其中 `tests/source-repo.test.js:59` 逐条核对 key 与 version。
**真正会误导人的是文件头注释里的陈旧版本**（`dongmanmanhua.js:2`、`mojoin_fixed_v107.js:2`），
所以**判据必须用 `loadSource(...).source.version`（真求值），不能用正则抓注释、也不能信文件名。**

> **顺带发现一个假阳性**：`node tools/validate-catalog.js` 报 **1 处**问题 ——
> `manwang: 脚本 key=9S8$vJnU2ANeSRoF 与清单不符`。这是**误报**：
> `tools/validate-catalog.js:23-29` 的 `metaOf` 用正则 `\bkey\s*=\s*["'`]([^"'`]*)["'`]` 抓**第一次**出现的 `key = "..."`，
> 而 `manwang_fixed_v120.js:15` 是**注释行**：`* - AES key = "9S8$vJnU2ANeSRoF"（UTF-8），解密得 JSON {...}`（`:37` 才是真正的 `paramsAesKey = ...`）。
> 用真求值的 `loadSource` 校验（`tests/source-repo.test.js:59`）则通过。
> **规则：`tools/validate-catalog.js` 只能作为"零依赖快速体检"，冲突时以 `loadSource` 为准。**

### 2.4 核查后判定"**不是**重复"的候选

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| vc `goda.js` v1.2.1 ↔ vc `mh18.js` v1.0.0（工具分组 C 的唯一命中） | **不是重复** | 两者唯一共同宿主是 `cdn.jsdelivr.net`，而该域来自**自更新地址字段**：`goda.js:124` `url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/goda.js"`、`mh18.js:16` 同理。站点域完全不同（`godamh.com`/`v2.apikk.top` vs `18mh.org`）；D3 低于阈值 | **不改**。同时建议把工具的分组 C 判据修掉：**排除 `url` 字段里的分发自更新域**（白名单 `cdn.jsdelivr.net`、`raw.githubusercontent.com`、`github.com`） | 否 | 0 |
| `manwaba`（vc, "漫蛙吧", hosts `mwuu.cc`/`tu.mhttu.cc`）↔ `manwang`（han, "漫网", hosts `manwang.net`/`dmw.546457.xyz`/`img1.baipiaoguai.org`） | **不是重复** | **key 不同**（`manwaba.js:9` / `manwang_fixed_v120.js:23`）、**宿主域集合完全不相交**、D3 < 0.30。仅中文名前缀"漫"相同 | **两个都保留**（清单里已在：`index.json:241-246`、`:247-253`）。建议在 `description` 里各写一句站点说明，避免用户以为同名 | 否 | 0 |
| `dongman_la`（`dongman.la`）↔ `dongmanmanhua`（`dongmanmanhua.cn`） | 不是重复 | 站点域不相交，key 不同 | 不改 | 否 | 0 |
| `mh1234`（`gmh1234.wszwhg.net`）↔ `mh4399`（`4399manhua.com`）↔ `mh18`（`18mh.org`） | 不是重复 | 站点域两两不相交 | 不改 | 否 | 0 |
| `hot_manga`（vc, `manga2026.com`）↔ vc `copy_manga.js` | 不是重复 | D3 = **33.5%**，落在"共享框架样板"区间；站点域不相交 | 不改。但记入 D3 的**阈值校准样本**：跨站点对也能到 33.5%，所以 D3 不能单独作为判重判据 | 否 | 0 |
| `laimanhua_split_hosts_v1.2.1_configurable.js` vs "同名非 configurable 变体" | **不存在该候选** | 两个镜像里 `Name -match 'laimanhua'` 的文件**只有 1 个**（`Get-ChildItem sources/mirror -Recurse -Filter *.js \| Where-Object Name -match 'laimanhua'`）。该文件已自带 `settings = ["searchDomain","browseDomain"]`（`laimanhua_split_hosts_v1.2.1_configurable.js:283-287` 附近） | 无需动作。**"L3 参数化"在这个源上上游已经做完了**，这正是 L3 的理想终态样例 | 否 | 0 |
| `copy_manga_multi_accounts.js`（vc, key `copy_manga`, v1.4.1） | **L4（功能型变体，当前完全不可达）** | `:3` `name = "拷贝漫画M"`、`:5` `key = "copy_manga"`（**与 `copy_manga.js` 撞 key**）、`:7` `version = "1.4.1"`；settings 比普通版多 `sub_accounts`/`login_sub_accounts`/`clear_sub_accounts`；D3 与 vc 普通版 = 57.7% | **两个选项，都要付代价**：<br>**(a) 保持现状**：清单不列它（`grep multi_accounts index.json` = 0 命中），多账号能力对用户不可达 —— 但镜像里有，可在 `docs` 里说明；<br>**(b) 改 key 后单列**（如 `copy_manga_multi`）：能让用户用上，但**这是改他人代码 = 衍生作品**（授权问题同 L3），且 `version 1.4.1 < 1.6.6`，用户很难判断该装哪个 | **(b) 是** | 0（选 a）/ **+1**（选 b） |

### 2.5 L3 参数差异点（3 处，可机械合并 0 处）

| 候选 | 层级 | 证据 | 建议动作 | 改代码 | 影响条目数 |
|---|---|---|---|---:|---:|
| `manwaba` 域名常量 | L3 形态但**已分叉** | vc `manwaba.js:19` `api = "https://mwuu.cc/api"`、`:395` `imageSource: "https://tu.mhttu.cc"`；han `manwaba_fixed_v113.js:8` `api = "https://manwali.cc/api"`、`:49` 正则把 `mwtuyi.cc`/`tu.mhttu.cc` 改写成 `https://tu.mwzu.cc`。**但两者 D3 只有 2.9%** → 不是"同一份代码差一个常量"，而是两份实现 | **不合并**。若要参数化，等价于**重写胜者**，走 §1 L3 模板并接受"衍生作品"的全部代价 | 是（若做） | 0 |
| `shonen_jump_plus` 的 `latestVersion` | L3 形态但**不该开设置** | vc `:13` `"4.0.24"` vs han `:13` `"4.5.24"`（同一位置，单值差异） | **不开设置项**。这是内部 UA/App 版本常量，不是用户偏好；把它变成设置只会让用户能选出一个**必然被服务端拒绝**的值。正确动作是"取新的那个"（= 表 B 的处理） | 否 | 0 |
| `comic_walker` 的 `latestVersion` | L3 形态 + 实质代码差异 | vc `:11` `"1.4.13"` vs han `:15` `"1.6.4"`，另有 `_refreshingToken`、`updateAppVersion()` 等代码差异 | 同上：按"内容更全者优先"处理 | 否 | 0 |

---

## 3. 多镜像源策略（N 个上游镜像同一个源）

### 3.1 选主规则（可复算，不允许人工拍脑袋）

按以下优先级**逐条**判定，命中即停：

1. **key 必须相同**（按 `loadSource` 的真求值，不是上游清单里的 key）。
2. **版本高者胜**：用**宿主自己的规则**，不是 SemVer。
   `Venera-Next/lib/features/comic_source/parser.dart:24-60` 的 `compareSemVer`：
   前 3 段 `int.parse` 后比大小（`:30-32`），第 4 段只特判字面量 `"hotfix"`（`:45-55`），否则字典序。
   本仓的 JS 端口在 `harness/build-catalog.js:62-76`。
3. **同版本时，主目录(`venera-configs`)优先**（`build-catalog.js:88-91` 的迭代顺序 + `:141-146` 的 `cmp > 0 ? e : prev`）。
4. **同版本且内容不同时**（当前 2 组）→ **不承认"抛硬币"结果**，转入人工覆盖表。
   判据建议：**D3 更高者胜**（`comic_walker` 62.3% 的 vc 是旧实现，han 是修复版；`shonen_jump_plus` 98.9%）。
   人工覆盖表的最小形式：一个 `{ key: winnerRepo }` 的 JSON 常量，附 `reason` 与证据行号。

> **注意 JS 端口与 Dart 原版有一处真实分歧**（今天不影响，将来会）：
> Dart 在 `split('.')` **之前**先做 `replaceFirst("-", ".")`（`parser.dart:25-26`），
> 而 `build-catalog.js:63-64` 直接 `split('.')`。于是 `"1.0.0-hotfix"` 在 Dart 里第 4 段是 `"hotfix"`（胜出），
> 在 JS 里第 3 段变成 `"0-hotfix"`（`parseInt` → 0）、第 4 段不存在（→ `''`）。
> **实测本仓 73 个脚本版本全是三段纯数字、无后缀**，所以现在没有实际影响；
> 但规则里必须写明"**版本一律三段纯数字**"，否则清单与宿主会给出不同判定。
> （Dart 还有 `int.parse("")` 对 `minAppVersion` 抛 `FormatException` 的问题，见 `parser.dart:205` 与 `docs/DECISIONS.md` D11。）

### 3.2 存证（谁赢了、谁输了、凭什么）

必须存在**机器生成、可 diff** 的地方，而不是散在聊天记录里。现状与缺口：

| 存证载体 | 现状 | 评价 |
|---|---|---|
| `docs/mirror-provenance.md:14-33` | `build-catalog.js:165-192` 生成，含 `key/采纳仓/版本/未采纳仓/版本/依据` 6 列 | **好**，但口径写成"16 组"（应为 15 个 key / 16 个落选文件）；且**同版本时只写"主目录优先"**，没写"内容不同"这一关键事实 |
| `harness/build-catalog.js:194-211` 生成的"上游清单版本与脚本不符"表 | 4 处（`ehentai` 1.1.8→1.2.0、`manwaba` 1.0.2→1.0.3、`lanraragi` 1.1.0→1.2.0、`copy_manga` 1.6.7→**1.6.6**） | **好**，`copy_manga` 是"更新循环"实病 |
| `harness/analyze-redundancy.js` 的 A/B/C 分组 | 只有 stdout / `--json` | **缺口**：不落盘、不进 git、D1 判据会误判 EOL |
| `harness/build-subscription.js:107` | `if (compareSemVer(candidate.version, prev.version) > 0)` —— 同版本静默保留先见者，**不产出任何 decisions 记录** | **缺口**：订阅清单是**对外发布**的那份（`subscription/index.json`，57 条全 `url`），它的选主过程**没有存证** |
| 每个文件的"镜像痕迹"（来自哪个仓、哪次拉取、哪个上游 commit） | `docs/mirror-provenance.md` 只有仓库级说明；**镜像文件本身不带 commit/日期** | **缺口**：`AGENTS.md` 要求 `sources/mirror/**` 永久只读，但"只读于哪个版本"无处可查 |

**建议**（按性价比排序）：
1. `analyze-redundancy.js` 增加 `--out docs/redundancy-report.md`，并**改用 D2（EOL 归一）算 sha**，D3 相似度一并落盘。
2. `build-subscription.js` 复用 `build-catalog.js` 的 `decisions` 结构，把落选记录写进 `docs/mirror-provenance.md` 的同一张表（两份清单的选主必须同源同证）。
3. 台账里为"同版本内容不同"的 2 组加一列 `contentDelta`（例如 `latestVersion 1.4.13→1.6.4；+_refreshingToken；+updateAppVersion()`）。

### 3.3 如何避免"两个 entry 都装"

**事实：宿主不是"两个都装"，而是"同 key 只能有一个 origin"。**

- `Venera-Next/doc/api/comic_source.zh.md:352`：**"同一 `key` 不会安装多份。仓库中存在多个同 `key` 的变体时可能需要用户选择来源，发布者宜避免无意重复。"**
- 代码证据 `source_repositories.dart:378-391`（`entryFor`）：
  ```dart
  final candidates = entries.where((e) => e.key == source.key).toList();
  final previousUrl = originFor(source.key)?.url;
  final exact = candidates.firstWhereOrNull((e) => e.url == previousUrl);
  if (exact != null) return exact;                 // 命中已记录的 origin → 静默解析
  if (candidates.length == 1) return candidates.single;
  throw (candidates.isEmpty
      ? 'This source is no longer listed in its repository.'
      : 'Multiple variants found. Choose a source in the repository again.').tl;
  ```
  即：清单里出现**同 key 两条** → 用户会撞上 **"Multiple variants found."**，
  **不是装了两份，而是更新链路变成"请重新选源"**。绑定关系是 `origins[key]`（`source_repositories.dart:133-135`），**按 key 存一条**。

**所以本仓策略是：清单里 `key` 必须唯一**（`tests/source-repo.test.js:49` 断言、`tools/validate-catalog.js:49` 报错）。
这条策略比宿主**更严格**，代价是"同 key 的功能型变体无法同时提供"（= §2.4 的 `copy_manga_multi_accounts`）。
这个代价是**有意付的**，应该在文档里说明白，而不是当成疏漏。

### 3.4 同 key 但内容不同版本

三种情形，三种处理：

| 情形 | 判别 | 处理 |
|---|---|---|
| **版本不同** | `compareSemVer` 能分出高低 | 走 §3.1 规则 2，机器判定，记入台账。（本仓 5 组） |
| **版本相同、内容相同** | D2 相等 | L0，天然无冲突。（本仓 8 组） |
| **版本相同、内容不同** | D2 不等 | **不得静默抛硬币**。转人工覆盖表，并把"当前采纳的是哪一份、另一份强在哪"写进台账。（本仓 2 组：`comic_walker`、`shonen_jump_plus`） |

**额外硬约束（容易被忽略）**：每个源脚本自带的 `url` 字段是"**源脚本的原始 HTTP(S) 下载地址**"（`comic_source.zh.md:26`）。
它构成一条**绕过本仓清单的更新通道**：
`source_repositories.dart:393-399` 的 `updateUrl()` 在**没有有效仓库关联时**直接 `return normalizeUrl(source.url)`。
实测本仓 **55/73** 的脚本声明了非空 `url`，其中 **50** 个是 jsDelivr 形式，**17 个是"跨仓"**——
即 han 侧的文件把自己的更新地址指向 **vc 侧的同名/近名文件**：

```
venera_comic_source/baozi.js            [baozi v1.1.6]      -> venera-app/venera-configs/baozi.js
venera_comic_source/ccc.js              [ccc v1.0.1]        -> venera-app/venera-configs/ccc.js
venera_comic_source/comick.js           [comick v1.2.0]     -> venera-app/venera-configs/comick.js
venera_comic_source/comic_walker.js     [comic_walker 1.0.1]-> venera-app/venera-configs/comic_walker.js
venera_comic_source/copy_manga.js       [copy_manga v1.6.6] -> venera-app/venera-configs/copy_manga.js
venera_comic_source/goda.js             [goda v1.2.1]       -> venera-app/venera-configs/goda.js
venera_comic_source/komiic_dual.js      [Komiic v1.0.8]     -> venera-app/venera-configs/komiic.js      ← 文件名不同
venera_comic_source/manga_dex.js        [manga_dex v1.1.1]  -> venera-app/venera-configs/manga_dex.js
venera_comic_source/manhuagui.js        [ManHuaGui v1.2.1]  -> venera-app/venera-configs/manhuagui.js
venera_comic_source/manhuaren.js        [manhuaren v1.0.0]  -> venera-app/venera-configs/manhuaren.js
venera_comic_source/manwaba_fixed_v113.js [manwaba v1.1.3]  -> venera-app/venera-configs/manwaba.js    ← 文件名不同
venera_comic_source/mycomic.js          [mycomic v1.1.0]    -> venera-app/venera-configs/mycomic.js
venera_comic_source/shonen_jump_plus.js [shonen_jump_plus 1.1.1] -> .../venera-configs/shonen_jump_plus.js
venera_comic_source/youku.js            [ykmh v1.0.6]       -> venera-app/venera-configs/ykmh.js       ← 文件名不同
venera_comic_source/zaimanhua.js        [zaimanhua v1.0.2]  -> venera-app/venera-configs/zaimanhua.js
venera_comic_source/baihehui.js         [baihehui v1.0.0]   -> venera-app/venera-configs/baihehui.js   ← 目标不在本仓镜像内
venera_comic_source/zerobyw33.js        [zerobyw33 v1.2.0]  -> meaninglesslyy/venera-configs/zerobyw33.js ← 第三方仓
```

**这条通道的净效果是"往旧版本方向"**：17 条里每条的目标版本都**不高于**本地版本
（`komiic_dual` 1.0.8 → vc `komiic.js` 1.0.3；`manwaba_fixed_v113` 1.1.3 → vc `manwaba.js` 1.0.3；`youku` 1.0.6 → vc `ykmh.js` 1.0.0），
所以不会造成"降级安装"，但会让**去重赢家永远无法通过自己的 `url` 拿到更新** ——
它只能通过本仓清单更新。**结论**：镜像场景下**不要依赖 `url`**，
去重决策必须由 `index.json` 单一来源给出，且每次拉取上游后重跑 `build-catalog.js`。

### 3.5 新增第三个镜像源的标准流程（可照抄）

假设要加入第三个上游仓库 `venera-comic-extra`：

1. **先体检，再镜像**。
   `node harness/validate-sources.js <新仓库目录>` —— 只看**阻断项**
   （加载失败 / 缺 `name`/`key`/`version` / key 不合规 / version 不合规 / **`minAppVersion` 为空**，见 `harness/validate-sources.js:6-12`）。
   有阻断项的源**不得进清单**（也可以用 `harness/analyze-redundancy.js` 先看有没有和自己撞 key 的）。
2. **登记上游与许可证**。在 `harness/build-catalog.js:88-91` 的 `specs` 里加一项；
   同时确认许可证状态（前两个仓库都是"无 LICENSE = 保留所有权利"，见 `docs/mirror-provenance.md:9-10`）。
   **无许可证的仓库不得进入 `subscription/index.json` 的代码分发路径**（`build-subscription.js:14-19` 的设计约束：订阅清单只用 `url` 指向上游，本仓不复制代码）。
3. **跑汇总**：`node harness/build-catalog.js --venera-configs <A> --venera-comic-source <B>` 需要扩展为接受第三个 `--` 参数；
   注意 **`specs` 的顺序就是"同版本优先"的顺序**，新仓库应排在**最后**（`build-catalog.js:88-91` + `:141-146`）。
4. **跑汇总后的三道门**：
   - `node tools/validate-catalog.js`（零依赖快检；**`key` 冲突/文件名不存在**会立刻报出来）
   - `npm test`（`tests/source-repo.test.js` 逐条核对 57+ 条的 key/version/minAppVersion 与脚本一致）
   - `node harness/analyze-redundancy.js`（看新引入了几组同 key / 同站 / 同宿主）
5. **补台账**：`docs/mirror-provenance.md` 的"上游"表 + "去重决策"表必须包含新仓库的每一行；
   若是**同版本内容不同**，进人工覆盖表（§3.1 规则 4）。
6. **订阅清单同源**：`node harness/build-subscription.js --venera-configs <A> --venera-comic-source <B> [--verify]`
   （加 `--verify` 会实测匿名可达性，`build-subscription.js:167-174`），
   并**核对** `subscription/index.json` 与 `index.json` 的 key/version 集合完全一致
   （当前实测：57 ↔ 57，key 集合相同，版本零差异）。
7. **只有以上全绿**，才把镜像与清单一起提交；**镜像文件永不修改**（`AGENTS.md` §1）。

---

## 4. 精简收益的诚实评估

### 4.1 现状（可复核）

| 指标 | 数值 | 来源 |
|---|---:|---|
| 镜像文件 | 73 | `node harness/analyze-redundancy.js` → `镜像文件: 73   涉及仓库: 2` |
| 清单条目 | 57 | `index.json`；`node tools/validate-catalog.js` → `条目: 57  唯一 key: 57` |
| 重复 key 的组数 | **15** | 按 D2/真求值分组实测 |
| 因去重被丢弃的文件 | **16** | 73 − 57；含 `copy_manga` 组 2 个落选 |
| 上游清单版本与脚本不符 | 4 | `docs/mirror-provenance.md:35-44` |
| `index.json` 里未被引用的镜像文件 | **17** | 16 个去重落选 + `vc/ehentai.js`（被自有 `sources/ehentai.js` 接管）|

### 4.2 逐层可减少的条目

| 层 | 现状条目 | 执行后条目 | Δ | 是否无损 |
|---|---:|---:|---:|---|
| L0（8 组内容同一） | 每组 1 条 | 每组 1 条 | **0** | 无损（`build-catalog.js` 已经做完） |
| L1（15 组同 key） | 每组 1 条 | 每组 1 条 | **0** | 无损规则已执行；**但 2 组"同版本分叉"的胜者是旧实现，属正确性问题、不是数量问题** |
| L2（`ikmmh` / `ikmmh_v2`） | 2 条 | 1 条（若摘掉 vc 那份） | **−1** | **有损**：丢掉一份可用的同站备用实现 |
| L3（3 处参数差异） | — | — | **0** | 不适用（不合并） |
| L4（`copy_manga_multi_accounts`） | 0 条（不可达） | 0 条（保持）或 **+1**（改 key 后单列） | **0 或 +1** | 选 +1 就要改写他人代码 = 衍生作品 |

### 4.3 结论

> **强制、无损的净减少 = 0 条。**
> **全部"建议动作"都执行后的净减少 = 1 条（57 → 56）**，而且那 1 条是**可选且有损**的
> （把 `ikmmh` v1.0.6 从清单里摘掉，保留 `ikmmh_v2` v3.0.0）。
> 如果连这 1 条也不做（我倾向不做），**净减少 = 0**。

**必须明说：收益很小。** 57 条里没有"纯粹凑数"的条目；`index.json` 里的每一个 key 都对应一个
真实站点或真实后端（`kavita`/`komga`/`lanraragi` 是自建服务，`baihehui`/`hipmh`/`tuku_cc` 等是小众站），
**没有任何一条是"另一条的重复"**。之所以看起来"重复很多"（73 → 57），是因为**两个上游仓库本身互为镜像**，
而这件事在 `build-catalog.js` 生成清单时**已经一次做完了**。

### 4.4 真正的收益不在"减少条目"，而在下面四件事

| # | 动作 | 收益类型 | 成本 |
|---|---|---|---|
| 1 | **修 2 组"同版本分叉"的胜者**（`comic_walker`、`shonen_jump_plus`） | **功能性**：当前用户拿到的是旧实现，且因版本号相同**永远不会收到更新提示** | 低（改覆盖表 + 重跑生成器） |
| 2 | **修 L0 判据**（`analyze-redundancy.js` 改用 EOL 归一的 D2） | **可复核性**：把"8 组"如实报出来，避免"1 组"给人"镜像几乎无重复"的错觉 | 极低（约 3 行） |
| 3 | **给订阅清单补 decisions 存证**（`build-subscription.js` 目前不记录落选，`:107`） | **可审计性**：对外发布的那份清单，其选主过程目前无据可查 | 低（复用 `build-catalog.js` 的结构） |
| 4 | **在 `description` 里标注同站/易混源**（`ikmmh`/`ikmmh_v2`、`manwaba`/`manwang`、`gouzi`… 等） | **认知**：用户不再以为清单里有重复 | 极低（改生成器的 `description` 模板） |

---

## 5. 机器可校验的规则清单

**原则**：能用 `loadSource`（真求值）判定的，绝不用正则；能做成测试断言的，绝不写成文档约定。

### 5.1 已被覆盖的规则（含覆盖者与位置）

| # | 规则 | 覆盖者 | 状态 |
|---|---|---|---|
| R1 | `index.json` 必须是 **JSON 数组** | `tests/source-repo.test.js:33`；`tools/validate-catalog.js:34-37` | ✅ 有断言 |
| R2 | 每条必须有 `key`/`name`/`version`，且 `key` 匹配 `^[a-zA-Z_][a-zA-Z0-9_]*$`、`version` 匹配 `^\d+\.\d+\.\d+(?:[.-].+)?$` | `tests/source-repo.test.js:38-47`；`tools/validate-catalog.js:40-48` | ✅ 有断言 |
| R3 | 必须有 `fileName` 或 `url`（二者取其一；两者都有时 `url` 优先） | `tests/source-repo.test.js:45`；`tools/validate-catalog.js:48`；宿主侧 `source_repositories.dart:246-253` | ✅ 有断言 |
| R4 | **清单里 `key` 必须唯一**（宿主"同一 key 只装一份"） | `tests/source-repo.test.js:49-57`；`tools/validate-catalog.js:49-52` | ✅ 有断言 |
| R5 | 每个 `fileName` 必须存在 | `tests/source-repo.test.js:64`；`tools/validate-catalog.js:56-58` | ✅ 有断言 |
| R6 | **每个 `fileName` 的脚本 key 必须等于清单 key，脚本 version 必须等于清单 version** | `tests/source-repo.test.js:59-82`（用 `loadSource`，**权威**）；`tools/validate-catalog.js:60-66`（正则快检，**有假阳性**，见 §2.3） | ✅ 有断言（以 `loadSource` 为准） |
| R7 | `minAppVersion` 必须非空 | `tests/source-repo.test.js:79`；`harness/validate-sources.js:6-12`（列为**阻断项**） | ✅ 有断言（但 R7 的测试只覆盖清单里的 56 条 `fileName`，见 §5.2 G3） |
| R8 | 汇总规模与镜像目录存在 | `tests/source-repo.test.js:84-93`（`>= 50` 条 + 两个镜像目录存在） | ✅ 有断言 |
| R9 | 自有源契约（元数据齐备 / 不用宿主不存在的全局 / ES2022 守卫） | `tests/source-repo.test.js:95-112` | ✅ 有断言（**仅覆盖 `sources/ehentai.js`**，见 G3） |
| R10 | 上游清单版本与脚本不符必须被纠正 | `harness/build-catalog.js:111-122` 生成 4 处纠正记录 + `docs/mirror-provenance.md:35-44` | ✅ 有机制（靠 R6 兜底） |
| R11 | 夹具 / 运行时 / 列表解析基线 | `tests/harness.test.js`（9 条）、`tests/gallery-list.test.js`（含"未匹配路由必须响亮失败" `:88`） | ✅ 有断言 |

### 5.2 尚未覆盖、建议补的规则（缺口）

| # | 规则（建议作为断言） | 为什么需要 | 建议落点 |
|---|---|---|---|
| **G1** | **同内容（D2 EOL 归一 sha256）的文件，不得在两个清单条目里同时被引用** | L0 的判据现在**没有任何自动检查**；当前靠"key 唯一"间接兜住，一旦出现"不同 key、同一份代码"就会漏 | `tests/source-repo.test.js` 新增一条：对全部被引用文件算 D2 sha，断言无重复 |
| **G2** | **`fileName` 不得重复**（同一物理文件被两条引用） | 与 G1 互补；`fileName` 重复在当前 `key` 唯一约束下等于一条条目被架空 | 同上（同一测试内） |
| **G3** | **全部 73 个镜像文件都必须过 `validate-sources.js` 的阻断项**（现在只有引用的 56 个走 `loadSource`，且只有自有源过 ES2022/全局检查） | 目前 `harness/validate-sources.js` 是**手动 CLI**，`npm test` **不调用它**（实测 `grep tests/ -Pattern 'validate-sources'` 只命中 `:21` 的 `HOST_STUBS` import）；镜像里 17 个落选文件完全没被任何测试加载过 | `tests/source-repo.test.js` 加一条遍历 `sources/mirror/**/*.js` 的测试 |
| **G4** | **`subscription/index.json` 与 `index.json` 的 key 集合与 version 必须一一对应**，且订阅清单里**不得出现 `fileName`** | 实测当前两者 57↔57、集合一致、零版本差异，但**没有任何测试钉住**；这条是"对外发布的那份"的一致性，回归代价最高 | 新增 `tests/subscription.test.js` |
| **G5** | **去重决策表必须与清单同源**：`docs/mirror-provenance.md` 的行数 == 判定次数，且 `key` 集合去重后条数 == 15（随上游变化） | 防"清单改了、台账没改" | `tests/source-repo.test.js` 读 `docs/mirror-provenance.md` 校验（或在 `build-catalog.js` 里加 `--check` 模式） |
| **G6** | **版本必须严格三段纯数字** | 宿主 `compareSemVer` 对 <3 段会 `v1[i]` 越界 / `int.parse` 抛异常（`parser.dart:30-32`），而 JS 端口用 `parseInt(pa[i] \|\| '0')` **不会抛**（`build-catalog.js:66-67`）→ JS 侧会静默放行一个宿主会崩的版本 | 在 R2 的正则之外，另加一条只允许 `^\d+\.\d+\.\d+$` 的断言（**当前 73+57 个版本全部满足**，可安全收紧） |
| **G7** | **`url` 字段形态**：非空时必须是 `http(s)://` 且不得是 GitHub 文件展示页或源列表地址 | `comic_source.zh.md:26` 明令禁止；当前 55 条 `url` 无一被检查（其中 2 条指向本仓镜像外的文件：`venera_comic_source/baihehui.js` → `venera-configs/baihehui.js`、`venera_comic_source/zerobyw33.js` → `meaninglesslyy/venera-configs/zerobyw33.js`） | `tools/validate-catalog.js` + 一条测试 |
| **G8** | **同版本同 key 的候选必须进人工覆盖表** | 防未来再出现"同版本内容不同 → 静默抛硬币" | `build-catalog.js` 在 `cmp === 0 && D2 不等` 时**非零退出**并打印双方 sha，强制人工决策 |

### 5.3 判定时必须避开的 4 个陷阱（本仓实测踩过或差点踩到）

| 陷阱 | 症状 | 正确做法 |
|---|---|---|
| **T1 用原始 sha 判内容同一** | 7 组真重复被漏报（`analyze-redundancy.js:53`） | 用 D2（先 `\r\n`→`\n`） |
| **T2 用正则抓脚本元数据** | `tools/validate-catalog.js` 把 `manwang_fixed_v120.js:15` 注释里的 `AES key = "..."` 当成源的 key → **假阳性 1 处** | 用 `loadSource` 真求值（`tests/source-repo.test.js:70`） |
| **T3 用宿主域集合判同一站点** | `goda`/`mh18` 因共用**自更新地址域** `cdn.jsdelivr.net` 被误判为一组（`goda.js:124`、`mh18.js:16`） | 排除 `url` 字段里的分发自更新域；改为"非 CDN 域有交集" + 站名规范化 + D3 |
| **T4 用行级多重集合度量相似度** | `manwaba.js` vs `manwaba_fixed_v113.js` 的"共同行"多达 67 行（几乎全是 `}`/`};`/`return`），让人误判成"参数型变体"；而 D3 只有 **2.9%** | 用去注释去空白的 **n-gram Jaccard**（本策略的 D3）；行多重集只能当粗筛 |

---

## 附录 A 复现命令

```powershell
cd C:\Users\Samso\Desktop\projectD03\EHviewer\venera-ehentai-source

# 1) 冗余三组信号（工具的原始 sha 判据；注意 A 组会漏报，见 §1.0 T1）
node harness/analyze-redundancy.js

# 2) 清单自检（零依赖正则版；有 1 处已知假阳性 manwang，见 §2.3）
node tools/validate-catalog.js
#    → 条目: 57  唯一 key: 57  问题: 1
#      ✗ manwang: 脚本 key=9S8$vJnU2ANeSRoF 与清单不符   （假阳性：命中的是注释行）

# 3) 契约测试（权威；用 loadSource 真求值）
npm test
#    → ℹ tests 51 / pass 51 / fail 0

# 4) 换行风格证据（解释为什么 A 组只报 1 组）
git config core.autocrlf                  # → true
git ls-files --eol sources/mirror/venera-configs
git ls-files --eol sources/mirror/venera_comic_source
#    → 两边索引都是 i/lf；vc 侧 29 个 w/lf + 4 个 w/crlf；han 侧 40 个全部 w/crlf

# 5) 哪些镜像文件没被清单引用
#    （内联脚本，见正文 §4.1：73 文件 / 56 被引用 / 17 未引用）
```

D2/D3 两个判据的实现要点（可独立复现，无需落盘脚本）：

- **D2** = `crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex')`
- **D3** = 状态机剥掉注释与空白 → 60 字符滑窗集合 → `|A∩B| / |A∪B|`
  （**不要**用正则剥注释：实测正则会因注释里出现 `/*` 而吃掉大段代码，把 `youku.js` 的 10694 有效字符误算成 903）

## 附录 B 与既有文档的口径差异

| # | 既有表述 | 位置 | 实测 | 处理建议 |
|---|---|---|---|---|
| **B1（更正）** | "内容完全相同 **1 组**（`ccc.js`）" | 由 `node harness/analyze-redundancy.js` 的 A 组输出（以及 `docs/` 现有描述）体现 | **8 组**（EOL 归一后 sha 相等；D3 均为 100.0%） | 修 `analyze-redundancy.js:53` 改用 D2；文档改写为 8 组并附 8 组清单 |
| **B2（口径）** | "73 个文件里 **16 组**重复 key" | `docs/DECISIONS.md:242`；`docs/mirror-provenance.md:14` | **15 个重复 key / 16 个落选文件 / 16 次判定**（`harness/build-catalog.js:5` 的注释写的正是 15） | 统一措辞；若要保留"16"，须写明"16 次判定（含 `copy_manga` 的 3 候选）" |
| **B3（补充）** | 台账"依据"列只写"同版本或更低，主目录优先" | `docs/mirror-provenance.md:19-33`（10 行） | 其中 **2 行**（`comic_walker`、`shonen_jump_plus`）的真实情况是**同版本但内容不同，且落选方是修复版** | 加一列 `contentDelta`，把这 2 行标出来，见 §3.2 建议 3 |
| **B4（缺口）** | `tools/validate-catalog.js` 自称"本仓是纯分发仓，刻意不携带离线运行时…更严格的校验在测试仓" | `tools/validate-catalog.js:5-7` | 本仓**实际带有** `harness/` 与 `tests/`（51 条测试在本仓跑通），且这些文件**目前尚未提交**（`git status --porcelain` → `?? harness/analyze-redundancy.js`、`?? harness/measure-endpoints.js`、`?? tools/`） | 更新该注释，或把这段话改为"更严格的校验见 `harness/validate-sources.js`（本仓）与 testkit" |
| **B5（范围外观察）** | — | — | `venera-sources-testkit`（主仓的**同级目录**）与 `venera-ehentai-source` **同时**带有内容高度重叠的 `harness/`、`tests/`、`fixtures/`（testkit 另有 `harness/source-locator.js`、`tests/source-contract.test.js`，主仓另有 `harness/analyze-redundancy.js`、`tools/`、`build-catalog.js`）。这本身是一处跨仓冗余，但**超出本次"漫画源清单"的范围** | 另开一次调研，别在本策略里扩散 |

## 附录 C UNKNOWN 清单

| # | 事项 | 查过什么 | 结论 |
|---|---|---|---|
| U1 | `manwaba`（漫蛙吧）与 `manwang`（漫网）**是否同一运营方** | 两者的 `key`、`name`、全部宿主域（`mwuu.cc`/`tu.mhttu.cc` vs `manwang.net`/`dmw.546457.xyz`/`img1.baipiaoguai.org`）、D3 相似度（< 0.30） | **UNKNOWN**。只能确证"两份脚本指向完全不同的站点"，不能确证运营方关系。**因此不作任何合并动作。** |
| U2 | 17 条"跨仓 `url`"中指向 `venera-configs/baihehui.js` 的那条**是否 404** | 本仓只镜像了 vc `index.json` 列出的 33 个文件，其中没有 `baihehui.js` | **UNKNOWN**（未发网络请求）。**只能说"目标不在本仓镜像内，无法离线核对"。** `zerobyw33.js` 指向 `meaninglesslyy/venera-configs`，那是第三方仓库，同理 |
| U3 | 8 组 L0 的**上游真实字节**是否本来就不同（而非本机检出造成） | `git ls-files --eol`（两边索引一致为 `i/lf`）、`core.autocrlf=true`、D2 归一后 sha 相等 | 本仓**索引层已归一为 LF**，所以**就本仓而言这 8 组内容等价**。上游 GitHub 上的真实字节未直接核对（未 clone 上游） |
| U4 | `comic_walker` / `shonen_jump_plus` 落选方"更好"是否已在上游达成共识 | 读了两边的代码差异（`_refreshingToken`、`updateAppVersion()`、`latestVersion` 常量） | **UNKNOWN**。代码证据强烈指向 han 侧是修复版（注释里明写"server started rejecting old UA versions… which broke token refresh"），但**没有上游 issue/PR 佐证** |
| U5 | 未被清单引用的 17 个镜像文件里，除 16 个去重落选 + `vc/ehentai.js` 外是否还有别的用途 | `index.json` 逐条比对、`grep multi_accounts index.json` = 0 | 已确认集合大小与成员；**各项的"是否该保留"是判断而非事实**，本文按"保留镜像"处理 |
| U6 | 第三个上游仓库是否**存在且值得镜像** | 未调研 | **UNKNOWN**（本文 §3.5 只给流程，不推荐具体仓库） |
