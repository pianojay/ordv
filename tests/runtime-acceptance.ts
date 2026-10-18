import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { atomicOutput } from '../src/core/output.js';
const root = process.cwd(), out = path.resolve('output/runtime'); await fs.mkdir(out, { recursive: true });
const npm = process.env.npm_execpath!;
const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', out], { encoding: 'utf8' }))[0];
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-installed-'));
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', NODE_ENV: 'production' };
try {
  await fs.writeFile(path.join(temp, 'package.json'), '{"private":true}');
  execFileSync(process.execPath, [npm, 'install', '--offline', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(out, packed.filename)], { cwd: temp, env, stdio: 'pipe' });
  const cli = path.join(temp, 'node_modules/ordv/dist/cli.js');
  const run = (args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: temp, env, encoding: 'utf8' });
  assert(run(['--help']).includes('discover'));
  assert(!(await fs.readdir(path.join(temp, 'node_modules'))).includes('tsx'));
  const fixture = path.join(temp, 'notes'); await fs.mkdir(fixture);
  await fs.writeFile(path.join(fixture, 'README.md'), '# Installed packet\n[Chapter](chapter.md)\n\n$x^2$\n\n```mermaid\nflowchart LR\nA-->B\n```');
  await fs.writeFile(path.join(fixture, 'chapter.md'), '# Chapter\n한국어 오프라인 자료\n\n[Back](README.md)');
  run(['discover', fixture, '--offline', '-o', 'plan.json']);
  await fs.rm(fixture, { recursive: true, force: true });
  run(['export', 'plan.json', '-o', 'packet.pdf']);
  const before = await fs.readFile(path.join(temp, 'packet.pdf')); assert.equal(before.subarray(0, 4).toString(), '%PDF');
  assert.throws(() => run(['export', 'plan.json', '-o', 'packet.pdf']), /already exists/);
  assert.deepEqual(await fs.readFile(path.join(temp, 'packet.pdf')), before);
  run(['export', 'plan.json', '-o', 'packet.pdf', '--force', '--mode', 'documents']);
  assert.throws(() => run(['export', 'plan.json', '-o', 'invalid.pdf', '--browser', path.join(temp, 'absent')]), /ORDV_BROWSER/);
  assert(!((await fs.readdir(temp)).some(f => /lock$|\.tmp$/.test(f))));
  const server = spawn(process.execPath, [cli, 'serve', '--plan', path.join(temp, 'plan.json'), '-p', '4319'], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; server.stdout.on('data', chunk => output += chunk); server.stderr.on('data', chunk => output += chunk);
  try {
    for (let i = 0; !output.includes('?token=') && i < 150; i++) { assert(server.exitCode === null, output); await delay(200); }
    const url = output.match(/http:\/\/127\.0\.0\.1:4319\/\?token=[a-f0-9]+/)?.[0]; assert(url, output);
    const index = await (await fetch(url)).text(); assert(index.includes('/assets/'));
    const script = index.match(/src="([^"]+\.js)"/)![1]; assert((await fetch(new URL(script, url))).ok);
    const token = new URL(url).searchParams.get('token')!;
    const headers = { 'x-packet-token': token, 'content-type': 'application/json' };
    const plan = await fs.readFile(path.join(temp, 'plan.json'), 'utf8');
    const first = fetch('http://127.0.0.1:4319/api/export', { method: 'POST', headers, body: plan });
    await delay(250);
    const second = await fetch('http://127.0.0.1:4319/api/export', { method: 'POST', headers, body: plan });
    assert.equal(second.status, 409); assert.equal((await first).status, 200);
  } finally { server.kill(); }
  // Cancellation after browser startup must leave no target/temporary/lock file.
  const { exportPDF } = await import('../src/core/export.js');
  const plan = JSON.parse(await fs.readFile(path.join(temp, 'plan.json'), 'utf8'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('acceptance cancellation')), 800);
  try { await assert.rejects(atomicOutput(path.join(temp, 'cancel.pdf'), async () => { const result = await exportPDF(plan, { signal: controller.signal }); return { bytes: result.bytes, result }; }, { signal: controller.signal }), /acceptance cancellation/); }
  finally { clearTimeout(timer); }
  assert(!((await fs.readdir(temp)).some(f => /lock$|\.tmp$|cancel\.pdf$/.test(f))));
  await fs.copyFile(path.join(temp, 'packet.pdf'), path.join(out, 'installed-offline.pdf'));
  console.log(`Runtime acceptance passed on ${process.platform}: production-only tarball install, outside-cwd CLI/UI/assets, offline snapshot export in both modes, overwrite refusal/force, invalid browser, concurrent API export, cancellation cleanup.`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
