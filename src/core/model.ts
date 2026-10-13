import { z } from 'zod';

export const LinkSchema = z.object({ href: z.string(), label: z.string(), kind: z.enum(['markdown', 'pdf', 'web', 'anchor', 'other']), target: z.string().optional(), fragment: z.string().optional(), issue: z.string().optional() });
export const HeadingSchema = z.object({ level: z.number().int().min(1).max(6), text: z.string(), slug: z.string() });
export const DocumentSchema = z.object({ id: z.string(), source: z.string(), title: z.string(), content: z.string(), hash: z.string(), links: z.array(LinkSchema), headings: z.array(HeadingSchema), assets: z.record(z.string(), z.string()), warnings: z.array(z.string()), available: z.boolean() });
export type Document = z.infer<typeof DocumentSchema>;
export type Link = z.infer<typeof LinkSchema>;
export interface ReadingNode { id: string; title: string; documentId?: string; children: ReadingNode[] }
const TreeSchema: z.ZodType<ReadingNode> = z.lazy(() => z.object({ id: z.string(), title: z.string(), documentId: z.string().optional(), children: z.array(TreeSchema) }));
export const SettingsSchema = z.object({ mode: z.enum(['book', 'documents']).default('book'), paper: z.enum(['A4', 'Letter']).default('A4'), toc: z.boolean().default(true), graph: z.boolean().default(false), math: z.boolean().default(true), documentStyles: z.record(z.string(), z.object({ fontSize: z.number().min(8).max(24), marginMm: z.number().min(5).max(40) })).default({}) });
export const PlanSchema = z.object({ version: z.literal(1), createdAt: z.string(), root: z.string(), input: z.string(), head: z.string(), documents: z.array(DocumentSchema), tree: z.array(TreeSchema), candidates: z.array(z.object({ id: z.string(), title: z.string(), score: z.number(), reachable: z.number(), incoming: z.number() })), settings: SettingsSchema, warnings: z.array(z.string()) });
export type Plan = z.infer<typeof PlanSchema>;
export const defaults = SettingsSchema.parse({});

export function flatten(tree: ReadingNode[]): string[] {
  return tree.flatMap(n => [...(n.documentId ? [n.documentId] : []), ...flatten(n.children)]);
}
export function validatePlan(value: unknown): Plan {
  const plan = PlanSchema.parse(value);
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
