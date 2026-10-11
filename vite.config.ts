import type {Plugin} from 'vite';
import {allDeps} from './lib/watch.ts';

// Editing a diagram source (or a file it imports) does not touch the Markdown, so Vite would not re-run the transform.
// Reload the deck when one changes. Files outside the project root are added to the watcher.
function svgDiagramReload(): Plugin {
  return {
    name: 'slidev-addon-svg-diagram:reload',
    configureServer(server) {
      const seen = new Set<string>();
      const watch = () => { for (const f of allDeps()) if (!seen.has(f)) { seen.add(f); server.watcher.add(f); } };
      server.watcher.on('change', (file) => {
        watch();
        if (!allDeps().has(file)) return;
        server.moduleGraph.invalidateAll();
        server.ws.send({type: 'full-reload'});
      });
      server.middlewares.use((_req, _res, next) => { watch(); next(); });
    },
  };
}

export default {plugins: [svgDiagramReload()]};
