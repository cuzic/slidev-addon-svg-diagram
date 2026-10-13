// vite.config.ts: the plugin that reloads the deck when a diagram source (or a file it imports) changes. Driven with a
// stand-in for Vite's dev server, so what it does to the server is what is asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import config from '../vite.config.ts';
import {recordDeps} from '../lib/watch.ts';

function fakeServer() {
  const watcher = Object.assign(new EventEmitter(), {added: [] as string[], add(f: string) { this.added.push(f); }});
  const calls = {invalidateAll: 0, sent: [] as unknown[]};
  const middlewares: ((req: unknown, res: unknown, next: () => void) => void)[] = [];
  const server = {
    watcher,
    moduleGraph: {invalidateAll() { calls.invalidateAll++; }},
    ws: {send(m: unknown) { calls.sent.push(m); }},
    middlewares: {use(fn: (typeof middlewares)[number]) { middlewares.push(fn); }},
  };
  const plugin = config.plugins[0] as {name: string; configureServer: (s: unknown) => void};
  plugin.configureServer(server);
  const request = () => { let nexts = 0; for (const m of middlewares) m({}, {}, () => { nexts++; }); return nexts; };
  return {watcher, calls, middlewares, request};
}

test('the config is one plugin, named for this addon', () => {
  assert.equal(config.plugins.length, 1);
  assert.equal((config.plugins[0] as {name: string}).name, 'slidev-addon-svg-diagram:reload');
});

test('a change to a file a figure depends on invalidates the modules and reloads the page, once', () => {
  const s = fakeServer();
  recordDeps('/v1/slides.md', ['/v1/flow.ts', '/v1/lib/helper.ts']);
  s.watcher.emit('change', '/v1/lib/helper.ts');
  assert.equal(s.calls.invalidateAll, 1);
  assert.deepEqual(s.calls.sent, [{type: 'full-reload'}]);
});

test('a change to any other file does nothing', () => {
  const s = fakeServer();
  recordDeps('/v2/slides.md', ['/v2/flow.ts']);
  s.watcher.emit('change', '/v2/slides.md');
  s.watcher.emit('change', '/v2/other.ts');
  s.watcher.emit('change', '/v2/flow.ts.bak');
  assert.equal(s.calls.invalidateAll, 0);
  assert.deepEqual(s.calls.sent, []);
});

test('a source that is no longer used by any slide stops reloading the deck', () => {
  const s = fakeServer();
  recordDeps('/v3/slides.md', ['/v3/gone.ts', '/v3/kept.ts']);
  recordDeps('/v3/slides.md', ['/v3/kept.ts']);
  s.watcher.emit('change', '/v3/gone.ts');
  assert.equal(s.calls.invalidateAll, 0);
  s.watcher.emit('change', '/v3/kept.ts');
  assert.equal(s.calls.invalidateAll, 1);
});

test('each change reloads: two edits, two reloads', () => {
  const s = fakeServer();
  recordDeps('/v4/slides.md', ['/v4/flow.ts']);
  s.watcher.emit('change', '/v4/flow.ts');
  s.watcher.emit('change', '/v4/flow.ts');
  assert.equal(s.calls.invalidateAll, 2);
  assert.equal(s.calls.sent.length, 2);
});

test('sources outside the project root are added to the watcher, each once, when they first show up', () => {
  const s = fakeServer();
  recordDeps('/v5/slides.md', ['/v5/../elsewhere/a.ts']);
  s.request();
  s.request();
  assert.deepEqual(s.watcher.added.filter(f => f.includes('elsewhere')), ['/v5/../elsewhere/a.ts']);
  recordDeps('/v5/slides.md', ['/v5/../elsewhere/a.ts', '/v5/../elsewhere/b.ts']);
  s.request();
  assert.deepEqual(s.watcher.added.filter(f => f.includes('elsewhere')), ['/v5/../elsewhere/a.ts', '/v5/../elsewhere/b.ts']);
});

test('the middleware always passes the request on, exactly once', () => {
  const s = fakeServer();
  assert.equal(s.middlewares.length, 1);
  assert.equal(s.request(), 1);
  recordDeps('/v6/slides.md', ['/v6/x.ts']);
  assert.equal(s.request(), 1);
});

test('a settings or icons file that is created or deleted in a folder a figure looks in reloads the deck; elsewhere or another name does not', () => {
  const s = fakeServer();
  recordDeps('/v9/slides.md', ['/v9/figs/a.ts'], ['/v9/figs', '/v9']);
  s.request();
  assert.ok(s.watcher.added.includes('/v9') && s.watcher.added.includes('/v9/figs'));
  s.watcher.emit('add', '/v9/svg-diagram.icons.json');
  s.watcher.emit('unlink', '/v9/figs/.svg-diagram.json');
  assert.equal(s.calls.invalidateAll, 2);
  s.watcher.emit('add', '/v9/other.json');
  s.watcher.emit('add', '/elsewhere/svg-diagram.icons.json');
  assert.equal(s.calls.invalidateAll, 2);
});
