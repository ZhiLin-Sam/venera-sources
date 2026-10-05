# venera-ehentai-source

把 **EhViewer_CN_SXJ** 积累的站点抓取能力，搬进 Venera 的 `ehentai` 漫画源；
并用**真实页面夹具 + 离线运行时**把「站点改版」变成一次可复现的测试失败，
而不是等用户报「列表空白」。

- 宿主：`CyrilPeng/Venera-Next`（活跃维护，1.17.0+228）
- 参考实现：`xiaojieonly/Ehviewer_CN_SXJ`（Android 原生，解析经验最厚）
- 授权状态：**未决，暂不公开分发** —— 先读 [NOTICE.md](NOTICE.md)

## 现状（Phase 1 已完成）

```
$ npm test
ℹ tests 44   pass 44   fail 0
```

上游 `ehentai.js` v1.2.0 **一行未改**，在完全离线、N 秒可重复的测试台上通过：

- 10 个列表变体 × 3 类断言（条数 / 不得静默丢失 / 字段完整）= 30 条
- 空列表、路由响亮失败、基线元数据 = 3 条
- 测试台自检（HTML5 `tbody` 补全、真数组、属性对象、位置索引…）= 11 条

### ⚠️ 已知边界：夹具年代

10 个列表变体夹具的条目日期是 **2017–2019**（见 [docs/DECISIONS.md](docs/DECISIONS.md) D9）。
所以这套绿灯证明的是「**能解析 2019 年的列表布局**」，**不代表能解析今天的站点**。
补当前样本（Phase 1.5）优先于继续堆测试。

## 目录

| 路径 | 说明 |
|---|---|
| `sources/ehentai.js` | 产品本体：要分发给 Venera 的源脚本（当前 = 上游原样，作改前基线） |
| `sources/upstream/ehentai.js` | 上游原始文件，只读基线 |
| `fixtures/cn-sxj/` | 33 个真实页面夹具（2.6 MB），黄金样本，只读 |
| `harness/runtime.js` | 离线运行时：复刻宿主的 `Network` / `Cookie` / `HtmlDocument` / `Comic` / `ComicSource` |
| `harness/html-document.js` | 复刻宿主 `HtmlDocument` 桥接（jsdom 实现完整 HTML5 树构造） |
| `harness/fixtures.js` | 夹具登记、oracle（期望值）、覆盖登记 |
| `harness/audit-fixtures.js` | 覆盖审计：哪些夹具已被真正断言 |
| `tests/` | `node:test` 回归测试 |
| `docs/DECISIONS.md` | **为什么这么做** + 可复核证据（含 11 条关键决策） |
| `docs/research/` | 调研产物：CN_SXJ 能力→移植矩阵（80 条）、Venera-Next 运行时 API 契约（1124 行）。关键论断已本地抽验，非逐条复核 |

## 快速开始

```powershell
npm install
npm test            # 44 条回归测试
npm run audit       # 夹具覆盖审计
```

改 `sources/ehentai.js` 后必须 `npm test` 全绿才提交（`AGENTS.md` §3）。

## 为什么值得这么搭

上游源在列表解析的四个模式里各包了一个**空的 `catch`**：

```
sources/upstream/ehentai.js:298 / 321 / 350 / 376   →   catch(e) {}
```

站点一改版 → 选择器失配 → 每行抛异常被吞 → **返回 0 条且不报错**。
用户看到空列表，你拿到零信号。这就是要解决的第一性问题。

本项目的报警等式不依赖硬编码常量，而是拿夹具自身结构做对照：

> **页面中承载画廊链接的行数 == 解析成功条数**

两边不等 = 有行被静默丢弃 = 立刻失败，并在消息里给出丢了几条。

## 阶段计划

| 阶段 | 目标 | 状态 |
|---|---|---|
| **1** | 夹具驱动回归测试台 + 锁定上游基线 | ✅ 完成（44 测试） |
| **1.5** | **补当前站点样本**（新增夹具，不覆盖旧样本），让 oracle 覆盖新旧两代布局 | ⏭ 下一步 |
| **2** | 功能补齐：把 CN_SXJ 有、上游源没有的能力搬进来（排行榜 / 详情页字段 / 归档 / 评论投票 / 高级搜索 / tag 命名空间） | 待办 |
| **3** | 反封与稳健：509 检测 + skipHathKey 一次性令牌重试、统一响应体检（Sad Panda / kokomade / 空 body）、IP 封禁识别、多域名灾备、把静默 `catch` 改为可上报「跳过几行、首个原因」 | 待办 |

能力清单与逐条判据见调研产物
（`tmp/<session>/research/cn-sxj-porting-matrix.md`，80 条能力 / 15 条不可移植）。

## 授权

三方授权各不相同，其中**上游源脚本未声明许可证**（`venera-configs` 无 `LICENSE`，返回 404），
按默认著作权 = 保留所有权利。因此本仓库当前 `private: true` + `UNLICENSED`。
公开分发前必须先在 [NOTICE.md](NOTICE.md) §3 的 A/B 方案中做出选择。
