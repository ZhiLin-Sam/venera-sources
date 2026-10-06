# 订阅端点可达性实测（国内直连）

## 测量条件（缺一不可，否则数据无意义）

| 项 | 值 |
|---|---|
| 时间 | 2026-10-05 |
| 网络 | 中国大陆，家宽 WLAN（默认路由 `WLAN 2 → 192.168.1.1`，非 TUN） |
| 代理 | **关闭**。证据：`HKCU:\...\Internet Settings\ProxyEnable = 0`；Clash 隧道进程（`verge-mihomo`/`clash-verge`）已退出，仅余 `clash-verge-service` |
| 有效性探针 | **baidu 200 / google 不通（0，29–10522 ms）→ 判定为直连国内环境** |
| 采样 | 每端点 **3 次**，取中位数 |
| 被测对象 | 公开仓库 `venera-app/venera-configs`（用来体现**各 host 本身**的质量，与本仓是否公开无关） |
| 复跑命令 | `node harness/measure-endpoints.js --repo venera-app/venera-configs --samples 3` |

> 为什么用上游公开仓测：本仓当时仍是私有仓，所有 host 上都是 404（**这本身就是"私有仓不能做订阅"的证据**）。
> host 质量与仓库无关，因此用公开仓取数、把结论套到本仓 URL 上是成立的。

## 结果

| host | 清单 | 源脚本相对路径 | 中位延迟（清单 / 文件） | 结论 |
|---|---|---|---|---|
| `gcore.jsdelivr.net` | 200 3/3 | 200 3/3 | 91 / 109 ms | ✅ 可用 |
| `cdn.jsdelivr.net` | 200 3/3 | 200 3/3 | 92 / 104 ms | ✅ 可用（**主**） |
| `fastly.jsdelivr.net` | 200 3/3 | 200 3/3 | 95 / 141 ms | ✅ 可用 |
| `gh-proxy.com`（第三方反代） | 200 3/3 | 200 3/3 | 214 / 1307 ms | ⚠ 能通但慢一个数量级，且第三方可见全部流量 → 仅应急 |
| `raw.githubusercontent.com`（源站） | **0/3** | **0/3** | 335 ms **快速失败** | ❌ 国内直连不可用（快速失败＝被干扰/阻断，非超时） |
| `ghfast.top`（第三方反代） | **0/3** | **0/3** | 10575 ms 超时 | ❌ 当前不可用 |

补充：三个 jsDelivr 域解析到的边缘不同（主域/Fastly → `151.101.x`（Fastly），Gcore → `104.17.x`（Cloudflare）），
延迟落在同一档（91–141 ms），差异在噪声范围内 —— 所以**三者互为等价备援**，
某个域将来被墙时换另一个即可，清单内容不用改。

## 结论：订阅地址怎么排

| 优先级 | 地址 | 说明 |
|---|---|---|
| **主** | `https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json` | 国内直连实测 3/3 |
| **等价备** | 把域名换成 `gcore.jsdelivr.net` / `fastly.jsdelivr.net` | 同一份内容的三个入口 |
| 有代理时可选 | `https://raw.githubusercontent.com/ZhiLin-Sam/venera-sources/main/index.json` | 更新最快；**国内直连不通** |
| 应急 | `https://gh-proxy.com/https://raw.githubusercontent.com/...` | 慢 10 倍 + 隐私风险 |
| 不用 | `ghfast.top` | 实测 3/3 超时 |

因为清单用**相对路径**（`fileName: sources/mirror/...`）且基准是"清单最终 URL"，
所以**换 host 不用改清单**，57 个源脚本自动跟着走同一条线路。

## 已知局限（不要过度解读）

1. **单点测量**：一台机器、一个 ISP、一个时刻。国内不同运营商/地区差异很大 ——
   最终以**你手机上的实测**为准（手机浏览器直接打开清单 URL，能出 JSON 即通）。
2. **jsDelivr 分支引用有 CDN 缓存**，推送后更新可能滞后；要立刻生效用 raw（需代理）或发布 tag
   改用 `@v1.0.0` 这类版本化地址。
3. DNS 同时返回 IPv6（如 `2a04:4e42::`、`2606:50c0::`）。若设备优先 IPv6 而该路径不通，
   可能表现为"偶发很慢"；这是设备/网络侧问题，与本仓无关。
4. 本表不含 Gitee —— 它需要**另建仓库**（与"不新建仓库"的决定冲突）且对 NSFW 内容有审核下架风险。
