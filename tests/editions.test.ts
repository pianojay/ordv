import { afterEach, beforeEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { discover, refreshPlan } from '../src/core/discover.js';
import { discoverCollection, createEdition, inspectEdition, runEditionOperation } from '../src/core/editions.js';
import { validatePlan, flatten } from '../src/core/model.js';
import { hash } from '../src/core/io.js';

let root: string, sourceRoot: string, outputRoot: string;
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-editions-')));
  sourceRoot = path.join(root, 'notes'); outputRoot = path.join(root, 'editions');
  await fs.mkdir(sourceRoot); await fs.mkdir(outputRoot);
  await fs.writeFile(path.join(sourceRoot, 'a.md'), '# First\nOriginal qualification: this is preliminary.\n[Next](b.md) [Reference](reference.md)');
  await fs.writeFile(path.join(sourceRoot, 'b.md'), '# Second\n한국어 원문\n[Back](a.md)\n## Detail\n$x^2$');
  await fs.writeFile(path.join(sourceRoot, 'reference.md'), '# Reference\nNot part of the requested reading.');
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
const request = () => ({ sourceRoot, outputRoot, planPath: 'collection.json' });
async function collection() { return discoverCollection(request()); }

it('creates exact reverse order with nested sections and preserves prose in a GUI-compatible plan', async () => {
  const found = await collection();
  const made = await createEdition({ ...request(), expectedRevision: found.revision, outputPlanPath: 'edition.json', title: '읽기 순서',
    selection: [{ section: 'Start here', children: [{ document: 'b.md' }, { section: 'Background', children: [{ document: 'a.md' }] }] }], settings: { tocDepth: 2 } });
  const plan = validatePlan(JSON.parse(await fs.readFile(made.planPath, 'utf8')));
  expect(flatten(plan.tree)).toEqual([found.documents.find(d => d.path.endsWith('b.md'))!.id, found.documents.find(d => d.path.endsWith('a.md'))!.id]);
  expect(made.order).toEqual(flatten(plan.tree));
  expect(made.toc.map(t => t.title)).toEqual(['Start here', 'Second', 'Detail', 'Background', 'First']);
  expect(plan.title).toBe('읽기 순서');
  expect(plan.settings.runningHeader).toBe(true);
  expect(plan.documents.find(d => d.source.endsWith('a.md'))!.content).toBe(await fs.readFile(path.join(sourceRoot, 'a.md'), 'utf8'));
  expect(made.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DOCUMENT_OMITTED', stage: 'preflight' })]));
  expect(JSON.stringify(found)).not.toContain('Original qualification');
  expect(made.revision).toBe(hash(await fs.readFile(made.planPath)));
  const refreshed = await refreshPlan(plan);
  expect(refreshed.title).toBe('읽기 순서');
  expect(refreshed.tree).toEqual(plan.tree);
});

it('rejects settings-only changes and allows explicit metadata inspection of the new revision', async () => {
  const found = await collection();
  const plan = JSON.parse(await fs.readFile(found.planPath, 'utf8')); plan.settings.runningHeader = false;
  await fs.writeFile(found.planPath, JSON.stringify(plan));
  for (const operation of ['create', 'preview', 'export']) {
    const result = await runEditionOperation(operation, { ...request(), expectedRevision: found.revision,
      ...(operation === 'create' ? { outputPlanPath: 'new.json', title: 'Title', selection: [{ document: 'a.md' }] } : { outputPath: 'result.pdf' }) });
    expect(result).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  }
  const inspected = await inspectEdition(request());
  expect(inspected.revision).not.toBe(found.revision);
  expect(inspected.settings.runningHeader).toBe(false);
  expect(await fs.readdir(outputRoot)).toEqual(['collection.json']);
});

it('preserves omitted settings and applies profile margins before explicit margin overrides', async () => {
  const found = await collection();
  const first = await createEdition({ ...request(), expectedRevision: found.revision, outputPlanPath: 'tablet.json', title: 'Tablet', selection: [{ document: 'a.md' }],
    settings: { readingProfile: 'tablet', runningHeader: false, marginsMm: { top: 22 } } });
  expect(first.settings).toMatchObject({ readingProfile: 'tablet', runningHeader: false, marginsMm: { top: 22, right: 40, bottom: 18, left: 15 } });
  const second = await createEdition({ ...request(), planPath: first.planPath, expectedRevision: first.revision, outputPlanPath: 'modified.json', title: 'Modified', selection: [{ document: 'b.md' }], settings: { tocDepth: 2 } });
  expect(second.settings).toMatchObject({ readingProfile: 'tablet', runningHeader: false, tocDepth: 2, marginsMm: first.settings.marginsMm });
});

it.each([
  [[], 'INVALID_REQUEST'],
  [[{ document: 'a.md' }, { document: 'a.md' }], 'DUPLICATE_SELECTION'],
  [[{ document: 'unknown.md' }], 'UNKNOWN_DOCUMENT'],
  [[{ section: 'Empty', children: [] }], 'INVALID_REQUEST'],
  [[{ document: 'a.md', section: 'Ambiguous', children: [] }], 'INVALID_REQUEST']
])('rejects invalid selections without saving an edition (%j)', async (selection, code) => {
  const found = await collection();
  const result = await runEditionOperation('create', { ...request(), expectedRevision: found.revision, outputPlanPath: 'bad.json', title: 'Title', selection });
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(await fs.readdir(outputRoot)).toEqual(['collection.json']);
});

it('rejects cyclic and excessively nested section requests', async () => {
  const found = await collection();
  const cycle: { section: string; children: unknown[] } = { section: 'Cycle', children: [] }; cycle.children.push(cycle);
  let deep: unknown = { document: 'a.md' };
  for (let i = 0; i < 32; i++) deep = { section: `Section ${i}`, children: [deep] };
  for (const node of [cycle, deep]) expect(await runEditionOperation('create', { ...request(), expectedRevision: found.revision,
    outputPlanPath: 'bad.json', title: 'Invalid tree', selection: [node] })).toMatchObject({ ok: false, error: { code: 'INVALID_SELECTION' } });
});

it('reports unavailable selected sources and missing assets before publishing an edition', async () => {
  await fs.appendFile(path.join(sourceRoot, 'a.md'), '\n[Missing](missing.md)');
  const found = await collection();
  const result = await runEditionOperation('create', { ...request(), expectedRevision: found.revision, outputPlanPath: 'bad.json', title: 'Title', selection: [{ document: 'missing.md' }] });
  expect(result).toMatchObject({ ok: false, error: { code: 'SOURCE_UNAVAILABLE' }, diagnostics: [expect.objectContaining({ source: path.join(sourceRoot, 'missing.md'), stage: 'preflight' })] });
  await fs.appendFile(path.join(sourceRoot, 'b.md'), '\n![Missing image](missing.png)');
  const refreshed = await discoverCollection({ ...request(), overwrite: true });
  const missingAsset = await runEditionOperation('create', { ...request(), expectedRevision: refreshed.revision, outputPlanPath: 'bad.json', title: 'Title', selection: [{ document: 'b.md' }] });
  expect(missingAsset).toMatchObject({ ok: true, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'ASSET_UNAVAILABLE', severity: 'warning' })]) });
});

