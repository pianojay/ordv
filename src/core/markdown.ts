import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import type { HeadingSchema } from './model.js';
import type { z } from 'zod';

export const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function parser(math = true) {
  const md = new MarkdownIt({ html: true, linkify: false, breaks: false, highlight(code, lang) { return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : escape(code); } });
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
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const text = (tokens[i + 1]?.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join('');
      headings.push({ level: Number(t.tag.slice(1)), text, slug: slug(text) });
    }
    const children = t.children || [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
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
