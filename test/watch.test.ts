import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDeps, allDeps} from '../lib/watch.ts';

const own = (prefix: string) => [...allDeps()].filter(f => f.startsWith(prefix)).sort();

test('allDeps is the union over every Markdown file, each file once', () => {
  recordDeps('/w1/a.md', ['/w1/x.ts', '/w1/y.ts']);
  recordDeps('/w1/b.md', ['/w1/y.ts', '/w1/z.ts']);
  assert.deepEqual(own('/w1/'), ['/w1/x.ts', '/w1/y.ts', '/w1/z.ts']);
});

test('recording again replaces what that Markdown file had: a figure that was removed is no longer watched', () => {
  recordDeps('/w2/a.md', ['/w2/old.ts', '/w2/keep.ts']);
  recordDeps('/w2/a.md', ['/w2/keep.ts', '/w2/new.ts']);
  assert.deepEqual(own('/w2/'), ['/w2/keep.ts', '/w2/new.ts']);
});

test('a file used by two Markdown files stays watched until both drop it', () => {
  recordDeps('/w3/a.md', ['/w3/shared.ts']);
  recordDeps('/w3/b.md', ['/w3/shared.ts']);
  recordDeps('/w3/a.md', []);
  assert.deepEqual(own('/w3/'), ['/w3/shared.ts']);
  recordDeps('/w3/b.md', []);
  assert.deepEqual(own('/w3/'), []);
});

test('the answer is a copy: changing it does not change what is recorded', () => {
  recordDeps('/w4/a.md', ['/w4/x.ts']);
  allDeps().delete('/w4/x.ts');
  assert.deepEqual(own('/w4/'), ['/w4/x.ts']);
});

test('the record is shared by every copy of the module (Slidev and Vite load this file separately)', async () => {
  const copy = await import('../lib/watch.ts?second-copy');
  const other = await import('../lib/watch.ts?third-copy');
  recordDeps('/w5/a.md', ['/w5/x.ts']);
  assert.deepEqual([...copy.allDeps()].filter((f: string) => f.startsWith('/w5/')), ['/w5/x.ts']);
  other.recordDeps('/w5/b.md', ['/w5/y.ts']);
  assert.deepEqual(own('/w5/'), ['/w5/x.ts', '/w5/y.ts']);
});
