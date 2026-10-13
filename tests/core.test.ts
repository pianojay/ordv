import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discover } from '../src/core/discover';
import { parseMarkdown } from '../src/core/markdown';
import { flatten, validatePlan, suggestedTree } from '../src/core/model';
import { moveNode, excludeDocument, reorder } from '../src/core/tree';
import { publicAddress, resolveReference, within, type Fetcher } from '../src/core/io';
import { diagnostics, renderHTML } from '../src/core/render';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'packet-test-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
async function write(file: string, text: string) { const full = path.join(root, file); await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, text); }

describe('discovery and reading order', () => {
  it('ranks README, handles cycles and shared children, keeps disconnected files', async () => {
    await write('README.md', '# Start\n[B](b.md) [C][c]\n\n[c]: sub/c.md');
    await write('b.md', '# B\n[back](README.md) [shared](shared.md#same)');
    await write('sub/c.md', '# C\n[shared](../shared.md#same-1)');
    await write('shared.md', '# Shared\n## Same\n## Same');
    await write('lonely.md', '# Lonely');
    const plan = await discover(root);
    expect(plan.documents).toHaveLength(5);
    expect(plan.documents.find(d => d.id === plan.head)!.title).toBe('Start');
    expect(flatten(plan.tree).map(id => plan.documents.find(d => d.id === id)!.title)).toEqual(['Start', 'B', 'Shared', 'C']);
    expect(new Set(flatten(plan.tree)).size).toBe(4);
    expect(plan.documents.find(d => d.title === 'Shared')!.headings.map(h => h.slug)).toEqual(['shared', 'same', 'same-1']);
    expect(validatePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    const lonely = plan.documents.find(d => d.title === 'Lonely')!;
    expect(suggestedTree(plan.documents, lonely.id)[0].documentId).toBe(lonely.id);
  });
  it('ignores links in code, parses reference links and image references', () => {
    const parsed = parseMarkdown('# Hello *world*\n[read][r]\n![image][im]\n\n[r]: file%20one.md\n[im]: image.png\n\n```\n[no](wrong.md)\n```');
    expect(parsed.links).toEqual([{ href: 'file%20one.md', label: 'read' }]);
    expect(parsed.images).toEqual(['image.png']);
    expect(parsed.headings[0].text).toBe('Hello world');
  });
  it('resolves encoded paths, fragments, missing files and root escapes', async () => {
    await write('README.md', '# Start\n[one](a%20b.md#heading) [missing](none.md) [outside](../outside.md)');
    await write('a b.md', '# Heading');
    const plan = await discover(path.join(root, 'README.md'));
    expect(plan.documents.filter(d => d.available)).toHaveLength(2);
    expect(plan.documents[0].links[0].issue).toBeUndefined();
    expect(plan.documents[0].links[1].issue).toContain('unavailable');
    expect(plan.documents[0].links[2].issue).toContain('unavailable');
    expect(within(root, path.join(root, '..', 'outside.md'))).toBe(false);
  });
  it('orders ambiguous heads deterministically and enforces document limits', async () => {
    await write('b.md', '# B'); await write('a.md', '# A');
    const plan = await discover(root); expect(plan.candidates.map(c => c.title)).toEqual(['A', 'B']);
    const limited = await discover(root, { maxDocuments: 1 }); expect(limited.documents).toHaveLength(1); expect(limited.warnings[0]).toContain('stopped');
  });
  it('deduplicates Windows paths that differ only in casing', async () => {
    if (process.platform !== 'win32') return;
    await write('README.md', '# Start\n[again](readme.md) [child](CHILD.md)');
    await write('child.md', '# Child\n[again](README.MD)');
    const plan = await discover(root);
    expect(plan.documents).toHaveLength(2);
    expect(flatten(plan.tree)).toHaveLength(2);
    expect(plan.documents.flatMap(d => d.links).every(l => !l.issue)).toBe(true);
  });
  it('does not follow symlink files outside root', async () => {
    const outside = path.join(root, '..', `outside-${path.basename(root)}.md`); await fs.writeFile(outside, '# Secret');
    try {
      await write('README.md', '# Start\n[escape](escape.md)');
      try { await fs.symlink(outside, path.join(root, 'escape.md')); } catch (e: any) { if (e.code === 'EPERM') return; throw e; }
      const p = await discover(root); expect(p.documents.find(d => d.source.endsWith('escape.md'))!.available).toBe(false);
    } finally { await fs.rm(outside, { force: true }); }
  });
});
describe('remote documents and assets', () => {
  it('uses final redirect base, handles cycles, depth and failed requests', async () => {
    const called: string[] = [];
    const fetcher: Fetcher = async (url, _max, refresh) => {
      called.push(`${url}:${refresh}`);
      if (url.endsWith('entry.md')) return { data: Buffer.from('# Remote\n[child](child.md) ![image](img.png) [PDF](source.pdf)'), type: 'text/plain', url: 'https://example.com/final/entry.md' };
      if (url.endsWith('child.md')) return { data: Buffer.from('# Child\n[next](next.md) [broken](broken.md)'), type: 'text/markdown', url };
      if (url.endsWith('img.png')) return { data: Buffer.from('png'), type: 'image/png', url };
      throw new Error('HTTP 404');
    };
    const p = await discover('https://example.com/entry.md', { fetcher, refresh: true, maxDepth: 1 });
    expect(p.documents).toHaveLength(2);
    expect(p.documents[0].assets['img.png']).toContain('data:image/png;base64,');
    expect(p.documents[0].links[1].kind).toBe('pdf');
    expect(called.some(s => s === 'https://example.com/final/child.md:true')).toBe(true);
    expect(p.documents[1].links[0].issue).toContain('depth limit');
    const deeper = await discover('https://example.com/entry.md', { fetcher });
    expect(deeper.documents.filter(d => !d.available)).toHaveLength(2);
  });
  it('rejects HTML as a remote Markdown head', async () => {
    await expect(discover('https://example.com/article.md', { fetcher: async url => ({ data: Buffer.from('<h1>HTML</h1>'), type: 'text/html', url }) })).rejects.toThrow('HTML');
  });
  it('filters private network addresses and unsupported URI schemes', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.2', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(resolveReference('/root/a.md', 'mailto:a@example.com').source).toBeUndefined();
    if (process.platform === 'win32') expect(resolveReference('D:\\notes\\a.md', 'sub\\b.md#top').source).toBe('D:\\notes\\sub\\b.md');
  });
});
describe('tree editing and snapshots', () => {
  it('moves, reorders, and excludes a document while retaining its children', () => {
    const tree = [{ id: 'a', title: 'A', documentId: 'A', children: [{ id: 'b', title: 'B', documentId: 'B', children: [] }] }, { id: 's', title: 'Section', children: [] }];
    expect(() => moveNode(tree, 'a', 'b')).toThrow('inside itself');
    expect(flatten(excludeDocument(tree, 'A'))).toEqual(['B']);
    const moved = moveNode(tree, 'b', 's'); expect(moved[1].children[0].id).toBe('b');
    expect(reorder(moved, 's', -1)[0].id).toBe('s');
    expect(tree[0].children).toHaveLength(1);
  });
  it('renders frozen snapshots, diagnostics, namespaced headings and sanitized HTML', async () => {
    await write('README.md', '# Start\n[child](child.md#same)\n<script>alert(1)</script>\n<img src="http://127.0.0.1/secret" onerror="alert(2)">');
    await write('child.md', '# Child\n## Same');
    const plan = await discover(root);
    await write('README.md', '# Changed');
    const html = await renderHTML(plan);
    expect(html).toContain('Start'); expect(html).not.toContain('<script>alert(1)'); expect(html).not.toContain('onerror="alert(2)"');
    const child = plan.documents.find(d => d.title === 'Child')!;
    expect(html).toContain(`d-${child.id}--same`);
    const excluded = structuredClone(plan); excluded.tree = excludeDocument(excluded.tree, child.id);
    expect(diagnostics(excluded).some(w => w.includes('omitted'))).toBe(true);
    expect(() => validatePlan({ ...plan, version: 2 })).toThrow();
    expect(() => validatePlan({ ...plan, tree: [...plan.tree, ...plan.tree] })).toThrow('Duplicate');
  });
});
