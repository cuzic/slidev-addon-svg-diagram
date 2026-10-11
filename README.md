# slidev-addon-svg-diagram

[Slidev](https://sli.dev) addon for embedding diagrams made with
[svg-diagram](https://github.com/cuzic/svg-diagram).

> Status: early. Needs `svg-diagram` with `svg-diagram/render` (cuzic/svg-diagram#15–#17, merged), which is not on npm yet: until it is, the repo's `svg-diagram` dependency is a local link.

## Usage

```bash
pnpm add slidev-addon-svg-diagram svg-diagram
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
- `pnpm-workspace.yaml` pins `markdown-it` to 14.x; Slidev 53 pulls `@comark/markdown-it`, which breaks with 15.x.
- Reloading the deck after an edit is a full reload. The tests check that the slide module is regenerated and that the server asks the page to reload; they do not run a browser.
