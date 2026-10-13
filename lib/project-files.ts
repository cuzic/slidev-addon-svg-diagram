// The two project files a figure's rendering reads besides its own source: `.svg-diagram.json` (settings) and
// `svg-diagram.icons.json` (the icons the project installed). svg-diagram finds each by walking up from a directory;
// the addon does the same from the source's directory, so it can watch them and hand the icons over fresh.
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = '.svg-diagram.json';
export const ICONS_FILE = 'svg-diagram.icons.json';

/** `name` in `from` or the nearest parent directory, absolute, or undefined. */
export function findUp(name: string, from: string): string | undefined {
  let dir = path.resolve(from);
  for (;;) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

export interface ProjectFiles {
  config?: string;
  icons?: string;
  /** Every folder a new file of either name would change the answer in: from `from` up to the folder the nearest one was found in
   *  (or, when there is none, up to the folder with a package.json, or `from` alone). */
  dirs: string[];
}

export function projectFiles(from: string): ProjectFiles {
  const config = findUp(CONFIG_FILE, from), icons = findUp(ICONS_FILE, from);
  const top = [config, icons].filter((f): f is string => !!f).map(f => path.dirname(f)).sort((a, b) => a.length - b.length)[0]
    ?? (() => { const pkg = findUp('package.json', from); return pkg ? path.dirname(pkg) : path.resolve(from); })();
  const dirs: string[] = [];
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    dirs.push(dir);
    if (dir === top || dir === path.dirname(dir) || !dir.startsWith(top)) break;
  }
  return {config, icons, dirs};
}

/** Runs `fn` after every earlier call has finished: svg-diagram's installed icons are one value for the whole process, and a
 *  render reads it after its first await, so two renders must not overlap. */
let tail: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}
