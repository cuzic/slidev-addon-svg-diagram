// The real thing: a Slidev dev server serving a small deck that loads this addon. Slide modules are requested the way the
// browser does, and the figures are read back out of them. Slow (a server start), so one server serves every test.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DECK = path.join(ROOT, 'test', '.tmp', `e2e-${process.pid}`);
const SLIDEV = path.join(ROOT, 'node_modules', '@slidev', 'cli', 'bin', 'slidev.mjs');

const GOOD = (title: string, label = 'label') => `import {diagram, box} from 'svg-diagram';\nimport {${label}} from './helper.ts';\nexport default function define() { return diagram({theme: 'blue', title: '${title}'}).add(box({title: '${title}', body: ${label}})); }\n`;
const CROWDED = `import {diagram, row, box, connect} from 'svg-diagram';
export default function define() {
  return diagram({theme: 'blue'}).add(row([box({id: 'a', title: '左', body: '本文'}), box({id: 'b', title: '右', body: '本文'})], {gap: 24}), connect('a:right', 'b:left', {label: '長めのラベルです', chip: true, route: 'elbow'}));
}
`;

let server: ChildProcess, port: number, log = '';

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
  s.on('error', reject);
});
const get = async (url: string) => (await fetch(`http://localhost:${port}${url}`)).text();
const slideModule = (n: number) => get(`/slides.md__slidev_${n}.md?import`);
const svgsIn = (js: string) => [...js.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
async function until<T>(fn: () => Promise<T | false>, what: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => false as const);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}\n--- server log ---\n${log.slice(-2000)}`);
    await new Promise(r => setTimeout(r, 250));
  }
}

before(async () => {
  fs.mkdirSync(path.join(DECK, 'public', 'diagrams'), {recursive: true});
  fs.writeFileSync(path.join(DECK, 'helper.ts'), `export const label = 'helper-v1';\n`);
  fs.writeFileSync(path.join(DECK, 'flow.ts'), GOOD('flow-v1'));
  fs.writeFileSync(path.join(DECK, 'crowded.ts'), CROWDED);
  fs.writeFileSync(path.join(DECK, 'public', 'diagrams', 'plain.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  fs.writeFileSync(path.join(DECK, 'slides.md'), [
    '---', 'theme: default', 'addons:', `  - ${ROOT}`, '---', '',
    '# Title', '',
    '---', '',
    '# A source', '', '<SvgDiagram src="./flow.ts" alt="flow" width="70%" />', '',
    '---', '',
    '# Untouched', '', '<SvgDiagram src="/diagrams/plain.svg" alt="plain" />', '', '```md', '<SvgDiagram src="./shown.ts" />', '```', '',
    '---', '',
    '# A figure that fails verification', '', '<SvgDiagram src="./crowded.ts" />', '',
  ].join('\n'));
  port = await freePort();
  server = spawn(process.execPath, [SLIDEV, path.join(DECK, 'slides.md'), '--port', String(port)], {cwd: ROOT, env: {...process.env, FORCE_COLOR: '0'}});
  server.stdout!.on('data', d => { log += d; });
  server.stderr!.on('data', d => { log += d; });
  await until(async () => (await fetch(`http://localhost:${port}/`)).ok, 'the dev server to answer', 90_000);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(r => { server.once('exit', r); setTimeout(r, 5000); });
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  fs.rmSync(DECK, {recursive: true, force: true});
});

test('a slide with a source tag is served with the figure embedded and the other attributes kept', {timeout: 60_000}, async () => {
  const js = await slideModule(2);
  const svgs = svgsIn(js);
  assert.equal(svgs.length, 1);
  assert.match(svgs[0], /^<svg\b/);
  assert.match(svgs[0], /flow-v1/);
  assert.match(svgs[0], /helper-v1/);
  assert.ok(js.includes('70%') && js.includes('flow'));
  assert.ok(!js.includes('./flow.ts'), 'the .ts path is gone from the page');
});

test('the embedded figure is well-formed SVG with an accessible name', async () => {
  const [svg] = svgsIn(await slideModule(2));
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title\b/);
  assert.equal((svg.match(/<svg\b/g) ?? []).length, 1);
});

test('a plain .svg path and a tag shown inside a code fence are left alone', async () => {
  const js = await slideModule(3);
  assert.equal(svgsIn(js).length, 0);
  assert.ok(js.includes('/diagrams/plain.svg'));
  assert.ok(js.includes('shown.ts'), 'the example tag is still shown');
});

test('the plain .svg is still served from public/', async () => {
  assert.match(await get('/diagrams/plain.svg'), /^<svg\b/);
});

test('a figure that fails verification is still embedded in dev, and the problem is in the server log', async () => {
  const js = await slideModule(4);
  assert.equal(svgsIn(js).length, 1);
  await until(async () => /\[svg-diagram\] \.\/crowded\.ts failed verification/.test(log), 'the verification warning in the log', 10_000);
});

test('slides without a diagram tag are untouched by the addon', async () => {
  assert.equal(svgsIn(await slideModule(1)).length, 0);
});

test('editing the source regenerates the figure', {timeout: 60_000}, async () => {
  fs.writeFileSync(path.join(DECK, 'flow.ts'), GOOD('flow-v2'));
  const svg = await until(async () => { const [s] = svgsIn(await slideModule(2)); return /flow-v2/.test(s) ? s : false; }, 'the edited source to show');
  assert.match(svg, /helper-v1/);
});

test('editing a file the source imports regenerates the figure too', {timeout: 60_000}, async () => {
  fs.writeFileSync(path.join(DECK, 'helper.ts'), `export const label = 'helper-v2';\n`);
  await until(async () => /helper-v2/.test(svgsIn(await slideModule(2))[0] ?? ''), 'the edited helper to show');
});

test('a source that stops working shows its error instead of a stale figure, and recovers when fixed', {timeout: 60_000}, async () => {
  fs.writeFileSync(path.join(DECK, 'flow.ts'), 'export default function define( {\n');
  await until(async () => { const r = await fetch(`http://localhost:${port}/slides.md__slidev_2.md?import`); return !r.ok || /error/i.test(await r.text()) ? true : false; }, 'the broken source to be reported');
  fs.writeFileSync(path.join(DECK, 'flow.ts'), GOOD('flow-v3'));
  await until(async () => /flow-v3/.test(svgsIn(await slideModule(2))[0] ?? ''), 'the fixed source to show');
});
