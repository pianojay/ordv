import type { PDFOptions } from 'puppeteer';
import { escape } from './markdown.js';
import { flatten, type Document, type Plan } from './model.js';

/** Paper margins, distinct from the upstream body's margin and 12px padding. */
export function printOptions(plan: Plan, override?: number): PDFOptions {
  const mm = override === undefined ? plan.settings.marginsMm : { top: override, right: override, bottom: override, left: override };
  if (plan.settings.runningHeader && mm.top < 10) throw new Error('Running headers require a top margin of at least 10 mm');
  if (plan.settings.pageNumbers !== 'none' && mm.bottom < 10) throw new Error('Page numbers require a bottom margin of at least 10 mm');
  return { format: plan.settings.paper, landscape: false, scale: 1, printBackground: true,
    // Dynamic source headers and final counters are overlaid after assembly.
    displayHeaderFooter: plan.settings.runningHeader || plan.settings.pageNumbers !== 'none',
    headerTemplate: '<span></span>', footerTemplate: '<span></span>',
    margin: Object.fromEntries(Object.entries(mm).map(([key, value]) => [key, `${value}mm`])) };
}

export function sourceFilename(source: string): string {
  let value = source;
  if (/^https?:\/\//i.test(source)) value = new URL(source).pathname;
  value = value.split(/[/\\]/).pop() || 'Markdown document';
  try { return decodeURIComponent(value); } catch { return value; }
}

export interface PageLabel { filename: string; date: string; footer: string; documentId?: string; local: number; total: number }

/** Source-start PDF destinations define ranges in the final page sequence. */
export function pageLabels(plan: Plan, starts: Map<string, number>, count: number, exportedAt: Date): PageLabel[] {
  const documents = new Map(plan.documents.map(d => [d.id, d]));
  const ordered = flatten(plan.tree).map(id => {
    const start = starts.get(id);
    if (start === undefined || start < 0 || start >= count) throw new Error(`Missing source page destination: ${id}`);
    return { doc: documents.get(id)!, start };
  });
  if (ordered.some((entry, i) => i > 0 && entry.start <= ordered[i - 1].start)) throw new Error('Source page ranges do not follow reading order');
  const dateFor = (doc?: Document) => plan.settings.headerDate === 'export' ? exportedAt.toISOString().slice(0, 10)
    : plan.settings.headerDate === 'source-created' ? doc?.sourceCreatedDate?.date || '' : '';
  return Array.from({ length: count }, (_, i) => {
    const source = [...ordered].reverse().find(entry => entry.start <= i);
    const next = source ? ordered[ordered.indexOf(source) + 1]?.start ?? count : ordered[0].start;
    const local = i - (source?.start ?? 0) + 1, total = next - (source?.start ?? 0);
    const packet = `${i + 1} / ${count}`;
    const localLabel = `${source ? 'Document' : 'Navigation'} ${local} / ${total}`;
    const footer = ({ packet, document: localLabel, both: `${localLabel} · Packet ${packet}`, none: '' })[plan.settings.pageNumbers];
    return { filename: source ? sourceFilename(source.doc.source) : 'Navigation', date: dateFor(source?.doc), footer,
      documentId: source?.doc.id, local, total };
  });
}

/** Transparent, Unicode-capable overlay; Chromium uses the system font fallback. */
export function marginalHTML(labels: PageLabel[], width: number, height: number, header: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${width}pt ${height}pt;margin:0}html,body{margin:0;padding:0;background:transparent}
*{box-sizing:border-box}.sheet{width:${width}pt;height:${height}pt;position:relative;break-after:page;overflow:hidden}
.sheet:last-child{break-after:auto}.header,.footer{position:absolute;font:9px/normal Arial,"Malgun Gothic",sans-serif;color:#000}
/* Match Chromium's default header/footer inset, including its 1px inner offset. */
.header{top:calc(5mm + 1px);left:10mm;right:10mm;display:flex;gap:10px;align-items:baseline}
.filename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}.date{flex:none}
.footer{bottom:calc(5mm + 1px);left:10mm;right:10mm;text-align:center;white-space:nowrap}
</style></head><body>${labels.map(label => `<div class="sheet">${header ? `<div class="header"><span class="filename">${escape(label.filename)}</span><span class="date">${escape(label.date)}</span></div>` : ''}<div class="footer">${escape(label.footer)}</div></div>`).join('')}</body></html>`;
}
