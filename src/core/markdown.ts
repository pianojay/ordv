import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import taskLists from 'markdown-it-task-lists';
import { Parser as HTMLParser } from 'htmlparser2';
import type { HeadingSchema } from './model.js';
import type { z } from 'zod';

export const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function parser(math = true) {
  const md = new MarkdownIt({ html: true, linkify: false, breaks: false });
  md.use(taskLists);
  if (math) md.use(texmath, { engine: katex, delimiters: ['dollars', 'brackets', 'beg_end'], katexOptions: { throwOnError: false, trust: false } });
  return md;
}
export function slugger() {
  const counts = new Map<string, number>();
  return (text: string) => {
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s/g, '-') || 'section';
    const n = counts.get(base) || 0; counts.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}
export function parseMarkdown(content: string) {
  const tokens = parser(false).parse(content, {});
  const headings: z.infer<typeof HeadingSchema>[] = [], links: { href: string; label: string }[] = [], images: string[] = [];
  const slug = slugger();
  function collectHTML(html: string) {
    const reader = new HTMLParser({ onopentag(name, attributes) { if (name === 'img') images.push(attributes.src || ''); } }, { decodeEntities: true });
    reader.end(html);
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'html_block') collectHTML(t.content);
    if (t.type === 'heading_open') {
      const text = (tokens[i + 1]?.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join('');
      headings.push({ level: Number(t.tag.slice(1)), text, slug: slug(text) });
    }
    const children = t.children || [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      if (child.type === 'html_inline') collectHTML(child.content);
      if (child.type === 'image') images.push(child.attrGet('src') || '');
      if (child.type === 'link_open') {
        let label = '';
        for (let k = j + 1; k < children.length && children[k].type !== 'link_close'; k++) label += children[k].content;
        links.push({ href: child.attrGet('href') || '', label });
      }
    }
  }
  return { headings, links, images };
}

export interface MathProblem { line: number; message: string }
/** Source headings hidden by closed disclosures under the preserve print policy. */
export function foldedVisibility(content: string): { closed: boolean; hidden: Set<string> } {
  const tokens = parser(false).parse(content, {}), headings = parseMarkdown(content).headings;
  const stack: boolean[] = [], hidden = new Set<string>(); let closed = false, heading = 0;
  const reader = new HTMLParser({
    onopentag(name, attrs) { if (name === 'details') { const folded = !Object.hasOwn(attrs, 'open'); stack.push(folded); closed ||= folded; } },
    onclosetag(name) { if (name === 'details') stack.pop(); }
  });
  for (const token of tokens) {
    if (token.type === 'html_block') reader.write(token.content);
    if (token.type === 'heading_open') { const h = headings[heading++]; if (h && stack.some(Boolean)) hidden.add(h.slug); }
    for (const child of token.children || []) if (child.type === 'html_inline') reader.write(child.content);
  }
  reader.end(); return { closed, hidden };
}
export function mathProblems(content: string): MathProblem[] {
  const result: MathProblem[] = [];
  const tokens = parser(true).parse(content, {});
  function check(tex: string, line: number, display: boolean) {
    try { katex.renderToString(tex, { displayMode: display, throwOnError: true, trust: false }); }
    catch (e: any) { result.push({ line, message: String(e.message).replace(/\s+/g, ' ').slice(0, 240) }); }
  }
  for (const t of tokens) {
    const line = (t.map?.[0] ?? 0) + 1;
    if (t.type.startsWith('math_')) check(t.content, line, t.block || t.type === 'math_inline_double');
    if (t.type === 'fence' && t.info.trim() === 'math') check(t.content, line + 1, true);
    for (const child of t.children || []) if (child.type.startsWith('math_')) check(child.content, line, child.type === 'math_inline_double');
  }
  return result;
}
