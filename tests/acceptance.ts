import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { discover } from '../src/core/discover.js';
import { exportPDF, launchBrowser } from '../src/core/export.js';
import { flatten, validatePlan } from '../src/core/model.js';
import { excludeDocument } from '../src/core/tree.js';

const out = path.resolve('output/acceptance'); await fs.mkdir(out, { recursive: true });
const plan = await discover('examples/notes', { fetcher: async url => {
  if (url.endsWith('/README.md')) return { data: Buffer.from('# Remote reading\n\nA captured public Markdown source.\n\n[Return](https://raw.githubusercontent.com/markdown-it/markdown-it/master/README.md)\n\n## Remote heading\n\nFrozen source content.'), type: 'text/plain', url };
  throw new Error('Unexpected remote fixture URL');
} });
plan.settings.graph = true;
assert.equal(plan.documents.find(d => d.id === plan.head)!.title, 'A small reading packet');
assert.equal(plan.documents.length, 6);
assert.equal(flatten(plan.tree).length, 5);
const snapshot = path.join(out, 'reading-plan.json'); await fs.writeFile(snapshot, JSON.stringify(plan, null, 2));
const reloaded = validatePlan(JSON.parse(await fs.readFile(snapshot, 'utf8')));
assert.deepEqual(flatten(reloaded.tree), flatten(plan.tree));
const { browser, close } = await launchBrowser();
try { console.log(`Browser smoke test: ${await browser.version()}`); } finally { await close(); }
for (const mode of ['book', 'documents'] as const) {
  const p = structuredClone(reloaded); p.settings.mode = mode;
  if (mode === 'documents') p.settings.documentStyles[p.head] = { fontSize: 12, marginMm: 20 };
  const result = await exportPDF(p);
  const file = path.join(out, `${mode}.pdf`); await fs.writeFile(file, result.bytes);
  const pdf = await PDFDocument.load(result.bytes), pageRefs = new Set(pdf.getPages().map(page => page.ref.toString()));
  assert(pdf.getPageCount() >= 5);
  let links = 0;
  for (const page of pdf.getPages()) {
    const annotations = page.node.lookup(PDFName.of('Annots'));
    if (!(annotations instanceof PDFArray)) continue;
    for (let i = 0; i < annotations.size(); i++) {
      const a = annotations.lookup(i); if (!(a instanceof PDFDict)) continue;
      const d = a.lookup(PDFName.of('Dest'));
      if (d instanceof PDFArray) { assert(d.get(0) instanceof PDFRef); assert(pageRefs.has(d.get(0).toString()), 'Link points outside assembled pages'); links++; }
      const action = a.lookup(PDFName.of('A'));
      if (action instanceof PDFDict) assert(!action.toString().includes('packet.invalid'), 'Unresolved virtual link');
    }
  }
  assert(links > 15, 'Expected clickable TOC, heading, graph and cross-document links');
  console.log(`${mode}: ${pdf.getPageCount()} pages; ${links} validated internal destinations; ${result.bytes.length} bytes`);
}
const missing = structuredClone(plan); missing.documents.find(d => d.id === missing.head)!.available = false;
await assert.rejects(exportPDF(missing), /unavailable/);
const empty = structuredClone(plan); for (const id of flatten(empty.tree)) empty.tree = excludeDocument(empty.tree, id);
await assert.rejects(exportPDF(empty), /Select at least/);
const imageRoot = path.join(out, 'image-fixture'); await fs.mkdir(imageRoot, { recursive: true });
await fs.copyFile('examples/notes/pipeline.svg', path.join(imageRoot, 'figure.svg'));
await fs.writeFile(path.join(imageRoot, 'README.md'), '# HTML image test\n<img src="figure.svg" alt="Offline HTML figure">\n<img src="missing.png" alt="Missing evidence">');
const imagePlan = await discover(path.join(imageRoot, 'README.md')); imagePlan.settings.toc = false;
const imageResult = await exportPDF(imagePlan);
assert(imageResult.warnings.some(w => w.includes('missing.png')));
await fs.writeFile(path.join(out, 'html-images.pdf'), imageResult.bytes);
await fs.writeFile(path.join(imageRoot, 'broken.png'), 'not image data');
await fs.writeFile(path.join(imageRoot, 'README.md'), '# Broken image\n<img src="broken.png" alt="Broken evidence">');
await assert.rejects(exportPDF(await discover(path.join(imageRoot, 'README.md'))), /Image failed to decode: Broken evidence/);
console.log('Offline HTML image export passed; missing image is reported; undecodable image is rejected.');
console.log('Acceptance passed. PDF outputs: output/acceptance/{book,documents}.pdf');
