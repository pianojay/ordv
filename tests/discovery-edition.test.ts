import { it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discover, refreshPlan } from '../src/core/discover.js';
import { validatePlan, flatten } from '../src/core/model.js';
import { diagnosticRecords } from '../src/core/diagnostics.js';

it('keeps explicit scope separate from head and retains GitHub line links as references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-scope-'));
  try {
    await fs.mkdir(path.join(root, 'sub'));
    await fs.writeFile(path.join(root, 'sub', 'head.md'), '# Head\n[parent](../parent.md#missing) [web](https://github.com/a/b/blob/main/file.md#L3-L8)');
    await fs.writeFile(path.join(root, 'parent.md'), '# Parent');
    const input = path.join(root, 'sub', 'head.md');
    const narrow = await discover(input);
    expect(narrow.documents.filter(d => d.available)).toHaveLength(1);
    expect(diagnosticRecords(narrow).some(d => d.code === 'SCOPE_EXCLUDED')).toBe(true);
    const p = await discover(input, { root, originRoot: 'ssh://vilab204/home/user/docs' });
    expect(p.documents).toHaveLength(2);
    expect(p.documents[0].links[1]).toMatchObject({ kind: 'web', fragment: 'L3-L8' });
    expect(p.documents[0].provenance).toMatchObject({ originalLocation: 'ssh://vilab204/home/user/docs/sub/head.md', importLocation: input, origin: 'user-provided' });
    expect(diagnosticRecords(p).some(d => d.code === 'BROKEN_ANCHOR')).toBe(true);
    await expect(discover(input, { root: path.join(root, 'elsewhere') })).rejects.toThrow();
    p.documents[1].role = 'evidence'; p.documents[1].freshness = 'superseded'; p.documents[1].supersededBy = 'new report';
    p.tree = [{ id: 'section', title: 'Read this', children: p.tree }];
    await fs.writeFile(input, '# Head\n[web](https://github.com/a/b/blob/main/file.md#L3-L8)');
    const updated = await refreshPlan(p);
    expect(updated.tree).toEqual(p.tree);
    expect(updated.documents.find(d => d.title === 'Parent')?.role).toBe('evidence');
    expect(updated.documents.find(d => d.title === 'Parent')?.available).toBe(true);
    expect(validatePlan(JSON.parse(JSON.stringify(updated)))).toEqual(updated);
    expect(flatten(updated.tree)).toEqual(flatten(p.tree));
    expect(diagnosticRecords(updated).some(d => d.code === 'SOURCE_SUPERSEDED')).toBe(true);
    const old = structuredClone(updated); old.documents[0].provenance!.capturedAt = '2000-01-01T00:00:00.000Z';
    expect(diagnosticRecords(old).some(d => d.code === 'SNAPSHOT_STALE')).toBe(true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('retains the original fetch time when discovering cached documents', async () => {
  const p = await discover('https://public.example/a.md', { fetcher: async url => ({ data: Buffer.from('# Remote'), url, type: 'text/plain', fetchedAt: '2000-01-01T00:00:00.000Z', cached: true }) });
  expect(p.documents[0].provenance?.cache).toBe(true);
  expect(diagnosticRecords(p).some(d => d.code === 'SNAPSHOT_STALE')).toBe(true);
  await expect(discover('https://github.com/a/b/blob/main/a.md')).rejects.toThrow('web references');
});
