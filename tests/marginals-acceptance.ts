import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { discover } from '../src/core/discover.js';
import { exportPDF, launchBrowser } from '../src/core/export.js';
import { parser } from '../src/core/markdown.js';
import { renderHTML } from '../src/core/render.js';
import { flatten, validatePlan } from '../src/core/model.js';

const out = path.resolve('output/marginals'), fixture = path.join(out, 'fixture');
await fs.mkdir(fixture, { recursive: true });
const secondName = `02-한글-${'long-source-name-'.repeat(6)}.md`;
const prose = Array.from({ length: 34 }, (_, i) => `Paragraph ${i + 1}. MARGIN_SENTINEL This public fixture checks continuation pages, accurate source ranges, and space reserved for running headers and footers.`).join('\n\n');
const content = `# Marginal acceptance\n\nMARGIN_SENTINEL The same Markdown is also printed through a plain upstream stylesheet reference.\n\n[Second source](${secondName}#shared-heading)\n\n${prose}\n\n| Column | Value |\n| --- | --- |\n${Array.from({ length: 16 }, (_, i) => `| Row ${i} | A table near a page boundary |`).join('\n')}\n\n\`\`\`typescript\nconst marker = 'code near the source transition';\n\`\`\``;
await fs.writeFile(path.join(fixture, 'README.md'), content);
await fs.writeFile(path.join(fixture, secondName), `# Second source\n\n## Shared heading\n\n한국어 파일 이름과 머리말을 확인합니다.\n\n[Back](README.md)\n\n${prose}`);
const plan = await discover(fixture); plan.settings.graph = true;
plan.documents.find(d => d.id === plan.head)!.sourceCreatedDate = { date: '2026-10-01', provenance: 'user-provided' };
await fs.writeFile(path.join(out, 'plan.json'), JSON.stringify(plan, null, 2));
assert.deepEqual(flatten(validatePlan(JSON.parse(JSON.stringify(plan))).tree), flatten(plan.tree));

