'use strict';
/**
 * 夹具登记表：把 CN_SXJ 的真实页面样本，变成「URL → 响应体」的路由表 + 期望值 oracle。
 *
 * 夹具来源：Ehviewer_CN_SXJ/app/src/test/resources/com/hippo/ehviewer/client/parser/
 * 只读，永不修改（见 AGENTS.md §2.1）。
 */
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'cn-sxj');

/** 列表页的 10 个变体：{E,Ex} × {Minimal, MinimalPlus, Compat, Extended, Thumbnail}。 */
const LIST_VARIANTS = [
  'GalleryListParserTestEMinimal',
  'GalleryListParserTestEMinimalPlus',
  'GalleryListParserTestECompat',
  'GalleryListParserTestEExtended',
  'GalleryListParserTestEThumbnail',
  'GalleryListParserTestExMinimal',
  'GalleryListParserTestExMinimalPlus',
  'GalleryListParserTestExCompat',
  'GalleryListParserTestExExtended',
  'GalleryListParserTestExThumbnail',
];

/**
 * 期望值 oracle。
 *
 * `galleries` 的来源有两处独立印证：
 *  1. CN_SXJ 的 GalleryListParserTest.java:79 断言 `result.galleryInfoList.size() == 25`
 *     —— 但注意该测试引用的文件名带两个点，磁盘上不存在，所以它**从未真正执行过**（见 docs/）。
 *     因此这条只作旁证。
 *  2. 本项目独立统计夹具内的画廊链接数（每个画廊在列表里出现 2 次链接 →
 *     Thumbnail/Extended 变体计数为 50，实际画廊数仍为 25）。这是主要依据。
 *
 * `uploader: null` 表示该变体不渲染上传者（缩略图模式），对应
 * GalleryListParserTest.java:95-106 的 assertNull(gi.uploader)。
 */
const EXPECTED = {
  GalleryListParserTestEMinimal: { galleries: 25, mode: 'minimal', uploader: true },
  GalleryListParserTestEMinimalPlus: { galleries: 25, mode: 'minimal', uploader: true },
  GalleryListParserTestECompat: { galleries: 25, mode: 'compat', uploader: true },
  GalleryListParserTestEExtended: { galleries: 25, mode: 'extended', uploader: true },
  GalleryListParserTestEThumbnail: { galleries: 25, mode: 'thumbnail', uploader: false },
  GalleryListParserTestExMinimal: { galleries: 25, mode: 'minimal', uploader: true },
  GalleryListParserTestExMinimalPlus: { galleries: 25, mode: 'minimal', uploader: true },
  GalleryListParserTestExCompat: { galleries: 25, mode: 'compat', uploader: true },
  GalleryListParserTestExExtended: { galleries: 25, mode: 'extended', uploader: true },
  GalleryListParserTestExThumbnail: { galleries: 25, mode: 'thumbnail', uploader: false },

  // 空列表：解析器必须返回 0 条且**不抛异常**（上游最容易在这里静默吞掉错误）
  EmptyGalleryList: { galleries: 0, mode: 'unknown', uploader: false },

  // 其他真实页面，用于后续阶段逐项接上
  GalleryListParserNew3: { galleries: 25, mode: 'unknown' },
  GalleryListUploader: { galleries: 25, mode: 'unknown' },
  FavoritesListParser: { galleries: null, mode: 'favorites' },
  GalleryTopListEX: { galleries: null, mode: 'toplist' },
  TopListGallary: { galleries: null, mode: 'toplist' },
  GalleryTopList: { galleries: null, mode: 'toplist' },
};

/**
 * 条目行容器：每种列表模式在真实页面里的行选择器（由夹具结构推导，见 docs/DECISIONS.md）。
 *
 * 注意两点（推导过程见探针输出）：
 *  - Minimal/Compat 的 tbody 首行是 `<tr>` 表头（TH×6 / TH×4），所以总行数 = 画廊数 + 1；
 *  - Extended 模式下每个画廊占多行（含标签行），只有承载画廊链接的那一行能产出结果。
 * 因此"是否静默丢弃"必须用「承载画廊链接的行数」，而不是总行数。
 */
const CONTAINER = {
  minimal: 'table.itg.gltm > tbody > tr',
  compat: 'table.itg.gltc > tbody > tr',
  extended: 'table.itg.glte > tbody > tr',
  thumbnail: 'div.gl1t',
};

const GALLERY_LINK_RE = /\/g\/\d+\/[0-9a-f]{6,}/;

/**
 * 从夹具结构独立数出「页面上真实存在的画廊条目数」= 承载画廊链接的行数。
 * 这是比硬编码 25 更可靠的 oracle：站点改版后它会随之变化，而硬编码不会。
 * @returns {{rows: number, withLink: number}}
 */
function countGalleryRows(fixtureName) {
  const { HtmlDocument } = require('./html-document');
  const mode = EXPECTED[fixtureName] && EXPECTED[fixtureName].mode;
  const selector = CONTAINER[mode];
  if (!selector) throw new Error(`no container selector for mode=${mode} (${fixtureName})`);
  const doc = new HtmlDocument(loadFixture(fixtureName));
  const rows = doc.querySelectorAll(selector);
  const withLink = rows.filter((row) =>
    row.querySelectorAll('a').some((a) => GALLERY_LINK_RE.test(a.attributes['href'] || '')),
  ).length;
  doc.dispose();
  return { rows: rows.length, withLink };
}

/**
 * 覆盖登记：哪个夹具被哪一类测试真正保护。
 *  'parse'      解析结果被断言（tests/gallery-list.test.js）
 *  'structural' 只断言了结构锚点存在，解析结果尚无 oracle
 * 未登记 = 无保护（站点改版不会报警）
 *
 * 这里是**显式声明**而不是扫描测试源码：扫描会因名字前缀（EMinimal ⊂ EMinimalPlus）
 * 与通用词（test.html）产生假阳性，曾导致 "test.html 已断言" 这种错误结论。
 */
const COVERAGE = Object.fromEntries(
  LIST_VARIANTS.map((name) => [name, 'parse']).concat([
    ['EmptyGalleryList', 'parse'],
    ['GalleryDetail', 'structural'],
  ]),
);

function fixturePath(name) {
  const file = name.endsWith('.html') || name.endsWith('.json') ? name : `${name}.html`;
  const full = path.join(FIXTURE_DIR, file);
  if (!fs.existsSync(full)) {
    throw new Error(`fixture not found: ${full}`);
  }
  return full;
}

function loadFixture(name) {
  return fs.readFileSync(fixturePath(name), 'utf8');
}

function listFixtures() {
  return fs.readdirSync(FIXTURE_DIR).sort();
}

module.exports = {
  FIXTURE_DIR,
  LIST_VARIANTS,
  EXPECTED,
  CONTAINER,
  COVERAGE,
  GALLERY_LINK_RE,
  countGalleryRows,
  fixturePath,
  loadFixture,
  listFixtures,
};
