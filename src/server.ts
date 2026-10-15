import express from 'express';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { discover, refreshPlan } from './core/discover.js';
import { diagnosticRecords } from './core/diagnostics.js';
import { validatePlan, type Plan } from './core/model.js';
import { renderHTML, diagnostics } from './core/render.js';
import { exportPDF } from './core/export.js';
import { packagePath } from './core/paths.js';

export async function serve(options: { port: number; input?: string; plan?: Plan; production?: boolean }) {
  const app = express(), token = randomBytes(24).toString('hex');
  let current = options.plan || (options.input ? await discover(options.input) : undefined);
  let busy = false;
  app.use((req, res, next) => {
    if (req.headers.host !== `127.0.0.1:${options.port}` && req.headers.host !== `localhost:${options.port}`) { res.status(403).send('Invalid host'); return; }
    if (req.path.startsWith('/api/')) {
      if (req.headers['x-packet-token'] !== token) { res.status(403).json({ error: 'Open the editor using the URL printed by the CLI' }); return; }
      if (req.headers.origin && ![`http://127.0.0.1:${options.port}`, `http://localhost:${options.port}`].includes(req.headers.origin)) { res.status(403).json({ error: 'Invalid origin' }); return; }
    }
    res.setHeader('Referrer-Policy', 'no-referrer'); next();
  });
  app.use(express.json({ limit: '100mb' }));
  app.get('/api/plan', (_req, res) => res.json(current || null));
  app.post('/api/discover', async (req, res, next) => {
    let acquired = false;
    try {
      if (busy) { res.status(409).json({ error: 'An operation is already running' }); return; }
      if (typeof req.body.input !== 'string' || !req.body.input.trim()) throw new Error('Enter a file, folder, or raw Markdown URL');
      busy = true; acquired = true;
      current = req.body.plan && req.body.refresh === true ? await refreshPlan(validatePlan(req.body.plan))
        : await discover(req.body.input, { refresh: req.body.refresh === true, root: typeof req.body.root === 'string' && req.body.root.trim() ? req.body.root : undefined,
          originRoot: typeof req.body.originRoot === 'string' && req.body.originRoot.trim() ? req.body.originRoot : undefined, offline: req.body.offline === true });
      res.json(current);
    } catch (e) { next(e); } finally { if (acquired) busy = false; }
  });
  app.post('/api/preview', async (req, res, next) => {
    try {
      const plan = validatePlan(req.body);
      const html = (await renderHTML(plan)).replaceAll('https://packet.invalid/#', '#');
      res.json({ html, warnings: diagnostics(plan), diagnostics: diagnosticRecords(plan) });
    } catch (e) { next(e); }
  });
  app.post('/api/export', async (req, res, next) => {
    let acquired = false;
    try {
      if (busy) { res.status(409).json({ error: 'An operation is already running' }); return; }
      const plan = validatePlan(req.body); busy = true; acquired = true;
      const controller = new AbortController();
      const cancel = () => { if (!res.writableEnded) controller.abort(new Error('Export cancelled: client disconnected')); };
      res.on('close', cancel);
      let result;
      try { result = await exportPDF(plan, { signal: controller.signal }); } finally { res.off('close', cancel); }
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="reading-packet.pdf"'); res.send(Buffer.from(result.bytes));
    } catch (e) { next(e); } finally { if (acquired) busy = false; }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));
  const production = options.production ?? (import.meta.url.includes('/dist/') || process.env.NODE_ENV === 'production');
  if (production) {
    app.use(express.static(packagePath('dist/ui'), { index: false }));
    app.get('/', async (_req, res, next) => { try { res.type('html').send(await fs.readFile(packagePath('dist/ui/index.html'), 'utf8')); } catch (e) { next(e); } });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: packagePath(), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('/', async (req, res, next) => { try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await fs.readFile(packagePath('index.html'), 'utf8'))); } catch (e) { next(e); } });
  }
  app.use((error: any, _req: any, res: any, _next: any) => res.status(400).json({ error: error.message || String(error) }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const s = app.listen(options.port, '127.0.0.1', () => resolve(s)); s.on('error', reject);
  });
  const url = `http://127.0.0.1:${options.port}/?token=${token}`;
  return { server, url };
}
