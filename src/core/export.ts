import puppeteer, { type Browser } from 'puppeteer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef, PDFString, PDFHexString } from 'pdf-lib';
import { flatten, validatePlan, type Plan } from './model.js';
import { renderHTML, diagnostics } from './render.js';

export async function launchBrowser(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-packet-browser-'));
  const candidates = [process.env.PACKET_BROWSER, puppeteer.executablePath(), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter((p): p is string => !!p);
  const executablePath = candidates.find(p => { try { return !!requireExists(p); } catch { return false; } });
  try {
    const browser = await puppeteer.launch({ headless: true, executablePath, userDataDir: profile, args: ['--disable-background-networking', '--disable-component-update'] });
    return { browser, close: async () => { await browser.close(); await fs.rm(profile, { recursive: true, force: true }); } };
  } catch (e) { await fs.rm(profile, { recursive: true, force: true }); throw new Error(`PDF browser could not start. Set PACKET_BROWSER to Chrome/Edge/Chromium. ${String(e)}`); }
}
import { existsSync as requireExists } from 'node:fs';

async function print(browser: Browser, html: string, plan: Plan, margin = 18): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', request => /^(data:|about:|blob:)/.test(request.url()) ? request.continue() : request.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.packetReady === true', { timeout: 30000 });
    const errors = await page.evaluate(() => (window as any).packetErrors as string[]);
    if (errors.length) throw new Error(errors.join('; '));
    return await page.pdf({ format: plan.settings.paper, printBackground: true, margin: { top: `${margin}mm`, right: `${margin}mm`, bottom: `${margin}mm`, left: `${margin}mm` } });
  } finally { await page.close(); }
}
function pdfText(value: any): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : value instanceof PDFName ? value.decodeText() : undefined;
}
function namedDestinations(pdf: PDFDocument): Map<string, PDFArray> {
  const result = new Map<string, PDFArray>();
  function normalize(key: string) { try { return decodeURIComponent(key); } catch { return key; } }
  function destination(value: any): PDFArray | undefined {
    value = pdf.context.lookup(value);
    if (value instanceof PDFDict) value = value.lookup(PDFName.of('D'));
    return value instanceof PDFArray ? value : undefined;
  }
  const direct = pdf.catalog.lookup(PDFName.of('Dests'));
  if (direct instanceof PDFDict) for (const [key, val] of direct.entries()) { const d = destination(val); if (d) result.set(normalize(key.decodeText()), d); }
  function walk(value: any) {
    value = pdf.context.lookup(value);
    if (!(value instanceof PDFDict)) return;
    const names = value.lookup(PDFName.of('Names'));
    if (names instanceof PDFArray) for (let i = 0; i < names.size(); i += 2) { const key = pdfText(names.lookup(i)), d = destination(names.get(i + 1)); if (key && d) result.set(normalize(key), d); }
    const kids = value.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walk(kids.get(i));
  }
  const names = pdf.catalog.lookup(PDFName.of('Names'));
  if (names instanceof PDFDict) walk(names.get(PDFName.of('Dests')));
  return result;
}
// Rebuild destinations and annotations against copied pages, rather than retaining
// Chromium page references from individual PDFs.
export async function assemblePDF(parts: Uint8Array[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const sources: { pdf: PDFDocument; pages: any[]; names: Map<string, PDFArray>; refs: Map<string, PDFRef> }[] = [];
  const globalNames = new Map<string, PDFArray>();
  for (const bytes of parts) {
    const pdf = await PDFDocument.load(bytes), original = pdf.getPages();
    const copied = await output.copyPages(pdf, pdf.getPageIndices());
    const refs = new Map(original.map((p, i) => [p.ref.toString(), copied[i].ref]));
    copied.forEach(p => output.addPage(p));
    const names = namedDestinations(pdf);
    sources.push({ pdf, pages: copied, names, refs });
    for (const [name, array] of names) {
      const ref = refs.get(array.get(0).toString());
      if (ref) globalNames.set(name, output.context.obj([ref, ...array.asArray().slice(1)]));
    }
  }
  function resolve(source: typeof sources[number], value: any): PDFArray | undefined {
    value = source.pdf.context.lookup(value);
    const name = pdfText(value);
    if (name) { let decoded = name; try { decoded = decodeURIComponent(name); } catch {} return globalNames.get(decoded); }
    if (value instanceof PDFArray) {
      const ref = source.refs.get(value.get(0).toString());
      if (ref) return output.context.obj([ref, ...value.asArray().slice(1)]);
    }
  }
  for (const source of sources) for (let pageIndex = 0; pageIndex < source.pages.length; pageIndex++) {
    const orig = source.pdf.getPage(pageIndex).node.lookup(PDFName.of('Annots'));
    const copy = source.pages[pageIndex].node.lookup(PDFName.of('Annots'));
    if (!(orig instanceof PDFArray) || !(copy instanceof PDFArray)) continue;
    for (let i = 0; i < orig.size(); i++) {
      const a = orig.lookup(i), b = copy.lookup(i);
      if (!(a instanceof PDFDict) || !(b instanceof PDFDict)) continue;
      const action = a.lookup(PDFName.of('A'));
      let dest: PDFArray | undefined;
      if (action instanceof PDFDict) {
        const uri = pdfText(action.lookup(PDFName.of('URI')));
        if (uri?.startsWith('https://packet.invalid/#')) {
          dest = globalNames.get(decodeURIComponent(uri.split('#')[1]));
          if (!dest) throw new Error(`Missing printed destination: ${uri}`);
        } else if (uri?.startsWith('https://packet-reference.invalid/')) {
          b.delete(PDFName.of('A')); continue;
        } else if (action.get(PDFName.of('S'))?.toString() === '/GoTo') dest = resolve(source, action.get(PDFName.of('D')));
      }
      if (a.has(PDFName.of('Dest'))) dest ||= resolve(source, a.get(PDFName.of('Dest')));
      if (dest) { b.delete(PDFName.of('A')); b.set(PDFName.of('Dest'), dest); }
    }
  }
  const dests = output.context.obj({});
  for (const [key, value] of globalNames) dests.set(PDFName.of(encodeURIComponent(key)), value);
  output.catalog.set(PDFName.of('Dests'), dests);
  output.setTitle('ordv reading edition'); output.setProducer('ordv');
  return output.save();
}
export async function exportPDF(value: Plan): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const plan = validatePlan(value), ids = flatten(plan.tree);
  if (!ids.length) throw new Error('Select at least one document');
  if (plan.settings.graph && ids.length > 30) throw new Error('Printed graph supports up to 30 documents; disable it for larger packets');
  // Generate per-document HTML sequentially so large packets don't retain a copy
  // of embedded fonts and Mermaid for every source at once.
  const jobs: { id?: string; navigation?: boolean }[] = plan.settings.mode === 'book' ? [{}] : [
    ...(plan.settings.toc || plan.settings.graph ? [{ navigation: true }] : []), ...ids.map(id => ({ id }))
  ];
  const firstHTML = await renderHTML(plan, jobs[0].id, jobs[0].navigation);
  const { browser, close } = await launchBrowser();
  try {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const { id, navigation } = jobs[i];
      const html = i === 0 ? firstHTML : await renderHTML(plan, id, navigation);
      parts.push(await print(browser, html, plan, id ? plan.settings.documentStyles[id]?.marginMm : undefined));
    }
    return { bytes: await assemblePDF(parts), warnings: diagnostics(plan) };
  } finally { await close(); }
}
