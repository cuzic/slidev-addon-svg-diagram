// setup/transformers.ts as Slidev calls it: a context with the slide's Markdown in a MagicString, the file it came from and the
// mode. The rendering is real (svg-diagram/render), so these also prove the two packages fit together.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MagicString from 'magic-string';
import setup from '../setup/transformers.ts';
import {allDeps} from '../lib/watch.ts';

type Mode = 'dev' | 'build' | 'export';
const pre = (setup({} as never) as unknown as {pre: ((ctx: unknown) => Promise<void>)[]}).pre[0];

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'addon-transformers-'));
const GOOD = (title: string) => `import {diagram, box} from 'svg-diagram';\nexport default function define() { return diagram({theme: 'blue'}).add(box({title: '${title}'})); }\n`;
const CROWDED = `import {diagram, row, box, connect} from 'svg-diagram';
export default function define() {
  return diagram({theme: 'blue'}).add(row([box({id: 'a', title: '左', body: '本文'}), box({id: 'b', title: '右', body: '本文'})], {gap: 24}), connect('a:right', 'b:left', {label: '長めのラベルです', chip: true, route: 'elbow'}));
}
`;
async function transform(code: string, mdFile: string, mode: Mode = 'dev', index = 0) {
  const s = new MagicString(code);
  await pre({s, slide: {index, source: {filepath: mdFile}}, options: {mode}});
  return s.toString();
}
const embedded = (md: string) => [...md.matchAll(/src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
async function warnings<T>(fn: () => Promise<T>): Promise<{result: T; warned: string[]}> {
  const warned: string[] = [];
  const warn = console.warn; console.warn = (m: unknown) => { warned.push(String(m)); };
  try { return {result: await fn(), warned}; } finally { console.warn = warn; }
}

test('the setup is a function returning one pre-transformer', () => {
  assert.equal(typeof setup, 'function');
  const r = setup({} as never) as unknown as {pre: unknown[]};
  assert.equal(r.pre.length, 1);
  assert.equal(typeof r.pre[0], 'function');
});

test('renders a source into the tag and leaves the rest of the slide byte for byte', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.ts'), GOOD('見出しA'));
  const md = `# タイトル\n\n- 箇条書き **強調**\n\n<SvgDiagram src="./a.ts" alt="図" width="50%" />\n\n最後の行\n`;
  const out = await transform(md, path.join(dir, 'slides.md'));
  const [svg] = embedded(out);
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /見出しA/);
  assert.equal(out.replace(/src="data:[^"]*"/, 'src="X"'), md.replace('src="./a.ts"', 'src="X"'));
  fs.rmSync(dir, {recursive: true});
});

test('paths are relative to the Markdown file, which may be in another folder', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'pages'));
  fs.mkdirSync(path.join(dir, 'figs'));
  fs.writeFileSync(path.join(dir, 'figs', 'f.ts'), GOOD('from figs'));
  const out = await transform('<SvgDiagram src="../figs/f.ts" />', path.join(dir, 'pages', 'p.md'));
  assert.match(embedded(out)[0], /from figs/);
  fs.rmSync(dir, {recursive: true});
});

test('records what each Markdown file depends on, including what a source imports', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'helper.ts'), `export const label = 'helped';\n`);
  fs.writeFileSync(path.join(dir, 'a.ts'), `import {diagram, box} from 'svg-diagram';\nimport {label} from './helper.ts';\nexport default function define() { return diagram({theme: 'blue'}).add(box({title: label})); }\n`);
  await transform('<SvgDiagram src="./a.ts" />', path.join(dir, 'slides.md'));
  const deps = allDeps();
  assert.ok(deps.has(path.join(dir, 'a.ts')));
  assert.ok(deps.has(path.join(dir, 'helper.ts')));
  fs.rmSync(dir, {recursive: true});
});

test('every slide of a deck keeps its own record: transforming slide 4 does not make slide 2\'s figure unwatched', async () => {
  const dir = tmp();
  const md = path.join(dir, 'slides.md');
  fs.writeFileSync(path.join(dir, 'two.ts'), GOOD('two'));
  fs.writeFileSync(path.join(dir, 'four.ts'), GOOD('four'));
  await transform('<SvgDiagram src="./two.ts" />', md, 'dev', 1);
  await transform('<SvgDiagram src="./four.ts" />', md, 'dev', 3);
  assert.ok(allDeps().has(path.join(dir, 'two.ts')));
  assert.ok(allDeps().has(path.join(dir, 'four.ts')));
  // re-transforming a slide replaces only that slide's record: a figure removed from slide 4 is no longer watched
  await transform('no figure now', md, 'dev', 3);
  assert.ok(allDeps().has(path.join(dir, 'two.ts')));
  assert.ok(!allDeps().has(path.join(dir, 'four.ts')));
  fs.rmSync(dir, {recursive: true});
});

test('a slide with no diagram tag is returned unchanged and nothing is rendered', async () => {
  const dir = tmp();
  const md = '# Plain\n\ntext `<SvgDiagram src="./x.ts" />`\n\n```md\n<SvgDiagram src="./y.ts" />\n```\n<SvgDiagram src="/diagrams/a.svg" />\n';
  assert.equal(await transform(md, path.join(dir, 'slides.md')), md);
  fs.rmSync(dir, {recursive: true});
});

test('dev: a figure that fails verification is embedded anyway, with the problems printed', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'bad.ts'), CROWDED);
  const {result: out, warned} = await warnings(() => transform('<SvgDiagram src="./bad.ts" />', path.join(dir, 'slides.md'), 'dev'));
  assert.equal(embedded(out).length, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /\[svg-diagram\] \.\/bad\.ts failed verification/);
  fs.rmSync(dir, {recursive: true});
});

