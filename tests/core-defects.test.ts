import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discover } from '../src/core/discover.js';
import { checksum } from '../src/core/checksum.js';
import { hash } from '../src/core/io.js';
import { parseMarkdown, mathProblems } from '../src/core/markdown.js';
import { renderHTML, diagnostics } from '../src/core/render.js';
import { exportPDF } from '../src/core/export.js';
import { flatten, validatePlan } from '../src/core/model.js';

let root: string;
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZfcAAAAASUVORK5CYII=';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-defect-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
async function file(content: string) { const head = path.join(root, 'README.md'); await fs.writeFile(head, content); return discover(head); }

describe('HTML image snapshots (#3)', () => {
  it('snapshots local inline/block images, entity paths and alt attributes', async () => {
    await fs.writeFile(path.join(root, 'one & two.png'), Buffer.from(pixel, 'base64'));
    const plan = await file('# Start\nInline <img src="one &amp; two.png" alt="First" onerror="alert(1)">\n\n<IMG SRC="one &amp; two.png" ALT="Second">');
    expect(Object.keys(plan.documents[0].assets)).toEqual(['one & two.png']);
    expect(plan.documents[0].assetHashes!['one & two.png']).toBe(checksum(plan.documents[0].assets['one & two.png']));
    const html = await renderHTML(plan);
    expect(html.match(/<img[^>]*src="data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).toContain('alt="First"'); expect(html).not.toContain('onerror="alert(1)"');
    expect(diagnostics(plan)).toEqual([]);
  });
  it('reports missing, forbidden, and srcset-only HTML images and prints placeholders', async () => {
    const plan = await file('# Start\n<img src="missing.png" alt="Evidence">\n<img src="../outside.png">\n<img srcset="small.png 1x">');
    const html = await renderHTML(plan);
    expect(html).toContain('[Unavailable image: Evidence]');
    expect(html).not.toMatch(/<img[^>]*src="(?:missing|\.\.)/);
    expect(diagnostics(plan).filter(w => w.includes('Image'))).toHaveLength(3);
    expect(diagnostics(plan).some(w => w.includes('srcset-only'))).toBe(true);
  });
  it('ignores image examples in fenced code and scripts', () => {
    const parsed = parseMarkdown('```html\n<img src="code.png">\n```\n\n<script>const s = "<img src=\"script.png\">";</script>');
    expect(parsed.images).toEqual([]);
  });
  it('resolves remote HTML image URLs against the final document URL', async () => {
    const calls: string[] = [];
    const plan = await discover('https://example.com/alias.md', { fetcher: async url => {
      calls.push(url);
      return url.endsWith('.md') ? { data: Buffer.from('# Remote\n<img src="images/pixel.png">'), type: 'text/markdown', url: 'https://example.com/final/head.md' } : { data: Buffer.from(pixel, 'base64'), type: 'image/png', url };
    } });
    expect(calls).toContain('https://example.com/final/images/pixel.png');
    expect(plan.documents[0].assets['images/pixel.png']).toContain('data:image/png;');
  });
});
describe('math preflight (#4)', () => {
  it('reports inline, display, bracket and fenced errors with source context', () => {
    const problems = mathProblems('Bad $\\unknownA{x}$.\n\n$$\\unknownB{x}$$\n\n\\[\\unknownC{x}\\]\n\n```math\n\\unknownD{x}\n```');
    expect(problems).toHaveLength(4);
    expect(problems.every(p => p.line >= 1 && p.message.includes('Undefined control sequence'))).toBe(true);
    expect(mathProblems('Valid $x^2$.\n\n```text\n$\\unknown{x}$\n```')).toEqual([]);
  });
  it('shows diagnostics in preview and rejects export before browser startup', async () => {
    const plan = await file('# Start\n$$\\unknown{x}$$');
    expect(diagnostics(plan)[0]).toContain('invalid math near line 2');
    expect(await renderHTML(plan)).toContain('katex-error');
    await expect(exportPDF(plan)).rejects.toThrow('Math preflight failed');
    plan.settings.math = false;
    expect(diagnostics(plan)).toEqual([]);
    expect(await renderHTML(plan)).not.toContain('class="katex-error"');
  });
  it('does not block export for math in excluded source documents', async () => {
    await fs.writeFile(path.join(root, 'other.md'), '# Other\n$$\\unknown{x}$$');
    const plan = await file('# Start\n[Other](other.md)');
    plan.tree[0].children = [];
    expect(diagnostics(plan).some(w => w.includes('invalid math'))).toBe(false);
  });
});
describe('snapshot integrity (#5)', () => {
  it('uses browser-compatible SHA-256 with the same result as Node', () => {
    for (const text of ['', 'abc', '한글\n', '\uFEFF# Heading']) expect(checksum(text)).toBe(hash(text));
  });
  it('rejects text, headings, links, and asset tampering while allowing reading-tree edits', async () => {
    await fs.writeFile(path.join(root, 'image.png'), Buffer.from(pixel, 'base64'));
    const plan = await file('# Start\n[Reference](https://example.com)\n![Image](image.png)');
    for (const [mutation, expected] of [
      [(p: any) => { p.documents[0].content += '\nChanged'; }, 'content hash'],
      [(p: any) => { p.documents[0].headings[0].slug = 'wrong'; }, 'heading metadata'],
      [(p: any) => { p.documents[0].links[0].label = 'wrong'; }, 'link metadata'],
      [(p: any) => { p.documents[0].links[0].kind = 'markdown'; }, 'derived metadata'],
      [(p: any) => { p.documents[0].title = 'Stale source title'; }, 'derived metadata'],
      [(p: any) => { p.documents[0].assets['image.png'] = 'data:image/png;base64,YWJj'; }, 'image hash'],
      [(p: any) => { delete p.documents[0].assetHashes; }, 'asset hash manifest']
    ] as const) { const changed = structuredClone(plan); mutation(changed); expect(() => validatePlan(changed)).toThrow(expected); }
    plan.tree[0].title = 'Editorial chapter title';
    expect(validatePlan(plan).tree[0].title).toBe('Editorial chapter title');
    expect(validatePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
  it('migrates valid legacy BOM snapshots and refuses stale legacy text', async () => {
    await fs.writeFile(path.join(root, 'README.md'), '\uFEFF# Start');
    const plan = await discover(path.join(root, 'README.md'));
    expect(plan.version).toBe(2); expect(plan.documents[0].sourceHash).toBe(hash('\uFEFF# Start'));
    const legacy = structuredClone(plan); legacy.version = 1; legacy.documents[0].hash = legacy.documents[0].sourceHash!; delete legacy.documents[0].assetHashes;
    const upgraded = validatePlan(legacy);
    expect(upgraded.version).toBe(2); expect(upgraded.documents[0].hash).toBe(hash('# Start'));
    expect(upgraded.documents[0].sourceHash).toBe(hash('\uFEFF# Start'));
    expect(upgraded.warnings[0]).toContain('original image bytes');
    legacy.documents[0].content = '# Changed';
    expect(() => validatePlan(legacy)).toThrow('content hash');
  });
});
describe('canonical redirect identities (#6)', () => {
  it('deduplicates aliases, remaps links/fragments and handles cycles and canonical heads', async () => {
    const plan = await discover('https://example.com/start-alias.md', { fetcher: async url => {
      if (url.includes('start')) return { url: 'https://example.com/final/start.md', type: 'text/markdown', data: Buffer.from('# Start\n[One](one.md#detail) [Two](two.md#detail) [Self](https://example.com/start-alias.md)') };
      return { url: 'https://example.com/final/shared.md', type: 'text/markdown', data: Buffer.from('# Shared\n## Detail\n[Back](start.md)') };
    } });
    expect(plan.documents).toHaveLength(2);
    const head = plan.documents.find(d => d.id === plan.head)!;
    expect(head.source).toBe('https://example.com/final/start.md');
    const shared = plan.documents.find(d => d.title === 'Shared')!;
    expect(shared.aliases).toEqual(['https://example.com/final/one.md', 'https://example.com/final/two.md']);
    expect(head.links[0].target).toBe(shared.id); expect(head.links[1].target).toBe(shared.id); expect(head.links[2].target).toBe(head.id);
    expect(shared.links[0].target).toBe(head.id);
    expect(head.links.every(l => !l.issue)).toBe(true);
    expect(flatten(plan.tree)).toHaveLength(2);
    expect(validatePlan(plan)).toEqual(plan);
  });
  it('retains a single consistent snapshot if an alias resolves after remote content changes', async () => {
    const plan = await discover('https://example.com/start.md', { fetcher: async url => url.endsWith('start.md') ? { url, type: 'text/plain', data: Buffer.from('# Start\n[A](one.md) [B](two.md)') } : { url: 'https://example.com/shared.md', type: 'text/plain', data: Buffer.from(url.endsWith('one.md') ? '# First' : '# Later') } });
    expect(plan.documents).toHaveLength(2);
    expect(plan.documents[1].title).toBe('First');
    expect(plan.documents[1].warnings[0]).toContain('first canonical snapshot');
  });
  it('replaces an earlier failed canonical request when an alias succeeds', async () => {
    const plan = await discover('https://example.com/start.md', { fetcher: async url => {
      if (url.endsWith('start.md')) return { url, type: 'text/plain', data: Buffer.from('# Start\n[Direct](shared.md) [Alias](alias.md)') };
      if (url.endsWith('shared.md')) throw new Error('Transient failure');
      return { url: 'https://example.com/shared.md', type: 'text/plain', data: Buffer.from('# Shared') };
    } });
    expect(plan.documents).toHaveLength(2);
    expect(plan.documents[0].links[0].target).toBe(plan.documents[1].id);
    expect(plan.documents[0].links.every(l => !l.issue)).toBe(true);
    expect(validatePlan(plan)).toEqual(plan);
  });
});