it('pages metadata, bounds heading/link lists, and supports explicit glob seeds', async () => {
  await fs.appendFile(path.join(sourceRoot, 'a.md'), Array.from({ length: 70 }, (_, i) => `\n## Heading ${i}\n[link](#heading-${i})`).join(''));
  const found = await discoverCollection({ ...request(), include: ['a*.md'], limit: 1 });
  expect(found.documents).toHaveLength(1); expect(found.nextOffset).toBe(1);
  expect(found.documents[0].headings).toHaveLength(50); expect(found.documents[0].headingCount).toBe(71);
  expect(found.documents[0].links).toHaveLength(50);
  const next = await inspectEdition({ ...request(), expectedRevision: found.revision, offset: 1, limit: 1 });
  expect(next.documents[0].id).not.toBe(found.documents[0].id);
  expect(JSON.stringify(next)).not.toContain('base64');
});

it('denies remote following even with a supplied cache-like fetcher, while legacy discovery still follows', async () => {
  await fs.writeFile(path.join(sourceRoot, 'remote.md'), '# Remote links\n[remote](https://example.com/note.md)\n![Image](https://example.com/image.png)');
  let fetched = 0;
  const fetcher = async (url: string) => { fetched++; return { data: Buffer.from(url.endsWith('.md') ? '# Remote' : 'image'), type: url.endsWith('.md') ? 'text/plain' : 'image/png', url, cached: true }; };
  const denied = await discover(path.join(sourceRoot, 'remote.md'), { root: sourceRoot, followRemote: false, fetcher });
  expect(fetched).toBe(0); expect(denied.documents).toHaveLength(1);
  expect(denied.documents[0].links[0].issue).toContain('disabled');
  await discover(path.join(sourceRoot, 'remote.md'), { root: sourceRoot, fetcher });
  expect(fetched).toBe(2);
  expect(await runEditionOperation('discover', { ...request(), head: 'https://example.com/note.md' })).toMatchObject({ ok: false, error: { code: 'REMOTE_DISABLED' } });
});

