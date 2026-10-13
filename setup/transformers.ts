import type {TransformersSetup} from '@slidev/types';
import fs from 'node:fs';
import path from 'node:path';
import {icon} from 'svg-diagram';
import {renderSource} from 'svg-diagram/render';
import {CONFIG_FILE, ICONS_FILE, findUp} from '../lib/project-files.ts';
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
      // the project's installed icons, from the source's own directory and read again every time (svg-diagram reads the
      // file once and from the working directory); older svg-diagram versions have no icon.use and no installed icons
      const icons = findUp(ICONS_FILE, path.dirname(abs));
      if (typeof icon.use === 'function') icon.use(icons ? fs.readFileSync(icons, 'utf8') : undefined);
      const r = await renderSource(abs, {fresh: editing});
      const config = findUp(CONFIG_FILE, path.dirname(abs));
      return {svg: r.svg, ok: r.ok, problems: r.problems, deps: [...r.deps, ...[config, icons].filter((f): f is string => !!f)]};
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
