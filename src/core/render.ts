import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sanitize from 'sanitize-html';
import { readingStyle } from './style.js';
import { parser, escape } from './markdown.js';
import { flatten, validatePlan, type Plan, type Document, type ReadingNode } from './model.js';

const require = createRequire(import.meta.url);
export const destination = (doc: string, slug = '') => `d-${doc}${slug ? `--${slug}` : ''}`;
export const linkURL = (id: string) => `https://packet.invalid/#${encodeURIComponent(id)}`;
let resources: Promise<{ katex: string; mermaid: string }> | undefined;
function resourcesForRender() {
  return resources ||= (async () => {
    const dir = path.dirname(require.resolve('katex/package.json'));
    let css = await fs.readFile(path.join(dir, 'dist/katex.min.css'), 'utf8');
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]))];
    for (const url of urls) {
      const file = url.replace(/["']/g, '');
      const bytes = await fs.readFile(path.join(dir, 'dist', file));
      css = css.split(`url(${url})`).join(`url(data:font/${path.extname(file).slice(1)};base64,${bytes.toString('base64')})`);
    }
    const mermaidPath = path.join(path.dirname(require.resolve('mermaid/package.json')), 'dist/mermaid.min.js');
    return { katex: css, mermaid: await fs.readFile(mermaidPath, 'utf8') };
  })();
}
export function diagnostics(plan: Plan): string[] {
  const ids = new Set(flatten(plan.tree)), out = [...plan.warnings];
  for (const d of plan.documents.filter(d => ids.has(d.id))) {
    if (!d.available) out.push(`${d.title}: selected document is unavailable`);
    out.push(...d.warnings.map(w => `${d.title}: ${w}`));
    for (const l of d.links) {
      if (l.issue) out.push(`${d.title}: ${l.href}: ${l.issue}`);
      else if (l.kind === 'markdown' && l.target && !ids.has(l.target)) out.push(`${d.title}: ${l.label || l.href}: referenced document omitted`);
    }
  }
  return [...new Set(out)];
}
function documentHTML(doc: Document, plan: Plan, title = doc.title, sections: string[] = []): string {
  const selected = new Set(flatten(plan.tree));
  const md = parser(plan.settings.math);
  const tokens = md.parse(doc.content, {});
  let headingIndex = 0;
  for (const token of tokens) {
    if (token.type === 'heading_open') token.attrSet('id', destination(doc.id, doc.headings[headingIndex++]?.slug));
    for (const child of token.children || []) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href') || '', link = doc.links.find(l => l.href === href);
        if (link?.target && selected.has(link.target) && !link.issue) child.attrSet('href', linkURL(destination(link.target, link.fragment)));
        else if (link) {
          child.attrSet('class', 'reference');
          child.attrSet('title', link.issue || (link.kind === 'markdown' ? 'Referenced document omitted from this packet' : 'Source reference'));
          if (!/^(https?:\/\/|mailto:)/i.test(href) && !href.startsWith('#')) child.attrSet('href', `https://packet-reference.invalid/?source=${encodeURIComponent(doc.source)}&reference=${encodeURIComponent(href)}`);
        }
      }
      if (child.type === 'image') {
        const href = child.attrGet('src') || '';
        if (doc.assets[href]) child.attrSet('src', doc.assets[href]);
        else { child.type = 'text'; child.content = `[Unavailable image: ${child.content || href}]`; child.tag = ''; }
      }
    }
  }
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, i, opts, env, self) => {
    if (tokens[i].info.trim() === 'mermaid') return `<pre class="mermaid">${escape(tokens[i].content)}</pre>`;
    if (tokens[i].info.trim() === 'math' && plan.settings.math) return md.render(`$$\n${tokens[i].content}\n$$`);
    return fence(tokens, i, opts, env, self);
  };
  let body = md.renderer.render(tokens, md.options, {});
  body = sanitize(body, {
    allowedTags: [...sanitize.defaults.allowedTags, 'img', 'span', 'input', 'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd', 'mover', 'munder', 'munderover', 'mpadded', 'mstyle', 'menclose', 'eq', 'eqn', 'section'],
    allowedAttributes: { '*': ['id', 'class', 'aria-hidden'], a: ['href', 'title'], img: ['src', 'alt', 'title'], span: ['style'], math: ['xmlns', 'display'], annotation: ['encoding'], input: ['type', 'checked', 'disabled'], mo: ['stretchy', 'fence', 'separator'], mspace: ['width'], mtd: ['columnalign'], mtable: ['rowspacing', 'columnspacing'], mpadded: ['width', 'height', 'depth', 'lspace', 'voffset'] },
    allowedSchemes: ['http', 'https', 'mailto'], allowedSchemesByTag: { img: ['data'] },
    allowedStyles: { span: { 'height': [/^[\d.e+-]+em$/], 'width': [/^[\d.e+-]+em$/], 'top': [/^[\d.e+-]+em$/], 'vertical-align': [/^[\d.e+-]+em$/], 'margin-left': [/^[\d.e+-]+em$/], 'margin-right': [/^[\d.e+-]+em$/], 'position': [/^relative$/], 'border-bottom-width': [/^[\d.e+-]+em$/] } }
  });
  // Self-links cause Chromium to emit named PDF destinations for every heading.
  body = body.replace(/<(h[1-6]) id="([^"]+)">([\s\S]*?)<\/\1>/g, (_, tag, id, text) => `<${tag} id="${id}"><a class="heading-link" href="#${id}">${text}</a></${tag}>`);
  const firstTitle = tokens[0]?.type === 'heading_open' && tokens[0].tag === 'h1' ? doc.headings[0] : undefined;
  if (firstTitle) body = body.replace(/^<h1[\s\S]*?<\/h1>\s*/, '');
  const style = plan.settings.mode === 'documents' ? plan.settings.documentStyles[doc.id] : undefined;
  return `<section class="doc" style="${style ? `font-size:${style.fontSize}pt` : ''}">${sections.length ? `<p class="section-label">${escape(sections.join(' / '))}</p>` : ''}<h1 id="${destination(doc.id)}"><a class="heading-link" ${firstTitle ? `id="${destination(doc.id, firstTitle.slug)}"` : ''} href="#${destination(doc.id, firstTitle?.slug)}">${escape(title)}</a></h1><p class="source"><a class="heading-link" href="#${destination(doc.id)}">${escape(doc.source)}</a></p>${body}${doc.links.some(l => l.kind === 'markdown' && l.target && !selected.has(l.target)) ? '<p class="reference-note">Some linked documents are references outside this packet.</p>' : ''}</section>`;
}
function tocHTML(plan: Plan) {
  const byId = new Map(plan.documents.map(d => [d.id, d]));
  function list(nodes: ReadingNode[]): string {
    return `<ul>${nodes.map(n => {
      const doc = n.documentId ? byId.get(n.documentId) : undefined;
      return `<li>${doc ? `<a href="${linkURL(destination(doc.id))}">${escape(n.title)}</a>` : `<strong>${escape(n.title)}</strong>`}${doc ? `<ul>${doc.headings.filter((h, i) => !(i === 0 && h.level === 1 && h.text === doc.title)).map(h => `<li class="heading-entry" style="margin-left:${(h.level - 1) * 12}px"><a href="${linkURL(destination(doc.id, h.slug))}">${escape(h.text)}</a></li>`).join('')}</ul>` : ''}${n.children.length ? list(n.children) : ''}</li>`;
    }).join('')}</ul>`;
  }
  return `<section class="navigation toc"><p class="source">MARKDOWN READING PACKET</p><h1>Contents</h1>${list(plan.tree)}</section>`;
}
export function graphSVG(plan: Plan) {
  const ids = flatten(plan.tree), byId = new Map(plan.documents.map(d => [d.id, d]));
  const treeEdges = new Set<string>();
  function visit(nodes: ReadingNode[], parent?: string) { for (const n of nodes) { if (parent && n.documentId) treeEdges.add(`${parent}:${n.documentId}`); visit(n.children, n.documentId || parent); } }
  visit(plan.tree);
  const positions = new Map(ids.map((id, i) => [id, { x: 20 + i % 3 * 285, y: 40 + Math.floor(i / 3) * 110 }]));
  const height = Math.ceil(ids.length / 3) * 110 + 50;
  const edges = ids.flatMap(id => byId.get(id)!.links.filter(l => l.kind === 'markdown' && l.target && positions.has(l.target)).map(l => {
    const a = positions.get(id)!, b = positions.get(l.target!)!, tree = treeEdges.has(`${id}:${l.target}`);
    let route: string;
    if (id === l.target) route = `M${a.x + 245},${a.y + 26} C${a.x + 280},${a.y + 26} ${a.x + 280},${a.y - 20} ${a.x + 210},${a.y}`;
    else if (a.y === b.y) {
      const forward = a.x < b.x, start = a.x + (forward ? 245 : 0), end = b.x + (forward ? 0 : 245), middle = (start + end) / 2;
      route = `M${start},${a.y + 26} C${middle},${a.y + 26} ${middle},${b.y + 26} ${end},${b.y + 26}`;
    } else {
      const down = a.y < b.y, startY = a.y + (down ? 52 : 0), endY = b.y + (down ? 0 : 52), middle = (startY + endY) / 2;
      route = `M${a.x + 122},${startY} C${a.x + 122},${middle} ${b.x + 122},${middle} ${b.x + 122},${endY}`;
    }
    return `<path d="${route}" fill="none" stroke="${tree ? '#187f7d' : '#a17c45'}" stroke-width="1.5" ${tree ? '' : 'stroke-dasharray="5 4"'} marker-end="url(#arrow)"/>`;
  })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 870 ${height}" role="img" aria-label="Document relationships"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#6a8080"/></marker></defs>${edges}${ids.map((id, i) => {
    const p = positions.get(id)!; return `<a href="${linkURL(destination(id))}"><rect x="${p.x}" y="${p.y}" width="245" height="52" rx="7" fill="#eef7f5" stroke="#9ec6c1"/><text x="${p.x + 12}" y="${p.y + 30}" font-size="13" fill="#183c43">${i + 1}. ${escape(byId.get(id)!.title.slice(0, 24))}</text></a>`;
  }).join('')}</svg>`;
}
export async function renderHTML(value: Plan, onlyDocument?: string, navigationOnly = false): Promise<string> {
  const plan = validatePlan(value), selected = flatten(plan.tree);
  if (!selected.length) throw new Error('Select at least one document');
  const byId = new Map(plan.documents.map(d => [d.id, d]));
  for (const id of selected) if (!byId.get(id)?.available) throw new Error(`Selected document unavailable: ${id}`);
  const resources = await resourcesForRender();
  const css = await readingStyle();
  function renderTree(nodes: ReadingNode[], sections: string[] = []): string {
    return nodes.map(n => `${n.documentId ? documentHTML(byId.get(n.documentId)!, plan, n.title, sections) : ''}${renderTree(n.children, n.documentId ? sections : [...sections, n.title])}`).join('');
  }
  const navigation = `${plan.settings.toc ? tocHTML(plan) : ''}${plan.settings.graph ? `<section class="graph-page"><h1>Document relationships</h1><p class="source">Solid: reading-tree links · Dashed: cross-links. Numbers indicate reading order.</p>${graphSVG(plan)}</section>` : ''}`;
  function findTitle(nodes: ReadingNode[], sections: string[] = []): { title: string; sections: string[] } | undefined {
    for (const n of nodes) { if (n.documentId === onlyDocument) return { title: n.title, sections }; const found = findTitle(n.children, n.documentId ? sections : [...sections, n.title]); if (found) return found; }
  }
  const entry = onlyDocument ? findTitle(plan.tree) : undefined;
  const content = onlyDocument ? documentHTML(byId.get(onlyDocument)!, plan, entry?.title, entry?.sections) : navigationOnly ? navigation : `${navigation}${renderTree(plan.tree)}`;
  const script = resources.mermaid.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>${css}\n${resources.katex}</style></head><body>${content}<script>${script}</script><script>window.packetReady=false;window.packetErrors=[];(async()=>{try{mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral'});for(const node of document.querySelectorAll('.mermaid')){try{await mermaid.run({nodes:[node]});}catch(e){window.packetErrors.push('Mermaid: '+e.message);node.textContent='Diagram could not be rendered: '+e.message;}}await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));}catch(e){window.packetErrors.push(e.message);}finally{window.packetReady=true;}})();</script></body></html>`;
}
