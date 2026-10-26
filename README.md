# venera-sources

给 **Venera / Venera-Next** 用的源目录：一条订阅装齐 **60 个源**。

## 整仓订阅

三行依次为 **主地址 / gcore 备用 / fastly 备用**（换域名即可，路径不变）：

```text
https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
https://gcore.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
https://fastly.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/index.json
```

CDN 有缓存，推送后可能延迟；刷新方法见 [docs/endpoint-measurement.md](docs/endpoint-measurement.md)。

## 单个源

在 Venera 的「漫画源」页选「添加源文件/URL」，复制下表对应一行的地址即可。

<details>
<summary>展开 60 个源的单项地址</summary>

| 源 | key | 版本 | 单项地址 |
|---|---|---|---|
| 古风漫画 | `GfmhApp` | 1.3.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/gfmh.js |
| Komiic | `Komiic` | 1.0.8 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/komiic_dual.js |
| 漫画柜 | `ManHuaGui` | 1.2.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/manhuagui.js |
| 百合会 | `baihehui` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/baihehui.js |
| 包子漫画 | `baozi` | 1.1.7 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/baozi.js |
| 嗶哩漫畫 | `bilimanga` | 1.1.7 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/bilimanga.js |
| CCC追漫台 | `ccc` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/ccc.js |
| カドコミ | `comic_walker` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/comic_walker.js |
| comick | `comick` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/comick.js |
| 拷贝漫画 | `copy_manga` | 1.6.6 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/copy_manga.js |
| 拷贝漫画(多账号) | `copy_manga_multi_accounts` | 1.4.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/copy_manga_multi_accounts.js |
| CxC | `cxc` | 1.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/cxc.js |
| 动漫屋 | `dm5` | 7.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/dm5.js |
| 动漫啦 | `dongman_la` | 1.0.5 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/dongman_la_fixed_v101.js |
| 咚漫 | `dongmanmanhua` | 1.0.6 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/dongmanmanhua.js |
| E-Hentai / ExHentai | `ehentai` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/ehentai.js |
| 飞翔漫画 | `ffppt` | 1.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/ffppt.js |
| GoDa漫画 | `goda` | 1.2.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/goda.js |
| 瓜子漫画 | `guazimanhua` | 1.0.4 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/guazi_manhua_v1.1.0.js |
| 嗨皮漫画 | `happy` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/happy.js |
| H-Comic | `hcomic` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/hcomic.js |
| 嬉皮漫畫 | `hipmh` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/hipmh.js |
| hitomi.la | `hitomi` | 1.1.2 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/hitomi.js |
| 热辣漫画 | `hot_manga` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/hot_manga.js |
| 爱看漫 | `ikmmh_v2` | 3.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/ikmmh_v2.js |
| jcomic.net | `jcomic` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/jcomic.js |
| 禁漫天堂 | `jm` | 1.4.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/jm.js |
| Kavita | `kavita` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/kavita.js |
| Komga | `komga` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/komga.js |
| 来漫画（分流） | `laimanhua_split` | 1.2.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/laimanhua_split_hosts_v1.2.1_configurable.js |
| Lanraragi | `lanraragi` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/lanraragi.js |
| 51漫画 | `manga51` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/manga51.js |
| MangaDex | `manga_dex` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/manga_dex.js |
| Mangabz | `mangabz` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/mangabz.js |
| 漫画人 | `manhuaren` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/manhuaren.js |
| 香蕉漫画 | `manhuauo_banana_v2` | 1.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/manhuauo_fixed_v2.js |
| 漫蛙吧 | `manwaba` | 1.1.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/manwaba_fixed_v113.js |
| 漫网 | `manwang` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/manwang_fixed_v120.js |
| 漫画1234 | `mh1234` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/mh1234.js |
| 18漫画 | `mh18` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/mh18.js |
| 4399漫画网 | `mh4399` | 1.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/mh4399.js |
| MOJOIN | `mojoin_v2` | 1.0.7 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/mojoin_fixed_v107.js |
| 漫小肆 | `mxs` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/mxs.js |
| MYCOMIC | `mycomic` | 1.1.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/mycomic.js |
| nhentai | `nhentai` | 1.1.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/nhentai.js |
| NoyManga | `noymanga` | 1.1.5 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/noymanga.js |
| Picacg | `picacg` | 1.0.6 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/picacg.js |
| 腾讯动漫（正版） | `qq_comic_official_v1` | 1.0.3 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/tencent_comic_official.js |
| Rawkuma | `rawkuma` | 1.1.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/rawkuma.js |
| 如漫画 | `rumanhua_fixed_v15` | 1.2.8 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/rumanhua_fixed_v16.js |
| SF漫画 | `sfacg_manhua` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/sfacg_manhua.js |
| 少年ジャンプ＋ | `shonen_jump_plus` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/shonen_jump_plus.js |
| サンデーうぇぶり | `sunday_webry` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/sunday_webry.js |
| 图库漫画 | `tuku_cc` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/tuku_cc.js |
| LINE WEBTOON | `webtoons_zh_hant` | 1.0.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/webtoons_zh_hant.js |
| W漫画 | `wmanhua` | 1.0.1 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/wmanhua.js |
| 紳士漫畫 | `wnacg` | 1.0.6 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/wnacg.js |
| 优酷漫画 (修复版) | `ykmh` | 1.0.7 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/youku.js |
| 再漫画 | `zaimanhua` | 1.0.2 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera-configs/zaimanhua.js |
| zero搬运网 | `zerobyw33` | 1.2.0 | https://cdn.jsdelivr.net/gh/ZhiLin-Sam/venera-sources@main/sources/mirror/venera_comic_source/zerobyw33.js |

</details>

来源与授权：[NOTICE.md](NOTICE.md) · 维护规约：[AGENTS.md](AGENTS.md) ·
决策与证据：[docs/DECISIONS.md](docs/DECISIONS.md)
