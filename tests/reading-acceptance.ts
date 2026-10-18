import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { discover } from '../src/core/discover.js';
import { exportPDF } from '../src/core/export.js';
import { flatten, applyReadingProfile, validatePlan } from '../src/core/model.js';
const out = path.resolve('output/reading'), fixture = path.join(out, 'fixture'); await fs.mkdir(fixture, { recursive: true });
const prose = Array.from({ length: 22 }, (_, i) => `Paragraph ${i + 1}. A preliminary claim remains preliminary: this is a teaching example, not a completed experiment. 한국어 연구 자료의 한정과 근거를 보존합니다.`).join('\n\n');
for (let i = 0; i < 4; i++) await fs.writeFile(path.join(fixture, `${i}.md`), `# Lesson ${i + 1}\n\n${i < 3 ? `[Next](${i + 1}.md#evidence)` : '[Start](0.md)'}\n\n## Evidence\n\n[Answer detail](#answer-detail-${i})\n\n${prose}\n\n<details><summary>Checkpoint answer ${i + 1}</summary>\n\n## Answer detail ${i}\n\nANSWER_SENTINEL_${i + 1}: This is the qualified answer, not a new result.\n\n</details>\n\n## Same heading\n\n## Same heading\n\n$x^2 + y^2 = z^2$\n\n| Condition | Result |\n| --- | --- |\n| Example | Inconclusive |\n\n${i === 0 ? '```mermaid\nflowchart LR\n'+Array.from({ length: 13 }, (_, j) => `N${j}["Research stage ${j}"] --> N${j + 1}["Research stage ${j + 1}"]`).join('\n')+'\n```' : ''}`);
const base = await discover(path.join(fixture, '0.md')); base.tree = [{ id: 'lessons', title: 'Study edition', children: base.tree }];
function links(pdf: PDFDocument) {
  const refs = new Set(pdf.getPages().map(p => p.ref.toString())); let count = 0;
  for (const p of pdf.getPages()) {
    const annots = p.node.lookup(PDFName.of('Annots')); if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) { const a = annots.lookup(i); if (!(a instanceof PDFDict)) continue;
      const d = a.lookup(PDFName.of('Dest')); if (d instanceof PDFArray) { assert(d.get(0) instanceof PDFRef); assert(refs.has(d.get(0).toString())); count++; }
      const action = a.lookup(PDFName.of('A')); if (action instanceof PDFDict) assert(!action.toString().includes('packet.invalid'), 'Unresolved internal destination');
    }
  }
  assert(count >= 15); return count;
}
const results: object[] = [];
for (const mode of ['book', 'documents'] as const) for (const answers of ['preserve', 'expand', 'appendix'] as const) {
  const p = structuredClone(base); p.settings.mode = mode; p.settings.answers = answers; p.settings.figures = 'readable';
  applyReadingProfile(p, answers === 'expand' ? 'tablet' : answers === 'appendix' ? 'duplex' : 'standard');
  const file = path.join(out, `${mode}-${answers}.pdf`), result = await exportPDF(p); await fs.writeFile(file, result.bytes);
  const pdf = await PDFDocument.load(result.bytes), internalLinks = links(pdf);
  const landscape = pdf.getPages().filter(p => p.getWidth() > p.getHeight()).length;
  assert(landscape >= 2, 'Wide figure overview and readable detail tiles');
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
  for (let i = 1; i <= 4; i++) assert.equal(text.includes(`ANSWER_SENTINEL_${i}`), answers !== 'preserve', 'Explicit answer visibility policy');
  assert(text.includes('preliminary')); assert(text.includes('한국어')); assert(text.includes('detail tile'));
  assert.equal(flatten(validatePlan(JSON.parse(JSON.stringify(p))).tree).length, 4);
  results.push({ mode, answers, pages: pdf.getPageCount(), landscape, internalLinks });
  console.log(JSON.stringify(results.at(-1)));
}
// Private real corpus is optional: already approved/imported by the user; never package its source or artifacts.
const tta = path.resolve('output/audit/tta-study');
try {
  await fs.access(tta);
  const p = await discover(tta, { maxDepth: 0, originRoot: 'ssh://vilab204/~/jw_tta/docs/study' });
  const names = ['2026-10-09-concepts.md', '2026-10-09-crisp.md', '2026-10-09-tta-cope.md', '2026-10-09-foundationpose-event6d.md'];
  const docs = names.map(name => p.documents.find(d => path.basename(d.source) === name && d.available)!); assert(docs.every(Boolean));
  p.head = docs[0].id; p.tree = [{ id: 'tta', title: 'Pose TTA: concepts, mechanisms, implementation boundaries', children: docs.map(d => ({ id: `node-${d.id}`, title: d.title, documentId: d.id, children: [] })) }];
  p.settings.figures = 'readable'; p.settings.answers = 'expand'; applyReadingProfile(p, 'tablet');
  for (const mode of ['book', 'documents'] as const) {
    p.settings.mode = mode; const result = await exportPDF(p), file = path.join(out, `private-tta-${mode}.pdf`); await fs.writeFile(file, result.bytes);
    const pdf = await PDFDocument.load(result.bytes); const internalLinks = links(pdf);
    const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' }); assert(text.includes('CRISP')); assert(text.includes('vilab204'));
    const summary = { corpus: 'private approved four-lesson TTA', mode, pages: pdf.getPageCount(), internalLinks, notices: result.warnings.length };
    results.push(summary); console.log(JSON.stringify(summary));
  }
} catch (e: any) { if (e.code !== 'ENOENT') throw e; console.log('Private TTA corpus absent; skipped (public substantial fixture still required).'); }
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
execFileSync('pdftoppm', ['-f', '1', '-l', '5', '-scale-to', '1300', '-png', path.join(out, 'book-appendix.pdf'), path.join(out, 'inspection')]);
console.log('Reading acceptance passed; reader application import/annotation still requires a separate device check.');
