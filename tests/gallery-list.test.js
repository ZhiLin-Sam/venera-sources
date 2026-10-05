'use strict';
/**
 * Phase 1 核心：列表页解析的夹具驱动回归测试。
 *
 * 除了"条数对不对"，这里最重要的是**承载画廊链接的行数 == 解析成功条数**这条等式：
 * 上游源在逐行解析里 `catch(e) {}`（sources/upstream/ehentai.js:298/321/350/376），
 * 站点一改版就会"页面明明有 25 个画廊、结果只剩 10 条、还不报错"。
 * 把两边强行挂钩，静默丢失就会变成一个响亮的失败。这才是"抗改版"的实际抓手。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSource } = require('../harness/runtime');
const { EXPECTED, LIST_VARIANTS, countGalleryRows } = require('../harness/fixtures');

const SOURCE = path.join(__dirname, '..', 'sources', 'ehentai.js');
const LIST_URL = 'https://e-hentai.org/?page=0';

function runSource(fixtureName, url = LIST_URL) {
  return loadSource(SOURCE, {
    routes: [{ match: url, fixture: fixtureName }],
    settings: { domain: 'e-hentai.org' },
    isLogged: false,
  });
}

for (const name of LIST_VARIANTS) {
  const expect = EXPECTED[name];

  test(`列表变体 ${name}：解析出 ${expect.galleries} 条`, async () => {
    const rt = runSource(name);
    const res = await rt.source.getGalleries(LIST_URL, false);
    assert.equal(
      res.comics.length,
      expect.galleries,
      `${name}: 期望 ${expect.galleries} 条，实际 ${res.comics.length} 条`,
    );
    assert.equal(rt.diagnostics.misses.length, 0, '不应有未匹配路由的请求');
  });

  test(`列表变体 ${name}：画廊链接行数 == 解析条数（不得静默丢失）`, async () => {
    const rt = runSource(name);
    const res = await rt.source.getGalleries(LIST_URL, false);

    const { withLink } = countGalleryRows(name);
    assert.equal(withLink, expect.galleries, `${name}: 夹具链接行 ${withLink}，oracle 需复核`);
    assert.equal(
      res.comics.length,
      withLink,
      `${name}: 页面有 ${withLink} 个画廊条目，只解析出 ${res.comics.length} 条 —— ` +
        `${withLink - res.comics.length} 条被静默丢弃（上游 catch(e){} 吞掉了）`,
    );
  });

  test(`列表变体 ${name}：字段完整（链接/标题/封面/时间）`, async () => {
    const rt = runSource(name);
    const res = await rt.source.getGalleries(LIST_URL, false);

    const bad = res.comics.filter((c) => !c.id || !c.title || !c.cover);
    assert.equal(
      bad.length,
      0,
      `${name}: ${bad.length} 条字段缺失，首条 = ${JSON.stringify(bad[0], null, 2)}`,
    );

    const badLink = res.comics.filter((c) => !/\/g\/\d+\/[0-9a-f]+/.test(String(c.id)));
    assert.equal(
      badLink.length,
      0,
      `${name}: ${badLink.length} 条链接不是画廊链接，首条 id = ${JSON.stringify(badLink[0]?.id)}`,
    );

    const unknownTitles = res.comics.filter((c) => c.title === 'Unknown');
    assert.equal(
      unknownTitles.length,
      0,
      `${name}: ${unknownTitles.length} 条标题回落到 "Unknown"，说明标题选择器失配`,
    );
  });
}

test('空列表 EmptyGalleryList：返回 0 条且不抛异常', async () => {
  const rt = runSource('EmptyGalleryList');
  const res = await rt.source.getGalleries(LIST_URL, false);
  assert.equal(res.comics.length, 0);
});

test('未匹配路由必须响亮失败（防止测试退化成假绿）', async () => {
  const rt = loadSource(SOURCE, { routes: [], settings: { domain: 'e-hentai.org' } });
  await assert.rejects(
    () => rt.source.getGalleries('https://e-hentai.org/somewhere-else', false),
    /no fixture route/,
  );
});

test('基线可加载：源脚本必须定义 ComicSource 子类且带元数据', () => {
  const rt = loadSource(SOURCE, { routes: [] });
  assert.equal(rt.source.name, 'ehentai');
  assert.equal(rt.source.key, 'ehentai');
  assert.ok(rt.source.version, 'version');
  assert.ok(rt.source.minAppVersion, 'minAppVersion');
});