test('build and export: a figure that fails verification stops the build, naming the figure and the problem', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'bad.ts'), CROWDED);
  for (const mode of ['build', 'export'] as Mode[]) {
    await assert.rejects(transform('<SvgDiagram src="./bad.ts" />', path.join(dir, 'slides.md'), mode), (e: Error) => /\[svg-diagram\] \.\/bad\.ts failed verification/.test(e.message) && e.message.split('\n').length > 1);
  }
  fs.rmSync(dir, {recursive: true});
});

test('a source that does not exist, does not parse, or does not build a diagram fails the slide with the tag and file named', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'syntax.ts'), 'export default function define( {\n');
  fs.writeFileSync(path.join(dir, 'nodefault.ts'), 'export const x = 1;\n');
  const md = path.join(dir, 'slides.md');
  for (const f of ['missing.ts', 'syntax.ts', 'nodefault.ts']) {
    await assert.rejects(transform(`<SvgDiagram src="./${f}" />`, md), (e: Error) => e.message.includes(`<SvgDiagram src="./${f}">`) && e.message.includes(md));
  }
  fs.rmSync(dir, {recursive: true});
});

test('dev re-reads an edited source', async () => {
  const dir = tmp();
  const src = path.join(dir, 'e.ts');
  const md = path.join(dir, 'slides.md');
  fs.writeFileSync(src, GOOD('before edit'));
  assert.match(embedded(await transform('<SvgDiagram src="./e.ts" />', md, 'dev'))[0], /before edit/);
  fs.writeFileSync(src, GOOD('after edit'));
  assert.match(embedded(await transform('<SvgDiagram src="./e.ts" />', md, 'dev'))[0], /after edit/);
  fs.rmSync(dir, {recursive: true});
});

test('the same figure used twice in a slide is embedded twice, identically', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'twice.ts'), GOOD('twice'));
  const out = await transform('<SvgDiagram src="./twice.ts" width="40%" />\n\n<SvgDiagram src="./twice.ts" width="60%" />\n', path.join(dir, 'slides.md'));
  const svgs = embedded(out);
  assert.equal(svgs.length, 2);
  assert.equal(svgs[0], svgs[1]);
  assert.ok(out.includes('width="40%"') && out.includes('width="60%"'));
  fs.rmSync(dir, {recursive: true});
});

test('several figures: each is rendered into its own tag', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'one.ts'), GOOD('uno'));
  fs.writeFileSync(path.join(dir, 'two.ts'), GOOD('dos'));
  const svgs = embedded(await transform('<SvgDiagram src="./one.ts" />\n\n<SvgDiagram src="./two.ts" />\n', path.join(dir, 'slides.md')));
  assert.match(svgs[0], /uno/);
  assert.match(svgs[1], /dos/);
  fs.rmSync(dir, {recursive: true});
});

test('the embedded SVG is the same one svg-diagram/render gives, as a base64 data URI an <img> can load', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'same.ts'), GOOD('same'));
  const {renderSource} = await import('svg-diagram/render');
  const direct = await renderSource(path.join(dir, 'same.ts'), {fresh: true});
  const out = await transform('<SvgDiagram src="./same.ts" />', path.join(dir, 'slides.md'));
  assert.equal(embedded(out)[0], direct.svg);
  assert.ok(!out.includes('\n'), 'the tag stays on one line');
  fs.rmSync(dir, {recursive: true});
});

// ---- the project's icons and settings ------------------------------------------------------------------------------------
const ICONS = (d: string) => JSON.stringify({version: 1, icons: {lock2: {vb: [0, 0, 24], d, from: 'mdi:lock', license: 'Apache-2.0'}}});
const ICON_FIG = `import {diagram, box} from 'svg-diagram';\nexport default function define() { return diagram({theme: 'blue'}).add(box({icon: 'lock2', title: 'x'})); }\n`;

test('an icon the project installed is drawn, found from the source\'s directory and not the working directory', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'figs'));
  fs.writeFileSync(path.join(dir, 'svg-diagram.icons.json'), ICONS('M1 1h8v8H1z'));
  fs.writeFileSync(path.join(dir, 'figs', 'a.ts'), ICON_FIG);
  const out = await transform('<SvgDiagram src="./figs/a.ts" />', path.join(dir, 'slides.md'));
  assert.match(embedded(out)[0], /data-icon="lock2"/);
  fs.rmSync(dir, {recursive: true});
});

test('editing the icons file or the settings file is watched, and the next render shows the new icon', async () => {
  const dir = tmp();
  const icons = path.join(dir, 'svg-diagram.icons.json'), config = path.join(dir, '.svg-diagram.json');
  fs.writeFileSync(icons, ICONS('M1 1h8v8H1z'));
  fs.writeFileSync(config, '{}');
  fs.writeFileSync(path.join(dir, 'a.ts'), ICON_FIG);
  const md = path.join(dir, 'slides.md');
  const first = embedded(await transform('<SvgDiagram src="./a.ts" />', md))[0];
  assert.ok(allDeps().has(icons) && allDeps().has(config));
  fs.writeFileSync(icons, ICONS('M2 2h20v20H2z'));
  const second = embedded(await transform('<SvgDiagram src="./a.ts" />', md))[0];
  assert.notEqual(second, first);
  assert.match(second, /M2 2h20v20H2z/);
  fs.rmSync(dir, {recursive: true});
});

test('a project with no icons file renders icon-free figures as before', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.ts'), GOOD('plain'));
  const out = await transform('<SvgDiagram src="./a.ts" />', path.join(dir, 'slides.md'));
  assert.match(embedded(out)[0], /plain/);
  fs.rmSync(dir, {recursive: true});
});
