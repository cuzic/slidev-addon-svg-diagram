import type {TransformersSetup} from '@slidev/types';
import fs from 'node:fs';
import path from 'node:path';
import * as svgDiagram from 'svg-diagram';
import {renderSource} from 'svg-diagram/render';
import {projectFiles, serial} from '../lib/project-files.ts';
import {rewriteDiagramTags} from '../lib/rewrite.ts';
import {recordDeps} from '../lib/watch.ts';

// `<SvgDiagram src="./flow.ts" />`: render the svg-diagram source here, before Slidev compiles the Markdown, and hand the
// component the SVG as a data URI. Paths are relative to the Markdown file the tag is in.
// (a type-only import: defineTransformersSetup is the identity function, and a runtime import of @slidev/types may not resolve from here)
const setup: TransformersSetup = () => ({
  pre: [async (ctx) => {
    const mdFile = ctx.slide.source.filepath;
    const editing = ctx.options.mode === 'dev';
    // what the figures depend on, kept even when a render throws: a figure that fails is exactly the one being fixed
    const deps = new Set<string>(), dirs = new Set<string>();
    let rewrite;
    try {
      rewrite = await rewriteDiagramTags(ctx.s.original, mdFile, (abs) => serial(async () => {
        deps.add(abs);
        const {config, icons, dirs: where} = projectFiles(path.dirname(abs));
        for (const f of [config, icons]) if (f) deps.add(f);
        for (const d of where) dirs.add(d);
        // the project's installed icons, from the source's own directory and read again every time (svg-diagram reads the
        // file once and from the working directory). svg-diagram 0.5.0 has no `icon` and no installed icons.
        if (typeof svgDiagram.icon?.use === 'function') {
          try { svgDiagram.icon.use(icons ? fs.readFileSync(icons, 'utf8') : undefined); }
          catch (e) { throw new Error(`${icons}: ${(e as Error).message}`); }
        }
        const r = await renderSource(abs, {fresh: editing});
        return {svg: r.svg, ok: r.ok, problems: r.problems, deps: r.deps};
      }));
    } catch (e) {
      recordDeps(`${mdFile}#${ctx.slide.index}`, [...deps], [...dirs]);
      throw e;
    }
    const {edits, failed} = rewrite;
    for (const d of rewrite.deps) deps.add(d);
    // one record per slide: every slide of a deck is in the same Markdown file, and a slide's record must not erase another's
    recordDeps(`${mdFile}#${ctx.slide.index}`, [...deps], [...dirs]);
    for (const f of failed) {
      const msg = `[svg-diagram] ${f.src} failed verification:\n  ${f.problems.join('\n  ')}`;
      if (!editing) throw new Error(msg);
      console.warn(msg);
    }
    for (const e of edits) ctx.s.overwrite(e.start, e.end, e.text);
  }],
});

export default setup;
