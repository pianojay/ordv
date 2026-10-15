import { flatten, type Plan } from './model.js';
import { mathProblems, parseMarkdown } from './markdown.js';

export type DiagnosticCode = 'DISCOVERY_LIMIT' | 'SOURCE_NOTICE' | 'SOURCE_UNAVAILABLE' | 'SCOPE_EXCLUDED' | 'TRAVERSAL_LIMIT' | 'TARGET_UNAVAILABLE' | 'BROKEN_ANCHOR' | 'DOCUMENT_OMITTED' | 'ASSET_UNAVAILABLE' | 'MATH_INVALID' | 'SOURCE_DATE_UNKNOWN' | 'PROVENANCE_UNKNOWN' | 'SNAPSHOT_STALE' | 'SOURCE_SUPERSEDED' | 'WEB_REFERENCE';
export interface Diagnostic { code: DiagnosticCode; severity: 'info' | 'warning' | 'error'; message: string; documentId?: string; href?: string }
export function mathErrors(plan: Plan): string[] {
  if (!plan.settings.math) return [];
  const ids = new Set(flatten(plan.tree));
  return plan.documents.filter(d => ids.has(d.id) && d.available).flatMap(d => mathProblems(d.content).map(p => `${d.title}: invalid math near line ${p.line}: ${p.message}`));
}
export function diagnosticRecords(plan: Plan, now = new Date()): Diagnostic[] {
  const ids = new Set(flatten(plan.tree)), out: Diagnostic[] = [];
  const add = (code: DiagnosticCode, severity: Diagnostic['severity'], message: string, documentId?: string, href?: string) => out.push({ code, severity, message, documentId, href });
  for (const w of plan.warnings) add(w.startsWith('Discovery stopped') ? 'DISCOVERY_LIMIT' : 'SOURCE_NOTICE', 'warning', w);
  for (const m of mathErrors(plan)) add('MATH_INVALID', 'error', m);
  for (const d of plan.documents.filter(d => ids.has(d.id))) {
    const emit = (code: DiagnosticCode, severity: Diagnostic['severity'], message: string, href?: string) => add(code, severity, `${d.title}: ${message}`, d.id, href);
    if (!d.provenance) emit('PROVENANCE_UNKNOWN', 'info', 'legacy snapshot has no independently recorded source provenance');
    else {
      const ageFrom = d.provenance.fetchedAt || (!d.provenance.cache ? d.provenance.capturedAt : undefined);
      if (!ageFrom || now.getTime() - Date.parse(ageFrom) > (plan.discovery?.freshnessDays ?? 30) * 86400000) emit('SNAPSHOT_STALE', 'warning', 'snapshot age exceeds the review interval or cache age is unknown; refresh explicitly');
    }
    if (d.freshness === 'superseded') emit('SOURCE_SUPERSEDED', 'warning', `source marked superseded${d.supersededBy ? ` by ${d.supersededBy}` : ''}; retained as historical evidence`);
    if (plan.settings.runningHeader && plan.settings.headerDate === 'source-created' && !d.sourceCreatedDate) emit('SOURCE_DATE_UNKNOWN', 'warning', 'source creation date is unavailable; the running-header date will be blank (no export-date fallback)');
    if (!d.available) emit('SOURCE_UNAVAILABLE', 'error', 'selected document is unavailable');
    for (const w of d.warnings) emit(w.startsWith('Image ') ? 'ASSET_UNAVAILABLE' : 'SOURCE_NOTICE', 'warning', w);
    for (const href of new Set(parseMarkdown(d.content).images)) if (!d.assets[href] && !d.warnings.some(w => w.startsWith(`Image ${href}:`))) emit('ASSET_UNAVAILABLE', 'warning', `Image ${href || '(missing src)'}: absent from the snapshot`, href);
    for (const l of d.links) {
      if (l.issue) {
        const code = /escapes|outside.*root/i.test(l.issue) ? 'SCOPE_EXCLUDED' : /limit/i.test(l.issue) ? 'TRAVERSAL_LIMIT' : /heading|anchor/i.test(l.issue) ? 'BROKEN_ANCHOR' : 'TARGET_UNAVAILABLE';
        emit(code, 'warning', `${l.href}: ${l.issue}`, l.href);
      } else if (l.kind === 'markdown' && l.target && !ids.has(l.target)) emit('DOCUMENT_OMITTED', 'info', `${l.label || l.href}: referenced document omitted`, l.href);
      else if (l.kind === 'web' && /github\.com\/.*\/blob\//.test(l.href)) emit('WEB_REFERENCE', 'info', `${l.href}: GitHub blob page retained as a web reference (including line fragments)`, l.href);
    }
  }
  return out.filter((d, i) => out.findIndex(v => JSON.stringify(v) === JSON.stringify(d)) === i);
}
/** Compatibility presentation for existing consumers; structured API is diagnosticRecords. */
export function diagnostics(plan: Plan): string[] { return diagnosticRecords(plan).map(d => `[${d.code}] ${d.message}`); }
