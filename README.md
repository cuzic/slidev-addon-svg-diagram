# slidev-addon-svg-diagram

[Slidev](https://sli.dev) addon for embedding diagrams made with
[svg-diagram](https://github.com/cuzic/svg-diagram).

> Status: scaffold. Only embedding a pre-built SVG is supported so far.

## Usage

```bash
pnpm add slidev-addon-svg-diagram
```

```md
---
addons:
  - svg-diagram
---

<SvgDiagram src="/diagrams/flow.svg" alt="Flow" width="80%" />
```

## Development

```bash
pnpm install
pnpm dev      # example/slides.md
pnpm build
```

## Roadmap

- Render svg-diagram sources at build time (code block / `<SvgDiagram src="x.ts">`)
- Inline SVG output so slide theme fonts and colors apply

## Known issues

- `pnpm build` currently fails with Slidev 53 + vite 8 (`lightningcss minify: Invalid token in pseudo element`).
  It also fails for a plain deck without this addon, so it is an upstream issue. `pnpm dev` works.
- `pnpm-workspace.yaml` pins `markdown-it` to 14.x; Slidev 53 pulls `@comark/markdown-it`, which breaks with 15.x.
