'use strict';
/**
 * 离线运行时：在 Node 里复刻 Venera 宿主注入给漫画源的全局对象，
 * 从而在不启动 App、不联网的前提下把真实夹具喂给 sources/ehentai.js。
 *
 * 宿主注入的全局对象（全部依据上游源的实际调用，见 sources/upstream/ehentai.js）：
 *   Network.get(url, headers)                       -> {status, body}
 *   Network.post(url, headers, body)                -> {status, body}
 *   Network.getCookies(url)                         -> Cookie[]
 *   Network.sendRequest(method, url, headers, body) -> {status, body}
 *   Cookie  构造器
 *   HtmlDocument  见 harness/html-document.js
 *   Comic  构造器
 *   ComicSource  基类（提供 loadSetting / saveSetting / isLogged）
 *
 * 设计原则：**没有匹配路由就抛错**，绝不返回空响应体。上游源把逐行解析异常静默吞掉
 * （返回 0 条也不报错），所以路由层必须保持"响亮失败"，否则测试会退化成假绿。
 */
const fs = require('node:fs');
const vm = require('node:vm');
const { HtmlDocument } = require('./html-document');
const { loadFixture } = require('./fixtures');

class NoFixtureForUrlError extends Error {
  constructor(url) {
    super(`no fixture route for url: ${url}`);
    this.name = 'NoFixtureForUrlError';
  }
}

/**
 * 宿主私有"魔法头"：它们不是 HTTP 头，而是宿主内部约定（证据见 docs/DECISIONS.md D11）。
 * 记录它们是为了能断言"不得散落在业务逻辑中"（AGENTS.md §2.4）。
 */
const HOST_MAGIC_HEADERS = ['http_client', 'cache-time', 'prevent-parallel'];

class Comic {
  constructor(fields = {}) {
    Object.assign(this, fields);
  }
}

class Cookie {
  constructor(fields = {}) {
    Object.assign(this, fields);
  }
}

class ComicSource {
  constructor(options = {}) {
    this._settingValues = { ...(options.settings || {}) };
    this.isLogged = Boolean(options.isLogged);
  }

  /** 宿主基类语义：未设置过时回落到源自身 settings 声明里的 default。 */
  loadSetting(key) {
    if (Object.prototype.hasOwnProperty.call(this._settingValues, key)) {
      return this._settingValues[key];
    }
    const declared = this.settings ? this.settings[key] : undefined;
    return declared && 'default' in declared ? declared.default : null;
  }

  saveSetting(key, value) {
    this._settingValues[key] = value;
  }
}

/** 提取源脚本里定义的 ComicSource 子类；宿主取最后一个声明。 */
function findSourceClasses(code) {
  const names = [];
  const re = /class\s+([A-Za-z_$][\w$]*)\s+extends\s+ComicSource/g;
  let m;
  while ((m = re.exec(code)) !== null) names.push(m[1]);
  return names;
}

function createNetwork(options = {}) {
  const routes = (options.routes || []).map((route, index) => ({
    index,
    hits: 0,
    status: 200,
    ...route,
  }));
  const diagnostics = { calls: [], misses: [], hostPrivateHeaders: [] };

  function matchRoute(url) {
    for (const route of routes) {
      const pattern = route.match;
      const hit =
        pattern instanceof RegExp ? pattern.test(String(url)) : String(url).includes(String(pattern));
      if (hit) return route;
    }
    return null;
  }

  function resolveBody(route) {
    if (route.body !== undefined) return route.body;
    if (route.fixture !== undefined) return loadFixture(route.fixture);
    if (route.file !== undefined) return fs.readFileSync(route.file, 'utf8');
    throw new Error(`route ${route.index} has neither body/fixture/file`);
  }

  async function request(method, url, headers, body) {
    const headerNames = headers && typeof headers === 'object' ? Object.keys(headers) : [];
    // 宿主私有伪头（只在某一宿主生效）。记录下来，供测试断言"不得散落在业务逻辑中"。
    const hostPrivate = headerNames.filter((h) => HOST_MAGIC_HEADERS.includes(h.toLowerCase()));
    if (hostPrivate.length) diagnostics.hostPrivateHeaders.push({ method, url, headers: hostPrivate });

    const route = matchRoute(url);
    diagnostics.calls.push({
      method,
      url,
      matched: route ? route.index : null,
      headers: headerNames,
      bodyLength: typeof body === 'string' ? body.length : body ? -1 : 0,
    });

    if (!route) {
      diagnostics.misses.push({ method, url });
      if (typeof options.defaultResponse === 'function') {
        return options.defaultResponse(method, url, headers, body);
      }
      throw new NoFixtureForUrlError(url);
    }
    route.hits += 1;
    return { status: route.status, body: resolveBody(route) };
  }

  const api = {
    get: (url, headers) => request('GET', url, headers, null),
    post: (url, headers, body) => request('POST', url, headers, body),
    sendRequest: (method, url, headers, body) => request(String(method).toUpperCase(), url, headers, body),
    getCookies: async (url) => {
      diagnostics.calls.push({ method: 'GET_COOKIES', url, matched: null, headers: [], bodyLength: 0 });
      return (options.cookies || []).map((c) => new Cookie(c));
    },
  };

  return { api, diagnostics, routes };
}

/**
 * 载入一个源脚本，返回实例与观测数据。
 *
 * @param {string} sourcePath  源脚本路径（sources/ehentai.js 或 sources/upstream/ehentai.js）
 * @param {object} options
 *   routes            [{match: string|RegExp, fixture?: string, body?: string, file?: string, status?: number}]
 *   defaultResponse   (method, url, headers, body) => {status, body}；不给则未匹配即抛错
 *   settings          覆盖 loadSetting 的初始值
 *   isLogged          是否已登录（默认 false，避免触发额外请求）
 *   cookies           注入 Network.getCookies 的返回值
 */
function loadSource(sourcePath, options = {}) {
  const network = createNetwork(options);
  const logs = [];
  const sandboxConsole = {
    log: (...args) => logs.push(['log', ...args]),
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
    error: (...args) => logs.push(['error', ...args]),
    debug: (...args) => logs.push(['debug', ...args]),
  };

  const sandbox = {
    Network: network.api,
    Cookie,
    Comic,
    HtmlDocument,
    ComicSource,
    console: sandboxConsole,
    // 审计模式用：补齐宿主其余全局（UI / Convert / APP / …，见 harness/validate-sources.js）。
    // 默认**不提供**，以保持"缺什么就响亮失败"，避免测试在假宿主上变绿。
    ...(options.globals || {}),
  };

  const code = fs.readFileSync(sourcePath, 'utf8');
  const classNames = findSourceClasses(code);
  const lastName = classNames.length ? classNames[classNames.length - 1] : null;
  const tail = `\n;globalThis.__dshExportedSource = ${lastName ? `(typeof ${lastName} !== 'undefined' ? ${lastName} : null)` : 'null'};`;

  const context = vm.createContext(sandbox);
  vm.runInContext(code + tail, context, { filename: sourcePath });

  const Exported = context.__dshExportedSource;
  if (typeof Exported !== 'function') {
    throw new Error(
      `no ComicSource subclass found in ${sourcePath}` +
        (classNames.length ? ` (found: ${classNames.join(', ')})` : ''),
    );
  }

  const source = new Exported();
  return {
    source,
    network: network.api,
    diagnostics: network.diagnostics,
    logs,
    classNames,
  };
}

module.exports = {
  loadSource,
  createNetwork,
  findSourceClasses,
  HOST_MAGIC_HEADERS,
  Comic,
  Cookie,
  ComicSource,
  NoFixtureForUrlError,
};
