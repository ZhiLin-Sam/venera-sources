# venera-sources —— 本仓库工作规约

本仓库有两个目标：

1. **自有源**：把 EhViewer_CN_SXJ 的站点抓取能力，搬进 Venera 的 `ehentai` 漫画源，
   并用真实页面夹具把「站点改版」变成一次可量化的测试失败，而不是等用户报 bug。
2. **汇总目录**：镜像多个上游源仓库、按宿主规则去重，发布成一份可直接添加的私有源清单
   （`index.json`，当前 57 条）。

> 本地目录名 `venera-ehentai-source` 是历史命名，远端仓库为 **`venera-sources`**（私有）。

## 1. 目录职责

| 路径 | 职责 | 可写性 |
|---|---|---|
| `sources/ehentai.js` | **产品本体**：要分发给 Venera 的源脚本 | 可写 |
| `sources/upstream/` | 上游原始文件，仅作对照基线 | **只读，永不修改** |
| `fixtures/cn-sxj/` | 从 CN_SXJ 拷贝的真实页面夹具（黄金样本） | **只读，永不手改** |
| `harness/` | 离线运行时（复刻 Venera 的 JS 桥接） | 可写 |
| `tests/` | 回归测试 | 可写 |
| `sources/mirror/**` | 上游源仓库的完整镜像（73 个文件） | **只读，永不手改** |
| `index.json` | 汇总清单（**生成物**） | 只经生成器写 |
| `docs/` | 调研、矩阵、决策记录 | 可写 |

## 2. 硬规则

1. **夹具是黄金样本**：`fixtures/` 里的 HTML 是站点某时刻的真实响应，是判据的唯一真相来源。
   解析结果与夹具不符时，先怀疑解析器，不要改夹具。需要新样本就**新增**文件，不要覆盖旧的。
2. **解析改动必须带测试**：任何触碰解析逻辑的改动，必须先有一个能复现问题的夹具测试（红），
   再改到绿。禁止"我看了下应该没问题"。
3. **禁止静默吞异常**：上游源在逐行解析里 `catch(e) {}`，一条改版会静默变成 0 条结果。
   本仓库的解析路径必须能报出「跳过了几行、第一个原因是什么」。
4. **不引入宿主私有 API**：`http_client: 'dart:io'` 这类只在某一宿主生效的伪头，必须隔离在
   一个可降级的封装里，不得散落在业务逻辑中。
5. **不碰上游仓库**：`Ehviewer_CN_SXJ/`、`venera/`、`Venera-Next/` 全部只读。只从它们**拷出**内容。
6. **不提交**：`node_modules/`、任何抓取到的实时页面、任何凭证/cookie。夹具只收已脱敏的静态样本。
7. **`index.json` 是生成物**：只能由 `node harness/build-catalog.js --venera-configs <A> --venera-comic-source <B>`
   生成，禁止手改 —— 手工改动会在下次汇总时丢失，且极易引入重复 key 或版本不符。
   清单版本一律以**脚本自身声明**为准（上游清单有 4 处是错的，见 `docs/DECISIONS.md` D12）。
8. 提交信息用 Conventional Commits，正文中文。

## 3. 验证方式

```powershell
npm install
npm test          # 夹具驱动的回归测试
npm run audit     # 夹具与被测解析器的覆盖对照
```

改动 `sources/ehentai.js` 后 **必须** `npm test` 全绿才允许提交。

## 4. 红线

- 疑似密钥 / cookie / token：**停下报告**，不入库。
- >50MB 单文件：不入库，只在 `SESSION-NOTES.md` 登记。
- 破坏性操作（删/移/覆盖夹具）：先出清单，等用户确认。
