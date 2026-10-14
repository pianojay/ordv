import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { discover } from '../src/core/discover.js';
import { renderHTML } from '../src/core/render.js';
import { exportPDF, launchBrowser } from '../src/core/export.js';
import { PDFDocument } from 'pdf-lib';

await fs.mkdir('output/style', { recursive: true });
const plan = await discover('examples/style', { fetcher: async () => { throw Error('Offline style fixture'); } });
// Remote sources are intentionally unavailable in this offline visual fixture.
const html = await renderHTML(plan);
await fs.writeFile('output/style/preview.html', html);
const { browser, close } = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1000 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('window.packetReady');
  assert.deepEqual(await page.evaluate(() => (window as any).packetErrors), []);
  await page.emulateMediaType('print');
  const style = await page.evaluate(`(() => {
    const get = (selector) => getComputedStyle(document.querySelector(selector));
    return { font: get('body').fontSize, line: get('body').lineHeight, padding: get('body').paddingLeft,
      h1Weight: get('h1').fontWeight, h1Border: get('h1').borderBottomWidth,
      prePadding: get('pre:not(.mermaid)').paddingLeft, preBackground: get('pre:not(.mermaid)').backgroundColor,
      quoteBorder: get('blockquote').borderLeftWidth, codeColor: get('p code').color };
  })()`);
  assert.deepEqual(style, { font: '14px', line: '22px', padding: '12px', h1Weight: '400', h1Border: '1px',
    prePadding: '23px', preBackground: 'rgb(248, 248, 248)', quoteBorder: '5px', codeColor: 'rgb(201, 174, 117)' });
  console.log('Verified upstream print cascade:', style);
  await page.emulateMediaType('screen');
  await page.screenshot({ path: 'output/style/preview.png', fullPage: true });
  const enlarged = structuredClone(plan);
  enlarged.settings.mode = 'documents';
  enlarged.settings.documentStyles[plan.head] = { fontSize: 24, marginMm: 20 };
  await page.setContent(await renderHTML(enlarged, plan.head), { waitUntil: 'load' });
  await page.waitForFunction('window.packetReady');
  const enlargedStyle = await page.$eval('.doc', el => ({ font: getComputedStyle(el).fontSize, line: getComputedStyle(el).lineHeight }));
  assert.equal(enlargedStyle.font, '32px');
  assert(parseFloat(enlargedStyle.line) > 48, 'Large document fonts retain proportional line spacing');
} finally { await close(); }
for (const mode of ['book', 'documents'] as const) {
  plan.settings.mode = mode;
  const result = await exportPDF(plan);
  const pdf = await PDFDocument.load(result.bytes);
  const { width, height } = pdf.getPage(0).getSize();
  assert(Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1, 'A4 page size');
  await fs.writeFile(`output/style/${mode}.pdf`, result.bytes);
  console.log(`${mode}: ${pdf.getPageCount()} A4 pages`);
}
