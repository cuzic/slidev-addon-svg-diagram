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
