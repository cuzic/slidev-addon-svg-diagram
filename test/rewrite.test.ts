import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteDiagramTags, toDataUri, type Render} from '../lib/rewrite.ts';

const render: Render = async (abs) => ({svg: `<svg>${abs}</svg>`, ok: true, problems: [], deps: [abs, abs + '.dep']});
const apply = (code: string, edits: {start: number; end: number; text: string}[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), code);

test('rewrites src of an <SvgDiagram> tag to a data URI, relative to the Markdown file, and keeps the other attributes', async () => {
  const md = '# T\n\n<SvgDiagram src="./flow.ts" alt="Flow" width="60%" />\n';
  const r = await rewriteDiagramTags(md, '/deck/slides.md', render);
  assert.equal(apply(md, r.edits), `# T\n\n<SvgDiagram src="${toDataUri('<svg>/deck/flow.ts</svg>')}" alt="Flow" width="60%" />\n`);
  assert.deepEqual(r.deps, ['/deck/flow.ts', '/deck/flow.ts.dep']);
});

test('leaves .svg sources, tags in fenced code, and tags without src alone', async () => {
  const md = ['<SvgDiagram src="/diagrams/a.svg" />', '', '```md', '<SvgDiagram src="./shown.ts" />', '```', '', '<SvgDiagram :src="x" />', ''].join('\n');
  const r = await rewriteDiagramTags(md, '/deck/slides.md', render);
  assert.deepEqual(r.edits, []);
});

test('renders a source used twice once, handles single quotes and a src from a subfolder', async () => {
  let calls = 0;
  const counting: Render = async (abs) => { calls++; return render(abs); };
  const md = `<SvgDiagram src='../d/x.ts' />\n\n<SvgDiagram src="../d/x.ts" width="50%"/>\n`;
  const r = await rewriteDiagramTags(md, '/deck/pages/p.md', counting);
  assert.equal(calls, 1);
  assert.equal(r.edits.length, 2);
  assert.deepEqual(r.deps, ['/deck/d/x.ts', '/deck/d/x.ts.dep']);
});

test('reports a diagram that failed verification, and names the tag when rendering throws', async () => {
  const bad: Render = async () => ({svg: '<svg/>', ok: false, problems: ['overlap'], deps: []});
  const r = await rewriteDiagramTags('<SvgDiagram src="./a.ts" />', '/deck/s.md', bad);
  assert.deepEqual(r.failed, [{src: './a.ts', problems: ['overlap']}]);
  await assert.rejects(rewriteDiagramTags('<SvgDiagram src="./a.ts" />', '/deck/s.md', async () => { throw new Error('boom'); }), /<SvgDiagram src="\.\/a\.ts"> in \/deck\/s\.md: boom/);
});

// ---- what is, and is not, a diagram tag ----

const run = (md: string, mdFile = '/deck/slides.md') => rewriteDiagramTags(md, mdFile, render);
const srcs = (r: {edits: {text: string}[]}) => r.edits.length;

test('several tags in one slide are all rewritten, including two on one line', async () => {
  const md = '<SvgDiagram src="./a.ts" /> <SvgDiagram src="./b.ts" />\n\ntext\n\n<SvgDiagram src="./c.ts" alt="c"/>\n';
  const r = await run(md);
  assert.equal(srcs(r), 3);
  const out = apply(md, r.edits);
  for (const n of ['a', 'b', 'c']) assert.ok(out.includes(toDataUri(`<svg>/deck/${n}.ts</svg>`)), n);
  assert.ok(!out.includes('./a.ts') && !out.includes('./b.ts') && !out.includes('./c.ts'));
});

test('attributes may be on several lines, in any order, with spaces around =', async () => {
  const md = '<SvgDiagram\n  alt="Flow"\n  width="70%"\n  src = "./multi.ts"\n/>\n';
  const r = await run(md);
  assert.equal(srcs(r), 1);
  assert.ok(apply(md, r.edits).includes('alt="Flow"\n  width="70%"\n  src="data:image/svg+xml;base64,'));
});

test('a > inside another attribute value does not cut the tag short', async () => {
  const md = '<SvgDiagram alt="a > b" src="./gt.ts" />\n';
  assert.equal(srcs(await run(md)), 1);
  assert.equal(srcs(await run(`<SvgDiagram alt='x > y' src='./gt.ts' />`)), 1);
});

test('only a plain src attribute counts: not :src, v-bind:src, data-src, or other components that start the same', async () => {
  for (const md of [
    '<SvgDiagram :src="foo.ts" />',
    '<SvgDiagram v-bind:src="foo.ts" />',
    '<SvgDiagram data-src="./x.ts" />',
    '<SvgDiagramFoo src="./x.ts" />',
    '<SvgDiagram-foo src="./x.ts" />',
    '<svgdiagram src="./x.ts" />',
    '<Other src="./x.ts" />',
  ]) assert.equal(srcs(await run(md)), 0, md);
});

test('a src that is not a .ts file is left to the browser: .svg, http, a data URI, an empty value', async () => {
  for (const s of ['/diagrams/a.svg', 'https://example.com/x.ts.svg', 'data:image/svg+xml;base64,AAAA', '', './x.mts', './x.tsx']) {
    assert.equal(srcs(await run(`<SvgDiagram src="${s}" />`)), 0, s);
  }
});

