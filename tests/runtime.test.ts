import { it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { atomicOutput } from '../src/core/output.js';
import { launchBrowser } from '../src/core/export.js';

it('publishes complete output, refuses overwrites, and preserves old output on failure/cancellation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-output-')), target = path.join(root, 'packet.pdf');
  const produce = async () => ({ bytes: 'complete', result: 42 });
  try {
    expect(await atomicOutput(target, produce)).toBe(42);
    await expect(atomicOutput(target, produce)).rejects.toThrow('--force');
    await expect(atomicOutput(target, async () => { throw new Error('failed renderer'); }, { force: true })).rejects.toThrow('failed renderer');
    const controller = new AbortController();
    await expect(atomicOutput(target, async () => { controller.abort(new Error('cancelled')); return produce(); }, { force: true, signal: controller.signal })).rejects.toThrow('cancelled');
    expect(await fs.readFile(target, 'utf8')).toBe('complete');
    expect(await fs.readdir(root)).toEqual(['packet.pdf']);
    await atomicOutput(target, async () => ({ bytes: 'new', result: 0 }), { force: true });
    expect(await fs.readFile(target, 'utf8')).toBe('new');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('serializes competing outputs and never clobbers a target created during rendering', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-concurrent-')), target = path.join(root, 'a');
  try {
    await atomicOutput(target, async () => {
      await expect(atomicOutput(target, async () => ({ bytes: 'second', result: 0 }), { force: true })).rejects.toThrow('reserved');
      return { bytes: 'first', result: 0 };
    });
    const race = path.join(root, 'race');
    await expect(atomicOutput(race, async () => { await fs.writeFile(race, 'external'); return { bytes: 'ordv', result: 0 }; })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(race, 'utf8')).toBe('external');
    expect((await fs.readdir(root)).sort()).toEqual(['a', 'race']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('fails an explicit invalid browser override instead of silently falling back', async () => {
  await expect(launchBrowser({ executablePath: path.join(os.tmpdir(), 'no-such-ordv-browser') })).rejects.toThrow('ORDV_BROWSER');
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(launchBrowser({ signal: controller.signal })).rejects.toThrow('cancelled');
});
