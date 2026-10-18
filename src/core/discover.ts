import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from './markdown.js';
import { defaults, suggestedTree, snapshotMetadataHash, type Document, type Link, type Plan } from './model.js';
import { hash, remote, within, githubBlob, safeFile, cachedFetcher, resolveReference, type Fetcher } from './io.js';
import { checksum } from './checksum.js';

export interface DiscoverOptions { root?: string; originRoot?: string; freshnessDays?: number; offline?: boolean; refresh?: boolean; maxDocuments?: number; maxDepth?: number; fetcher?: Fetcher; cacheDir?: string }
const markdownSource = (s: string) => /\.(md|markdown)$/i.test(remote(s) ? new URL(s).pathname : s);
const extension = (s: string) => path.extname(remote(s) ? new URL(s).pathname : s).toLowerCase();
const sourceKey = (s: string) => !remote(s) && process.platform === 'win32' ? s.toLowerCase() : s;
const imageTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
export async function discover(input: string, options: DiscoverOptions = {}): Promise<Plan> {
  const maxDocuments = options.maxDocuments ?? 500, maxDepth = options.maxDepth ?? 8;
  if (!Number.isInteger(maxDocuments) || maxDocuments < 1 || !Number.isInteger(maxDepth) || maxDepth < 0) throw new Error('Invalid discovery limits');
  if (options.offline && options.refresh) throw new Error('Offline discovery cannot refresh remote sources');
  let root = process.cwd(), directory = false, seeds: string[];
  if (remote(input)) { if (githubBlob(input)) throw new Error('GitHub blob URLs are web references; choose a public raw Markdown URL'); const u = new URL(input); u.hash = ''; seeds = [u.href]; if (options.root) root = await fs.realpath(path.resolve(options.root)); }
  else {
    input = await fs.realpath(path.resolve(input)); directory = (await fs.stat(input)).isDirectory();
    root = options.root ? await fs.realpath(path.resolve(options.root)) : directory ? input : path.dirname(input);
    if (!(await fs.stat(root)).isDirectory() || !within(root, input)) throw new Error('Selected head/folder is outside the authorized root');
    seeds = directory ? await scan(input) : [input];
  }
  if (!seeds.length) throw new Error('No Markdown files found');
  const fetcher = options.fetcher ?? cachedFetcher(options.cacheDir ?? path.join(root, '.reading-packet', 'cache'), options.offline);
  const docs: Document[] = [], bySource = new Map<string, Document>(), warnings: string[] = [];
  const aliases = new Map<string, string>();
  let snapshotBytes = 0;
  function reserve(bytes: number) { if (snapshotBytes + bytes > 60 * 1024 * 1024) throw new Error('Snapshot exceeds the 60 MB content/asset limit'); snapshotBytes += bytes; }
  const queue = seeds.map(source => ({ source, depth: 0 }));
  for (let at = 0; at < queue.length; at++) {
    const { source, depth } = queue[at];
    if (bySource.has(sourceKey(source))) continue;
    if (docs.length >= maxDocuments) { warnings.push(`Discovery stopped at ${maxDocuments} documents`); break; }
    const doc: Document = { id: hash(sourceKey(source)).slice(0, 16), source, title: path.basename(remote(source) ? new URL(source).pathname : source) || source, content: '', hash: '', links: [], headings: [], assets: {}, assetHashes: {}, warnings: [], available: false, role: 'chapter', freshness: 'unreviewed' };
    docs.push(doc); bySource.set(sourceKey(source), doc);
    try {
      let base = source, bytes: Buffer, fetchedAt: string | undefined, cached = false;
      if (remote(source)) {
        const fetched = await fetcher(source, 5 * 1024 * 1024, !!options.refresh);
        if (fetched.type === 'text/html') throw new Error('HTML pages are references, not importable Markdown');
        bytes = fetched.data; base = fetched.url;
        fetchedAt = fetched.fetchedAt; cached = !!fetched.cached;
        const url = new URL(base); url.hash = ''; base = url.href;
        const canonical = bySource.get(sourceKey(base));
        if (canonical && canonical !== doc && canonical.available) {
          aliases.set(doc.id, canonical.id);
          canonical.aliases = [...new Set([...(canonical.aliases || []), source])].filter(s => s !== canonical.source);
          if (canonical.sourceHash !== hash(bytes)) canonical.warnings.push('Redirect alias returned changed content; the first canonical snapshot was retained.');
          bySource.set(sourceKey(source), canonical);
          docs.splice(docs.indexOf(doc), 1);
          continue;
        }
        if (canonical && canonical !== doc) {
          // A direct canonical request may have failed before a redirect alias
          // successfully supplies the snapshot. Replace that failed placeholder.
          for (const [key, value] of bySource) if (value === canonical) bySource.set(key, doc);
          docs.splice(docs.indexOf(canonical), 1);
        }
        const originalId = doc.id;
        doc.id = hash(sourceKey(base)).slice(0, 16); doc.source = base;
        if (source !== base) doc.aliases = [source];
        aliases.set(originalId, doc.id);
        bySource.set(sourceKey(base), doc);
      } else { const file = await safeFile(root, source); if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error('Markdown exceeds 5 MB'); bytes = await fs.readFile(file); }
      reserve(bytes.length);
      doc.content = bytes.toString('utf8').replace(/^\uFEFF/, ''); doc.sourceHash = hash(bytes); doc.hash = checksum(doc.content); doc.available = true;
      doc.provenance = { identity: doc.id, importLocation: source, originalLocation: options.originRoot && !remote(source)
        ? `${options.originRoot.replace(/\/$/, '')}/${path.relative(root, source).split(path.sep).map(encodeURIComponent).join('/')}` : base,
        capturedAt: new Date().toISOString(), fetchedAt, cache: cached, origin: options.originRoot && !remote(source) ? 'user-provided' : 'source' };
      // Graph IDs identify this captured collection; source identity follows the
      // original location even when a transferred collection changes import root.
      doc.provenance.identity = checksum(doc.provenance.originalLocation).slice(0, 16);
      const parsed = parseMarkdown(doc.content); doc.headings = parsed.headings;
      doc.title = parsed.headings.find(h => h.level === 1)?.text || doc.title;
      for (const raw of parsed.links) {
        let link: Link = { ...raw, kind: 'other' };
        try {
          const resolved = resolveReference(base, raw.href);
          if (resolved.source) {
            const targetSource = resolved.source;
            link.fragment = resolved.fragment;
            link.kind = raw.href.startsWith('#') ? 'anchor' : githubBlob(targetSource) ? 'web' : markdownSource(targetSource) ? 'markdown' : extension(targetSource) === '.pdf' ? 'pdf' : remote(targetSource) ? 'web' : 'other';
            if (link.kind === 'anchor') link.target = doc.id;
            else if (link.kind === 'markdown') {
              link.target = hash(sourceKey(targetSource)).slice(0, 16);
              if (!remote(targetSource) && !within(root, targetSource)) link.issue = 'Target document is unavailable: file escapes the authorized root';
              else if (remote(targetSource) && depth >= maxDepth) link.issue = `Remote traversal depth limit (${maxDepth})`;
              else queue.push({ source: targetSource, depth: remote(targetSource) ? depth + 1 : depth });
            }
          }
        } catch (e: any) { link.issue = e.message; }
        doc.links.push(link);
      }
      for (const href of new Set(parsed.images)) {
        try {
          if (!href) throw new Error('HTML image has no src; srcset-only images are not supported');
          if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(href)) { reserve(href.length); doc.assets[href] = href; continue; }
          const resolved = resolveReference(base, href).source;
          if (!resolved) throw new Error('Unsupported image URL');
          let data: Buffer, type: string;
          if (remote(resolved)) { const result = await fetcher(resolved, 15 * 1024 * 1024, !!options.refresh); data = result.data; type = result.type || imageTypes[extension(resolved)]; }
          else { const file = await safeFile(root, resolved); if ((await fs.stat(file)).size > 15 * 1024 * 1024) throw new Error('Image exceeds 15 MB'); data = await fs.readFile(file); type = imageTypes[extension(file)]; }
          if (!Object.values(imageTypes).includes(type)) throw new Error('Unsupported image type');
          reserve(data.length);
          doc.assets[href] = `data:${type};base64,${data.toString('base64')}`;
        } catch (e: any) { doc.warnings.push(`Image ${href}: ${e.message}`); }
      }
      doc.assetHashes = Object.fromEntries(Object.entries(doc.assets).map(([href, data]) => [href, checksum(data)]));
    } catch (e: any) { doc.warnings.push(e.message); }
  }
  for (const d of docs) for (const l of d.links) {
    if (l.target) {
      const seen = new Set<string>();
      while (aliases.has(l.target) && aliases.get(l.target) !== l.target && !seen.has(l.target)) { seen.add(l.target); l.target = aliases.get(l.target)!; }
    }
  }
  const byId = new Map(docs.map(d => [d.id, d]));
  for (const d of docs) for (const l of d.links) {
    if (l.target) {
      const target = byId.get(l.target);
      if (!target || !target.available) l.issue ||= `Target document is unavailable${target?.warnings.some(w => /escapes.*root/.test(w)) ? ': file escapes the authorized root' : ''}`;
      else if (l.fragment && !target.headings.some(h => h.slug === l.fragment)) l.issue ||= `Unresolved heading #${l.fragment}`;
    }
  }
  for (const d of docs) if (d.available) d.metadataHash = snapshotMetadataHash(d);
  const incoming = new Map(docs.map(d => [d.id, 0]));
  for (const d of docs) for (const t of new Set(d.links.filter(l => l.kind === 'markdown' && l.target !== d.id).map(l => l.target))) if (t && incoming.has(t)) incoming.set(t, incoming.get(t)! + 1);
  function reachable(id: string, seen = new Set<string>()): number {
    if (seen.has(id) || !byId.get(id)?.available) return 0;
    seen.add(id);
    return 1 + byId.get(id)!.links.filter(l => l.kind === 'markdown' && l.target).reduce((sum, l) => sum + reachable(l.target!, seen), 0);
  }
  const candidates = docs.filter(d => d.available).map(d => {
    const reach = reachable(d.id), inc = incoming.get(d.id)!;
    const readme = !remote(d.source) && path.dirname(d.source) === root && /^readme\.(md|markdown)$/i.test(path.basename(d.source));
    return { id: d.id, title: d.title, incoming: inc, reachable: reach, score: (readme ? 1_000_000 : 0) + (inc === 0 ? 10_000 : 0) + reach * 10 - inc };
  }).sort((a, b) => b.score - a.score || byId.get(a.id)!.source.localeCompare(byId.get(b.id)!.source));
  const head = directory ? candidates[0]?.id : docs[0].id;
  if (!head || !byId.get(head)?.available) throw new Error(`Cannot read the head document: ${docs[0]?.warnings.join('; ') || input}`);
  return { version: 2, createdAt: new Date().toISOString(), root, input, head, documents: docs, tree: suggestedTree(docs, head), candidates, settings: structuredClone(defaults), warnings,
    discovery: { originRoot: options.originRoot, freshnessDays: options.freshnessDays ?? 30, maxDocuments, maxDepth } };
}

