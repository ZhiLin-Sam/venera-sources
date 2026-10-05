# Venera-Next 漫画源 JS 运行时 API 精确参考

**调研对象**：`C:\Users\Samso\Desktop\projectD03\EHviewer\Venera-Next\`（只读）
**仓库版本**：`git describe` = `v1.17.0-4-g3c8f8e6`；`pubspec.yaml:5` = `1.17.0+228`
**调研方式**：纯静态阅读源码 + 文档交叉验证。**未运行任何构建、Gradle、dart、flutter 命令**，未修改任何文件。
**证据格式**：所有路径相对 `Venera-Next\`。

> **重要前提**：本文档的证据基准是**本仓库代码**。`doc/api/*.md` 只作为交叉验证来源；当文档与代码冲突时，以代码为准，并会显式标注冲突。
> 本机**没有** `.dart_tool/`、**没有** pub cache（已实测：`$LOCALAPPDATA\Pub\Cache`、`~\.pub-cache`、`%APPDATA%\Pub\Cache` 均不存在），因此 `flutter_qjs` / `package:html` 的**包内源码不可读**。凡涉及这两个依赖内部行为的结论，均标注为推断并写明依据。

---

## 0. 运行时总体架构（理解后面所有结论的基座）

### 0.1 引擎与宿主

| 项 | 值 | 证据 |
|---|---|---|
| JS 引擎 | QuickJS，经 `flutter_qjs` 0.3.7（git 依赖，固定 commit `8feae95d…`） | `pubspec.yaml:19-22`；`pubspec.lock` 中 `flutter_qjs` → `version: "0.3.7"` |
| 引擎已迁移到 | **QuickJS-NG**（不是原版 QuickJS） | `doc/development/dependency_audit.zh.md:18`；`doc/development/git_dependencies.json:9` |
| 宿主实现 | `lib/foundation/js_engine.dart` | `lib/foundation/js_engine.dart:73` |
| Dart 侧实现方 | 自有 fork `github.com/CyrilPeng/flutter_qjs` | `pubspec.yaml:19-22` |

### 0.2 引擎引导（bootstrap）：全局对象只有两个是"注入"的

```dart
_engine = FlutterQjs();                                   // js_engine.dart:153
var setGlobalFunc = _engine!.evaluate(
  "(key, value) => { this[key] = value; }");              // js_engine.dart:155-157
(setGlobalFunc as JSInvokable)(["sendMessage", _messageReceiver]); // js_engine.dart:158
setGlobalFunc(["appVersion", App.version]);               // js_engine.dart:159
_engine!.evaluate(utf8.decode(jsInit), name: "<init>");   // js_engine.dart:168
```

**结论**：宿主只向 JS 世界注入 **2 个**全局：`sendMessage`（Dart 原生函数）与 `appVersion`（字符串）。`assets/init.js`（1533 行）随后被整体求值，**其余所有 API 都是在 JS 侧用 `sendMessage` 拼出来的包装层**。
→ 因此"源脚本能调用什么" = `assets/init.js` 定义的名字 ∪ `{sendMessage, appVersion}` ∪ QuickJS 内建标准对象。

**路径陷阱**：`doc/api/js.zh.md:5` 说"函数名与大小写以 `assets/init.js` 为准"，但正文的 API 表把名字写成 `Network` / `HtmlDocument`，而**任务描述里假设的 `http_get` / `http` / `html` / `document` 等名字在 init.js 中完全不存在**（见 §1.14）。

### 0.3 源脚本的求值方式（决定了语法边界）

```dart
js = js.replaceAll("\r\n", "\n");                                  // parser.dart:182
final className = sourceClassName(js);                             // parser.dart:183
JsEngine().runCode("""(() => { $js
    this['temp'] = new $className()
  }).call()
""", filePath);                                                    // parser.dart:184-187
...
finally { JsEngine().runCode("delete this['temp'];"); }            // parser.dart:170
```

由此**必然**推出（无需额外证据即可判定为语法错误）：

- ❌ `import` / `export` / `require` —— 顶层模块语法在函数体内非法；文档也明确禁止：`doc/api/comic_source.zh.md:18`
- ❌ **顶层 `await`** —— 包裹箭头函数**不是** `async`（`parser.dart:184`），所以 `doc/api/comic_source.zh.md:19,29` 里的 `async (...) => ...` 写法是唯一正确姿势
- ❌ 浏览器全局 `window` / `document` / `localStorage`
- ✅ 顶层 `this` === 全局对象（`(() => {...}).call()` 未传 `thisArg`；在非严格模式下箭头函数继承外层 `this`，而 `JsEngine().evaluate` 的顶层 `this` 即 globalThis —— 这一点同时被 `init.js` 自身依赖：`js_engine.dart:156` 的 setter 用 `this[key] = value`）
- ✅ 类声明的作用域被限制在该箭头函数体内；宿主通过 `this['temp']` 取回实例（`parser.dart:185-189`）

### 0.4 引擎实例清单（"一个引擎"这个直觉是错的）

| 引擎 | 数量 | 是否加载 init.js | 证据 |
|---|---|---|---|
| 主引擎 `JsEngine` | **单例，全局共享** | 是 | `js_engine.dart:74-78`（`_cache`）、`:168` |
| `JSPool` 的 isolate 引擎 | 4 个（`_maxInstances = 4`） | 是（走 `cacheJsInit`） | `js_pool.dart:19`、`:44-46`、`:190`、`:57` |
| `modifyImage` 引擎 | 每次调用新建一个 isolate | 是 | `image_processing.dart:235-242`、`:338`、`:341` |

**关键含义**：所有已安装源的**全部回调**都在**同一个** QuickJS 实例上执行（`js_engine.dart:74`）。Dart 侧网络请求可以并发，但 JS 执行是单线程串行的。这解释了 `doc/api/comic_source.zh.md:129` 那句"请求可能并发执行…不要用全局变量保存请求参数"背后的真实约束。

---

## 1. 全局对象与函数清单（穷尽）

### 1.1 宿主注入（不在 init.js 中）

| 名字 | 签名 | 返回 | 同步/异步 | 异常 | 证据 |
|---|---|---|---|---|---|
| `sendMessage` | `sendMessage(Object message)` | `any`（值或 Promise） | **取决于 `message.method`** | 未识别 method → 返回 `null`；Dart 抛错 → JS 侧 reject/throw | 注入：`js_engine.dart:158`；分发：`js_engine.dart:174-268`；未识别：`:262-263` |
| `appVersion` | 字符串属性 | `string` | 同步 | — | `js_engine.dart:159`；消费：`init.js:1470` |

`sendMessage` 的完整 method 分发表（`js_engine.dart:179-261`）：

| `method` | 对应 Dart | 同步返回？ | 证据 |
|---|---|---|---|
| `log` | `Log.addLog` | 是（`void`） | `:180-191` |
| `load_data` | `_sourceBridge.loadData` | 是 | `:192-195` |
| `save_data` | `_sourceBridge.saveData` | 是（`void`） | `:196-203` |
| `delete_data` | `_sourceBridge.deleteData` | 是（`void`） | `:204-207` |
| `http` | `_http(...)` | **否（`Future`）** | `:208-209`、`:270` |
| `html` | `handleHtmlCallback` | 是 | `:210-211`、`:420` |
| `convert` | `_convert` | 是 | `:212-213`、`:538` |
| `random` | `_random` | 是 | `:214-219`、`:692` |
| `cookie` | `handleCookieCallback` | 是 | `:220-221`、`:489` |
| `uuid` | `Uuid().v1()` | 是 | `:222-223` |
| `load_setting` | `_sourceBridge.loadSetting` | 是 | `:224-227` |
| `isLogged` | `_sourceBridge.isLogged` | 是 | `:228-229` |
| `delay` | `Future.delayed` | **否（`Future`）** | `:230-233` |
| `UI` | `_uiMessageBridge.handleUIMessage` | 视 function 而定 | `:234-235`、`components/js_ui.dart:18` |
| `getLocale` | `"${languageCode}_${countryCode}"` | 是 | `:236-237` |
| `getPlatform` | `Platform.operatingSystem` | 是 | `:238-239` |
| `setClipboard` | `Clipboard.setData` | **否（`Future`）** | `:240-241` |
| `getClipboard` | 读剪贴板 | **否（`Future`）** | `:242-246` |
| `compute` | `JSPool().execute` | **否（`Future`）** | `:247-260` |

> ⚠️ **`sendMessage` 是有"名字空洞"的**：`js_engine.dart:179` 的 `switch` **没有 `default` 分支**（对比 `:264` 的 `catch`）。未识别的 method 会静默走到 `:263 return null`。所以拼错 API 名不会报错，只会拿到 `null`。这是排查源脚本问题的首要检查点。

### 1.2 Network（`init.js:461-611`）

全部网络函数返回 Promise（`doc/api/js.zh.md:15`）。

| 签名 | 返回 | 同步/异步 | 异常行为 | 证据 |
|---|---|---|---|---|
| `Network.sendRequest(method, url, headers?, data?, extra?)` | `Promise<{status, headers, body: string}>` | 异步 | 见下 | `init.js:498-513` |
| `Network.fetchBytes(method, url, headers?, data?, extra?)` | `Promise<{status, headers, body: ArrayBuffer}>` | 异步 | 同上 | `init.js:471-487` |
| `Network.get(url, headers?, extra?)` | 同 `sendRequest` | 异步 | — | `init.js:522-524` |
| `Network.post(url, headers?, data?, extra?)` | 同上 | 异步 | — | `init.js:534-536` |
| `Network.put(url, headers?, data?, extra?)` | 同上 | 异步 | — | `init.js:546-548` |
| `Network.patch(url, headers?, data?, extra?)` | 同上 | 异步 | — | `init.js:558-560` |
| `Network.delete(url, headers?, extra?)` | 同上 | 异步 | — | `init.js:569-571` |
| `Network.setCookies(url, cookies)` | `undefined`（**无 return**） | 同步发射，无回执 | 无 | `init.js:578-585` |
| `Network.getCookies(url)` | `Cookie[]`（**同步返回，不是 Promise**） | **同步** | 无 | `init.js:592-598`；Dart `:503-523` 直接 `return cookies.map(...).toList()`；文档确认 `doc/api/js.zh.md:49` |
| `Network.deleteCookies(url)` | `undefined`（**无 return**） | 同步发射，无回执 | 无 | `init.js:604-610` |

**错误语义（很重要，容易踩）**：

```dart
} catch (e) { error = e.toString(); }              // js_engine.dart:315-317
return { "status":..., "headers":..., "body":..., "error": error };  // :330-335
```
```javascript
if (result.error) { throw result.error; }          // init.js:508-510（sendRequest）
if (result.error) { throw result.error; }          // init.js:482-484（fetchBytes）
```

→ **脚本 `catch` 到的 `e` 是一个 Dart `toString()` 出来的字符串，不是 `Error` 对象**。因此 `e.message` / `e.name` / `e.stack` 全是 `undefined`，`catch (e) { e.message }` 这种写法拿不到信息，必须 `String(e)`。
→ 出错时 `status === null`、`headers === {}`、`body === null`（`js_engine.dart:330-335`，`response?` 为 null）。
→ 4xx/5xx **不抛异常**（`validateStatus: (status) => true`，`js_engine.dart:125,287`；`throwOnStatusCode: false`，`app_dio.dart:249`），脚本**必须**自己检查 `status`（`doc/api/js.zh.md:15`）。

**`extra` 的真实地位**：Dart 侧只是 `Map.from(req["extra"] ?? {})` 直接塞进 Dio 的 `Options(extra:)`（`js_engine.dart:278,312`）。它**不是** RequestInit、**不是**超时配置（`doc/api/js.zh.md:27` 已明确）。真正被宿主识别的只有下面 §3.3 列出的三个**通过 `headers` 传递**的魔法键。

### 1.3 `fetch`（`init.js:620-655`）

```javascript
async function fetch(url, options) // options = {method?, headers?, body?}
```

返回对象：`{ok, status, statusText, headers, arrayBuffer(), text(), json()}`。

| 成员 | 值 | 证据 |
|---|---|---|
| `ok` | `status >= 200 && status < 300` | `init.js:634` |
| `statusText` | **恒为 `''`** | `init.js:636` |
| `headers` | 普通对象（宿主 `Map<String,String>`，多值用 `,` join） | `init.js:637`；`js_engine.dart:321-323` |
| `arrayBuffer()` | `Promise<ArrayBuffer>` | `init.js:638` |
| `text()` | `Promise<string>`，内部 `Convert.decodeUtf8(body)` | `init.js:639` |
| `json()` | `Promise<any>`；失败时抛 `SyntaxError`，消息含 URL/status/content-type/原始错误 | `init.js:640-653` |

没有 `Headers` 实例、没有流式 Response、没有 `AbortSignal`（`doc/api/js.zh.md:58`）。
`fetch` 内部走 `Network.fetchBytes`，因此**不传 `extra`**（`init.js:631`）→ 用 `fetch` 时**无法**使用 `cache-time` / `prevent-parallel` / `http_client`。

### 1.4 HTML（`init.js:660-993`）

| 名字 | 签名 | 返回 | 同步/异步 | 证据 |
|---|---|---|---|---|
| `new HtmlDocument(html) ` | 构造 | 实例 | 同步 | `init.js:669-678` |
| `HtmlDocument.querySelector(sel)` | — | `HtmlElement \| null` | 同步 | `init.js:685-694` |
| `HtmlDocument.querySelectorAll(sel)` | — | `HtmlElement[]` | 同步 | `init.js:701-709` |
| `HtmlDocument.getElementById(id)` | — | `HtmlElement \| null` | 同步 | `init.js:728-737` |
| `HtmlDocument.dispose()` | — | `undefined` | 同步 | `init.js:715-721` |
| `new HtmlElement(k, doc)` | **内部使用**，不要自己构造 | — | — | `init.js:753-756` |
| `HtmlElement.text` (getter) | — | `string` | 同步 | `init.js:762-769` |
| `HtmlElement.innerHTML` (getter) | — | `string` | 同步 | `init.js:849-856` |
| `HtmlElement.attributes` (getter) | — | `Object`（`{属性名: 值}`） | 同步 | `init.js:775-782`；Dart `:730-734` |
| `HtmlElement.classNames` (getter) | — | `string[]` | 同步 | `init.js:877-884` |
| `HtmlElement.id` (getter) | — | `string \| null` | 同步 | `init.js:890-897` |
| `HtmlElement.localName` (getter) | — | `string` | 同步 | `init.js:903-910` |
| `HtmlElement.querySelector(sel)` | — | `HtmlElement \| null` | 同步 | `init.js:789-799`（Dart `dom_querySelector`） |
| `HtmlElement.querySelectorAll(sel)` | — | `HtmlElement[]` | 同步 | `init.js:806-815` |
| `HtmlElement.children` (getter) | — | `HtmlElement[]` | 同步 | `init.js:821-829` |
| `HtmlElement.nodes` (getter) | — | `HtmlNode[]` | 同步 | `init.js:835-843` |
| `HtmlElement.parent` (getter) | — | `HtmlElement \| null` | 同步 | `init.js:862-871` |
| `HtmlElement.previousElementSibling` (getter) | — | `HtmlElement \| null` | 同步 | `init.js:916-925` |
| `HtmlElement.nextElementSibling` (getter) | — | `HtmlElement \| null` | 同步 | `init.js:931-940` |
| `new HtmlNode(k, doc)` | 内部 | — | — | `init.js:948-951` |
| `HtmlNode.text` (getter) | — | `string` | 同步 | `init.js:957-964` |
| `HtmlNode.type` (getter) | — | `"text"\|"element"\|"comment"\|"document"\|"unknown"` | 同步 | `init.js:970-977`；枚举映射 Dart `:789-796` |
| `HtmlNode.toElement()` | — | `HtmlElement \| null` | 同步 | `init.js:983-992` —— ⚠️ **永远是 `null`，见 §2.4** |

**没有的东西**：没有全局 `document`、没有全局 `querySelector`、没有 `getAttribute`（用 `element.attributes["href"]`，`doc/api/js.zh.md:72`）、没有 `getElementsByClassName`/`TagName`、没有 XPath、没有 `cloneNode`、没有 `textContent`（只有 `text`）、没有 `matches()`、没有 `offsetParent` 之类布局属性。

### 1.5 Convert（`init.js:27-361`，**全部同步**）

`doc/api/js.zh.md:132` 明确"以下函数为同步调用"；Dart `_convert` 也是同步函数（`js_engine.dart:212-213, 538`）。

| API | 参数 | 返回 | 失败行为 | 证据 |
|---|---|---|---|---|
| `Convert.encodeUtf8(str)` | string | `ArrayBuffer` | — | `init.js:32-39` |
| `Convert.decodeUtf8(bytes)` | ArrayBuffer | string | 非法 UTF-8 → 抛错（Dart `utf8.decode` 默认严格） | `init.js:45-52`；`js_engine.dart:545` |
| `Convert.encodeGbk(str)` | string | `ArrayBuffer` | — | `init.js:58-65` |
| `Convert.decodeGbk(bytes)` | ArrayBuffer | string | — | `init.js:71-78` |
| `Convert.encodeBase64(bytes)` | ArrayBuffer | string | — | `init.js:84-91` |
| `Convert.decodeBase64(text)` | string | `ArrayBuffer` | 非法输入 → 抛错 | `init.js:97-104`；`js_engine.dart:552` |
| `Convert.md5(bytes)` | ArrayBuffer | `ArrayBuffer` | — | `init.js:110-117` |
| `Convert.sha1(bytes)` | ArrayBuffer | `ArrayBuffer` | — | `init.js:123-130` |
| `Convert.sha256(bytes)` | ArrayBuffer | `ArrayBuffer` | — | `init.js:136-143` |
| `Convert.sha512(bytes)` | ArrayBuffer | `ArrayBuffer` | — | `init.js:149-156` |
| `Convert.hmac(key, value, hash)` | ArrayBuffer, ArrayBuffer, `md5\|sha1\|sha256\|sha512` | `ArrayBuffer` | 未知 hash → 抛 `"Unsupported hash: X"` | `init.js:164-173`；`js_engine.dart:564-570` |
| `Convert.hmacString(key, value, hash)` | 同上 | 十六进制 **string** | 同上 | `init.js:181-191`；`js_engine.dart:571-573` |
| `Convert.hexEncode(bytes)` | ArrayBuffer | string | — | **纯 JS 实现**（不经桥）：`init.js:347-360` |
| `Convert.encryptAesEcb(value, key)` | ArrayBuffer×2 | `ArrayBuffer` | 长度非块整数倍 → 抛错 | `init.js:198-206`；`js_engine.dart:576-585` |
| `Convert.decryptAesEcb(value, key)` | 同上 | `ArrayBuffer` | 同上 | `init.js:213-221` |
| `Convert.encryptAesCbc(value, key, iv)` | +iv | `ArrayBuffer` | 同上 | `init.js:229-238`；`js_engine.dart:586-596` |
| `Convert.decryptAesCbc(value, key, iv)` | 同上 | `ArrayBuffer` | 同上 | `init.js:246-255` |
| `Convert.encryptAesCfb(value, key, iv, blockSize)` | +blockSize | `ArrayBuffer` | — | `init.js:264-274`；`js_engine.dart:597-608` |
| `Convert.decryptAesCfb(value, key, iv, blockSize)` | 同上 | `ArrayBuffer` | — | `init.js:283-293` |
| `Convert.encryptAesOfb(value, key, blockSize)` | **无 iv 参数** | `ArrayBuffer` | — | `init.js:301-310`；`js_engine.dart:609-619`（`cipher.init(isEncode, KeyParameter(key))`，**未传 IV**） |
| `Convert.decryptAesOfb(value, key, blockSize)` | 同上 | `ArrayBuffer` | — | `init.js:318-327` |
| `Convert.decryptRsa(value, key)` | value, key=Base64 PKCS#8 私钥 DER **字符串** | `ArrayBuffer` | 解析失败 → `null`（被 `catch` 吞掉） | `init.js:334-342`；`js_engine.dart:620-660` |
| `Convert.encryptRsa` | — | — | **不存在**（`_convert` 的 `rsa` 分支 `isEncode==true` 时 `return null`） | `js_engine.dart:621-630` |

**AES 无自动 padding**（`doc/api/js.zh.md:149`，与 `processBlock` 循环实现一致：`js_engine.dart:580-584`）。
**OFB 缺 IV**（`doc/api/js.zh.md:146,149`，与 `:613` 一致）。
**`_convert` 的兜底**：任何内部异常都被 `catch` 成 **静默返回 `null`**（`js_engine.dart:634-637`，只写日志）。所以 `decodeBase64` 之类失败可能表现为 `null` 而不是抛错，**使用前必须判空**（`doc/api/js.zh.md:132` 已提醒）。

### 1.6 Image（**仅 `modifyImage` 上下文可用**，`init.js:1240-1349`）

| API | 返回 | 同步/异步 | 证据 |
|---|---|---|---|
| `image.width` / `image.height` (getter) | number | 同步 | `init.js:1324-1338` |
| `image.copyRange(x, y, width, height)` | `Image \| null` | 同步 | `init.js:1254-1266` |
| `image.copyAndRotate90()` | `Image \| null` | 同步 | `init.js:1272-1280` |
| `image.fillImageAt(x, y, other)` | `undefined`（无 return） | 同步 | `init.js:1288-1297` |
| `image.fillImageRangeAt(x, y, other, srcX, srcY, width, height)` | `undefined`（无 return） | 同步 | `init.js:1309-1322` |
| `Image.empty(width, height)` (static) | `Image` | 同步 | `init.js:1340-1348` |
| `new Image(key)` | 内部；仅 `modifyImage` 引擎会自动注入一个已解码实例 | — | `init.js:1242-1244`、`image_processing.dart:344-351` |

**边界（很容易踩）**：
- 该引擎的 `sendMessage` **只处理 `method === 'image'`**，其他一切（`Network`、`Convert`、`log`、`ComicSource`…）**静默返回 `null`**：`image_processing.dart:260-325`（对比主引擎的 `js_engine.dart:174-268`）。
- 越界坐标 → Dart `ArgumentError`（`image_processing.dart:57-162` 各方法均校验）。
- `modifyImage` 在**独立 isolate** 内执行，**不能**捕获源实例或主引擎闭包（`doc/api/js.zh.md:167`；`image_processing.dart:339` 用 `Isolate.run`）。
- 并发上限 **4**（`image_processing.dart:328` `_AsyncSemaphore(4)`）。

### 1.7 UI（`init.js:1355-1458`；Dart `components/js_ui.dart`）

| API | 签名 | 返回 | 同步/异步 | 参数契约 | 证据 |
|---|---|---|---|---|---|
| `UI.showMessage(message)` | — | **`undefined`（无 return）** | 同步发射 | 空串被忽略 | `init.js:1360-1366`；`js_ui.dart:20-24` |
| `UI.showDialog(title, content, actions)` | `actions: [{text, callback, style}]` | **`undefined`（无 return）** | 同步发射 | `style ∈ {text, filled, danger}`，默认 `text`；`callback` 必须是函数，否则该按钮**被跳过**；`actions` 为空时自动加 OK 按钮 | `init.js:1376-1384`；`js_ui.dart:65-111`、`:240-268`、`:88-97` |
| `UI.launchUrl(url)` | — | **`undefined`（无 return）** | 同步发射 | 空串忽略 | `init.js:1390-1396`；`js_ui.dart:27-31` |
| `UI.showLoading(onCancel?)` | `onCancel: ()=>void` | `number`（loading id） | 同步 | `onCancel` 非函数时**直接返回 `undefined`**；`onCancel` 为 null/undefined 时弹窗**不可取消** | `init.js:1404-1410`；`js_ui.dart:32-37`、`:113-131` |
| `UI.cancelLoading(id)` | — | **`undefined`（无 return）** | 同步发射 | id 非 int 则忽略 | `init.js:1417-1423`；`js_ui.dart:38-42` |
| `UI.showInputDialog(title, validator?, image?)` | `validator: (v)=>string\|null\|undefined` | `Promise<string \| null>` | 异步 | `title` 非 string → 返回 `undefined`（**不是 Promise**）；`validator` 非函数 → 忽略校验；`image` 可为 URL string / `Uint8List` / `List<int>`；取消→`null` | `init.js:1432-1440`；`js_ui.dart:43-49`、`:138-176` |
| `UI.showSelectDialog(title, options, initialIndex?)` | `options: string[]` | `Promise<number \| null>`，索引从 0 | 异步 | `title` 非 string 或 `options` 非 List → 返回 `undefined`；`options` 为空 → `null`；`initialIndex` 越界 → 置 `null`（用第一个） | `init.js:1449-1457`；`js_ui.dart:50-61`、`:178-195` |

**与文档的冲突（以代码为准）**：`init.js:1373` 的 JSDoc 写 `@returns {Promise<void>}`，但函数体**没有 `return`**（`init.js:1376-1384`），所以 `UI.showDialog` 返回 `undefined`，无法 await。`doc/api/js.zh.md:121` 的正文描述（"当前 JS 包装不返回可等待的关闭 Promise"）**与代码一致**，JSDoc 是过时的。同理 `UI.showMessage`/`launchUrl`/`cancelLoading` 也是 fire-and-forget。

`doc/api/js.zh.md:121` 说"actions … 任何 action 都会关闭对话框"，与 `js_ui.dart:82-84`（回调结束后 `dialogContext.pop()`）一致。
UI 字符串**不自动翻译**（`doc/api/js.zh.md:128`）。

### 1.8 APP（`init.js:1464-1492`）

| 属性 | 类型 | 值来源 | 证据 |
|---|---|---|---|
| `APP.version` | string | 注入的 `appVersion` 全局 | `init.js:1469-1471`；`js_engine.dart:159` |
| `APP.locale` | string | `"${languageCode}_${countryCode}"` | `init.js:1477-1481`；`js_engine.dart:237` |
| `APP.platform` | string | `Platform.operatingSystem` ∈ `android\|ios\|windows\|macos\|linux` | `init.js:1487-1491`；`js_engine.dart:239` |

⚠️ `doc/api/js.zh.md:114` 提醒：无地区语言可能返回 `en_null`；`ComicSource.translate` **按完整 locale 精确查表**（`init.js:1227-1230`，`this.translation[locale]?.[key] ?? key`），**没有语言回退**。

### 1.9 剪贴板（`init.js:1501-1518`）

| API | 返回 | 同步/异步 | 证据 |
|---|---|---|---|
| `setClipboard(text)` | `Promise<void>` | 异步 | `init.js:1501-1506`；`js_engine.dart:240-241` |
| `getClipboard()` | `Promise<string \| null>` | 异步 | `init.js:1514-1518`；`js_engine.dart:242-246` |

### 1.10 日志 / 计时 / 计算（`init.js:19-24, 372-442, 995-1014, 1527-1533`）

| API | 签名 | 返回 | 同步/异步 | 行为与陷阱 | 证据 |
|---|---|---|---|---|---|
| `log(level, title, content)` | `level ∈ info\|warning\|error` | `undefined`（无 return） | 同步发射 | 未知 level → 降级 `warning`；`content` 被 `toString()`，`null` → `"null"` | `init.js:995-1002`；`js_engine.dart:180-191` |
| `console.log(value)` | **仅单参数** | `undefined` | 同步发射 | → `log('info','JS Console',value)` | `init.js:1005-1007` |
| `console.warn(value)` | 单参数 | `undefined` | 同步发射 | → `level='warning'` | `init.js:1008-1010` |
| `console.error(value)` | 单参数 | `undefined` | 同步发射 | → `level='error'` | `init.js:1011-1013` |
| `createUuid()` | — | `string`（**UUID v1**，基于时间） | 同步 | 每次不同，需复用请自行持久化 | `init.js:372-376`；`js_engine.dart:223` |
| `randomInt(min, max)` | — | `number`（int） | 同步 | `min` 缺省 0，`max` 缺省 1；**非加密安全**，不要用于令牌 | `init.js:384-391`；`js_engine.dart:214-219, 692-697` |
| `randomDouble(min, max)` | — | `number` | 同步 | 同上 | `init.js:399-406` |
| `setTimeout(callback, delayMs)` | — | **`undefined`**（**无 timer id，无 `clearTimeout`**） | 异步回调 | 实现为 `sendMessage({method:'delay'}).then(callback)` | `init.js:19-24`；Dart `js_engine.dart:230-233`（注释明说是临时方案，TODO 未实现原生 setTimeout） |
| `setInterval(callback, delayMs)` | — | `_Timer` 对象，用 `timer.cancel()` 停止 | 异步回调 | 用**递归 `setTimeout`** 实现 → 有累积漂移；`cancel()` 后不再排下一轮（当前轮已入队仍会跑） | `init.js:408-442` |
| `compute(functionCode, ...args)` | `functionCode` **必须是字符串** | `Promise<any>` | 异步 | 见下 | `init.js:1527-1533`；`js_engine.dart:247-260` |

**`compute` 的完整契约与陷阱**：

1. 传函数对象 → 抛 `"Function must be a string"`（`js_engine.dart:250-253`）。
2. `args` 非 List → 抛 `"Args must be a list"`（`:257-259`）。
3. 代码在 `JSPool` 中执行，**必须求值为一个函数**，否则抛 `"The provided code does not evaluate to a function."`（`js_pool.dart:199-204`）；该函数以 `args` 数组为**唯一参数**（`js_pool.dart:205`）。
4. 池中引擎**加载了完整 init.js**（`js_pool.dart:57, 190, 168`），所以 `Convert`/`Network` 等**名字上存在**；但——
5. ⚠️ **`compute` 内部的源数据桥未配置**：`JsSourceDataBridge` 是**静态字段**（`js_engine.dart:86, 108-109`），Dart 静态字段**按 isolate 隔离**，而池 isolate 只调用 `JsEngine.cacheJsInit` + `init()`（`js_pool.dart:188-191`），**从未**调用 `configureComicSourceDataBridge`（唯一调用点：`js_engine.dart:90`、`features/comic_source/js_bridge.dart:12,23`，都在主 isolate）。→ 在 `compute` 里调 `this.loadData(...)` / `loadSetting` / `isLogged` 会抛 `"JS source data bridge is not configured."`。
   *（此条为**基于 Dart isolate 语义 + 代码调用点的强推断**，未实测；如需确证需运行该测试环境。）*
6. 池规模 4，调度策略"选 pending 最少的实例"（`js_pool.dart:100-112`）。
7. 不得用于长期异步网络任务（`doc/api/js.zh.md:196`）。

### 1.11 数据构造器（`init.js:1031-1143`）

| 构造器 | 参数 | 说明 | 证据 |
|---|---|---|---|
| `new Comic({...})` | `id, title, subtitle, subTitle, cover, tags, description, maxPage, language, favoriteId, stars` | `subTitle` 与 `subtitle` **都原样保留**（不做归一化） | `init.js:1031-1043` |
| `new ComicDetails({...})` | `title, subtitle, subTitle, cover, description, tags, chapters, isFavorite, subId, thumbnails, recommend, commentCount, likesCount, isLiked, uploader, updateTime, uploadTime, url, stars, maxPage, comments` | 只有这里做了 `this.subtitle = subtitle ?? subTitle` | `init.js:1070-1091`（归一化在 `:1072`） |
| `new Comment({...})` | `userName, avatar, content, time, replyCount, id, isLiked, score, voteStatus` | `voteStatus ∈ {1,0,-1}` | `init.js:1106-1116` |
| `new Cookie({name, value, domain?})` | — | **只有 3 个字段可设**；`path`/`expires`/`secure`/`httpOnly` 不可设 | `init.js:451-455`；Dart `js_engine.dart:494-501` 只读这三个 |
| `new ImageLoadingConfig({...})` | `url, method, data, headers, onResponse, modifyImage, onLoadFailed` | 注释明说"为兼容旧版本，**不要用构造函数**，直接写字面量对象" | `init.js:1135-1143`（注释在 `:1133`） |

**桥接归一化的硬规则**（`normalization.dart`）：

- 所有跨桥对象**键必须是 string**，否则整份数据判定为无效：`normalization.dart:10-23`（`key is! String` → `return null`）。
- 列表元素必须是 string，否则无效：`normalization.dart:25-37`。
- `ComicDetails.tags` 必须是 **Map**；Map 中 value 非 List 的条目被**静默跳过**（`normalization.dart:66-87`，注意 `:74-76` 是 `continue` 而非失败）。
- 因此 `Map`/`Set`/任意类实例不能跨桥（`doc/api/comic_source.zh.md:84`）——与上述实现一致。

### 1.12 ComicSource 基类与实例 API

**基类字段**（`init.js:1145-1154`）：

```javascript
class ComicSource {
    name = ""; key = ""; version = ""; minAppVersion = ""; url = "";
    translation = {};          // init.js:1219
    static sources = {};       // init.js:1234
    ...
}
```

⚠️ `minAppVersion = ""` 的默认值是**致命的**，见 §5.3。

**实例方法/属性**（全部经桥）：

| API | 返回 | 同步/异步 | 实现 | 证据 |
|---|---|---|---|---|
| `this.loadData(dataKey)` | `any`（该 `key` 的持久化数据项） | **同步** | `js_bridge.dart:33-35` → `source.data[dataKey]` | `init.js:1161-1167`；`js_engine.dart:192-195` |
| `this.saveData(dataKey, data)` | 返回 `sendMessage(...)` 的值 | 发起即返回；**不是落盘完成的承诺** | `js_bridge.dart:37-41`：写入内存 `data` 后 `saveData()`（异步、可合并、失败会重试到 `.data.update` 原子替换） | `init.js:1187-1194`；`source.dart:178-229`；`doc/api/js.zh.md:97` |
| `this.deleteData(dataKey)` | 同上 | 同上 | `js_bridge.dart:43-47` | `init.js:1200-1206` |
| `this.loadSetting(key)` | `any` | **同步** | `js_bridge.dart:49-54`：`data["settings"]?[key] ?? settings[key]['default'] ?? throw` | `init.js:1174-1180` |
| `this.isLogged` (getter) | `boolean` | **同步** | `js_bridge.dart:56-58` → `source.isLogged` = `data["account"] != null` | `init.js:1212-1217`；`source.dart:102` |
| `this.translate(key)` | `string`（找不到返回原文 key） | **同步，纯 JS** | `this.translation[APP.locale]?.[key] ?? key` | `init.js:1227-1230` |
| `ComicSource.sources` (static) | `{key: 实例}` | — | 宿主注册：`parser.dart:231-233`；宿主管理，**源脚本不要自己写**（`doc/api/comic_source.zh.md:78`） | `init.js:1234`；`parser.dart:218-233` |

**`saveData` 的保留键**：`dataKey === 'setting'`（**单数**）被 Dart 侧**拒绝**并抛 `"setting is not allowed to be saved"`（`js_engine.dart:199-201`）。
注意**设置实际存放在 `dataKey === 'settings'`（复数）**下（`js_bridge.dart:51`；`comic_source_page.dart:786-787`），所以"用 `saveData("setting", …)` 覆盖设置"之所以危险，是因为它会污染另一个键空间；文档的警告在 `doc/api/comic_source.zh.md:325`。

**宿主注册与撤销**：解析时先保存回滚闭包（`parser.dart:221-229`），成功后 `commit()`（`parser.dart:103-106`），失败 `rollback()`（`parser.dart:95-101`）。

### 1.13 回调契约（宿主如何调用源）—— 同步/异步一览

| 回调 | 宿主调用方式 | 是否 await | 证据 |
|---|---|---|---|
| `init()` | 特殊包装，**最多等 15s** | 是（若返回 thenable） | `comic_source_manager.dart:225-233` |
| `comic.loadInfo(id)` | `runReadCode` | 是 | `parser.dart:838-852` |
| `comic.loadEp(id, ep)` | `runReadCode` | 是 | `parser.dart:854-868` |
| `comic.loadThumbnails(id, next)` | `runReadCode` | 是 | `parser.dart:1160-1177` |
| `comic.onImageLoad(key, cid, eid)` | `runCode` + 手动 `if (res is Future) await res` | **可以异步** | `parser.dart:1122-1141`（`:1131-1133`） |
| `comic.onThumbnailLoad(key)` | `runCode`，**立即归一化，不 await** | ❌ **必须同步** | `parser.dart:1143-1158`（`:1147` 是同步闭包） |
| `comic.loadComments` / `loadChapterComments` | `runReadCode` | 是 | `parser.dart:1028-1044`、`:1075-1091` |
| `comic.sendComment` / `sendChapterComment` | `runCode` | 是 | `parser.dart:1046-1073`、`:1093-1120` |
| `comic.likeComic` / `voteComment` / `likeComment` / `starRating` | `runCode` | 是 | `parser.dart:1179-1228`、`:1299-1314` |
| `comic.archive.getArchives` / `getDownloadUrl` | `runReadCode` | 是 | `parser.dart:1316-1348` |
| `comic.onClickTag(ns, tag)` | `runCode`，**同步取 Map** | ❌ 必须同步 | `parser.dart:1254-1269`（`:1259` 后立刻判 `res is! Map`） |
| `comic.link.linkToId(url)` | `runCode`，`res as String?` | ❌ 必须同步 | `parser.dart:1284-1297` |
| `search.onTagSuggestionSelected(ns, tag)` | `runCode` | ❌ 必须同步 | `parser.dart:1271-1282` |
| `search.load` / `search.loadNext` | `runReadCode` | 是 | `parser.dart:807-833` |
| `explore[i].load` / `loadNext` | `runReadCode` | 是 | `parser.dart:382-533` |
| `categoryComics.*` | `runReadCode` | 是 | `parser.dart:630-777` |
| `favorites.*`（除 `logout`） | `runReadCode` | 是 | `parser.dart:870-1026` |
| `account.login` / `logout` / `loginWithWebview.checkStatus` / `loginWithCookies.validate` | `runCode` | login 是；`checkStatus` **同步**（`parser.dart:338-343` 无 await）；`validate` 经 `runReadCode` 且 await（`:357-367`） | `parser.dart:304-380` |
| `settings.<k>.callback` | 直接 `func([])`，返回 Future 则显示 loading | 是 | `comic_source_page.dart:618-633` |
| `category` 里 `type:"dynamic"` 的 `loader()` | `JSAutoFreeFunction` 保存，**调用点不在 parser** | — | `parser.dart:573-581` |

⚠️ **`onThumbnailLoad` 必须同步的真相**：`parser.dart:1147` 的闭包是**同步**的，如果源返回 Promise，`normalizeComicSourceLoadingConfig(Promise)`（`normalization.dart:6-12`，非 Map → `null`）会失败并抛 `"function onThumbnailLoad return invalid data"`（`parser.dart:1152-1155`）。这与 `doc/api/comic_source.zh.md:237`、`doc/api/js.zh.md:206` 完全一致。

### 1.14 ❌ 明确**不存在**的名字（任务清单逐项核对）

对仓库内全部 `.js` 做全量正则检索，**零命中**（搜索式见下），逐个确认：

| 假设的名字 | 是否存在 | 正确的替代 | 核对依据 |
|---|---|---|---|
| `http_get` | ❌ **不存在** | `Network.get(url, headers?, extra?)` | grep `http_get` 于 `*.js` → 0 命中；`assets/init.js:522` |
| `http.post` / `http` 对象 | ❌ **不存在** | `Network.post(...)` | grep `\bhttp\b` → 仅 `init.js` 注释与 `http_method` 字段 |
| `html`（函数） | ❌ **不存在** | `new HtmlDocument(str)` | `init.js:660` |
| `document`（全局） | ❌ **不存在** | `new HtmlDocument(str)` 的局部变量 | grep `\bdocument\b` 于 `*.js` → 仅 JSDoc 散文（`init.js:681,697,712,751,968`） |
| `querySelector`（全局） | ❌ **不存在** | `doc.querySelector(...)` | grep `querySelector\b` → 仅类方法定义（`init.js:685,789`） |
| `localStorage` | ❌ **不存在** | ① `this.loadData/saveData`；② **webview 登录后宿主会把页面 localStorage 存进数据键 `_localStorage`** | grep `localStorage` 于 `*.js` → 0；存储点：`comic_source_page.dart:1139`、`:1214` |
| `sessionStorage` | ❌ 不存在 | — | grep → 0 |
| `XMLHttpRequest` | ❌ 不存在 | `Network.*` / `fetch` | grep → 0 |
| `btoa` / `atob` | ❌ **不在 init.js**（引擎是否内建 → UNKNOWN，见 §4.2） | `Convert.encodeBase64` / `decodeBase64` | grep → 0 |
| `base64`（全局） | ❌ 不存在 | `Convert.*` | grep `base64_encode` → 0；`Convert` 在 `init.js:84-104` |
| `crypto`（全局） | ❌ 不存在 | `Convert.md5/sha1/sha256/sha512/hmac*`、`createUuid()` | grep → 0；`init.js:110-191` |
| `crypto.subtle` | ❌ 不存在 | 同上 | 同上 |
| `setting`（全局） | ❌ 不存在（"setting" 只是**被保留的数据键名**） | `this.loadSetting(key)`；定义放类字段 `settings` | grep；`js_engine.dart:199-201`；`init.js:1174` |
| `toast` | ❌ 不存在 | `UI.showMessage(msg)` | grep → 0；`init.js:1360` |
| `sleep` | ❌ 不存在 | `setTimeout` + Promise 封装；或 `await sendMessage({method:'delay'})` 等价的 `new Promise(r => setTimeout(r, ms))` | grep `sleep\(` → 0；`init.js:19` |
| `GM_*`（油猴 API） | ❌ 不存在 | — | grep `GM_` → 0 |
| `require` / `module.exports` | ❌ **不存在且被明确禁止** | 无需替代：单文件自包含 | grep → 0；`doc/api/comic_source.zh.md:18` |
| `import` / `export` | ❌ **不存在且被禁止** | 同上 | grep `import\s` 于 `*.js` → 0；`parser.dart:184` 的函数体包裹使语法非法 |
| `window` / `navigator` | ❌ 不存在 | `APP.platform` / `APP.locale` | `doc/api/js.zh.md:9` 明示无 DOM 全局 |
| `Buffer` / `process` / `fs` | ❌ 不存在 | `Convert` 处理二进制 | `doc/api/js.zh.md:9` 明示非 Node |

### 1.15 搜索式（可复现）

```
grep -P '\b(http_get|http_post|localStorage|sessionStorage|XMLHttpRequest|\bdocument\b|querySelector\b|base64_encode|btoa|atob|toast|sleep\(|GM_|require\(|module\.exports|import\s)' -g '*.js'
```
→ 仅返回 `assets/init.js` 中 `querySelector` 的**方法定义**与 `document` 的**JSDoc 散文**，无任何"可用全局"。

---

## 2. HTML 解析方式与选择器能力边界

### 2.1 是自研还是库？

**都不是浏览器，也不是 XPath**：宿主用 Dart 的 **`package:html` 0.15.7**（`pubspec.yaml:25`）解析，用它的 `querySelector` 做 CSS 选择。

```dart
import 'package:html/parser.dart' as html;      // js_engine.dart:10
import 'package:html/dom.dart' as dom;          // js_engine.dart:11
DocumentWrapper.parse(String doc) : doc = html.parse(doc);   // js_engine.dart:703
var element = doc.querySelector(query);                      // js_engine.dart:710
var res = doc.querySelectorAll(query);                       // js_engine.dart:717
var element = doc.getElementById(id);                        // js_engine.dart:819
```

**不执行页面脚本**：`html.parse` 是纯解析器，没有 JS 引擎/事件循环（`doc/api/js.zh.md:62` 明示）。

### 2.2 元素/节点寻址模型（性能与内存边界）

元素和节点**不跨桥传输**，而是**按整数句柄索引**存放在 Dart 侧：

```dart
var elements = <dom.Element>[];   // js_engine.dart:705
var nodes    = <dom.Node>[];      // js_engine.dart:707
int? querySelector(String query) { ... elements.add(element); return elements.length - 1; }  // :709-714
```

→ **每次查询都把新元素追加进数组，永不回收**（只有 `dispose()` 丢弃整个 `_documents` 条目）。
→ 同一 document 上做大量 `querySelectorAll` 会**单调增长内存**。
→ **文档数上限 8**，超出时按插入顺序删最旧的并打 warning：`js_engine.dart:422-431`（`if (_documents.length > 8)`）。
→ `dispose()` 后继续用旧 handle → 访问 `elements[...]` 的悬垂行为（`_documents[key]!` 会抛 null-check 错误），`doc/api/js.zh.md:88` 明确要求"先复制字符串再 dispose"。

⚠️ `elements`/`nodes` **没有** `max-age`/LRU；`handleHtmlCallback` 各分支用 `_documents[...]!` 强解包（如 `:441, 443, 459`），**对已 dispose 的 handle 调用会抛未捕获的 null-check 异常**。

### 2.3 选择器能力边界

`querySelector` 的字符串被**原样**传给 `package:html` → `csslib` 的选择器引擎（`js_engine.dart:710, 717, 748, 755`）。因此能力边界 = **csslib 的实现**，而**不是**浏览器。

**可从本仓库代码确证的**：

- ✅ **属性选择器可用**：`attributes` 是完整属性表（`js_engine.dart:730-734`），且 `doc.querySelectorAll` 接受任意 CSS 字符串 → `[href^="/"]`、`a.comic`（文档示例 `doc/api/js.zh.md:78`）等由 csslib 决定。
- ❌ **XPath 完全不可用**：API 面只接受 CSS selector 字符串，没有任何 XPath 入口（`init.js:685, 701, 789, 806`）。
- ❌ **不支持伪元素**（`::before` 之类）——没有渲染树。
- ❌ **不支持 `:has()`**：csslib 未实现该选择器（推断，见下）。
- ⚠️ **`:nth-child()` / `:nth-of-type()` / `:not()` / `:first-child` / `:last-child` / `:empty`**：这些属于 CSS3 Selectors Level 3，csslib 以支持 Level 3 为目标，**推断可用**。
- ⚠️ **无 `matches()` / `closest()` / `getAttribute()`**：API 面不存在（`init.js:743-941` 全部成员已穷举于 §1.4）。

> **UNKNOWN（选择器具体支持矩阵）**：本机**没有** pub cache 与 `.dart_tool`（实测三个候选路径均不存在），因此 `package:html`/`csslib` 的源码与版本实现不可读。上表中标 ⚠️ 的条目是**基于 csslib 定位的推断**，不是本仓库可证事实。
> **确证方法**：在有依赖的环境执行 `flutter pub get` 后阅读 `~/.pub-cache/hosted/pub.dev/csslib-*/lib/src/selector.dart`，或写一个 App 内 JS Evaluator 用例逐个伪类实测（见 §7.1）。
> **本仓库可确证的上界**：至少在 `doc/api/js.zh.md:78` 的官方示例里只用了 `a.comic` 这种类型+类选择器。

---

## 3. HTTP 层

### 3.1 客户端栈

```dart
class AppDio with DioMixin {                       // app_dio.dart:178
  AppDio([BaseOptions? options]) {
    httpClientAdapter = RHttpAdapter();            // app_dio.dart:181
    if (App.isInitialized) {
      interceptors.add(CookieManagerSql.dynamic(() => SingleInstanceCookieJar.instance)); // :184
      interceptors.add(NetworkCacheManager());      // :186
      interceptors.add(CloudflareInterceptor());    // :187
      interceptors.add(MyLogInterceptor());         // :188
    }
  }
```

- 传输层：`rhttp` 0.15.1（Rust HTTP）封装为 `RHttpAdapter`（`app_dio.dart:235`；`pubspec.yaml:61`）。
- 主引擎持有的 Dio 在 `resetDio()`/`doInit()` 中构造（`js_engine.dart:121-128, 146-151`），使用 `AppDio`。
- **代理**：`getProxy()`（`app_dio.dart:237`，`js_engine.dart:290`）。
- **DNS 覆写**：`appdata.settings['enableDnsOverrides']` + `dnsOverrides`（`app_dio.dart:250, 258-272`）。
- **TLS**：`verifyCertificates: appdata.settings['ignoreBadCertificate'] != true`；`sni: settings['sni'] != false`（`app_dio.dart:251-254`；UI 开关 `features/settings/debug.dart:102-105`）。
- **Cloudflare 拦截器**：`CloudflareInterceptor()`（`app_dio.dart:187`，实现在 `network/cloudflare.dart`）。

### 3.2 Cookie jar：**有，且全局共享**

- `SingleInstanceCookieJar` 单例 + `CookieManagerSql` 拦截器（`app_dio.dart:184`；`js_engine.dart:144` 创建）。
- 脚本可读写删：`Network.setCookies` / `getCookies` / `deleteCookies` → `js_engine.dart:489-536`。
- **`setCookies` 只能设置 `name`/`value`/`domain`**（`js_engine.dart:494-501`），**不能**设置 `path`/`expires`/`maxAge`/`secure`/`httpOnly` → 写出的 cookie 是 session cookie。
- **`getCookies` 返回同步数组**，字段最全：`name, value, domain, path, expires, max-age, secure, httpOnly, session`（`js_engine.dart:509-523`）。
- **`deleteCookies(url)` 是"按 URI 清空"**，不是"删某个 cookie"：`clearCookies([data["url"]])` → `deleteUri(uri)`（`js_engine.dart:524-536`）。
- 设置与登录状态是两套 API（`doc/api/js.zh.md:52`）：`isLogged` 只看 `data["account"]`（`source.dart:102`）。

### 3.3 自定义 header：**可以，且有三个"魔法 header"**

- 任意 header 直接可行，**`Referer` / `User-Agent` 完全可控**（`doc/api/comic_source.zh.md:229-233` 的官方示例；`_http` 不删不改 headers，只在缺失时补 UA：`js_engine.dart:277-281`）。
- **默认 UA**：若 `headers` 未含 `user-agent`/`User-Agent`，补 `webUA`：

```dart
if (headers["user-agent"] == null && headers["User-Agent"] == null) {
  headers["User-Agent"] = webUA;      // js_engine.dart:279-281
}
```
`webUA` = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36`（`foundation/consts.dart:10-11`）。
（对比：`RHttpAdapter` 自己的兜底 UA 是 `VeneraNext/v<version>`（`app_dio.dart:283-286`），但因为 `_http` 已经填了 `webUA`，**脚本通常看不到它**。）

| 魔法 header | 取值 | 作用 | 证据 |
|---|---|---|---|
| `cache-time` | `'no'` \| `'long'` | `'no'` = 跳过并清除该 URI 的短期网络缓存；`'long'` = 6 小时内直接用缓存 | `network/cache.dart:92-101`（no）、`:105-115`（long 6h） |
| `prevent-parallel` | `'true'` | 对**相同 `path`** 的请求串行 | `app_dio.dart:205-213` |
| `http_client` | `'dart:io'` | 绕过 rhttp，改用 `Dio` + `IOHttpClientAdapter`（含代理、cookie jar、LogInterceptor） | `js_engine.dart:283-301` |

**网络缓存细节**（`network/cache.dart`）：
- **仅 GET** 参与缓存（`:86-88, 197-199`）。
- 默认策略：`diff < 5s` 直接命中；`5s ≤ diff < 2h` 发一个 **HEAD 校验**，header 相同则命中；否则清除（`:116-143`）。
- 单条 > 1 MiB 不缓存（`:208`）；缓存总量上限 10 MiB，FIFO 淘汰（`:42, 52-55`）。
- 比较 header 时忽略白名单（`cache-time, prevent-parallel, date, cf-ray, authorization, set-cookie, …`）：`:150-167`。
- 读路径的 `runReadCode` 失败重试会 **`NetworkCacheManager().clear()`**（`js_engine.dart:361`）。

### 3.4 重定向：**脚本无法控制**

```dart
redirectSettings: const rhttp.RedirectSettings.limited(5),   // app_dio.dart:243  ← const，硬编码
```
```dart
response = await dio!.request(req["url"],
  options: Options(
    method: req['http_method'],
    responseType: ..., headers: headers, extra: extra,       // js_engine.dart:306-313
  ));
```
`_http` 构造 `Options` 时**只**设置 `method` / `responseType` / `headers` / `extra`，**从不**读脚本提供的 `followRedirects` / `maxRedirects`。

→ **结论：无法禁止重定向，也无法调整最大跳数（固定 5）**。脚本也拿不到中间 3xx 响应。
`http_client: 'dart:io'` 分支同样只传 `Options(method:, responseType:, headers:, extra:)`（`js_engine.dart:284-296` 构造 Dio，`:302-314` 发请求），所以**即使切到 dart:io 也无法关重定向**。

### 3.5 超时与重试：**超时宿主做，重试宿主做且有限**

| 项 | 值 | 谁控制 | 证据 |
|---|---|---|---|
| connect 超时 | **15 s（硬编码）** | 宿主，脚本不可改 | `app_dio.dart:244-245` |
| keep-alive 超时 / ping | 60 s / 30 s | 宿主 | `app_dio.dart:246-247` |
| RequestOptions 上的 connect/receive/send | 15 s / 15 s / 15 s | 宿主拦截器写入 | `app_dio.dart:171-173` |
| 读路径整体重试 | **最多额外 2 次（共 3 次尝试）** | 宿主 | `js_engine.dart:343-370`（`maxRetries = 2`），测试确证尝试 3 次：`test/features/comic_source/source_lifecycle_test.dart:236` |
| 重试白名单 | ① malformed-JSON 类 `SyntaxError`；② 13 个瞬时网络关键字 | 宿主 | `js_engine.dart:385-415`；`transientNetworkFailures` 列表 `:396-413` |
| 重试退避 | `200ms × (retry+1)`（200/400） | 宿主 | `js_engine.dart:362-367` |
| 图片重试 | **最多 5 次，但仅当提供了 `onLoadFailed`** | 宿主 | `images.dart:307`（`retriesRemaining = 5`）、`:373-388`、`_shouldRetryImageLoad` `:68-73` |
| 追更单本超时 | **45 s** | 宿主 | `follow_updates/follow_updates_manager.dart:22` |
| `init()` 超时 | **15 s** | 宿主 | `comic_source_manager.dart:232` |
| 调试器求值超时 | **30 s** | 宿主 | `features/settings/debug.dart:63` |
| `extra` 能否配超时？ | ❌ **不能** | — | `doc/api/js.zh.md:27` 明确；`_http` 不发任何超时字段（`js_engine.dart:306-313`） |

⚠️ **`runReadCode` 只重试读回调**。写回调（`sendComment`、`likeComic`、`addOrDelFavorite`、`addFolder`、`starRating`…）走 `runCode`，**不重试**（对照 `parser.dart` 中 `runCode` vs `runReadCode` 的调用点）。这与 `doc/api/js.zh.md:198` 的设计意图一致。

⚠️ **超时不中断同步死循环**（`doc/development/source_debugging.zh.md:67`）：`Future.timeout` 只让 Dart 侧放弃等待，QuickJS 仍在该实例上跑；由于是**共享单例**（§0.4），死循环会**卡住所有源**。

### 3.6 并发限制

| 维度 | 限制 | 证据 |
|---|---|---|
| HTTP 全局并发 | **无上限** | 无全局限流代码；`AppDio._requestTails` 只在 `prevent-parallel: 'true'` 时生效（`app_dio.dart:192-213`） |
| HTTP 同 path 串行 | 需显式 `prevent-parallel: 'true'`；**键是 `path` 字符串（不含 query）** | `app_dio.dart:206` `_requestTails[path]` |
| JS 执行 | **1 个实例串行**（所有源共享） | `js_engine.dart:74-78` |
| `compute` 池 | 4 isolate | `js_pool.dart:19` |
| `modifyImage` | 4 并发（信号量） | `image_processing.dart:328` |
| 源安装下载 | 3 并发 | `source_installation.dart:104` |
| 追更检查 | 全局 5 / 同源 2 / 同源启动间隔 ≥500 ms | `follow_update_queue.dart:11-13` |

### 3.7 取消（`RequestScope`）

`RequestScope`（`network/request_scope.dart:12-75`）通过 Zone 传递（`:24-25, 53`），`_http` 把 `scope?.cancelToken` 交给 Dio（`js_engine.dart:304`），并 `scope?.check()`（`:275-276`）。
**边界**（`doc/development/source_debugging.zh.md:65-67`，与代码一致）：QuickJS 的异步调度不总保留 Zone，因此**脚本在 `await` 之后自己发起的子请求不保证被取消**，同步死循环也**无法**被中断。

---

## 4. JS 引擎能力与 ES 级别

### 4.1 引擎身份

| 项 | 值 | 证据 |
|---|---|---|
| 引擎 | QuickJS | `doc/api/js.zh.md:9`；`js_engine.dart:12` import `flutter_qjs` |
| 包装 | `flutter_qjs` 0.3.7 | `pubspec.lock`（`flutter_qjs` → `version: "0.3.7"`） |
| 包装来源 | fork `github.com/CyrilPeng/flutter_qjs`，commit `8feae95df7fb00455df129ad7a0dfec1d0e8d8e4` | `pubspec.yaml:19-22` |
| 引擎分支 | **QuickJS-NG**（fork 历史已迁移，commit `67496e2`） | `doc/development/dependency_audit.zh.md:18`：*"当前历史包含迁移到 QuickJS-NG（`67496e2`）"*；`doc/development/git_dependencies.json:9` |
| 上游标注 | 源码标注 `ekibun/flutter_qjs`，MIT | `doc/development/dependency_audit.en.md:18` |
| **具体 QuickJS-NG 版本号** | **UNKNOWN** | 见下 |

> **UNKNOWN: QuickJS-NG 的确切版本/tag**
> 已查：`doc/development/dependency_audit.{zh,en}.md`、`doc/development/git_dependencies.json`、`pubspec.yaml`、`pubspec.lock`、`CHANGELOG.md`、全仓库 `.md/.json/.yaml/.dart` 的 `quickjs` 关键字检索（仅上表 4 处提及，**均无版本号**）。
> 已查本机是否有依赖源码：`$LOCALAPPDATA\Pub\Cache`、`~\.pub-cache`、`%APPDATA%\Pub\Cache`、`Venera-Next\.dart_tool\package_config.json` → **全部不存在**；`flutter_qjs*` / `quickjs.h` 全用户目录检索 → **0 命中**。
> 结论：无法从本机确证引擎版本。要确证需 `flutter pub get` 后读 `.dart_tool/package_config.json` → fork checkout → 其内嵌 `quickjs-ng` 的 `VERSION`/`quickjs.h` 的 `QJS_VERSION`。

### 4.2 ES 级别：**可确证的下界**（这些语法必须能解析，否则 App 无法启动）

`assets/init.js` 在每次引擎初始化时被整体求值（`js_engine.dart:168`；池内 `js_pool.dart:57`；图片引擎 `image_processing.dart:338`），所以它用到的语法**一定**被支持：

| 特性 | ES 版本 | init.js 证据 |
|---|---|---|
| `??` 空值合并 | ES2020 | `init.js:1072`（`subtitle ?? subTitle`）、`:1229`（`?? key`） |
| `?.` 可选链 | ES2020 | `init.js:1229`（`this.translation[locale]?.[key]`） |
| 类字段初始化器 | ES2022 | `init.js:409-413`、`:1146-1154`、`:1240-1242`、`:1245-1246` |
| **静态**类字段 | ES2022 | `init.js:661`（`static _key = 0`）、`:1234`（`static sources = {}`） |
| 静态方法 | ES2015 | `init.js:1340`（`static empty`） |
| getter | ES2015 | `init.js:762, 775, 821, 835, 849, 862, 877, 890, 903, 916, 931, 957, 970, 1324, 1332` |
| 箭头函数 / 默认参数 | ES2015 | `init.js:19, 32, 451` |
| 解构（含默认值） | ES2015 | `init.js:451`（`{name, value, domain}`）、`:1031, 1070, 1106, 1135` |
| 对象方法简写 / `async` 方法 | ES2017 | `init.js:471, 498, 522` |
| `async` / `await` | ES2017 | `init.js:472, 631` |
| 模板字符串 | ES2015 | `init.js:649-651` |
| 展开调用 / rest 参数 | ES2015 | `init.js:359`（`String.fromCharCode(...charCodes)`）、`:1527`（`...args`） |
| `Uint8Array` / `ArrayBuffer` | ES2015 | `init.js:349-350` |
| `Promise`（跨桥） | ES2015 | `init.js:23`（`.then`）；宿主端确证：`parser.dart:1131`（`if (res is Future)`）、`js_ui.dart:226`、`comic_source_page.dart:621` |
| `class` / `extends` | ES2015 | `init.js:1145, 1240, 743, 943, 660` |

→ **可确证下界：ES2022**（由静态类字段与类字段初始化器决定）。

**另有官方文字证据**：`doc/api/js.zh.md:9` 称源脚本"具有标准 JavaScript 语言能力"，仅排除 DOM / 模块加载器 / npm / 完整 Web API。

### 4.3 具体特性判定表

| 特性 | 判定 | 依据 |
|---|---|---|
| `?.` 可选链 | ✅ **可用** | `init.js:1229` 直接用（必然支持） |
| `??` 空值合并 | ✅ **可用** | `init.js:1072, 1229` |
| `async` / `await` | ✅ **可用**（函数内） | `init.js:471-513`；`parser.dart:1131` |
| `Promise` | ✅ **可用** | `init.js:23`；`parser.dart:1131` |
| 顶层 `await` | ❌ **不可用** | 包裹器是非 async 箭头函数：`parser.dart:184-187` |
| `class` 字段 / 静态字段 | ✅ **可用** | §4.2 |
| `String.prototype.replaceAll` | ⚠️ **UNKNOWN** | 仓库内**无任何 JS 使用**（`replaceAll` 只出现在 **Dart**：`parser.dart:182, 293`、`source_installation.dart:266`）。属 ES2021，理论上 QuickJS-NG 支持，但**本仓库无可证证据** |
| `Array.prototype.at` | ⚠️ **UNKNOWN** | 仓库内无 JS 使用（`elementAtOrNull` 是 Dart 扩展：`parser.dart:41-42`）。属 ES2022 |
| `Object.hasOwn` / `structuredClone` | ⚠️ **UNKNOWN** | 无使用 |
| 正则**命名捕获组** `(?<name>…)` | ⚠️ **UNKNOWN** | 仓库内 JS 正则只有 `init.js:646` 的 `split(/[?#]/, 1)` 与 `:85` 等，无命名组。属 ES2018 |
| 正则 `s`/`d` 标志、lookbehind | ⚠️ **UNKNOWN** | 同上；（注意 Dart 侧用了 lookbehind：`parser.dart:293` `(?<!\?)`，但那是 **Dart** 的 RegExp，与 QuickJS 无关） |
| `Proxy` / `Reflect` | ⚠️ **UNKNOWN** | 仓库内无 JS 使用。核心 ES2015，**很可能支持**，但无可证证据 |
| `TextEncoder` / `TextDecoder` | ⚠️ **UNKNOWN** | 仓库内 0 命中。注意：这是 **QuickJS-NG 的宿主扩展**，不是 ECMAScript 标准，取决于 fork 是否编入 |
| `btoa` / `atob` | ⚠️ **UNKNOWN** | 仓库内 0 命中（§1.14）。同样是宿主/标准库扩展，非核心 ES |
| `encodeURIComponent` | ✅ **可用**（强证据） | **官方模板直接使用**：`doc/examples/minimal_source.js:25, 42, 56, 65-66`。这是仓库内唯一的 `URI` 全局使用证据 |
| `JSON.parse` / `JSON.stringify` | ✅ **可用** | `init.js:643`；`doc/examples/minimal_source.js:18` |
| `Map` / `Set` | ✅ 语言层面可用，但 ❌ **不能跨桥** | `doc/api/comic_source.zh.md:84`；`normalization.dart:11-22` 要求键为 string |
| `Uint8Array` / `ArrayBuffer` | ✅ **可用**（二进制接口） | `init.js:349-350`；`doc/api/js.zh.md:11` |
| `Date` / `Math` | ✅ 标准 | `init.js:430`（仅定时器）；属标准内建 |
| `fetch` | ⚠️ **是 App 的包装，不是浏览器 fetch** | `init.js:620-655`；`doc/api/js.zh.md:58` |
| `console` | ⚠️ **是 App 的包装**，仅 `log/warn/error` 单参数 | `init.js:1004-1014` |
| `setTimeout` / `setInterval` | ⚠️ **是 App 的包装**（无 timer id / 无 clearTimeout） | `init.js:19-24, 438-442` |
| `queueMicrotask` / `requestAnimationFrame` | ❌ 无（App 未提供） | 仓库 0 命中 |
| `Symbol` / `WeakMap` / `BigInt` | ⚠️ **UNKNOWN**（核心 ES 内建，推断可用，无仓库证据） | — |

### 4.4 判定手段（可复现的实证方法）

用 App 内 **JS Evaluator**（§7.1）逐条实测，例如：

```javascript
(() => ({
  at: typeof [].at,
  replaceAll: typeof "".replaceAll,
  proxy: typeof Proxy,
  textEncoder: typeof TextEncoder,
  btoa: typeof btoa,
  namedGroups: (() => { try { return /(?<y>a)/.exec("a").groups.y; } catch (e) { return String(e); } })(),
  es2022static: (() => { try { eval("class A { static x = 1 }"); return A.x; } catch (e) { return String(e); } })(),
}))()
```

---

## 5. 源文件格式与 metadata 字段（全部字段 + 校验规则）

### 5.1 文件与入口

| 项 | 规则 | 证据 |
|---|---|---|
| 编码 | UTF-8 | `doc/api/comic_source.zh.md:18`；读取为字符串 `file.readAsString()`（`parser.dart:137`） |
| 扩展名 | `.js`；无扩展名会被补 `.js` | `parser.dart:119-121` |
| 换行归一化 | **`\r\n` → `\n`**（在解析前） | `parser.dart:182` |
| BOM | 类检测时剥离 `\uFEFF` | `parser.dart:77`（`script.replaceFirst('\uFEFF','')`） |
| 入口类 | 正则 `^\s*class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+extends\s+ComicSource\b`，**多行模式**，取**第一个**匹配 | `parser.dart:73-84` |
| 失败消息 | `'Expected a class declaration extending ComicSource.'` | `parser.dart:78-82`；测试 `test/features/comic_source/source_parser_test.dart:19-27` |
| 文件名净化 | 安装时 `fileName.replaceAll(RegExp(r'[^a-zA-Z0-9_.()-]'), '_')` | `comic_source_manager.dart:266` |
| 落盘路径 | `<App.dataPath>/comic_source/<fileName>`；重名加 `(0)`、`(1)`… 后缀 | `parser.dart:122-135` |
| 禁止 | `import` / `export` / `require` / 依赖浏览器全局变量 | `doc/api/comic_source.zh.md:18`；语法层面由 `parser.dart:184` 保证 |

### 5.2 基类字段（全部 5 个）

来源：`init.js:1145-1154`（基类声明）+ `parser.dart:188-212`（宿主读取与校验）。

| 字段 | init.js 声明 | 宿主读取 | 必填？ | 校验规则 | 失败表现 |
|---|---|---|---|---|---|
| `name` | `name = ""`（`:1146`） | `parser.dart:188-190` | ✅ 逻辑必填 | 仅 `?? throw`：**`null`/`undefined` 才失败**；空字符串 `""` **通过** | `ComicSourceParseException('name is required')` |
| `key` | `key = ""`（`:1148`） | `parser.dart:191-193`；格式校验 `:276-281` | ✅ 逻辑必填 | `null` → 抛错；**且必须匹配 `^[a-zA-Z_][a-zA-Z0-9_]*$`** | `'key is required'` / `"key <k> is invalid"` |
| `version` | `version = ""`（`:1150`） | `parser.dart:194-196` | ✅ 逻辑必填 | 仅判 `null`；**脚本版本的"三段数字"格式完全不做校验**（只有 `index.json` 的 version 才校验，见 §6） | `'version is required'`。默认为 `"1.0.0"` 的兜底（`parser.dart:252`）实际是**死代码**，因为 `null` 已在 `:194-196` 抛错 |
| `minAppVersion` | `minAppVersion = ""`（`:1152`） | `parser.dart:197, 204-212` | ⚠️ **实际上必填**（见 §5.3） | 非 `null` 时执行 `compareSemVer(minAppVersion, App.version.split('-').first)`；为真（要求高于当前 App）→ 抛错 | `"minAppVersion @version is required"`（`parser.dart:206-210`）。**格式错误 → 未捕获的 `FormatException`/`RangeError`** |
| `url` | `url = ""`（`:1154`） | `parser.dart:198, 251` | ❌ 可选 | **完全不校验**。`url ?? ""` | 无。但在无仓库关联时 `updateUrl` 会 `normalizeUrl(source.url)`（`source_repositories.dart:399`），此时非法/空 URL 抛 `'Enter a complete HTTP or HTTPS URL.'` |
| `translation` | `translation = {}`（`:1219`） | `parser.dart:1242-1252` | ❌ 可选 | 必须是 `Map`，且每项 value 能转 `Map<String,String>` | 未捕获类型错误（`_parseTranslation` 无 try/catch） |

### 5.3 ⚠️ 重大陷阱：`minAppVersion` 在实践上**必填**

```javascript
class ComicSource { ... minAppVersion = "" ... }     // init.js:1152 —— 基类默认值是空串
```
```dart
var minAppVersion = JsEngine().runCode("this['temp'].minAppVersion");  // parser.dart:197
if (minAppVersion != null) {                                          // parser.dart:204
  if (compareSemVer(minAppVersion, App.version.split('-').first)) {    // parser.dart:205
```
```dart
bool compareSemVer(String ver1, String ver2) {
  ver1 = ver1.replaceFirst("-", ".");          // parser.dart:25
  List<String> v1 = ver1.split('.');           // parser.dart:27  →  "" → [""]
  for (int i = 0; i < 3; i++) {
    int num1 = int.parse(v1[i]);               // parser.dart:31  →  int.parse("") 抛 FormatException
```

**推导**：任何 `extends ComicSource` 的类都**继承** `minAppVersion = ""`，所以 `this['temp'].minAppVersion` 返回 **`""` 而非 `null`** → `minAppVersion != null` 为真 → `compareSemVer("", appVersion)` → `v1 = [""]` → `int.parse("")` → **`FormatException`**。

→ **后果**：脚本若**省略** `minAppVersion`，导入会失败，且错误是原始的 `FormatException: Invalid radix-10 number`，**完全不可读**，没有指向 `minAppVersion` 的任何提示。
→ 这正好解释了 `doc/api/comic_source.zh.md:25` 那句措辞：*"显式填写实际验证过的最低应用版本，如 `1.16.0`；基类默认空字符串不是有效版本"* —— 文档说的是**事实**，不是风格建议。
→ **推论（同为硬约束）**：`minAppVersion` 必须是**至少三段数字**（`1.16.0`），`"1.16"` 会在 `v1[2]` 抛 `RangeError`；含非数字段（如 `"1.16.0-beta"` → `"1.16.0.beta"`，第 4 段不参与 `int.parse`，**这是安全的**）不会崩。→ 预发布后缀形式**可以**，只要前 3 段是数字。
→ **官方模板与测试都显式写了 `minAppVersion`**：`doc/examples/minimal_source.js:7`（`"1.16.0"`）、`test/features/comic_source/source_lifecycle_test.dart:263`（`"1.0.0"`）。

### 5.4 可选成员清单（宿主的存在性检查 → 未实现请省略）

`parser.dart:235-269` 逐个决定是否注册。判定方式统一为 `_checkExists(path)`（`parser.dart:283-285`），生成代码为：

```dart
String _propertyPath(String index) =>
    'ComicSource.sources.$_key?.${index.replaceAll(RegExp(r'(?<!\?)\.'), '?.')}';   // parser.dart:292-293
```
（即把 `a.b.c` 变成 `ComicSource.sources.<key>?.a?.b?.c`，**所以嵌套缺失是安全的**。）

| 成员 | 存在性判定路径 | 注册位置 |
|---|---|---|
| `account` / `account.login` / `account.logout` / `account.loginWithWebview[.url/.checkStatus/.onLoginSuccess]` / `account.loginWithCookies[.fields/.validate]` / `account.registerWebsite` | `parser.dart:305, 311, 337, 345, 356, 372-377` | `parser.dart:304-380` |
| `category`（`title`, `parts[]`, `enableRankingPage`） | 判 `category.title` 非 null | `parser.dart:535-628` |
| `categoryComics` / `.optionList` / `.optionLoader` / `.ranking` / `.ranking.options` / `.ranking.load` / `.ranking.loadWithNext` | `parser.dart:631, 634, 659, 708, 710, 722` | `parser.dart:630-777` |
| `explore[]`（`title`, `type`, `load`/`loadNext`） | `parser.dart:383, 386, 422` | `parser.dart:382-533` |
| `search` / `search.optionList` / `search.load` / `search.enableTagsSuggestions` / `search.onTagSuggestionSelected` | `parser.dart:780, 782, 807, 265, 1272` | `parser.dart:779-836, 1271-1282` |
| `comic.loadInfo` | **无检查**（总是注册闭包） | `parser.dart:838-852` |
| `comic.loadEp` | **无检查**（总是注册闭包） | `parser.dart:854-868` |
| `comic.loadThumbnails` | `parser.dart:1161` | `parser.dart:1160-1177` |
| `comic.onImageLoad` | `parser.dart:1123` | `parser.dart:1122-1141` |
| `comic.onThumbnailLoad` | `parser.dart:1144` | `parser.dart:1143-1158` |
| `comic.loadComments` | `parser.dart:1029` | `parser.dart:1028-1044` |
| `comic.sendComment` | `parser.dart:1047` | `parser.dart:1046-1073` |
| `comic.loadChapterComments` | `parser.dart:1076` | `parser.dart:1075-1091` |
| `comic.sendChapterComment` | `parser.dart:1094` | `parser.dart:1093-1120` |
| `comic.likeComic` / `comic.voteComment` / `comic.likeComment` | `parser.dart:1180, 1197, 1214` | `parser.dart:1179-1228` |
| `comic.idMatch`（**必须是正则可用的字符串**） | `parser.dart:1236, 1239` | `parser.dart:1235-1240` |
| `comic.onClickTag` | `parser.dart:1255` | `parser.dart:1254-1269` |
| `comic.link`（`domains`, `linkToId`） | `parser.dart:1285, 1288` | `parser.dart:1284-1297` |
| `comic.starRating` | `parser.dart:1300` | `parser.dart:1299-1314` |
| `comic.archive`（`getArchives`, `getDownloadUrl`） | `parser.dart:1317` | `parser.dart:1316-1348` |
| `favorites` / `.multiFolder` / `.isOldToNewSort` / `.singleFolderForSingleComic` / `.loadComics` / `.loadNext` / `.loadFolders` / `.addFolder` / `.deleteFolder` / `.addOrDelFavorite` | `parser.dart:871, 873-877, 921, 940, 965, 985, 998` | `parser.dart:870-1026` |
| `settings` | `parser.dart:1231` | `parser.dart:1230-1233` |
| `comic.enableTagsTranslate` | `parser.dart:266` | — |
| `init()` | 调用时用 `?.init?.()`（**可缺省**） | `comic_source_manager.dart:228` |

⚠️ **`comic.loadInfo` / `comic.loadEp` 没有存在性检查**（`parser.dart:838-868` 无条件注册），所以缺它们不会在导入时失败，而是**在用户点开漫画时才报错**——正是 `doc/api/comic_source.zh.md:387` 那条"搜索入口出现但打不开"的成因。

### 5.5 `settings` 字段（宿主 UI 的真实渲染规则）

解析：`parser.dart:1230-1233` → `normalizeComicSourceSettings`（`normalization.dart:162-188`）。
**每次 build 重新从 JS 读**（支持 getter）：`source.dart:245-253` + `comic_source_page.dart:782`。
渲染分支在 `comic_source_page.dart:789-877`：

| `type` | 必需字段 | 行为 | 证据 |
|---|---|---|---|
| `"select"` | `title`, `options: [{value, text}]`, `default` | 存 `data['settings'][key] = option.value` | `comic_source_page.dart:793-826` |
| `"switch"` | `title`, `default` | 存布尔 | `comic_source_page.dart:827-839` |
| `"input"` | `title`, `default`, `validator`（**正则字符串或 null**） | `RegExp(item.value['validator'])` | `comic_source_page.dart:840-869`（`:857-859` 是关键） |
| `"callback"` | `title`, `buttonText`, `callback` | `func([])`；返回 Future 时按钮显示 loading | `comic_source_page.dart:870-871` + `:598-646`（`:620-631`） |
| 其他任何值 | — | **静默忽略** | `comic_source_page.dart:873` 之前无 `else` |
| 单项构建失败 | — | `Log.error("ComicSourcePage", "Failed to build a setting…")`，**不影响其他项** | `comic_source_page.dart:873-875` |

⚠️ `type` 本身**不校验**（`String type = item.value['type']`，`comic_source_page.dart:791`），缺 `type` 会得到 `null` → 落入"静默忽略"。
⚠️ `select` 分支若 `item.value['title']` 不是 String 会抛错 → 被 `:873` 捕获后该项消失（`doc/api/comic_source.zh.md:310-316` 的示例是正确写法）。

### 5.6 数据持久化与原子性

| 项 | 位置 | 证据 |
|---|---|---|
| 源数据文件 | `<App.dataPath>/comic_source/<key>.data`（JSON） | `source.dart:145-150, 219-229` |
| 原子写 | 先写 `<key>.data.update`，`flush: true`，再 `rename` | `source.dart:163-171` |
| 写合并 | `_activeSave` / `_pendingSave` 串行化，避免并发写 | `source.dart:178-217` |
| 安装期暂存 | `stageDataWrites()` → 只在 `commitDataWrites()` 成功后发布 | `source.dart:157-176`；`comic_source_manager.dart:275, 337, 355` |
| 安装回滚 | 失败时恢复脚本、JS 运行时对象、页面注册与 origin | `comic_source_manager.dart:283-296`；`parser.dart:95-106, 221-229` |
| 测试确证 | `test/features/comic_source/source_lifecycle_test.dart:74-224`（4 个事务场景） | — |

---

## 6. 源仓库 `index.json` 规范

### 6.1 加载与形状

```dart
response = await dio.get<String>(base.toString(), ...
    headers: {'cache-time': 'no'});                       // source_repositories.dart:201-208
if (response.statusCode != 200) throw 'Unable to load repository.'.tl;   // :212
return parseCatalog(response.data!, baseUrl: response.realUri.toString()); // :213
```

| 项 | 规则 | 证据 |
|---|---|---|
| 传输 | HTTP(S) GET，带 `cache-time: 'no'` | `source_repositories.dart:201-208` |
| 必须 200 | 否则抛 `'Unable to load repository.'` | `:212` |
| 形状 | **UTF-8 JSON 数组**（`json is! List` → 抛错） | `:220-226`；`doc/api/comic_source.zh.md:333-345` |
| BOM | 剥离 `\uFEFF` | `:220` |
| JSON 解析失败 | 抛 `'The address must return a source list in JSON format.'` | `:221-223` |
| 空 body (`data!`) | **未做判空** → 200 + null body 会抛 null-check 异常 | `:213`（`response.data!`） |

### 6.2 条目字段（全部）

```dart
if (record is! Map ||
    key is! String ||
    record['name'] is! String ||
    record['version'] is! String ||
    !RegExp(r'^\w+$').hasMatch(key) ||
    !RegExp(r'^\d+\.\d+\.\d+(?:[.\-].+)?$').hasMatch(record['version'] as String)) {
  skipped.add(label);  continue;                                  // source_repositories.dart:235-245
}
final target = record['url'] is String && (record['url'] as String).trim().isNotEmpty
    ? record['url'] as String
    : record['fileName'];                                          // :246-249
```

| 字段 | 必填 | 类型 | 校验 | 证据 |
|---|---|---|---|---|
| `key` | ✅ | String | `^\w+$`（**字母/数字/下划线**） | `source_repositories.dart:239` |
| `name` | ✅ | String | 仅类型；**不校验非空** | `:237` |
| `version` | ✅ | String | `^\d+\.\d+\.\d+(?:[.\-].+)?$` —— **三段数字开头，可带 `.` 或 `-` 后缀** | `:240-242` |
| `url` | 二选一 | String | 非空则**优先于** `fileName` | `:246-248` |
| `fileName` | 二选一 | String | `url` 缺失/空白时使用；必须非空 | `:246-252` |
| `description` | ❌ | any | `?.toString() ?? ''` | `:265` |
| 其他字段 | — | — | **静默忽略** | 无读取代码 |

**校验规则与脚本侧的不一致（值得注意）**：

| 位置 | `key` 正则 | 含义 |
|---|---|---|
| `index.json` | `^\w+$`（`source_repositories.dart:239`） | **允许数字开头**（`1abc`） |
| 源脚本 | `^[a-zA-Z_][a-zA-Z0-9_]*$`（`parser.dart:278`） | **不允许**数字开头 |

→ 一个合法的 catalog 条目可以列出一个**脚本无法使用**的 `key`；这类源在安装时（`expectedKey` 校验 + `_checkKeyValidation`）才会失败（`parser.dart:199-203, 219, 276-281`）。

### 6.3 无效条目的处理

| 情况 | 行为 | 证据 |
|---|---|---|
| 单条非法 | **跳过**并记录标签到 `SourceCatalog.skipped` | `:243, 251, 269`；`SourceCatalog.skipped` 定义 `:45-52` |
| 跳过时用的标签 | `key`（trim 后非空）否则 `#<1-based 序号>` | `:232-234` |
| 全部非法 | 抛 `'The repository contains no usable source entries.'` | `:272-274` |
| 部分合法 | 正常返回，UI 汇总提示被跳过的条目 | `doc/api/comic_source.zh.md:353` |

### 6.4 相对路径解析基准（**最终响应 URL，不是请求 URL**）

```dart
return parseCatalog(response.data!, baseUrl: response.realUri.toString());   // source_repositories.dart:213
...
url: normalizeUrl(base == null ? target.trim()
                              : base.resolve(target.trim()).toString()),     // :260-264
```

- 基准 = **`response.realUri`**，即**跟随重定向后的最终 URL**。`doc/api/comic_source.zh.md:349` 说的"以最终成功响应的列表 URL 为基准"与代码一致。
- 解析用 `Uri.resolve`（RFC 3986 相对解析），因此 `scripts/example.js` 相对列表 URL 解析，`/abs/path.js` 相对 host 根，`https://…` 绝对。
- **`base == null`** 仅出现在 `parseCatalog(contents)` 无 `baseUrl` 的调用（`:216`）；此时 target 必须是**绝对 HTTP(S)**，否则 `normalizeUrl` 抛错（`:260-263` → `:254-270` 的 `catch` 把它变成 `skipped`）。
- `normalizeUrl`：必须是 `http`/`https`、host 非空、**去掉 fragment**（`:181-189`）。
- 本地粘贴 JSON：`SourceRepositories.save(..., catalogContents:)` 分支会 `parseCatalog(catalogContents, baseUrl: url)`（`:306`），即用输入的列表地址做基准 —— 与 `doc/api/comic_source.zh.md:350` 一致。

### 6.5 版本比较规则（`compareSemVer`，**不是 SemVer**）

```dart
/// return true if ver1 > ver2
bool compareSemVer(String ver1, String ver2) {          // parser.dart:23-60
  ver1 = ver1.replaceFirst("-", ".");                   // :25   只替换第一个 '-'
  ver2 = ver2.replaceFirst("-", ".");                   // :26
  List<String> v1 = ver1.split('.');                    // :27
  List<String> v2 = ver2.split('.');                    // :28
  for (int i = 0; i < 3; i++) {
    int num1 = int.parse(v1[i]);                        // :31   ← 前 3 段必须存在且为数字
    int num2 = int.parse(v2[i]);                        // :32
    if (num1 > num2) return true;                       // :34-35
    else if (num1 < num2) return false;                 // :36-37
  }
  var v14 = v1.elementAtOrNull(3);                      // :41
  var v24 = v2.elementAtOrNull(3);                      // :42
  if (v14 != v24) {
    if (v14 == null && v24 != "hotfix") return true;    // :45-46
    else if (v14 == null) return false;                 // :47-48
    if (v24 == null) {                                  // :50
      if (v14 == "hotfix") return true;                 // :51-52
      return false;                                     // :54
    }
    return v14.compareTo(v24) > 0;                      // :56   ← 字符串字典序
  }
  return false;                                         // :59
}
```

**规则总结**：

1. **第一段 `-` 变 `.`**（只替换第一个）→ `1.0.0-rc` 变成 `1.0.0.rc`，从而把预发布后缀变成第 4 段。
2. **前 3 段按整数比较**，任一段非数字 → `FormatException`；不足 3 段 → `RangeError`（`v1[i]` 越界）。
3. 前 3 段相同后，看**第 4 段**：
   - 两者相等（含都为 `null`）→ 返回 `false`（**不视为更新**）。
   - `ver1` 无第 4 段：**默认为"更新"**，除非 `ver2` 的第 4 段正好是字面量 `"hotfix"`。
   - `ver2` 无第 4 段：只有 `ver1` 的第 4 段正好是 `"hotfix"` 才算更新。
   - 否则用 `String.compareTo`（**字典序**，不是 semver 的数字/字母优先级）。
4. **完全没有** semver 的"预发布 < 正式"语义，也没有 build metadata 处理。

→ 与 `doc/api/comic_source.zh.md:354` 的警告完全对应：*"版本比较使用项目自身规则，不是完整 npm SemVer 范围解析器。避免只改变预发布后缀却依赖复杂优先级。"*

**使用点**：

| 用途 | 表达式 | 证据 |
|---|---|---|
| 仓库更新检测 | `compareSemVer(entry.version, source.version)` | `source_repositories.dart:439` |
| UI 显示 "New Version" | `compareSemVer(newVersion, source.version)` | `comic_source_page.dart:676` |
| `minAppVersion` 门槛 | `compareSemVer(minAppVersion, App.version.split('-').first)` | `parser.dart:205` |

### 6.6 仓库与来源（origin）关联

| 存储键 | 形状 | 证据 |
|---|---|---|
| `appdata.settings['comicSourceRepositories']` | `[{id, name, url}]` | `source_repositories.dart:110-129`、`:317-319` |
| `appdata.settings['comicSourceOrigins']` | `{<sourceKey>: {kind, repositoryId, repositoryName, url}}` | `:133-147`、`:344-357` |
| `kind` | `'repository'` \| `'url'` \| `'file'` | `:392-401`（安装）、`:152-153`（显示） |

**更新时选哪个条目**（`entryFor`）：

```dart
final candidates = entries.where((e) => e.key == source.key).toList();   // :382
final exact = candidates.firstWhereOrNull((e) => e.url == previousUrl);  // :384
if (exact != null) return exact;                                          // :385
if (candidates.length == 1) return candidates.single;                     // :386
throw (... 'Multiple variants found. Choose a source in the repository again.'); // :387-390
```
→ 同一 `key` 多条目时，优先匹配"上次记录的 origin.url"；无法消歧则**报错而不是猜**（与 `doc/api/comic_source.zh.md:352` 一致）。

**更新的两道额外闸门**：

1. 仓库 URL 在操作期间变了 → `'Repository changed. Refresh the list and try again.'`（`:364-366, 406-410, 425-431`）。
2. 新脚本返回不同 `key` → 被 `expectedKey` 拒绝：`'The downloaded script does not match this source.'`（`parser.dart:199-203`），因此**不能用更新把一个源替换成另一个源**（`doc/api/comic_source.zh.md:353`）。

---

## 7. 离线测试手段（App 之外能否跑源脚本？）

**结论：存在，但只有三条路，且没有"交给任意 JS 运行时"的独立 harness。**

### 7.1 ✅ App 内 JS Evaluator（唯一官方交互式入口）

| 项 | 值 | 证据 |
|---|---|---|
| 入口 | 设置 → 调试 → **JS Evaluator** | `features/settings/debug.dart:106-152` |
| 执行 | `widget.evaluate != null ? widget.evaluate!(code) : JsEngine().runCode(code, '<debug>')` | `debug.dart:46-48` |
| 引擎 | **主引擎单例**（能访问所有已安装源） | `debug.dart:12` import `foundation/js_engine.dart`；`:8` import `comic_source` |
| Promise | `Future<Object?>.sync(...)` → **会自动 await** | `debug.dart:45-49` |
| 超时 | **30 秒** | `debug.dart:63` |
| 结果格式 | `Map`/`List` → `JsonEncoder.withIndent('  ')`；否则 `toString()` | `debug.dart:52-56` |
| 句柄释放 | `JSRef.freeRecursive(value)` | `debug.dart:60` |
| 并发限制 | 运行期间按钮禁用（`running` 门） | `debug.dart:38, 131` |
| 错误 | `catch → result = error.toString()` | `debug.dart:65-66` |
| 文档 | `doc/development/source_debugging.zh.md:31-57` | — |

**用法（官方示例）**：

```javascript
ComicSource.sources.example_source.version              // doc/development/source_debugging.zh.md:44
```
```javascript
(async () => {
    const source = ComicSource.sources.example_source;
    return await source.comic.loadInfo("your-test-comic-id");
})()                                                    // 同上 :50-54
```

**限制（这是"能不能当离线 harness"的关键）**：

- ⚠️ 它**只能访问已安装**的源（`ComicSource.sources.<key>`，注册见 `parser.dart:231-233`）。**没有**"加载一段 JS 文本并解析成源"的入口 —— 想测一个**未安装**的脚本，必须先在 App 里安装（文件/URL），或先安装再"编辑脚本→保存并重新加载"（`doc/development/source_debugging.zh.md:18-27`）。
- ⚠️ 需要**活动图形界面**（Flutter widget + `App.rootContext`），所以**不能**在没有 GUI 的 headless 环境里用（`doc/api/js.zh.md:11`："UI API 需要活动的图形界面，后台加载和无头模式不应依赖用户交互"）。
- ⚠️ `DebugPage.evaluate` 是可注入 seam（`debug.dart:17-18`），但**只被测试用来伪造求值器**（`test/features/settings/debug_test.dart:19-24`），**不存在**一个"接收 JS 文件路径"的无头 evaluator。
- ✅ 可用于**逐条实测引擎特性**（§4.4），这是确证 ES 边界最实际的手段。

其它重载入口：调试页的 **Reload Configs**（`debug.dart:72-83` → `ComicSourceManager().reloadForDebug()`，`comic_source_manager.dart:200-215`，逐个重读已安装脚本并汇总错误）。文档也提"打开日志"（`debug.dart:95-101`）。

### 7.2 ✅ `flutter test` 里跑真 QuickJS（**本仓库真实存在，但需要平台构建产物**）

**`test/features/comic_source/source_lifecycle_test.dart` 是唯一真正启动 QuickJS 的测试**：

```dart
// 先尝试加载平台原生库（Windows：先开 runner 的 dll，再开插件 dll）
try {
  if (Platform.isWindows) {
    final build = Directory('build/windows/x64/runner/Release').absolute.path;
    if (File('$build/flutter_windows.dll').existsSync()) {
      DynamicLibrary.open('$build/flutter_windows.dll');
      DynamicLibrary.open('$build/flutter_qjs_plugin.dll');
    }
  }
  DynamicLibrary.open(Platform.isWindows ? 'flutter_qjs_plugin.dll'
      : Platform.isLinux ? 'libflutter_qjs_plugin.so' : 'flutter_qjs.framework/flutter_qjs');
  nativeAvailable = true;
} catch (_) { nativeAvailable = false; }                      // source_lifecycle_test.dart:16-35
...
setUp(() async {
  ...
  App.version = '9.0.0';                                      // :50
  Log.isMuted = true;                                         // :52
  JsEngine.cacheJsInit(await File('assets/init.js').readAsBytes());   // :53
  await JsEngine().init();                                    // :54
});
...
test('...', ..., skip: nativeAvailable ? false
    : 'QuickJS native library unavailable; run with platform build DLLs on PATH.'); // :251-254
```

它能做的（= 事实上的源集成测试范式）：

- 用**真实 installer** 安装脚本：`manager.installScript(js:, fileName:, origin:, beforeInstall:)`（`:67-72`）
- 用**真实 parser** 解析、**真实 init 包装**（15s 超时路径）
- 直接 `JsEngine().runCode(...)` / `runReadCode(...)` 并断言 JS 世界状态（`:82, 99, 112, 123, 141, 186, 229-246`）
- 断言**读重试恰好 3 次尝试**与**取消后只尝试 1 次**（`:226-249`）
- 断言安装/重载失败时脚本、运行时对象、`.data`、origin 全部回滚（`:74-224`）

**关键限制**：

- ⚠️ **需要先有平台构建产物**：Windows 需要 `build/windows/x64/runner/Release/flutter_windows.dll` + `flutter_qjs_plugin.dll`；否则整个 group 被 **`skip`**（`:251-254`）。所以**裸 checkout 上它不跑**。
- ⚠️ CI 的 `analyze.yml` 只跑 `flutter pub get` → `flutter analyze` → `flutter test --coverage`（`.github/workflows/analyze.yml:33, 51, 52`），**中间没有 `flutter build`** → 在该 workflow 中这个 group 必然是 skip 状态。这是"离线 harness 存在但不默认生效"的硬证据。
- ⚠️ 它是 **Dart 测试**，你写 Dart 断言，而**不是**一个"喂 .js 文件、打印结果"的通用 runner。

**其它测试 seam（可用于自建 harness）**：

| seam | 位置 |
|---|---|
| `JSPool.debugLoadJsInit` / `debugCreateEngine` / `resetForTesting` / `debugInstanceCount` | `js_pool.dart:83-98` |
| `JsEngine.debugResetSourceDataBridge` / `debugResetUiMessageHandler` | `js_engine.dart:98-106` |
| `JsEngine.debugIsRetryableReadError` | `js_engine.dart:372-375`（已被 `test/foundation/js_engine_test.dart:7-42` 使用） |
| `SourceInstallations.forTesting(client:, manager:)` | `source_installation.dart:91-96` |
| `SourceRepositories.forTesting(client)` / `debugCreateDio` | `source_repositories.dart:94-98` |
| `ImageDownloader.debug*`（loading config / onResponse / onLoadFailed / reset） | `images.dart:43-120` |
| `debugNormalizeComicSource*` 系列 | `comic_source_manager.dart:34-87` |
| `debugRunWithImageScriptSlot` | `image_processing.dart:330-333` |
| `ImageDownloader.debugLoadComicImageUnwrapped`（可替换图片加载） | `images.dart:48-55` |

### 7.3 ⚠️ 无头 CLI：**存在，但没有"跑 JS / 跑源"的命令**

```dart
if (args.contains('--headless')) { ... }        // main.dart:25
```
```dart
switch (command) {
  case 'webdav':        // up | down
  case 'updatescript':  // all
  case 'updatesubscribe':
  default: cliPrint({'status':'error','message':'Unknown command: $command'}); exit(1);
}                                               // headless.dart:38-240
```

| 命令 | 做什么 | 对源脚本的覆盖 | 证据 |
|---|---|---|---|
| `--headless webdav up\|down` | WebDAV 同步 | 无 | `headless.dart:39-52` |
| `--headless updatescript all` | 检查并应用所有源更新（**重新下载 + 重新解析 + 重新 init**） | 覆盖：AST 解析、`minAppVersion` 校验、`init()`、`saveData`、origin 更新 | `headless.dart:53-124`（`:90` → `ComicSourcePage.update`） |
| `--headless updatesubscribe [--update-comic-by-id-type <id> <type>]` | 追更检查 | 覆盖：`comic.loadInfo`（+ `updateTime`/标签解析） | `headless.dart:125-236`；`doc/user/headless.zh.md:34-105` |
| 「跑一段 JS」/「跑某个源」 | — | ❌ **不存在** | `headless.dart:237-239` 的 `default` 分支 |

输出约定：`[CLI PRINT] {json}`（`headless.dart:13-15`），`--ignore-disheadless-log` 抑制日志（`:19-21`）。
→ 无头模式是**冒烟测试已发布源**的手段，**不是**离线开发 harness：它不覆盖 `search` / `loadEp` / `onImageLoad` / 图片处理，也不能执行任意代码。

### 7.4 ❌ 不存在的手段（明确清单）

| 假设的手段 | 存在？ | 已检查的地方 |
|---|---|---|
| 独立命令行 JS runner（`node init.js` 之类） | ❌ **不存在** | 全仓库 `.js` 仅 `assets/init.js`；`tool/` 只有 `check_git_dependencies.dart`；`init.js` 强依赖 `sendMessage`（`init.js:20` 起处处使用），**在纯 Node 中无 shim 必然失败**，而仓库内无任何 shim |
| 让源脚本在 Node/Deno 里跑的 polyfill / mock | ❌ 不存在 | 全仓库检索无 `polyfill`/`mock` 的 JS 适配器 |
| `index.html` / 浏览器 playground | ❌ 不存在 | `assets/` 只有 init.js + 数据/图片 |
| CI 里对源脚本的离线测试任务 | ❌ 不存在 | `.github/workflows/analyze.yml:30-54` 只有 py 脚本 + `flutter analyze` + `flutter test --coverage`；`pr_build.yml` 是构建+启动冒烟（`:104-117`），不涉及源脚本 |
| `flutter test` 中默认生效的 QuickJS 测试 | ❌ 默认 **skip** | `source_lifecycle_test.dart:16-35, 251-254`（需平台 DLL）；CI 无 build 步骤（`analyze.yml:33-52`） |

### 7.5 ✅ 推荐的离线开发闭环（基于以上事实）

1. **App 内迭代**：安装脚本（文件或 URL）→ 源菜单 "编辑脚本"（`features/comic_source/source_script_editor.dart:27-47`，保存即 `onSave` → 重载）或桌面端 VS Code 草稿 `source_edit/<key>.js` → 调试页 **Reload Configs** 或编辑器 "Save and reload"。
2. **逐条验引擎能力**：调试页 JS Evaluator 跑 §4.4 的探测脚本。
3. **验回调**：Evaluator 里直接 `await ComicSource.sources.<key>.search.load(...)` / `.comic.loadEp(...)`（文档范式 `doc/development/source_debugging.zh.md:50-54`）。**注意**：这绕过宿主解析层，因此验不出 `Invalid data` 之类的归一化失败 —— 那类问题要看日志或走真实 UI。
4. **端到端回归**：把用例写成类似 `test/features/comic_source/source_lifecycle_test.dart` 的 Dart 测试（先做一次平台构建以获得 `flutter_qjs_plugin.dll`）。
5. **发布后冒烟**：`--headless updatescript all` + `--headless updatesubscribe`（需已配置追更目录，`headless.dart:127-131`）。

---

## 8. 结论速查：最需要在写源时避开的 10 个坑

| # | 坑 | 证据 |
|---|---|---|
| 1 | **必须显式写 `minAppVersion`（三段数字）**，否则 `int.parse("")` 抛 `FormatException`，错误信息不可读 | `init.js:1152` + `parser.dart:197,204-205` + `parser.dart:25-31` |
| 2 | **`HtmlNode.toElement()` 永远是 `null`**（JS 发 `node_toElement`，Dart 收 `node_to_element`） | `init.js:986` vs `js_engine.dart:467`（落入 `:486 return null`） |
| 3 | **`onThumbnailLoad` 必须同步返回**，返回 Promise 直接抛 `invalid data`；封面不继承正文 header | `parser.dart:1143-1158`；`doc/api/comic_source.zh.md:237` |
| 4 | **`catch` 到的是字符串不是 Error**，`e.message` 为 `undefined` | `js_engine.dart:316,334` + `init.js:509` |
| 5 | **无法关闭/控制重定向**（固定 `limited(5)`，`_http` 不读任何相关选项） | `app_dio.dart:243`；`js_engine.dart:306-313` |
| 6 | **无法设置超时**（全部硬编码 15s），`extra` 也不是超时配置 | `app_dio.dart:244-248`；`js_engine.dart:306-313`；`doc/api/js.zh.md:27` |
| 7 | **`sendMessage` 无 `default` 分支**：拼错 method 静默返回 `null` 而不报错 | `js_engine.dart:179-263` |
| 8 | **`compute` 内不能访问源数据桥**（isolate 静态字段未配置）→ `loadData`/`loadSetting`/`isLogged` 抛错 | `js_engine.dart:86,108-109` + `js_pool.dart:188-191` |
| 9 | **整数形式的章节键会被 JS 重排**；章节/图片顺序必须由源端保证 | `doc/api/comic_source.zh.md:126,147`；`models.dart:347-369` |
| 10 | **`dataKey === 'setting'`（单数）被宿主拒绝**；设置应走 `settings` + `loadSetting` | `js_engine.dart:199-201`；`js_bridge.dart:51` |

---

## 9. UNKNOWN 汇总（确证所需的最小动作）

| # | UNKNOWN | 已查证的位置 | 确证方法 |
|---|---|---|---|
| 1 | **QuickJS-NG 的确切版本号 / tag** | `doc/development/dependency_audit.{zh,en}.md`、`git_dependencies.json`、`pubspec.yaml`、`pubspec.lock`、`CHANGELOG.md`、全仓库 quickjs 关键字；本机 pub cache / `.dart_tool` / `quickjs.h`（均不存在/0 命中） | `flutter pub get` → 读 `.dart_tool/package_config.json` 定位 fork checkout → 其内嵌 quickjs-ng 的版本文件 |
| 2 | **`?.`/`??`/`async` 之外的具体 ES 特性边界**：`Proxy`、命名捕获组、`String.replaceAll`、`Array.at`、`TextEncoder`/`TextDecoder`、`btoa`/`atob`、`queueMicrotask`、`Symbol`、`BigInt` | 全仓库 `.js` 检索：**零使用**，故无证据。仅能确证下界 = ES2022（§4.2） | App 内 JS Evaluator 跑 §4.4 的探测脚本 |
| 3 | **`package:html`/`csslib` 的选择器支持矩阵**（`:nth-child`、`:not`、`:has`、`:is` 等确切支持面） | `pubspec.yaml:25` 只给版本 `^0.15.7`；本机无 pub cache，包源码不可读。可确证的只有：走 CSS 选择器（`js_engine.dart:710,717`）、**无 XPath**、**无 `getAttribute`** | `flutter pub get` 后读 `csslib` 的 selector 实现；或在 Evaluator 里逐伪类实测 |
| 4 | **`compute` 内源数据桥确为不可用**（依赖 Dart 静态字段的 isolate 隔离语义） | 代码证据链完整（`js_engine.dart:86,108-109`；`js_pool.dart:188-191` 无 configure 调用），但**未实测** | 在 `source_lifecycle_test` 式环境里跑 `compute("() => { try { this.loadData('x'); return 'ok' } catch(e) { return String(e) } }")` |

**主要非 UNKNOWN 的不确定性**：`_http` 在 `http_client: 'dart:io'` 分支下 receive/send 超时的确切语义（`js_engine.dart:283-301` 未显式设置，依赖 Dio 默认）—— 由于本机无 Dio/rhttp 源码，未能确证；但**默认分支（rhttp）不受影响**，其超时是硬编码常量（`app_dio.dart:244-248`），这一条是确定的。
