import type {Plugin} from 'vite';
import path from 'node:path';
import {allDeps, allWatchDirs} from './lib/watch.ts';
import {CONFIG_FILE, ICONS_FILE} from './lib/project-files.ts';

// Editing a diagram source (or a file it imports) does not touch the Markdown, so Vite would not re-run the transform.
// Reload the deck when one changes. Files outside the project root are added to the watcher.
function svgDiagramReload(): Plugin {
  return {
    name: 'slidev-addon-svg-diagram:reload',
    configureServer(server) {
      const seen = new Set<string>();
      const watch = () => { for (const f of [...allDeps(), ...allWatchDirs()]) if (!seen.has(f)) { seen.add(f); server.watcher.add(f); } };
      const reload = () => { server.moduleGraph.invalidateAll(); server.ws.send({type: 'full-reload'}); };
      server.watcher.on('change', (file) => {
        watch();
        if (!allDeps().has(file)) return;
        reload();
      });
      // a settings / icons file that is created or deleted changes which one a figure uses (an edit is the 'change' above)
      for (const event of ['add', 'unlink'] as const) server.watcher.on(event, (file) => {
        if (![CONFIG_FILE, ICONS_FILE].includes(path.basename(file)) || !allWatchDirs().has(path.dirname(file))) return;
        watch();
        reload();
      });
      server.middlewares.use((_req, _res, next) => { watch(); next(); });
    },
  };
}

export default {plugins: [svgDiagramReload()]};
