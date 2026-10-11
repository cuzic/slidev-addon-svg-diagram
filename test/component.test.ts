// components/SvgDiagram.vue, compiled and rendered on the server: what the markup is for each prop.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {parse, compileScript} from '@vue/compiler-sfc';
import {createSSRApp} from 'vue';
import {renderToString} from '@vue/server-renderer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'test', '.tmp', `component-${process.pid}`);
let Component: object;

before(async () => {
  const source = fs.readFileSync(path.join(ROOT, 'components', 'SvgDiagram.vue'), 'utf8');
  const {descriptor, errors} = parse(source, {filename: 'SvgDiagram.vue'});
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, {id: 'svg-diagram', inlineTemplate: true});
  fs.mkdirSync(OUT, {recursive: true});
  // inside the repo so that `import ... from 'vue'` resolves
  const file = path.join(OUT, `SvgDiagram-${Date.now()}.mjs`);
  fs.writeFileSync(file, stripTypeScriptTypes(script.content, {mode: 'strip'}));
  Component = (await import(file)).default;
});
after(() => fs.rmSync(OUT, {recursive: true, force: true}));

const render = (props: Record<string, unknown>) => renderToString(createSSRApp(Component, props));
const attrs = (html: string) => Object.fromEntries([...html.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

test('renders one <img> carrying src, alt and the class the stylesheet targets', async () => {
  const html = await render({src: '/diagrams/a.svg', alt: 'A flow'});
  assert.match(html, /^<img\b[^>]*>$/);
  const a = attrs(html);
  assert.equal(a.src, '/diagrams/a.svg');
  assert.equal(a.alt, 'A flow');
  assert.match(a.class, /\bsvg-diagram\b/);
});

test('width defaults to the full width and is set from the prop', async () => {
  assert.match(attrs(await render({src: 'x.svg'})).style, /width:\s*100%/);
  assert.match(attrs(await render({src: 'x.svg', width: '60%'})).style, /width:\s*60%/);
  assert.match(attrs(await render({src: 'x.svg', width: '320px'})).style, /width:\s*320px/);
});

test('alt defaults to empty (a decorative image), not to the file name', async () => {
  const a = attrs(await render({src: '/diagrams/a.svg'}));
  assert.equal(a.alt ?? '', '');
});

test('a data URI, as the transformer produces, goes through unchanged', async () => {
  const uri = 'data:image/svg+xml;base64,PHN2Zy8+';
  assert.equal(attrs(await render({src: uri})).src, uri);
});

test('values are escaped: quotes and angle brackets in alt cannot break out of the attribute', async () => {
  const html = await render({src: 'x.svg', alt: 'a "b" <c> & d'});
  assert.ok(!html.includes('<c>'));
  assert.equal(html.match(/<img/g)!.length, 1);
  assert.match(html, /alt="a &quot;b&quot; &lt;c&gt; &amp; d"/);
});

test('the component declares no other props: an unknown attribute falls through to the <img>', async () => {
  assert.equal(attrs(await render({src: 'x.svg', loading: 'lazy'})).loading, 'lazy');
});

test('the stylesheet centres the figure and keeps its aspect ratio', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components', 'SvgDiagram.vue'), 'utf8');
  const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
  assert.match(css, /\.svg-diagram\s*\{[^}]*margin:\s*0 auto/);
  assert.match(css, /height:\s*auto/);
  assert.match(css, /display:\s*block/);
});