interface Word { x: number; y: number; right: number; bottom: number; text: string }
function textPages(file: string) {
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' });
  return [...xml.matchAll(/<page width="([^"]+)" height="([^"]+)">([\s\S]*?)<\/page>/g)].map(p => ({
    width: +p[1], height: +p[2], words: [...p[3].matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/word>/g)].map(w => ({
      x: +w[1], y: +w[2], right: +w[3], bottom: +w[4], text: w[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    }))
  }));
}
const header = (words: Word[]) => words.filter(w => w.y < 35).map(w => w.text).join(' ');
const footer = (words: Word[], height: number) => words.filter(w => w.y > height - 40).map(w => w.text).join(' ');
function checkDestinations(pdf: PDFDocument) {
  const refs = new Set(pdf.getPages().map(p => p.ref.toString())); let links = 0;
  for (const page of pdf.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots')); if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i); if (!(a instanceof PDFDict)) continue;
      const dest = a.lookup(PDFName.of('Dest'));
      if (dest instanceof PDFArray) { assert(dest.get(0) instanceof PDFRef); assert(refs.has(dest.get(0).toString())); links++; }
    }
  }
  assert(links > 5, 'TOC, graph, and cross-document destinations survive the overlay');
}
const measurements: unknown[] = [];
for (const mode of ['book', 'documents'] as const) {
  const p = structuredClone(plan); p.settings.mode = mode;
  // Test every numbering scope in both modes, including no running furniture.
  for (const scope of ['packet', 'document', 'both', 'none'] as const) {
    p.settings.pageNumbers = scope;
    p.settings.runningHeader = scope !== 'none';
    p.settings.headerDate = scope === 'both' ? 'source-created' : 'export';
    const result = await exportPDF(p), file = path.join(out, `${mode}-${scope}.pdf`);
    await fs.writeFile(file, result.bytes);
    const pdf = await PDFDocument.load(result.bytes); checkDestinations(pdf);
    const pages = textPages(file); assert.equal(pages.length, pdf.getPageCount());
    let firstPages = 0, secondPages = 0, firstStart = -1, secondStart = -1;
    for (const [i, page] of pages.entries()) {
      const body = page.words.filter(w => w.y >= 35 && w.y <= page.height - 40).map(w => w.text).join(' ');
      if (body.includes('Marginal acceptance') && body.includes('MARGIN_SENTINEL') && firstStart === -1) firstStart = i;
      if (body.includes('한국어') && secondStart === -1) secondStart = i;
      assert(page.words.some(w => w.text.includes('SENTINEL')) || body.length > 0, 'Overlay must not erase body text');
    }
    assert(firstStart >= 1, 'Navigation precedes sources'); assert(secondStart > firstStart + 1, 'First source spans multiple pages');
    firstPages = secondStart - firstStart; secondPages = pages.length - secondStart;
    assert(secondPages > 1, 'Second source spans multiple pages');
    for (const [i, page] of pages.entries()) {
      const h = header(page.words), f = footer(page.words, page.height);
      const localStart = i < firstStart ? 0 : i < secondStart ? firstStart : secondStart;
      const localTotal = i < firstStart ? firstStart : i < secondStart ? firstPages : secondPages;
      const label = i < firstStart ? 'Navigation' : 'Document';
      const local = `${label} ${i - localStart + 1} / ${localTotal}`, packet = `${i + 1} / ${pages.length}`;
      const expected = { packet, document: local, both: `${local} · Packet ${packet}`, none: '' }[scope];
      assert.equal(f, expected, `${mode}/${scope} footer on page ${i + 1}`);
      if (scope === 'none') { assert.equal(h, ''); continue; }
      assert(h.includes(i < firstStart ? 'Navigation' : i < secondStart ? 'README.md' : '02-한글-'), `Source attribution on page ${i + 1}: ${h}`);
      if (scope === 'both') {
        assert.equal(/2026-10-01/.test(h), i >= firstStart && i < secondStart, 'No fabricated date for navigation or the undated source');
      } else assert(h.includes(new Date().toISOString().slice(0, 10)), 'Export-date default is UTC');
      const bodyWords = page.words.filter(w => w.y >= 35 && w.y <= page.height - 40);
      assert(bodyWords.every(w => w.y >= 40 && w.bottom < page.height - 28.34), 'Body stays clear of reserved bands');
    }
    const sentinel = pages[firstStart].words.find(w => w.text === 'MARGIN_SENTINEL')!;
    measurements.push({ mode, scope, pages: pages.length, navigationPages: firstStart, firstPages, secondPages, textOriginPt: sentinel.x });
    console.log(`${mode}/${scope}: ${pages.length} pages; ${firstStart} navigation + ${firstPages}/${secondPages} source pages; final headers/counters/links verified`);
  }
}

