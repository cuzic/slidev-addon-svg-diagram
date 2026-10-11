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

// `<SvgDiagram` followed by attributes up to the closing `>`; a `>` inside a quoted value does not end the tag. Not
// `<SvgDiagramFoo` or `<SvgDiagram-foo`, which are other components.
const TAG = /<SvgDiagram(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/g;
// one attribute of a tag: name, then an optional quoted or bare value
const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** The plain `src` attribute of a tag whose value is a .ts file: where it is (in the tag) and its value. */
function tsSrc(tag: string): {index: number; length: number; value: string} | null {
  ATTR.lastIndex = '<SvgDiagram'.length;
  for (const m of tag.matchAll(ATTR)) {
    if (m.index! < '<SvgDiagram'.length || m[1] !== 'src') continue; // exactly `src`, not :src, v-bind:src, data-src
    const value = m[2] ?? m[3];
    return value !== undefined && /\.ts$/.test(value) ? {index: m.index!, length: m[0].length, value} : null;
  }
  return null;
}

/** Ranges Markdown does not treat as live HTML: fenced code, inline code spans, HTML comments. */
function literalRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  // fenced code (CommonMark): up to 3 spaces, 3+ backticks or tildes; closed by the same character, at least as many, nothing after
  let open: {start: number; char: string; len: number} | null = null;
  let pos = 0;
  for (const line of code.split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!open) {
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) open = {start: pos, char: m[1][0], len: m[1].length};
    } else if (m && m[1][0] === open.char && m[1].length >= open.len && m[2].trim() === '') {
      ranges.push([open.start, pos + line.length]);
      open = null;
    }
    pos += line.length + 1;
  }
  if (open) ranges.push([open.start, code.length]);
  // HTML comments (an unclosed one runs to the end)
  for (const m of code.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) ranges.push([m.index!, m.index! + m[0].length]);
  // inline code: a run of backticks closed by a run of the same length, within one paragraph
  for (const m of code.matchAll(/(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g)) ranges.push([m.index!, m.index! + m[0].length]);
  return ranges;
}

export const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

export async function rewriteDiagramTags(code: string, mdFile: string, render: Render): Promise<Rewrite> {
  const literal = literalRanges(code);
  const rendered = new Map<string, Promise<Rendered>>();
  const edits: Edit[] = [], deps = new Set<string>(), failed: Rewrite['failed'] = [];
  for (const tag of code.matchAll(TAG)) {
    const at = tag.index!;
    if (literal.some(([a, b]) => at >= a && at < b)) continue;
    const src = tsSrc(tag[0]);
    if (!src) continue;
    const abs = path.resolve(path.dirname(mdFile), src.value);
    if (!rendered.has(abs)) rendered.set(abs, render(abs));
    let r: Rendered;
    try { r = await rendered.get(abs)!; }
    catch (e) { throw new Error(`<SvgDiagram src="${src.value}"> in ${mdFile}: ${(e as Error).message}`); }
    for (const d of r.deps) deps.add(d);
    if (!r.ok && !failed.some(f => f.src === src.value)) failed.push({src: src.value, problems: r.problems});
    const start = at + src.index;
    edits.push({start, end: start + src.length, text: `src="${toDataUri(r.svg)}"`});
  }
  return {edits, deps: [...deps], failed};
}
