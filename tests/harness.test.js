'use strict';
/**
 * 测试台自身的正确性测试。
 *
 * 为什么先测测试台：上游源把逐行解析异常静默吞掉，如果桥接语义不对（例如 jsdom 没自动补
 * <tbody>、querySelectorAll 没返回真数组、attributes 不是普通对象），源会安静地返回 0 条，
 * 于是测试"通过"却什么都没验证。这里先用夹具的结构性事实把桥接钉死，
 * 再让 tests/gallery-list.test.js 去测源。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { HtmlDocument } = require('../harness/html-document');
const {
  loadFixture,
  LIST_VARIANTS,
  listFixtures,
  countGalleryRows,
  CONTAINER,
} = require('../harness/fixtures');

test('桥接：jsdom 按 HTML5 规则隐式补 tbody（上游选择器依赖这一点）', () => {
  const doc = new HtmlDocument('<table class="itg gltm"><tr><td class="gl1m">x</td></tr></table>');
  assert.equal(doc.querySelectorAll('table.itg.gltm > tbody > tr').length, 1);
  assert.equal(doc.querySelectorAll('table.itg.gltm > tr').length, 0);
  doc.dispose();
});

test('桥接：querySelectorAll 返回真数组，可直接 .map/.find/.filter', () => {
  const doc = new HtmlDocument('<div><span class="a">1</span><span class="a">2</span></div>');
  const found = doc.querySelectorAll('span.a');
  assert.ok(Array.isArray(found));
  assert.deepEqual(found.map((e) => e.text), ['1', '2']);
  assert.equal(found.find((e) => e.text === '2').text, '2');
  doc.dispose();
});

test('桥接：attributes 是普通对象，能取 src/data-src/style', () => {
  const doc = new HtmlDocument('<img src="a.jpg" data-src="b.jpg" style="width:80px">');
  const img = doc.querySelector('img');
  assert.equal(img.attributes['src'], 'a.jpg');
  assert.equal(img.attributes['data-src'], 'b.jpg');
  assert.equal(img.attributes['style'], 'width:80px');
  doc.dispose();
});

test('桥接：children 只含元素节点，支持位置索引（上游 compact 模式依赖）', () => {
  const doc = new HtmlDocument('<div>text<p>one</p>\n<p>two</p></div>');
  const div = doc.querySelector('div');
  assert.equal(div.children.length, 2);
  assert.equal(div.children[0].text, 'one');
  assert.equal(div.children[1].text, 'two');
  assert.ok(Array.isArray(div.children));
  doc.dispose();
});

test('桥接：getElementById 可用；dispose 可重复调用', () => {
  const doc = new HtmlDocument('<h1 id="gn">T</h1>');
  assert.equal(doc.getElementById('gn').text, 'T');
  assert.equal(doc.getElementById('nope'), null);
  doc.dispose();
  doc.dispose();
});

test('夹具：33 个文件齐全', () => {
  const files = listFixtures();
  assert.equal(files.length, 33, `expect 33 fixtures, got ${files.length}`);
  assert.ok(files.includes('GalleryDetail.html'));
  assert.ok(files.includes('GalleryPageApiParserTest.json'));
});

test('夹具结构：10 个列表变体各含 25 个承载画廊链接的条目', () => {
  for (const name of LIST_VARIANTS) {
    const { withLink } = countGalleryRows(name);
    assert.equal(withLink, 25, `${name}: 画廊链接行 ${withLink}，expect 25`);
  }
});

test('夹具结构：Minimal/Compat 的表头行存在，所以「总行数 ≠ 画廊数」是正常的', () => {
  const minimal = new HtmlDocument(loadFixture('GalleryListParserTestEMinimal'));
  assert.deepEqual(
    minimal.querySelector('table.itg.gltm > tbody > tr').children.map((c) => c.tagName),
    ['TH', 'TH', 'TH', 'TH', 'TH', 'TH'],
  );
  minimal.dispose();

  const compat = new HtmlDocument(loadFixture('GalleryListParserTestECompat'));
  assert.deepEqual(
    compat.querySelector('table.itg.gltc > tbody > tr').children.map((c) => c.tagName),
    ['TH', 'TH', 'TH', 'TH'],
  );
  compat.dispose();
});

test('夹具结构：Extended 为一行一画廊、无表头', () => {
  // 注意：用 t.querySelectorAll('tbody > tr') 会连**嵌套表格**的行一起数到（曾量到 105/110），
  // 只有直接子代选择器才是真实条目行。这条测试就是把该差异钉住。
  const { rows, withLink } = countGalleryRows('GalleryListParserTestEExtended');
  assert.equal(withLink, 25);
  assert.equal(rows, 25, `Extended 直接子代行应为 25，实际 ${rows}`);
});

test('夹具结构：EmptyGalleryList 没有任何承载画廊链接的行', () => {
  const doc = new HtmlDocument(loadFixture('EmptyGalleryList'));
  const linked = doc
    .querySelectorAll('a')
    .filter((a) => /\/g\/\d+\/[0-9a-f]{6,}/.test(a.attributes['href'] || ''));
  assert.equal(linked.length, 0, `空列表页不应含画廊链接，实际 ${linked.length}`);
  doc.dispose();
});

test('夹具结构：GalleryDetail 详情页关键锚点存在（为后续阶段铺路）', () => {
  const doc = new HtmlDocument(loadFixture('GalleryDetail'));
  assert.ok(doc.querySelector('h1#gn'), 'h1#gn (标题)');
  assert.ok(doc.querySelector('div#gdd'), '#gdd (元信息区)');
  assert.ok(doc.querySelector('div#taglist'), '#taglist (标签表)');
  assert.ok(
    doc.querySelectorAll('script').find((e) => e.text.includes('var token')),
    '内联 var token 脚本',
  );
  doc.dispose();
});