// Independent reference: same Markdown, upstream CSS only, declared yzane options.
const { browser, close } = await launchBrowser();
try {
  const css = (await Promise.all(['markdown.css', 'highlight-default.css', 'markdown-pdf.css'].map(n => fs.readFile(`assets/styles/vscode/${n}`, 'utf8')))).join('\n');
  const page = await browser.newPage();
  await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${parser(false).render(content)}</body></html>`, { waitUntil: 'load' });
  const reference = await page.pdf({ format: 'A4', landscape: false, scale: 1, printBackground: true, margin: { top: '15mm', right: '10mm', bottom: '10mm', left: '10mm' }, displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:9px;margin-left:1cm">README.md</div><div style="font-size:9px;margin-left:auto;margin-right:1cm">2026-10-15</div>',
    footerTemplate: '<div style="font-size:9px;margin:0 auto"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  const file = path.join(out, 'upstream-reference.pdf'); await fs.writeFile(file, reference);
  const referencePages = textPages(file), origin = referencePages[0].words.find(w => w.text === 'MARGIN_SENTINEL')!.x;
  for (const measurement of measurements as { textOriginPt: number }[]) assert(Math.abs(measurement.textOriginPt - origin) <= 0.5, 'Matched upstream effective left margin');
  const refHeader = referencePages[0].words.find(w => w.text === 'README.md')!;
  const ours = textPages(path.join(out, 'book-packet.pdf')).flatMap(p => p.words).find(w => w.text === 'README.md' && w.y < 35)!;
  assert(Math.abs(ours.x - refHeader.x) < 0.5 && Math.abs(ours.y - refHeader.y) < 0.5, 'Header geometry matches the reference');
  const refFooter = referencePages[0].words.find(w => w.y > referencePages[0].height - 40)!;
  const oursFooter = textPages(path.join(out, 'book-packet.pdf'))[2].words.find(w => w.y > referencePages[0].height - 40)!;
  assert(Math.abs(oursFooter.x - refFooter.x) < 0.5 && Math.abs(oursFooter.y - refFooter.y) < 0.5, 'Footer geometry matches the reference');
  // Text extraction alone can miss clipping/paint failures. Check actual ink in
  // header/footer bands on the first and continuation source pages in both modes.
  for (const mode of ['book', 'documents']) {
    const prefix = path.join(out, `${mode}-raster`);
    execFileSync('pdftoppm', ['-f', '3', '-l', '4', '-scale-to', '1100', '-png', path.join(out, `${mode}-packet.pdf`), prefix]);
    for (const number of [3, 4]) {
      const src = `data:image/png;base64,${(await fs.readFile(`${prefix}-${number}.png`)).toString('base64')}`;
      const ink = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        let top = 0, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          const i = (y * image.width + x) * 4;
          if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) >= 150) continue;
          if (y < image.height * 35 / 841.92) top++;
          if (y > image.height * 800 / 841.92) bottom++;
        }
        return { top, bottom };
      }, src);
      assert(ink.top > 30 && ink.bottom > 10, `Visible header/footer on ${mode} source page ${number}`);
    }
  }
  const p = structuredClone(plan); p.settings.mode = 'documents';
  p.settings.documentStyles[p.head] = { fontSize: 12, marginMm: 20 };
  await fs.writeFile(path.join(out, 'documents-override.pdf'), (await exportPDF(p)).bytes);
  const override = textPages(path.join(out, 'documents-override.pdf')).flatMap(p => p.words).find(w => w.text === 'MARGIN_SENTINEL')!;
  assert(Math.abs((override.x - origin) - 10 * 72 / 25.4) < 0.8, 'Uniform document override adds 10 mm to the left paper margin');
  const letter = structuredClone(plan); letter.settings.paper = 'Letter'; letter.settings.toc = false; letter.settings.graph = false;
  await fs.writeFile(path.join(out, 'letter-no-navigation.pdf'), (await exportPDF(letter)).bytes);
  const letterPages = textPages(path.join(out, 'letter-no-navigation.pdf'));
  assert(Math.abs(letterPages[0].height - 792) < 1);
  assert(header(letterPages[0].words).includes('README.md'), 'No-navigation packet starts with its source header');
  assert.equal(footer(letterPages[0].words, letterPages[0].height), `1 / ${letterPages.length}`);
  // Inspect the HTML preview with the same saved settings; furniture is export-only.
  await page.setContent(await renderHTML(plan), { waitUntil: 'load' });
  await page.waitForFunction('window.packetReady');
  console.log(`Matched upstream body x=${origin.toFixed(2)}pt and header x/y=${refHeader.x.toFixed(2)}/${refHeader.y.toFixed(2)}pt; browser=${await browser.version()}`);
} finally { await close(); }

// CLI consumes the exact same snapshot and settings as the editor/core API.
execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli.ts', 'export', path.join(out, 'plan.json'), '-o', path.join(out, 'cli.pdf'), '--force', '--mode', 'book', '--page-numbers', 'both', '--header-date', 'source-created', '--margins', '15,10,10,10', '--source-date', `${plan.head}=2026-10-01`], { stdio: 'pipe' });
assert.deepEqual(textPages(path.join(out, 'cli.pdf')).map(p => footer(p.words, p.height)), textPages(path.join(out, 'book-both.pdf')).map(p => footer(p.words, p.height)));
assert.deepEqual(flatten(validatePlan(JSON.parse(await fs.readFile(path.join(out, 'plan.json'), 'utf8'))).tree), flatten(plan.tree));
await fs.writeFile(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
console.log('Marginals acceptance passed: both modes/all scopes, date provenance, matched reference, overrides, final destinations, saved plan and CLI.');
