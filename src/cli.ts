#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { discover, refreshPlan } from './core/discover.js';
import { roles, applyReadingProfile, validatePlan, flatten } from './core/model.js';
import { diagnosticRecords } from './core/diagnostics.js';
import { excludeDocument } from './core/tree.js';
import { atomicOutput } from './core/output.js';
import { exportPDF } from './core/export.js';
import { serve } from './server.js';

const command = new Command().name('ordv').description('Turn linked Markdown into printable reading packets').version('0.1.0');
const cancellation = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const) process.once(name, () => { cancellation.abort(new Error('Operation cancelled')); process.exitCode = name === 'SIGINT' ? 130 : 143; });
command.command('discover').argument('<source>', 'Markdown file, directory, or public raw Markdown URL').option('-o, --output <file>', 'Save a snapshot reading plan').option('--refresh', 'Refresh remote cached content')
  .option('--root <directory>', 'Explicit authorized root, independent of the head')
  .option('--origin-root <location>', 'Original host/path of transferred sources (user-provided)')
  .option('--offline', 'Use cached remote resources only').option('--force', 'Replace an existing plan').option('--freshness-days <days>', 'Review interval in days', '30').action(async (input, opts) => {
  const plan = validatePlan(await discover(input, { refresh: !!opts.refresh, root: opts.root, originRoot: opts.originRoot, offline: !!opts.offline, freshnessDays: Number(opts.freshnessDays) }));
  const json = JSON.stringify(plan, null, 2);
  if (opts.output) { await atomicOutput(opts.output, async () => ({ bytes: json, result: undefined }), { force: opts.force, signal: cancellation.signal }); console.error(`Saved ${plan.documents.length} document snapshots to ${opts.output}`); }
  else console.log(json);
});
const repeated = (value: string, previous: string[]) => [...previous, value];
command.command('edit').argument('<plan>').requiredOption('-o, --output <file>', 'Save revised plan')
  .option('--force', 'Replace an existing plan')
  .option('--role <id=role>', `Explicit document role: ${roles.join(', ')}`, repeated, [])
  .option('--include <id>', 'Append a document to reading order', repeated, [])
  .option('--exclude <id>', 'Exclude a document while retaining its children', repeated, [])
  .option('--refresh', 'Refresh sources, preserving editorial choices').action(async (file, opts) => {
    let plan = validatePlan(JSON.parse(await fs.readFile(file, 'utf8')));
    if (opts.refresh) plan = await refreshPlan(plan);
    for (const assignment of opts.role) {
      const [id, role] = assignment.split('='); const doc = plan.documents.find(d => d.id === id);
      if (!doc || !roles.includes(role as typeof roles[number])) throw new Error('Expected an existing ID=role');
      doc.role = role as typeof roles[number];
    }
    for (const id of opts.exclude) { if (!plan.documents.some(d => d.id === id)) throw new Error(`Unknown document ${id}`); plan.tree = excludeDocument(plan.tree, id); }
    for (const id of opts.include) { const doc = plan.documents.find(d => d.id === id); if (!doc?.available) throw new Error(`Unavailable document ${id}`); if (!flatten(plan.tree).includes(id)) plan.tree.push({ id: `node-${id}`, title: doc.title, documentId: id, children: [] }); }
    await atomicOutput(opts.output, async () => ({ bytes: JSON.stringify(validatePlan(plan), null, 2), result: undefined }), { force: opts.force, signal: cancellation.signal });
  });
