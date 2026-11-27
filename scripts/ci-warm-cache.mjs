import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// npm ci caches locked tarballs. A fresh install also needs registry metadata.
const npm = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : await fs.realpath(path.join(path.dirname(process.execPath), 'npm'));
await fs.access(npm);
const out = path.resolve('output/runtime');
await fs.mkdir(out, { recursive: true });
await fs.mkdir('output/ci', { recursive: true });
const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', out], { encoding: 'utf8' }))[0];
assert(packed.filename && path.basename(packed.filename) === packed.filename);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-cache-bootstrap-'));
try {
  await fs.writeFile(path.join(temp, 'package.json'), '{"private":true}');
  const log = execFileSync(process.execPath, [npm, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(out, packed.filename)], {
    cwd: temp,
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  await fs.writeFile('output/ci/cache-bootstrap.log', `Online production dependency cache bootstrap.\n${log}`);
  console.log(log);
} catch (error) {
  await fs.writeFile('output/ci/cache-bootstrap.log', `Online production dependency cache bootstrap failed.\n${error.stdout || ''}\n${error.stderr || ''}\n${error}`);
  throw error;
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
