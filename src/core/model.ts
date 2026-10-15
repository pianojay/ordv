import { z } from 'zod';
import { checksum } from './checksum.js';
import { parseMarkdown } from './markdown.js';

export const LinkSchema = z.object({ href: z.string(), label: z.string(), kind: z.enum(['markdown', 'pdf', 'web', 'anchor', 'other']), target: z.string().optional(), fragment: z.string().optional(), issue: z.string().optional() });
export const HeadingSchema = z.object({ level: z.number().int().min(1).max(6), text: z.string(), slug: z.string() });
export const DocumentSchema = z.object({ id: z.string(), source: z.string(), aliases: z.array(z.string()).optional(), title: z.string(), content: z.string(), hash: z.string(), sourceCreatedDate: z.object({ date: z.iso.date(), provenance: z.literal('user-provided') }).optional(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), metadataHash: z.string().optional(), links: z.array(LinkSchema), headings: z.array(HeadingSchema), assets: z.record(z.string(), z.string()), assetHashes: z.record(z.string(), z.string()).optional(), warnings: z.array(z.string()), available: z.boolean() });
export type Document = z.infer<typeof DocumentSchema>;
export type Link = z.infer<typeof LinkSchema>;
export interface ReadingNode { id: string; title: string; documentId?: string; children: ReadingNode[] }
const TreeSchema: z.ZodType<ReadingNode> = z.lazy(() => z.object({ id: z.string(), title: z.string(), documentId: z.string().optional(), children: z.array(TreeSchema) }));
export const SettingsSchema = z.object({
  mode: z.enum(['book', 'documents']).default('book'),
  paper: z.enum(['A4', 'Letter']).default('A4'),
  toc: z.boolean().default(true), graph: z.boolean().default(false), math: z.boolean().default(true),
  marginsMm: z.object({
    top: z.number().min(5).max(50).default(15), right: z.number().min(5).max(50).default(10),
    bottom: z.number().min(5).max(50).default(10), left: z.number().min(5).max(50).default(10)
  }).default(() => ({ top: 15, right: 10, bottom: 10, left: 10 })),
  runningHeader: z.boolean().default(true),
  headerDate: z.enum(['export', 'source-created', 'none']).default('export'),
  pageNumbers: z.enum(['packet', 'document', 'both', 'none']).default('packet'),
  documentStyles: z.record(z.string(), z.object({ fontSize: z.number().min(8).max(24), marginMm: z.number().min(5).max(40).optional() })).default({})
});
export const PlanSchema = z.object({ version: z.union([z.literal(1), z.literal(2)]), createdAt: z.string(), root: z.string(), input: z.string(), head: z.string(), documents: z.array(DocumentSchema), tree: z.array(TreeSchema), candidates: z.array(z.object({ id: z.string(), title: z.string(), score: z.number(), reachable: z.number(), incoming: z.number() })), settings: SettingsSchema, warnings: z.array(z.string()) });
export type Plan = z.infer<typeof PlanSchema>;
export const defaults = SettingsSchema.parse({});
export function snapshotMetadataHash(doc: Document): string {
  // Arrays make the digest independent of JSON object-property ordering.
  return checksum(JSON.stringify([doc.title, doc.headings.map(h => [h.level, h.text, h.slug]), doc.links.map(l => [l.href, l.label, l.kind, l.target ?? null, l.fragment ?? null, l.issue ?? null])]));
}

export function flatten(tree: ReadingNode[]): string[] {
  return tree.flatMap(n => [...(n.documentId ? [n.documentId] : []), ...flatten(n.children)]);
}
export function validatePlan(value: unknown): Plan {
  const plan = PlanSchema.parse(value);
  const legacy = plan.version === 1;
  for (const doc of plan.documents) {
    if (!doc.available) continue;
    const digest = checksum(doc.content);
    if (doc.hash !== digest && !(legacy && doc.hash === checksum(`\uFEFF${doc.content}`))) throw new Error(`Snapshot content hash mismatch: ${doc.title}. Rediscover the source to create a new snapshot.`);
    const parsed = parseMarkdown(doc.content);
    if (JSON.stringify(doc.headings) !== JSON.stringify(parsed.headings)) throw new Error(`Stale snapshot heading metadata: ${doc.title}`);
    if (JSON.stringify(doc.links.map(l => ({ href: l.href, label: l.label }))) !== JSON.stringify(parsed.links)) throw new Error(`Stale snapshot link metadata: ${doc.title}`);
    if (!legacy && doc.metadataHash !== snapshotMetadataHash(doc)) throw new Error(`Snapshot derived metadata hash mismatch: ${doc.title}`);
    const assets = Object.keys(doc.assets).sort();
    if (!legacy && (!doc.assetHashes || JSON.stringify(Object.keys(doc.assetHashes).sort()) !== JSON.stringify(assets))) throw new Error(`Snapshot asset hash manifest mismatch: ${doc.title}`);
    for (const href of assets) {
      const data = doc.assets[href];
      if (!parsed.images.includes(href)) throw new Error(`Snapshot asset is not referenced by the document: ${href}`);
      if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error(`Invalid snapshot image data: ${href}`);
      if (!legacy && doc.assetHashes![href] !== checksum(data)) throw new Error(`Snapshot image hash mismatch: ${doc.title}: ${href}`);
    }
    if (legacy) {
      doc.sourceHash ??= doc.hash;
      doc.hash = digest;
      doc.metadataHash = snapshotMetadataHash(doc);
      doc.assetHashes = Object.fromEntries(assets.map(href => [href, checksum(doc.assets[href])]));
    }
  }
  if (legacy) {
    plan.version = 2;
    plan.warnings.push('Version-1 plan upgraded. Image and graph-metadata hashes were established from stored data; original image bytes and resolved metadata cannot be independently verified.');
  }
  const ids = new Set(plan.documents.map(d => d.id));
  if (ids.size !== plan.documents.length) throw new Error('Duplicate document IDs');
  if (!ids.has(plan.head)) throw new Error('Head is missing from the snapshot');
  const seen = new Set<string>(), nodes = new Set<string>();
  function visit(tree: ReadingNode[], depth = 0) {
    if (depth > 100) throw new Error('Reading tree is too deeply nested');
    for (const n of tree) {
      if (nodes.has(n.id)) throw new Error('Duplicate tree node IDs');
      nodes.add(n.id);
      if (n.documentId) {
        if (!ids.has(n.documentId)) throw new Error('Tree refers to a missing document');
        if (seen.has(n.documentId)) throw new Error('A document can appear only once');
        seen.add(n.documentId);
      }
      visit(n.children, depth + 1);
    }
  }
  visit(plan.tree);
  return plan;
}
export function suggestedTree(documents: Document[], head: string): ReadingNode[] {
  const seen = new Set<string>(), byId = new Map(documents.map(d => [d.id, d]));
  function visit(id: string): ReadingNode | undefined {
    const d = byId.get(id);
    if (!d || seen.has(id) || !d.available) return;
    seen.add(id);
    return { id: `node-${id}`, title: d.title, documentId: id, children: d.links.filter(l => l.kind === 'markdown' && l.target).map(l => visit(l.target!)).filter((n): n is ReadingNode => !!n) };
  }
  const tree = visit(head);
  return tree ? [tree] : [];
}