it('rejects lexical and directory-symlink output escapes and source includes', async () => {
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.md'), '# Not authorized');
  await fs.symlink(outside, path.join(outputRoot, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(outside, path.join(sourceRoot, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const planPath of ['../outside/plan.json', 'redirect/new/plan.json']) {
    expect(await runEditionOperation('discover', { ...request(), planPath })).toMatchObject({ ok: false, error: { code: 'PATH_OUTSIDE_ROOT' } });
  }
  for (const include of ['../outside/*.md', 'redirect/*.md']) {
    expect(await runEditionOperation('discover', { ...request(), include: [include] })).toMatchObject({ ok: false, error: { code: 'PATH_OUTSIDE_ROOT' } });
  }
  expect(await fs.readdir(outside)).toEqual(['secret.md']);
});

it('keeps saved snapshots usable after sources are removed and refuses overwrite by default', async () => {
  const found = await collection();
  for (const file of await fs.readdir(sourceRoot)) await fs.rm(path.join(sourceRoot, file));
  const made = await createEdition({ ...request(), expectedRevision: found.revision, outputPlanPath: 'edition.json', title: 'Offline', selection: [{ document: 'b.md' }] });
  expect(made.status).toBe('created');
  const collision = await runEditionOperation('create', { ...request(), expectedRevision: found.revision, outputPlanPath: 'edition.json', title: 'Changed', selection: [{ document: 'a.md' }] });
  expect(collision).toMatchObject({ ok: false, error: { code: 'OUTPUT_EXISTS' } });
  expect(hash(await fs.readFile(made.planPath))).toBe(made.revision);
  const controller = new AbortController(); controller.abort();
  expect(await runEditionOperation('inspect', request(), { signal: controller.signal })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
});

it('protects source aliases, unselected Markdown, and referenced PDFs in overlapping roots', async () => {
  const actual = path.join(sourceRoot, 'actual'); await fs.mkdir(actual);
  await fs.writeFile(path.join(actual, 'note.md'), '# Protected source');
  await fs.writeFile(path.join(actual, 'reference.pdf'), 'Protected PDF');
  await fs.writeFile(path.join(actual, 'metadata.json'), '{"retain":true}');
  await fs.symlink(actual, path.join(sourceRoot, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(sourceRoot, 'head.md'), '# Head\n[Note](alias/note.md) [PDF](alias/reference.pdf) [Metadata](alias/metadata.json)');
  const roots = { sourceRoot, outputRoot: sourceRoot, planPath: 'collection.json' };
  const found = await discoverCollection({ ...roots, head: 'head.md' });
  const base = { ...roots, expectedRevision: found.revision, overwrite: true };
  for (const outputPlanPath of ['actual/note.md', 'reference.md', 'actual/metadata.json']) {
    expect(await runEditionOperation('create', { ...base, outputPlanPath, title: 'Protected', selection: [{ document: 'head.md' }] })).toMatchObject({ ok: false, error: { code: 'INVALID_OUTPUT' } });
  }
  expect(await runEditionOperation('export', { ...base, outputPath: 'actual/reference.pdf' })).toMatchObject({ ok: false, error: { code: 'INVALID_OUTPUT' } });
  expect(await runEditionOperation('preview', { ...base, outputPath: 'actual/note.md' })).toMatchObject({ ok: false, error: { code: 'INVALID_OUTPUT' } });
  expect(await fs.readFile(path.join(actual, 'note.md'), 'utf8')).toBe('# Protected source');
  expect(await fs.readFile(path.join(actual, 'reference.pdf'), 'utf8')).toBe('Protected PDF');
  expect(await fs.readFile(path.join(actual, 'metadata.json'), 'utf8')).toBe('{"retain":true}');
});

it('emits parseable JSON and failing exit status for malformed requests and unknown commands', () => {
  const cli = path.resolve('src/cli.ts');
  for (const [operation, input, code] of [['create', '{', 'INVALID_REQUEST'], ['unknown', '{}', 'UNKNOWN_OPERATION']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'agent', operation, '--request', '-'], { input, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code } });
    expect(result.stderr).toBe('');
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'agent', 'discover'], { encoding: 'utf8' });
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
}, 30000);
