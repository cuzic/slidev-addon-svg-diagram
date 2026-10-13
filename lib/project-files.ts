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
