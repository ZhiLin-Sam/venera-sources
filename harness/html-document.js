'use strict';
/**
 * 复刻 Venera 宿主注入的 `HtmlDocument` 桥接。
 *
 * 依据（上游源的真实用法，见 sources/upstream/ehentai.js）：
 *   new HtmlDocument(body)            构造
 *   doc.querySelector(sel)            返回节点或 null
 *   doc.querySelectorAll(sel)         返回**真数组**（源里直接 .map/.find/.filter）
 *   doc.getElementById(id)            按 id 取
 *   node.text                         文本（等价 package:html 的 Node.text ≈ textContent）
 *   node.innerHTML                    内部 HTML
 *   node.attributes["name"]           属性，按普通对象取值（不是 NamedNodeMap）
 *   node.children                     子元素数组（**含元素**，不含文本节点）
 *   node.dispose()                    释放（JS 侧 no-op）
 *
 * 宿主侧真实实现是 Dart package:html（完整 HTML5 树构造，会隐式补 <tbody>），
 * 因此这里必须用 jsdom（同样实现 HTML5 解析算法）而不是宽松的 linkedom——
 * 上游选择器大量写成 `table.itg.gltc > tbody > tr`，只有自动补 tbody 才会命中。
 */
const { JSDOM } = require('jsdom');

/** 把 jsdom 节点包成宿主桥接的语义。 */
class BridgedNode {
  constructor(el) {
    this.el = el;
  }

  get text() {
    return this.el.textContent;
  }

  // 别名，容错：宿主不同实现可能暴露不同拼写
  get textContent() {
    return this.el.textContent;
  }

  get innerHTML() {
    return this.el.innerHTML;
  }

  get innerHtml() {
    return this.el.innerHTML;
  }

  get outerHTML() {
    return this.el.outerHTML;
  }

  get outerHtml() {
    return this.el.outerHTML;
  }

  /** 属性按普通对象暴露：attributes["src"]、attributes["data-src"]。 */
  get attributes() {
    const out = {};
    if (this.el.attributes) {
      for (const attr of this.el.attributes) out[attr.name] = attr.value;
    }
    return out;
  }

  /** 子元素数组；源里用 children[i] 位置索引，所以必须是真数组。 */
  get children() {
    return Array.from(this.el.children || []).map(bridge);
  }

  get tagName() {
    return this.el.tagName;
  }

  querySelector(selector) {
    const found = this.el.querySelector(selector);
    return found ? bridge(found) : null;
  }

  querySelectorAll(selector) {
    return Array.from(this.el.querySelectorAll(selector)).map(bridge);
  }

  getElementById(id) {
    if (typeof this.el.getElementById === 'function') {
      const found = this.el.getElementById(id);
      return found ? bridge(found) : null;
    }
    const found = this.el.querySelector(`#${id}`);
    return found ? bridge(found) : null;
  }

  /** 宿主用于释放 Dart 侧对象；JS 侧无对应资源。 */
  dispose() {}
}

function bridge(node) {
  return node ? new BridgedNode(node) : null;
}

class HtmlDocument extends BridgedNode {
  constructor(html) {
    const dom = new JSDOM(String(html));
    super(dom.window.document);
    this._dom = dom;
  }

  dispose() {
    if (this._dom) {
      this._dom.window.close();
      this._dom = null;
    }
  }
}

module.exports = { HtmlDocument, BridgedNode, bridge };
