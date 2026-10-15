import { describe, it, expect } from 'vitest';
import { discover } from '../src/core/discover.js';
import { defaults, validatePlan, SettingsSchema } from '../src/core/model.js';
import { flatten } from '../src/core/model.js';
import { printOptions, sourceFilename, pageLabels, marginalHTML } from '../src/core/marginals.js';
import { diagnostics } from '../src/core/diagnostics.js';

const planForTest = () => discover('examples/style');
describe('yzane print profile and saved settings', () => {
  it('isolates editable margin defaults between new and loaded plans', async () => {
    const first = await planForTest(), second = await planForTest();
    first.settings.marginsMm.top = 25;
    expect(second.settings.marginsMm.top).toBe(15);
    expect(defaults.marginsMm.top).toBe(15);
    const loaded = SettingsSchema.parse({}); loaded.marginsMm.left = 30;
    expect(SettingsSchema.parse({}).marginsMm.left).toBe(10);
  });
  it('uses explicit asymmetric margins and preserves separate CSS padding', async () => {
    const plan = await planForTest();
    expect(printOptions(plan)).toMatchObject({ format: 'A4', landscape: false, scale: 1, printBackground: true, displayHeaderFooter: true,
      margin: { top: '15mm', right: '10mm', bottom: '10mm', left: '10mm' } });
    expect(plan.settings.runningHeader).toBe(true);
    expect(plan.settings.headerDate).toBe('export');
    expect(plan.settings.pageNumbers).toBe('packet');
    expect(printOptions(plan, 20).margin).toEqual({ top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' });
    expect(() => printOptions(plan, 5)).toThrow('Running headers require');
    plan.settings.runningHeader = false;
    expect(() => printOptions(plan, 5)).toThrow('Page numbers require');
    plan.settings.pageNumbers = 'none';
    expect(printOptions(plan, 5).margin?.top).toBe('5mm');
  });
  it('loads old settings without inventing source creation dates and round-trips new fields', async () => {
    const plan = await planForTest();
    plan.settings = SettingsSchema.parse({ mode: 'documents', documentStyles: { [plan.head]: { fontSize: 12 } } });
    expect(plan.settings.marginsMm).toEqual(defaults.marginsMm);
    expect(plan.documents[0].sourceCreatedDate).toBeUndefined();
    plan.settings.headerDate = 'source-created'; plan.settings.pageNumbers = 'both';
    plan.documents[0].sourceCreatedDate = { date: '2026-10-01', provenance: 'user-provided' };
    expect(validatePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    plan.documents[0].sourceCreatedDate.date = '2026-02-30';
    expect(() => validatePlan(plan)).toThrow();
  });
});
describe('final page labels', () => {
  it('counts navigation and source ranges independently, in reading order', async () => {
    const plan = await planForTest(), [first, second] = flatten(plan.tree);
    const starts = new Map([[first, 2], [second, 5]]), now = new Date('2026-10-15T23:59:00Z');
    let labels = pageLabels(plan, starts, 7, now);
    expect(labels[0]).toMatchObject({ filename: 'Navigation', date: '2026-10-15', footer: '1 / 7', local: 1, total: 2 });
    expect(labels[4]).toMatchObject({ filename: 'README.md', local: 3, total: 3, footer: '5 / 7' });
    plan.settings.pageNumbers = 'both'; labels = pageLabels(plan, starts, 7, now);
    expect(labels[1].footer).toBe('Navigation 2 / 2 · Packet 2 / 7');
    expect(labels[5].footer).toBe('Document 1 / 2 · Packet 6 / 7');
    plan.settings.pageNumbers = 'document';
    expect(pageLabels(plan, starts, 7, now)[6].footer).toBe('Document 2 / 2');
    plan.settings.pageNumbers = 'none';
    expect(pageLabels(plan, starts, 7, now).every(p => !p.footer)).toBe(true);
    expect(() => pageLabels(plan, new Map([[first, 5], [second, 2]]), 7, now)).toThrow('reading order');
    expect(() => pageLabels(plan, new Map(), 7, now)).toThrow('Missing source');
  });
  it('does not substitute export or snapshot time for unavailable source creation dates', async () => {
    const plan = await planForTest(), ids = flatten(plan.tree);
    plan.settings.headerDate = 'source-created';
    plan.documents.find(d => d.id === ids[0])!.sourceCreatedDate = { date: '2026-10-01', provenance: 'user-provided' };
    const labels = pageLabels(plan, new Map([[ids[0], 1], [ids[1], 3]]), 5, new Date());
    expect(labels.map(l => l.date)).toEqual(['', '2026-10-01', '2026-10-01', '', '']);
    expect(diagnostics(plan).some(w => w.includes('no export-date fallback'))).toBe(true);
    plan.settings.headerDate = 'none';
    expect(pageLabels(plan, new Map([[ids[0], 0], [ids[1], 2]]), 4, new Date()).every(l => !l.date)).toBe(true);
  });
  it('keeps Unicode filenames, decodes URL paths, and escapes overlay content', () => {
    expect(sourceFilename('C:\\notes\\한글.md')).toBe('한글.md');
    expect(sourceFilename('https://example.com/notes/My%20file.md?raw=1#anchor')).toBe('My file.md');
    const html = marginalHTML([{ filename: '<img src=x onerror=alert(1)>', date: '', footer: '1 / 1', local: 1, total: 1 }], 595, 842, true);
    expect(html).toContain('&lt;img'); expect(html).not.toContain('<img');
    expect(marginalHTML([], 595, 842, false)).not.toContain('<div class="header">');
  });
});
