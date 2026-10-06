# venera-sources

给 **Venera / Venera-Next** 用的**源目录仓库**：一条订阅地址装齐 **56 个源**，
并自带**夹具驱动的回归测试台**，把「站点改版」变成一次可复现的测试失败。

## 订阅地址

国内直连实测（2026-10-05，**无代理**，每端点 3 次取中位）：

```
https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json            # 主   92ms  3/3
https://gcore.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json          # 等价备 91ms  3/3
https://fastly.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json         # 等价备 95ms  3/3
https://raw.githubusercontent.com/ZhiLin-Sam/venera-sources/main/index.json      # 需代理 0/3
```

把任一条填进 App 的「漫画源列表」即可。**换域名不用改清单** —— 清单用相对路径，
基准是清单自身的最终 URL，56 个脚本自动跟着走同一条线路。
数据与判定方法见 [docs/endpoint-measurement.md](docs/endpoint-measurement.md)。

> jsDelivr 会缓存分支引用，推送后更新可能滞后；要立刻生效用带代理的 raw 地址，
> 或发布 tag 后改用 `@v1.0.0` 这类版本化地址。

## 内容

| 路径 | 说明 |
|---|---|
| `index.json` | **订阅清单：56 条**（生成物，勿手改） |
| `sources/ehentai.js` | 自有源（本项目维护，夹具回归保护） |
| `sources/mirror/**` | 两个上游仓库的完整镜像，73 个文件，分层存放 |
| `fixtures/cn-sxj/` | 33 份真实页面夹具（黄金样本，只读） |
| `harness/` · `tests/` | 离线运行时与回归测试（`npm test`，51 项） |
| `subscription/index.json` | 可选形态：只含清单 + `url` 引用，**不含他人代码** |
| `docs/` | 决策记录、镜像来源、冗余策略、端点实测 |

## 常用命令

```powershell
npm install
npm test                        # 51 项回归
npm run audit                   # 夹具覆盖审计
node harness/build-catalog.js --venera-configs <A> --venera-comic-source <B>   # 重新汇总
node harness/verify-subscription.js --base <清单URL>                            # 复核订阅
```

> **页面中承载画廊链接的行数 == 解析成功条数**

不等 = 有行被静默丢弃 = 立刻失败并报出丢了几条。

## 边界与授权

- ⚠️ 夹具条目停在 **2017–2019**：**挡得住回归，挡不住改版**。要挡改版必须补当前样本。
- 两个上游源仓库**都没有声明许可证**；本仓是其镜像并已公开分发，
  **收到权利人异议即删除对应文件**。见 [NOTICE.md](NOTICE.md)。
- 工作规约见 [AGENTS.md](AGENTS.md)；关键决策与证据见 [docs/DECISIONS.md](docs/DECISIONS.md)。
