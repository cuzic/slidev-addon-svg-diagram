import type {TransformersSetup} from '@slidev/types';
import {renderSource} from 'svg-diagram/render';
import {rewriteDiagramTags} from '../lib/rewrite.ts';
import {recordDeps} from '../lib/watch.ts';

// `<SvgDiagram src="./flow.ts" />`: render the svg-diagram source here, before Slidev compiles the Markdown, and hand the
// component the SVG as a data URI. Paths are relative to the Markdown file the tag is in.
// (a type-only import: defineTransformersSetup is the identity function, and a runtime import of @slidev/types may not resolve from here)
const setup: TransformersSetup = () => ({
  pre: [async (ctx) => {
    const mdFile = ctx.slide.source.filepath;
    const editing = ctx.options.mode === 'dev';
    const {edits, deps, failed} = await rewriteDiagramTags(ctx.s.original, mdFile, async (abs) => {
      const r = await renderSource(abs, {fresh: editing});
      return {svg: r.svg, ok: r.ok, problems: r.problems, deps: r.deps};
    });
    // one record per slide: every slide of a deck is in the same Markdown file, and a slide's record must not erase another's
    recordDeps(`${mdFile}#${ctx.slide.index}`, deps);
    for (const f of failed) {
      const msg = `[svg-diagram] ${f.src} failed verification:\n  ${f.problems.join('\n  ')}`;
      if (!editing) throw new Error(msg);
      console.warn(msg);
    }
    for (const e of edits) ctx.s.overwrite(e.start, e.end, e.text);
  }],
});

export default setup;
