import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { hash } from '../src/core/io.js';

const out = path.resolve('output/agent'); await fs.mkdir(out, { recursive: true });
const npm = process.env.npm_execpath!;
const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', out], { encoding: 'utf8' }))[0];
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ordv-agent-installed-'));
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', NODE_ENV: 'production' };
try {
  await fs.writeFile(path.join(temp, 'package.json'), '{"private":true}');
  execFileSync(process.execPath, [npm, 'install', '--offline', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(out, packed.filename)], { cwd: temp, env, stdio: 'pipe' });
  const packageDir = path.join(temp, 'node_modules/ordv');
  const wrapper = path.join(packageDir, 'skills/ordv-reading/scripts/ordv.mjs');
  assert((await fs.readFile(path.join(packageDir, 'skills/ordv-reading/SKILL.md'), 'utf8')).includes('name: ordv-reading'));
  const workspace = path.join(temp, 'another-workspace'); await fs.mkdir(workspace);
  const sourceRoot = path.join(workspace, 'notes'), outputRoot = path.join(workspace, 'editions');
  await fs.mkdir(sourceRoot); await fs.mkdir(outputRoot);
  const original = '# 결과 Results\n원문과 한정 조건을 보존합니다. This observation is preliminary.\n\n[Background](background.md#assumptions) [Omitted reference](reference.md)\n\n$x^2 + y^2 = z^2$\n\n```mermaid\nflowchart LR\nA[Capture]-->B[Read]\n```\n';
  await fs.writeFile(path.join(sourceRoot, 'results.md'), original);
  await fs.writeFile(path.join(sourceRoot, 'background.md'), '# Background\n[Results](results.md)\n\n## Assumptions\nThese assumptions require further evidence.\n');
  await fs.writeFile(path.join(sourceRoot, 'reference.md'), '# Reference\nThis reference is deliberately excluded.\n');
  function run(operation: string, request: unknown, ok = true) {
    const result = spawnSync(process.execPath, [wrapper, operation, '--request', '-'], { cwd: workspace, env, input: JSON.stringify(request), encoding: 'utf8', timeout: 120000 });
    if (result.error) throw result.error;
    assert.equal(result.status, ok ? 0 : 1, result.stderr + result.stdout);
    const envelope = JSON.parse(result.stdout); assert.equal(envelope.ok, ok);
    return envelope;
  }
  const roots = { sourceRoot, outputRoot };
  const discovered = run('discover', { ...roots, planPath: 'collection.json', include: ['*.md'], limit: 1 });
  assert.equal(discovered.documents.length, 1); assert.equal(discovered.nextOffset, 1);
  assert(!JSON.stringify(discovered).includes('This observation is preliminary'));
  const inspected = run('inspect', { ...roots, planPath: discovered.planPath, expectedRevision: discovered.revision });
  const byName = new Map<string, string>(inspected.documents.map((d: any) => [path.basename(d.path), d.id]));
  const edition = run('create', { ...roots, planPath: discovered.planPath, expectedRevision: discovered.revision,
    outputPlanPath: 'study.json', title: '결과부터 읽기', settings: { tocDepth: 2 },
    selection: [{ document: byName.get('results.md') }, { section: 'Foundations', children: [{ section: 'Assumptions', children: [{ document: 'background.md' }] }] }] });
  assert.deepEqual(edition.order, [byName.get('results.md'), byName.get('background.md')]);
  assert(edition.diagnostics.some((d: any) => d.code === 'DOCUMENT_OMITTED'));
  assert.equal(edition.settings.runningHeader, true); assert.equal(edition.settings.headerDate, 'export');
  const plan = JSON.parse(await fs.readFile(edition.planPath, 'utf8'));
  assert.equal(plan.documents.find((d: any) => d.source.endsWith('results.md')).content, original);
  const render = { ...roots, planPath: edition.planPath, expectedRevision: edition.revision };
  const preview = run('preview', { ...render, outputPath: 'preview.html' });
  const html = await fs.readFile(preview.previewPath, 'utf8');
  assert(html.includes('원문과 한정 조건을 보존합니다')); assert(html.includes('This observation is preliminary'));
  assert(html.includes('katex')); assert(html.includes('class="mermaid"')); assert(html.includes('href="#d-'));
  assert(!html.includes('https://packet.invalid/#'));
  assert(!html.includes('This reference is deliberately excluded.'));
  for (const file of await fs.readdir(sourceRoot)) await fs.rm(path.join(sourceRoot, file));
  const exported = run('export', { ...render, outputPath: 'study.pdf' });
  const pdf = await fs.readFile(exported.pdfPath);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), exported.pageCount);
  assert.equal(exported.revision, preview.revision); assert.deepEqual(exported.order, preview.order);
  assert.equal(exported.manifestPath, edition.planPath);
  assert.equal(run('export', { ...render, outputPath: 'study.pdf' }, false).error.code, 'OUTPUT_EXISTS');
  assert.equal(hash(await fs.readFile(exported.pdfPath)), hash(pdf));
  assert.equal(run('export', { ...render, outputPath: 'outside.pdf', browser: path.join(workspace, 'missing-browser') }, false).error.code, 'RENDERER_UNAVAILABLE');
  const edited = JSON.parse(await fs.readFile(edition.planPath, 'utf8')); edited.settings.runningHeader = false;
  await fs.writeFile(edition.planPath, JSON.stringify(edited));
  assert.equal(run('export', { ...render, outputPath: 'stale.pdf' }, false).error.code, 'STALE_REVISION');
  const latest = run('inspect', { ...roots, planPath: edition.planPath }); assert.notEqual(latest.revision, edition.revision);
  assert(!(await fs.readdir(outputRoot)).some(f => /\.tmp$|ordv-lock$|outside\.pdf$|stale\.pdf$/.test(f)));
  const runtime = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    'import {launchBrowser} from "ordv/export"; import {readFileSync} from "node:fs"; const {browser,close}=await launchBrowser(); try {console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,browser:await browser.version(),puppeteer:JSON.parse(readFileSync("node_modules/puppeteer/package.json","utf8")).version}));} finally {await close();}'], { cwd: temp, env, encoding: 'utf8' }));
  await fs.copyFile(exported.pdfPath, path.join(out, 'installed-agent.pdf'));
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify({ acceptance: 'installed CLI and packaged skill wrapper; does not attest host skill registration', runtime,
    package: { name: 'ordv', version: '0.1.0', sha256: hash(await fs.readFile(path.join(out, packed.filename))) },
    checks: ['production-only installation', 'another workspace', 'compact paged metadata', 'reverse order and nested sections', 'excluded cyclic reference', 'original prose', 'Korean/math/Mermaid/internal links in preview', 'default running headers', 'offline snapshot export', 'matching preview/export revision and order', 'overwrite refusal', 'renderer failure', 'settings-only stale rejection', 'inspect recovery'],
    pageCount: exported.pageCount, pdfSha256: hash(pdf) }, null, 2));
  console.log(`Agent acceptance passed on ${process.platform}: installed packaged wrapper, ordered nested selection, offline preview/export, bounded JSON, defaults, stale revision, and failure cleanup.`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
