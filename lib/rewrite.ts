// Finds `<SvgDiagram src="./x.ts" ...>` in a slide's Markdown and says how to rewrite each `src` to the rendered SVG as a data URI.
// Pure apart from the injected `render`, so it is testable without Slidev. Tags inside fenced code blocks are left alone
// (a deck that shows the tag as an example must keep showing it).
import path from 'node:path';

export interface Rendered {svg: string; ok: boolean; problems: string[]; deps: string[]}
export type Render = (absSource: string) => Promise<Rendered>;
export interface Edit {start: number; end: number; text: string}
export interface Rewrite {
  edits: Edit[];
  /** Every file the rendered diagrams depend on (absolute), for watching. */
  deps: string[];
  /** Diagrams that rendered but failed verification (the picture is still embedded). */
  failed: {src: string; problems: string[]}[];
}

const TAG = /<SvgDiagram\b[^>]*>/g;
const SRC = /\bsrc\s*=\s*(["'])([^"']+\.ts)\1/;

function fencedRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open: {start: number; marker: string} | null = null;
  let pos = 0;
  for (const line of code.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!open) open = {start: pos, marker: m[1][0]};
      else if (m[1][0] === open.marker) { ranges.push([open.start, pos + line.length]); open = null; }
    }
    pos += line.length + 1;
  }
  if (open) ranges.push([open.start, code.length]);
  return ranges;
}

export const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

export async function rewriteDiagramTags(code: string, mdFile: string, render: Render): Promise<Rewrite> {
  const fences = fencedRanges(code);
  const rendered = new Map<string, Promise<Rendered>>();
  const edits: Edit[] = [], deps = new Set<string>(), failed: Rewrite['failed'] = [];
  for (const tag of code.matchAll(TAG)) {
    const at = tag.index!;
    if (fences.some(([a, b]) => at >= a && at < b)) continue;
    const src = SRC.exec(tag[0]);
    if (!src) continue;
    const abs = path.resolve(path.dirname(mdFile), src[2]);
    if (!rendered.has(abs)) rendered.set(abs, render(abs));
    let r: Rendered;
    try { r = await rendered.get(abs)!; }
    catch (e) { throw new Error(`<SvgDiagram src="${src[2]}"> in ${mdFile}: ${(e as Error).message}`); }
    for (const d of r.deps) deps.add(d);
    if (!r.ok && !failed.some(f => f.src === src[2])) failed.push({src: src[2], problems: r.problems});
    const start = at + src.index!;
    edits.push({start, end: start + src[0].length, text: `src="${toDataUri(r.svg)}"`});
  }
  return {edits, deps: [...deps], failed};
}