/** Refresh explicitly; retain editorial choices and report removed selected sources. */
export async function refreshPlan(value: Plan, options: Pick<DiscoverOptions, 'fetcher' | 'cacheDir'> = {}): Promise<Plan> {
  const next = await discover(value.input, { ...value.discovery, ...options, root: value.root, refresh: true });
  const old = new Map(value.documents.map(d => [d.id, d]));
  const selected = new Set(value.tree.flatMap(function ids(n): string[] { return [...(n.documentId ? [n.documentId] : []), ...n.children.flatMap(ids)]; }));
  for (const previous of value.documents) {
    if (!selected.has(previous.id) || next.documents.some(d => d.id === previous.id)) continue;
    try {
      const captured = await discover(previous.source, { ...value.discovery, ...options, root: value.root, refresh: true });
      for (const d of captured.documents) if (!next.documents.some(v => v.id === d.id) && next.documents.length < (value.discovery?.maxDocuments ?? 500)) next.documents.push(d);
    } catch { /* Unavailable selected sources are retained below as placeholders. */ }
  }
  for (const d of next.documents) {
    const previous = old.get(d.id);
    if (previous) { d.role = previous.role; d.freshness = previous.freshness; d.supersededBy = previous.supersededBy; d.sourceCreatedDate = previous.sourceCreatedDate; }
  }
  const present = new Set(next.documents.map(d => d.id));
  for (const d of value.documents) if (!present.has(d.id)) next.documents.push({ ...d, available: false, warnings: ['Source no longer appears in refreshed discovery; remove it or rediscover explicitly'] });
  next.tree = structuredClone(value.tree); next.head = value.head; next.settings = structuredClone(value.settings);
  return next;
}
async function scan(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || ['node_modules', 'dist', 'output', 'tmp'].includes(e.name) || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && markdownSource(full)) files.push(full);
    }
  }
  await walk(root); return files;
}
