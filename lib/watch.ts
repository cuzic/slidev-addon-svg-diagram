// Which files each slide's diagrams were rendered from (the key names the slide: `<markdown file>#<slide index>`), shared between the transformer (fills it) and the Vite plugin
// (reloads the deck when one of them changes).
//
// The two are loaded by different loaders (Slidev loads setup/ with jiti, Vite bundles vite.config.ts), so each gets its own
// copy of this module; the map lives on globalThis to be the same one.
const KEY = Symbol.for('slidev-addon-svg-diagram.depsByMarkdown');
const g = globalThis as unknown as Record<symbol, Map<string, Set<string>> | undefined>;
const depsByMarkdown = (g[KEY] ??= new Map<string, Set<string>>());

export function recordDeps(slideKey: string, deps: string[]): void {
  depsByMarkdown.set(slideKey, new Set(deps));
}
export function allDeps(): Set<string> {
  return new Set([...depsByMarkdown.values()].flatMap(s => [...s]));
}