test('a tag in a fenced code block is shown as written: backtick and tilde fences, with an info string, and a longer fence around a shorter one', async () => {
  for (const md of [
    '```md\n<SvgDiagram src="./x.ts" />\n```\n',
    '~~~\n<SvgDiagram src="./x.ts" />\n~~~\n',
    '````md\n```\n<SvgDiagram src="./x.ts" />\n```\n````\n',
    '   ```\n<SvgDiagram src="./x.ts" />\n   ```\n',
    '```\n<SvgDiagram src="./x.ts" />\n',   // never closed: the rest of the slide is code
  ]) assert.equal(srcs(await run(md)), 0, md);
});

test('a tag after a closed fence is rewritten; a fence of the other kind does not close it', async () => {
  assert.equal(srcs(await run('```\ncode\n```\n\n<SvgDiagram src="./x.ts" />\n')), 1);
  assert.equal(srcs(await run('```\n~~~\n<SvgDiagram src="./x.ts" />\n~~~\n```\n')), 0);
  assert.equal(srcs(await run('```\ncode\n```\n<SvgDiagram src="./x.ts" />\n```\nmore\n```\n')), 1);
});

test('a tag in inline code is shown as written', async () => {
  assert.equal(srcs(await run('Write `<SvgDiagram src="./x.ts" />` in the slide.\n')), 0);
  assert.equal(srcs(await run('Use ``<SvgDiagram src="./x.ts" />`` here.\n')), 0);
  assert.equal(srcs(await run('`code` then <SvgDiagram src="./x.ts" />\n')), 1);
});

test('a tag in an HTML comment is not rendered', async () => {
  assert.equal(srcs(await run('<!-- <SvgDiagram src="./x.ts" /> -->\n')), 0);
  assert.equal(srcs(await run('<!--\n<SvgDiagram src="./x.ts" />\n-->\n<SvgDiagram src="./y.ts" />\n')), 1);
});

test('src is resolved from the Markdown file: nested folders, .., and a file at the filesystem root', async () => {
  const seen: string[] = [];
  const spy: Render = async (abs) => { seen.push(abs); return render(abs); };
  await rewriteDiagramTags('<SvgDiagram src="d/x.ts" />\n<SvgDiagram src="../up/y.ts" />\n<SvgDiagram src="/abs/z.ts" />', '/deck/pages/p.md', spy);
  assert.deepEqual(seen, ['/deck/pages/d/x.ts', '/deck/up/y.ts', '/abs/z.ts']);
});

test('edits do not overlap and each replaces exactly the src attribute', async () => {
  const md = 'a <SvgDiagram src="./a.ts" alt="x"/> b <SvgDiagram width="1" src=\'./b.ts\'/> c\n';
  const r = await run(md);
  const edits = [...r.edits].sort((x, y) => x.start - y.start);
  for (let i = 1; i < edits.length; i++) assert.ok(edits[i - 1].end <= edits[i].start);
  assert.deepEqual(edits.map(e => md.slice(e.start, e.end)), ['src="./a.ts"', `src='./b.ts'`]);
});

test('no tags: nothing rendered, nothing recorded', async () => {
  let calls = 0;
  const r = await rewriteDiagramTags('# Title\n\nplain text\n', '/deck/s.md', async (a) => { calls++; return render(a); });
  assert.equal(calls, 0);
  assert.deepEqual(r, {edits: [], deps: [], failed: []});
});

test('deps are collected from every figure, once each', async () => {
  const r = await run('<SvgDiagram src="./a.ts" />\n<SvgDiagram src="./b.ts" />\n<SvgDiagram src="./a.ts" />\n');
  assert.deepEqual(new Set(r.deps), new Set(['/deck/a.ts', '/deck/a.ts.dep', '/deck/b.ts', '/deck/b.ts.dep']));
  assert.equal(r.deps.length, 4);
});

test('a figure that failed verification is reported once even if used twice, and its picture is still embedded', async () => {
  const bad: Render = async (abs) => ({svg: `<svg>bad ${abs}</svg>`, ok: false, problems: ['p1', 'p2'], deps: [abs]});
  const md = '<SvgDiagram src="./f.ts" />\n<SvgDiagram src="./f.ts" />\n';
  const r = await rewriteDiagramTags(md, '/deck/s.md', bad);
  assert.deepEqual(r.failed, [{src: './f.ts', problems: ['p1', 'p2']}]);
  assert.equal(srcs(r), 2);
});

test('one figure that cannot be rendered stops the slide, even if others are fine', async () => {
  const picky: Render = async (abs) => { if (abs.endsWith('bad.ts')) throw new Error('nope'); return render(abs); };
  await assert.rejects(rewriteDiagramTags('<SvgDiagram src="./ok.ts" />\n<SvgDiagram src="./bad.ts" />', '/deck/s.md', picky), /bad\.ts.*nope/);
});

test('toDataUri round-trips any SVG text: Japanese, quotes, angle brackets, a BOM-like character', () => {
  for (const svg of ['<svg>在庫 "管理" & <b></svg>', '<svg/>', '﻿<svg>x</svg>', '<svg>🙂</svg>']) {
    const uri = toDataUri(svg);
    assert.match(uri, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/);
    assert.equal(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'), svg);
  }
});