command.command('check').argument('<plan>').action(async file => {
  const records = diagnosticRecords(validatePlan(JSON.parse(await fs.readFile(file, 'utf8'))));
  console.log(JSON.stringify(records, null, 2)); if (records.some(d => d.severity === 'error')) process.exitCode = 1;
});
command.command('serve').alias('open').argument('[source]', 'Optional initial document or directory').option('-p, --port <port>', 'Local editor port', '4317').option('--plan <file>', 'Load a saved reading plan').option('--production', 'Serve the built UI').action(async (input, opts) => {
  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const plan = opts.plan ? validatePlan(JSON.parse(await fs.readFile(opts.plan, 'utf8'))) : undefined;
  const { server, url } = await serve({ port, input, plan, production: opts.production || undefined });
  cancellation.signal.addEventListener('abort', () => { server.close(); server.closeAllConnections(); }, { once: true });
  console.log(`ordv editor: ${url}\nPress Ctrl+C to stop.`);
});
command.command('export').argument('<plan>', 'Saved JSON reading plan').requiredOption('-o, --output <file>', 'Output PDF').option('--mode <mode>', 'book or documents').option('--graph', 'Include the relationship graph')
  .option('--force', 'Explicitly replace an existing output')
  .option('--browser <executable>', 'Chrome/Edge/Chromium executable override')
  .option('--profile <profile>', 'standard, tablet, or duplex')
  .option('--toc-depth <level>', '0 for chapters only, or heading level 1–6')
  .option('--answers <policy>', 'preserve, expand, or appendix')
  .option('--figures <policy>', 'fit or readable')
  .option('--page-numbers <scope>', 'packet, document, both, or none')
  .option('--header-date <date>', 'export (UTC), source-created, or none')
  .option('--running-header', 'Show the filename/date running header')
  .option('--no-running-header', 'Hide the filename/date running header')
  .option('--margins <mm>', 'Paper margins in mm: top,right,bottom,left')
  .option('--source-date <id=date>', 'User-supplied creation date (YYYY-MM-DD) for a document ID; repeatable', (value: string, previous: string[]) => [...previous, value], [])
  .action(async (file, opts) => {
  const plan = validatePlan(JSON.parse(await fs.readFile(file, 'utf8')));
  if (opts.profile) { if (!['standard', 'tablet', 'duplex'].includes(opts.profile)) throw new Error('Invalid reading profile'); applyReadingProfile(plan, opts.profile); }
  if (opts.tocDepth !== undefined) plan.settings.tocDepth = Number(opts.tocDepth);
  if (opts.answers) plan.settings.answers = opts.answers;
  if (opts.figures) plan.settings.figures = opts.figures;
  if (opts.mode) plan.settings.mode = opts.mode;
  if (opts.graph) plan.settings.graph = true;
  if (opts.pageNumbers) plan.settings.pageNumbers = opts.pageNumbers;
  if (opts.headerDate) plan.settings.headerDate = opts.headerDate;
  if (typeof opts.runningHeader === 'boolean') plan.settings.runningHeader = opts.runningHeader;
  if (opts.margins) {
    const values = opts.margins.split(',').map(Number);
    if (values.length !== 4 || values.some((n: number) => !Number.isFinite(n))) throw new Error('Margins must be top,right,bottom,left in millimeters');
    const [top, right, bottom, left] = values;
    plan.settings.marginsMm = { top, right, bottom, left };
  }
  for (const value of opts.sourceDate) {
    const [id, date, extra] = value.split('=');
    const doc = plan.documents.find(d => d.id === id);
    if (!doc || !date || extra !== undefined) throw new Error('Source date must be an existing document ID=YYYY-MM-DD');
    doc.sourceCreatedDate = { date, provenance: 'user-provided' };
  }
  const result = await atomicOutput(opts.output, async () => { const result = await exportPDF(validatePlan(plan), { signal: cancellation.signal, executablePath: opts.browser }); return { bytes: result.bytes, result }; }, { force: opts.force, signal: cancellation.signal });
  result.diagnostics.forEach(d => console.error(`${d.severity} [${d.code}]: ${d.message}`));
  console.log(`Exported ${opts.output} (${result.bytes.length} bytes)`);
});
command.parseAsync().catch(e => { console.error(`Error: ${e.message}`); if (!cancellation.signal.aborted) process.exitCode = 1; });
