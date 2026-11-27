import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { discover } from './discover.js';
import { hash, remote, within, resolveReference } from './io.js';
import { validatePlan, SettingsSchema, flatten, suggestedTree, applyReadingProfile, type Plan, type ReadingNode } from './model.js';
import { diagnosticRecords, type Diagnostic } from './diagnostics.js';
import { renderHTML } from './render.js';
import { exportPDF } from './export.js';
import { atomicOutput } from './output.js';
import { foldedVisibility, parseMarkdown } from './markdown.js';

export type EditionOperation = 'discover' | 'create' | 'inspect' | 'preview' | 'export';
export interface EditionDiagnostic {
  code: string; severity: Diagnostic['severity']; message: string;
  stage: 'request' | 'discovery' | 'preflight' | 'render' | 'output';
  documentId?: string; source?: string; reference?: string;
}
export class EditionError extends Error {
  constructor(public code: string, message: string, public diagnostics: EditionDiagnostic[] = []) { super(message); }
}
const text = z.string().min(1).max(4096);
const roots = { sourceRoot: text, outputRoot: text, planPath: text };
const revision = { expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) };
const page = { offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) };
const discoverRequest = z.object({ ...roots, ...page, head: text.optional(), include: z.array(text).min(1).max(500).optional(), allowRemote: z.boolean().default(false), overwrite: z.boolean().default(false) }).strict();
const createRequest = z.object({ ...roots, ...revision, outputPlanPath: text, title: z.string().trim().min(1).max(300), selection: z.array(z.unknown()).min(1).max(500), settings: z.record(z.string(), z.unknown()).optional(), overwrite: z.boolean().default(false) }).strict();
const inspectRequest = z.object({ ...roots, expectedRevision: revision.expectedRevision.optional(), ...page }).strict();
const renderRequest = z.object({ ...roots, ...revision, outputPath: text, overwrite: z.boolean().default(false), browser: text.optional() }).strict();
const selectionNode = z.union([
  z.object({ document: text }).strict(),
  z.object({ section: z.string().trim().min(1).max(300), children: z.array(z.unknown()).min(1).max(500) }).strict()
]);
const short = (value: string) => value.slice(0, 1024);

async function authorizedRoot(value: string) {
  if (!path.isAbsolute(value)) throw new EditionError('INVALID_ROOT', 'Source and output roots must be absolute paths');
  const root = await fs.realpath(value);
  if (!(await fs.stat(root)).isDirectory()) throw new EditionError('INVALID_ROOT', `Root must be an existing directory: ${value}`);
  return root;
}

