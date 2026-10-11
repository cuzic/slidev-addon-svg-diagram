// What gets published and found: package.json against the Slidev addon conventions, against the files that are really there,
// and against what the code imports at runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), {withFileTypes: true})
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

test('named and tagged the way Slidev lists addons', () => {
  assert.match(pkg.name, /^(@[^/]+\/)?slidev-addon-[a-z0-9-]+$/);
  assert.ok(pkg.keywords.includes('slidev-addon'));
  assert.ok(pkg.keywords.includes('slidev'));
  assert.match(pkg.engines.slidev, /^>=\d+\.\d+\.\d+$/);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.ok(fs.existsSync(path.join(ROOT, 'LICENSE')));
});

test('every entry of `files` exists, and what Slidev looks for in an addon is among them', () => {
  for (const f of pkg.files) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is listed in files but missing`);
  for (const f of ['components', 'setup', 'lib', 'vite.config.ts']) assert.ok(pkg.files.includes(f), `${f} must be published`);
  for (const f of ['example', 'test', 'node_modules']) assert.ok(!pkg.files.includes(f), `${f} must not be published`);
});

test('every file the addon needs at run time is inside a published path', () => {
  const published = (f: string) => pkg.files.some((p: string) => f === p || f.startsWith(`${p}/`));
  for (const f of [...walk('components'), ...walk('setup'), ...walk('lib'), 'vite.config.ts']) assert.ok(published(f), `${f} is not published`);
});

test('every bare import the published code makes at run time is a declared dependency (type-only imports excluded)', () => {
  const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
  const builtin = (s: string) => s.startsWith('node:');
  const files = [...walk('setup'), ...walk('lib'), 'vite.config.ts'].filter(f => f.endsWith('.ts'));
  for (const f of files) {
    for (const m of read(f).matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('.') || builtin(spec)) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      assert.ok(declared.has(name), `${f} imports ${spec} at run time, but ${name} is not in dependencies or peerDependencies`);
    }
  }
});

test('svg-diagram is a peer dependency (the user decides its version), and its render entry is what the setup imports', () => {
  assert.ok(pkg.peerDependencies['svg-diagram']);
  assert.match(read('setup/transformers.ts'), /from 'svg-diagram\/render'/);
});

test('relative imports in published code point at files that exist, with their .ts extension', () => {
  for (const f of [...walk('setup'), ...walk('lib'), 'vite.config.ts'].filter(f => f.endsWith('.ts'))) {
    for (const m of read(f).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      assert.match(m[1], /\.ts$/, `${f}: ${m[1]}`);
      assert.ok(fs.existsSync(path.resolve(ROOT, path.dirname(f), m[1])), `${f} imports ${m[1]}, which is missing`);
    }
  }
});

test('the example deck loads the addon from this directory and uses diagrams that exist', () => {
  const slides = read('example/slides.md');
  assert.match(slides, /addons:\s*\n\s*-\s*\.\/\s*\n/);
  for (const m of slides.matchAll(/<SvgDiagram\b[^>]*\bsrc="([^"]+)"/g)) {
    const file = m[1].startsWith('/') ? path.join('example', 'public', m[1]) : path.join('example', m[1]);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${m[1]} → ${file} is missing`);
  }
});

test('the README documents the tag, the .svg form, and the known build problem', () => {
  const readme = read('README.md');
  assert.match(readme, /<SvgDiagram src="\.\/diagrams\/flow\.ts"/);
  assert.match(readme, /<SvgDiagram src="\/diagrams\/flow\.svg"/);
  assert.match(readme, /addons:\s*\n\s*-\s*svg-diagram/);
  assert.match(readme, /Known issues/);
});

test('the scripts exist and `test` runs every test file', () => {
  assert.match(pkg.scripts.test, /test\/\*\.test\.ts/);
  for (const s of ['dev', 'build', 'export']) assert.ok(pkg.scripts[s], s);
});
