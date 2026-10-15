import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Reserve the destination before expensive work; competing ordv exports fail clearly. */
export async function atomicOutput<T>(file: string, produce: () => Promise<{ bytes: Uint8Array | string; result: T }>, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const target = path.resolve(file), lock = `${target}.ordv-lock`, temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  options.signal?.throwIfAborted();
  let guard;
  try { guard = await fs.open(lock, 'wx'); }
  catch (e: any) { if (e.code === 'EEXIST') throw new Error(`Output is reserved by another ordv operation: ${target}. If a prior process crashed, verify it has stopped before removing ${lock}`); throw e; }
  try {
    await guard.writeFile(`pid=${process.pid}\n`);
    if (!options.force) { try { await fs.lstat(target); throw new Error(`Output already exists: ${target}. Use --force to replace it.`); } catch (e: any) { if (e.code !== 'ENOENT') throw e; } }
    const { bytes, result } = await produce();
    options.signal?.throwIfAborted();
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    options.signal?.throwIfAborted();
    // link is an atomic no-clobber publication, unlike check-then-rename.
    if (options.force) await fs.rename(temporary, target);
    else await fs.link(temporary, target);
    return result;
  } finally {
    await fs.rm(temporary, { force: true }); await guard.close(); await fs.rm(lock, { force: true });
  }
}
