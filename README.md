# slidev-addon-svg-diagram

[Slidev](https://sli.dev) addon for embedding diagrams made with
[svg-diagram](https://github.com/cuzic/svg-diagram).

> Status: early. Needs `svg-diagram` 0.5.0 or later (it provides `svg-diagram/render`).

## Usage

```bash
pnpm add slidev-addon-svg-diagram svg-diagram
```

Slidev 53 itself needs one setting, with or without this addon (its Markdown stack pulls `markdown-it` 15, which it cannot load): pin 14 in `pnpm-workspace.yaml`.

```yaml
overrides:
  markdown-it: ^14.1.0
```

```md
---
addons:
  - svg-diagram
---

<!-- a diagram source: rendered when Slidev builds the slide -->
<SvgDiagram src="./diagrams/flow.ts" alt="Flow" width="80%" />

<!-- or an SVG you built yourself -->
<SvgDiagram src="/diagrams/flow.svg" alt="Flow" width="80%" />
```

A `.ts` source is the same module `svg-diagram build` takes (`export default function define() { return diagram(...) }`).
Its path is relative to the Markdown file the tag is in. Settings come from `.svg-diagram.json` as for the CLI.
Icons come from the `svg-diagram.icons.json` that `svg-diagram icons add` wrote; both files are looked for from the source's folder upwards, and editing either one redraws the figure in `slidev` dev. (Needs a svg-diagram release that has installable icons; earlier ones have no icons file.)

- **Dev:** editing the source (or any local file it imports) regenerates the figure and reloads the deck. A figure that fails
  svg-diagram's verification is drawn anyway, with the problems printed in the terminal.
- **Build / export:** a figure that fails verification stops the build, as `svg-diagram build` does.
- Tags inside fenced code blocks are left alone.
- No browser is needed to render a figure: text is measured from font files (svg-diagram's default) and the figure's checks run on its geometry. The tests pass with `playwright-chromium` and `@resvg/resvg-js` made unimportable.
- The fonts it measures with are the ones fontconfig finds for svg-diagram's font stack on the machine that builds the deck; name them in `.svg-diagram.json` (`"fonts"`) to get the same figure on every machine.

## Development

```bash
pnpm install
pnpm test     # unit tests, and one run against a real Slidev dev server (~15 s)
pnpm dev      # example/slides.md
```

## Known issues

- `pnpm build` currently fails with Slidev 53 + vite 8 (`lightningcss minify: Invalid token in pseudo element`).
  It also fails for a plain deck without this addon, so it is an upstream issue. `pnpm dev` works.
  The build-time behaviour of this addon (failing on a bad figure) is therefore untested.
- Slidev 53 needs `markdown-it` pinned to 14.x (see Usage): it pulls `@comark/markdown-it`, which breaks with 15.x. Checked on a plain Slidev 53 deck, without this addon.
- Reloading the deck after an edit is a full reload. The tests check that the slide module is regenerated and that the server asks the page to reload; they do not run a browser.