async function authorizedPath(root: string, value: string): Promise<string> {
  const target = path.resolve(root, value);
  if (!within(root, target)) throw new EditionError('PATH_OUTSIDE_ROOT', `Path is outside its authorized root: ${value}`);
  let ancestor = target;
  while (true) {
    try {
      const real = await fs.realpath(ancestor);
      if (!within(root, real)) throw new EditionError('PATH_OUTSIDE_ROOT', `Path resolves outside its authorized root: ${value}`);
      return path.resolve(real, path.relative(ancestor, target));
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new EditionError('PATH_OUTSIDE_ROOT', `Dangling symbolic link: ${value}`); }
      catch (entryError: any) { if (entryError.code !== 'ENOENT') throw entryError; }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

async function artifactPath(sourceRoot: string, outputRoot: string, value: string, extension: '.json' | '.html' | '.pdf', plan?: Plan) {
  const output = await authorizedPath(outputRoot, value);
  if (path.extname(output).toLowerCase() !== extension) throw new EditionError('INVALID_OUTPUT', `This operation requires a ${extension} output path`);
  if (plan) {
    const sources = new Set<string>();
    for (const doc of plan.documents) {
      if (!remote(doc.source)) sources.add(doc.source);
      for (const href of [...doc.links.map(l => l.href), ...parseMarkdown(doc.content).images]) {
        try { const target = resolveReference(doc.source, href).source; if (target && !remote(target)) sources.add(target); }
        catch { continue; }
      }
    }
    for (const source of sources) {
      let canonical = path.resolve(source);
      try {
        const root = within(outputRoot, canonical) ? outputRoot : within(sourceRoot, canonical) ? sourceRoot : undefined;
        if (root) canonical = await authorizedPath(root, canonical);
      } catch (error) { if (!(error instanceof EditionError && error.code === 'PATH_OUTSIDE_ROOT')) throw error; }
      if (within(output, canonical) && within(canonical, output)) throw new EditionError('INVALID_OUTPUT', 'Output would replace a source document, asset, or local reference');
    }
  }
  return output;
}

function staged(plan: Plan, stage: EditionDiagnostic['stage']): EditionDiagnostic[] {
  const byId = new Map(plan.documents.map(d => [d.id, d.source]));
  return diagnosticRecords(plan).map(d => ({ code: d.code, severity: d.severity,
    message: short(d.message), stage, documentId: d.documentId, source: d.documentId ? short(byId.get(d.documentId) || '') : undefined, reference: d.href ? short(d.href) : undefined }));
}
function diagnosticSummary(diagnostics: EditionDiagnostic[]) {
  return { diagnostics: diagnostics.slice(0, 100), diagnosticCount: diagnostics.length, diagnosticsTruncated: diagnostics.length > 100 };
}
function ensurePrintable(plan: Plan) {
  if (!flatten(plan.tree).length) throw new EditionError('EMPTY_SELECTION', 'Select at least one document');
  const records = staged(plan, 'preflight');
  if (records.some(d => d.severity === 'error')) throw new EditionError('PREFLIGHT_FAILED', 'Selected snapshots have blocking diagnostics', records);
  return records;
}
function outline(plan: Plan) {
  const toc: { title: string; depth: number; documentId?: string; heading?: string }[] = [];
  const byId = new Map(plan.documents.map(d => [d.id, d]));
  function visit(nodes: ReadingNode[], depth: number) {
    for (const n of nodes) {
      toc.push({ title: short(n.title), depth, documentId: n.documentId });
      if (n.documentId && plan.settings.tocDepth) {
        const doc = byId.get(n.documentId)!;
        const hidden = plan.settings.answers === 'preserve' ? foldedVisibility(doc.content).hidden : new Set<string>();
        for (const [i, h] of doc.headings.entries()) if (!hidden.has(h.slug) && h.level <= plan.settings.tocDepth && !(i === 0 && h.level === 1 && h.text === doc.title)) {
          toc.push({ title: short(h.text), depth: depth + h.level, documentId: n.documentId, heading: h.slug });
        }
      }
      visit(n.children, depth + 1);
    }
  }
  visit(plan.tree, 0);
  const order = flatten(plan.tree);
  return { order: order.slice(0, 500), orderCount: order.length, toc: toc.slice(0, 500), tocCount: toc.length, tocTruncated: toc.length > 500 };
}
function metadata(plan: Plan, offset: number, limit: number) {
  return {
    documents: plan.documents.slice(offset, offset + limit).map(d => ({ id: d.id, path: short(d.source), pathTruncated: d.source.length > 1024, title: short(d.title), available: d.available,
      headings: d.headings.slice(0, 50).map(h => ({ ...h, text: short(h.text), slug: short(h.slug) })), headingCount: d.headings.length,
      links: d.links.slice(0, 50).map(l => ({ ...l, href: short(l.href), label: short(l.label), target: l.target ? short(l.target) : undefined, fragment: l.fragment ? short(l.fragment) : undefined, issue: l.issue ? short(l.issue) : undefined })), linkCount: d.links.length })),
    totalDocuments: plan.documents.length, offset, limit, nextOffset: offset + limit < plan.documents.length ? offset + limit : null,
    candidateHeads: plan.candidates.slice(0, 20).map(c => ({ ...c, title: short(c.title) })), candidateHeadCount: plan.candidates.length
  };
}
async function currentRevision(planPath: string, expected: string) {
  const bytes = await fs.readFile(planPath, 'utf8');
  if (hash(bytes) !== expected) throw new EditionError('STALE_REVISION', 'The saved plan changed. Inspect its new revision and repeat your editorial decision; do not silently refresh.');
  return bytes;
}
async function loadPlan(sourceRoot: string, outputRoot: string, file: string, expected?: string) {
  const planPath = await authorizedPath(outputRoot, file);
  const bytes = expected ? await currentRevision(planPath, expected) : await fs.readFile(planPath, 'utf8');
  let plan: Plan;
  try { plan = validatePlan(JSON.parse(bytes)); }
  catch (error) { throw new EditionError('INVALID_PLAN', short(String(error))); }
  if (!within(sourceRoot, path.resolve(plan.root))) throw new EditionError('PATH_OUTSIDE_ROOT', 'The plan source root is outside the authorized source root');
  for (const doc of plan.documents) if (doc.available && !remote(doc.source)) await authorizedPath(sourceRoot, doc.source);
  return { plan, planPath, revision: hash(bytes) };
}
function composeTree(selection: unknown[], plan: Plan): ReadingNode[] {
  const selected = new Set<string>(), visited = new WeakSet<object>();
  let count = 0;
  function visit(values: unknown[], depth: number): ReadingNode[] {
    if (depth > 30) throw new EditionError('INVALID_SELECTION', 'Sections may be nested at most 30 levels');
    return values.map(value => {
      if (++count > 1000) throw new EditionError('INVALID_SELECTION', 'Selection exceeds 1000 nodes');
      if (value && typeof value === 'object') {
        if (visited.has(value)) throw new EditionError('INVALID_SELECTION', 'Selection contains a cycle or reused node');
        visited.add(value);
      }
      const node = selectionNode.parse(value), id = `edition-${count}`;
      if ('section' in node) return { id, title: node.section, children: visit(node.children, depth + 1) };
      const source = remote(node.document) ? node.document : path.resolve(plan.root, node.document);
      const equal = (a: string, b: string) => process.platform === 'win32' && !remote(a) ? a.toLowerCase() === b.toLowerCase() : a === b;
      const doc = plan.documents.find(d => d.id === node.document || equal(d.source, source) || d.aliases?.some(a => equal(a, source)));
      if (!doc) throw new EditionError('UNKNOWN_DOCUMENT', `Selection is not in this snapshot: ${node.document}`);
      if (!doc.available) throw new EditionError('SOURCE_UNAVAILABLE', `Selected document is unavailable: ${doc.source}`, [{ code: 'SOURCE_UNAVAILABLE', severity: 'error', message: 'Selected snapshot is unavailable', stage: 'preflight', documentId: doc.id, source: short(doc.source) }]);
      if (selected.has(doc.id)) throw new EditionError('DUPLICATE_SELECTION', `Document selected more than once: ${node.document}`);
      selected.add(doc.id);
      return { id, title: doc.title, documentId: doc.id, children: [] };
    });
  }
  return visit(selection, 0);
}

export async function discoverCollection(value: unknown, options: { signal?: AbortSignal } = {}) {
  const request = discoverRequest.parse(value);
  const sourceRoot = await authorizedRoot(request.sourceRoot), outputRoot = await authorizedRoot(request.outputRoot);
  const planPath = await artifactPath(sourceRoot, outputRoot, request.planPath, '.json');
  const head = request.head ? remote(request.head) ? request.head : await authorizedPath(sourceRoot, request.head) : sourceRoot;
  if (remote(head) && !request.allowRemote) throw new EditionError('REMOTE_DISABLED', 'Set allowRemote true to capture public remote Markdown');
  const seeds: string[] = [];
  if (request.include) {
    for (const include of request.include) {
      if (remote(include)) {
        if (!request.allowRemote) throw new EditionError('REMOTE_DISABLED', 'Remote includes require allowRemote true');
        seeds.push(include);
      } else {
        await authorizedPath(sourceRoot, include);
        let matches = 0;
        for await (const file of fs.glob(include, { cwd: sourceRoot })) {
          const full = await authorizedPath(sourceRoot, file);
          if ((await fs.stat(full)).isFile() && /\.(md|markdown)$/i.test(full)) { seeds.push(full); matches++; }
        }
        if (!matches) throw new EditionError('UNKNOWN_DOCUMENT', `Include matched no Markdown files: ${include}`);
      }
    }
    if (request.head) seeds.unshift(head);
  }
  const cacheDir = await authorizedPath(outputRoot, '.ordv/cache');
  const plan = validatePlan(await discover(head, { root: sourceRoot, followRemote: request.allowRemote, includeSources: request.include ? seeds : undefined, cacheDir, signal: options.signal }));
  if (request.head) {
    const selectedHead = plan.documents.find(d => d.source === head || d.aliases?.includes(head));
    if (!selectedHead?.available) throw new EditionError('SOURCE_UNAVAILABLE', 'The selected head is unavailable');
    plan.head = selectedHead.id; plan.tree = suggestedTree(plan.documents, plan.head);
  }
  const bytes = JSON.stringify(plan, null, 2);
  await artifactPath(sourceRoot, outputRoot, request.planPath, '.json', plan);
  await atomicOutput(planPath, async () => ({ bytes, result: undefined }), { force: request.overwrite, signal: options.signal });
  return { ok: true as const, status: 'discovered', operation: 'discover', planPath, revision: hash(bytes), ...metadata(plan, request.offset, request.limit), ...diagnosticSummary(staged(plan, 'discovery')) };
}

export async function createEdition(value: unknown, options: { signal?: AbortSignal } = {}) {
  const request = createRequest.parse(value);
  const sourceRoot = await authorizedRoot(request.sourceRoot), outputRoot = await authorizedRoot(request.outputRoot);
  const { plan, planPath } = await loadPlan(sourceRoot, outputRoot, request.planPath, request.expectedRevision);
  const outputPlanPath = await artifactPath(sourceRoot, outputRoot, request.outputPlanPath, '.json', plan);
  plan.title = request.title; plan.tree = composeTree(request.selection, plan);
  const settings = SettingsSchema.strict().parse({ ...plan.settings, ...request.settings });
  if (request.settings?.readingProfile !== undefined) applyReadingProfile(plan, settings.readingProfile);
  plan.settings = SettingsSchema.parse({ ...plan.settings, ...request.settings,
    marginsMm: { ...plan.settings.marginsMm, ...(request.settings?.marginsMm as object | undefined) } });
  validatePlan(plan);
  const records = ensurePrintable(plan), bytes = JSON.stringify(plan, null, 2);
  await atomicOutput(outputPlanPath, async () => { await currentRevision(planPath, request.expectedRevision); return { bytes, result: undefined }; }, { force: request.overwrite, signal: options.signal });
  return { ok: true as const, status: 'created', operation: 'create', planPath: outputPlanPath, manifestPath: outputPlanPath, revision: hash(bytes), title: plan.title, settings: plan.settings, ...outline(plan), ...diagnosticSummary(records) };
}

export async function inspectEdition(value: unknown) {
  const request = inspectRequest.parse(value);
  const sourceRoot = await authorizedRoot(request.sourceRoot), outputRoot = await authorizedRoot(request.outputRoot);
  const { plan, planPath, revision: capturedRevision } = await loadPlan(sourceRoot, outputRoot, request.planPath, request.expectedRevision);
  return { ok: true as const, status: 'inspected', operation: 'inspect', planPath, revision: capturedRevision, title: plan.title, settings: plan.settings, ...metadata(plan, request.offset, request.limit), ...outline(plan), ...diagnosticSummary(staged(plan, 'preflight')) };
}

async function renderEdition(operation: 'preview' | 'export', value: unknown, options: { signal?: AbortSignal } = {}) {
  const request = renderRequest.parse(value);
  const sourceRoot = await authorizedRoot(request.sourceRoot), outputRoot = await authorizedRoot(request.outputRoot);
  const { plan, planPath } = await loadPlan(sourceRoot, outputRoot, request.planPath, request.expectedRevision);
  const outputPath = await artifactPath(sourceRoot, outputRoot, request.outputPath, operation === 'preview' ? '.html' : '.pdf', plan);
  if (outputPath === planPath) throw new EditionError('INVALID_OUTPUT', 'Output would replace the saved plan');
  const records = ensurePrintable(plan);
  const pageCount = await atomicOutput(outputPath, async () => {
    let result;
    try { result = await exportPDF(plan, { signal: options.signal, executablePath: request.browser }); }
    catch (error) {
      if (options.signal?.aborted) throw error;
      const message = short(String(error));
      const code = /browser.*start|browser.*exist|No installed browser/i.test(message) ? 'RENDERER_UNAVAILABLE' : /Mermaid/i.test(message) ? 'DIAGRAM_INVALID' : 'RENDER_FAILED';
      throw new EditionError(code, message, [...records, { code, message, stage: 'render', severity: 'error' }]);
    }
    const count = (await PDFDocument.load(result.bytes)).getPageCount();
    const bytes = operation === 'preview' ? (await renderHTML(plan)).replaceAll('https://packet.invalid/#', '#') : result.bytes;
    await currentRevision(planPath, request.expectedRevision);
    await authorizedPath(outputRoot, request.outputPath);
    return { bytes, result: count };
  }, { force: request.overwrite, signal: options.signal });
  return { ok: true as const, status: operation === 'preview' ? 'previewed' : 'exported', operation, planPath, manifestPath: planPath, revision: request.expectedRevision,
    ...(operation === 'preview' ? { previewPath: outputPath } : { pdfPath: outputPath }), pageCount, title: plan.title, settings: plan.settings, ...outline(plan), ...diagnosticSummary(records) };
}
export const previewEdition = (value: unknown, options: { signal?: AbortSignal } = {}) => renderEdition('preview', value, options);
export const exportEdition = (value: unknown, options: { signal?: AbortSignal } = {}) => renderEdition('export', value, options);

export function editionFailure(operation: string, error: unknown, signal?: AbortSignal) {
  const message = short(error instanceof Error ? error.message : String(error));
  const code = signal?.aborted ? 'CANCELLED' : error instanceof EditionError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'INVALID_REQUEST'
    : /already exists|EEXIST/.test(message) ? 'OUTPUT_EXISTS' : /reserved by another/.test(message) ? 'OUTPUT_BUSY' : /ENOENT/.test(message) ? 'NOT_FOUND' : 'OPERATION_FAILED';
  const diagnostics: EditionDiagnostic[] = error instanceof EditionError && error.diagnostics.length ? error.diagnostics : [{ code, severity: 'error', message, stage: code.startsWith('OUTPUT') ? 'output' : 'request' }];
  return { ok: false as const, status: 'error', operation, error: { code, message }, ...diagnosticSummary(diagnostics) };
}
export async function runEditionOperation(operation: string, value: unknown, options: { signal?: AbortSignal } = {}) {
  try {
    options.signal?.throwIfAborted();
    switch (operation) {
      case 'discover': return await discoverCollection(value, options);
      case 'create': return await createEdition(value, options);
      case 'inspect': return await inspectEdition(value);
      case 'preview': return await previewEdition(value, options);
      case 'export': return await exportEdition(value, options);
      default: throw new EditionError('UNKNOWN_OPERATION', `Unknown agent operation: ${operation}`);
    }
  } catch (error) { return editionFailure(operation, error, options.signal); }
}
