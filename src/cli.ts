#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { discover } from './core/discover.js';
import { validatePlan } from './core/model.js';
import { exportPDF } from './core/export.js';
import { serve } from './server.js';

const command = new Command().name('ordv').description('Turn linked Markdown into printable reading packets').version('0.1.0');
command.command('discover').argument('<source>', 'Markdown file, directory, or public raw Markdown URL').option('-o, --output <file>', 'Save a snapshot reading plan').option('--refresh', 'Refresh remote cached content').action(async (input, opts) => {
  const plan = await discover(input, { refresh: !!opts.refresh });
  const json = JSON.stringify(plan, null, 2);
  if (opts.output) { await fs.mkdir(path.dirname(path.resolve(opts.output)), { recursive: true }); await fs.writeFile(opts.output, json); console.error(`Saved ${plan.documents.length} document snapshots to ${opts.output}`); }
  else console.log(json);
});
command.command('serve').alias('open').argument('[source]', 'Optional initial document or directory').option('-p, --port <port>', 'Local editor port', '4317').option('--plan <file>', 'Load a saved reading plan').option('--production', 'Serve the built UI').action(async (input, opts) => {
  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const plan = opts.plan ? validatePlan(JSON.parse(await fs.readFile(opts.plan, 'utf8'))) : undefined;
  const { url } = await serve({ port, input, plan, production: !!opts.production });
  console.log(`ordv editor: ${url}\nPress Ctrl+C to stop.`);
});
command.command('export').argument('<plan>', 'Saved JSON reading plan').requiredOption('-o, --output <file>', 'Output PDF').option('--mode <mode>', 'book or documents').option('--graph', 'Include the relationship graph').action(async (file, opts) => {
  const plan = validatePlan(JSON.parse(await fs.readFile(file, 'utf8')));
  if (opts.mode) plan.settings.mode = opts.mode;
  if (opts.graph) plan.settings.graph = true;
  const result = await exportPDF(validatePlan(plan));
  await fs.mkdir(path.dirname(path.resolve(opts.output)), { recursive: true });
  await fs.writeFile(opts.output, result.bytes);
  result.warnings.forEach(w => console.error(`Warning: ${w}`));
  console.log(`Exported ${opts.output} (${result.bytes.length} bytes)`);
});
command.parseAsync().catch(e => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
