import { flatten, type Plan } from './model.js';
import { mathProblems, parseMarkdown } from './markdown.js';

export function mathErrors(plan: Plan): string[] {
  if (!plan.settings.math) return [];
  const ids = new Set(flatten(plan.tree));
  return plan.documents.filter(d => ids.has(d.id) && d.available).flatMap(d => mathProblems(d.content).map(p => `${d.title}: invalid math near line ${p.line}: ${p.message}`));
}
export function diagnostics(plan: Plan): string[] {
  const ids = new Set(flatten(plan.tree)), out = [...plan.warnings, ...mathErrors(plan)];
  for (const d of plan.documents.filter(d => ids.has(d.id))) {
    if (plan.settings.runningHeader && plan.settings.headerDate === 'source-created' && !d.sourceCreatedDate) out.push(`${d.title}: source creation date is unavailable; the running-header date will be blank (no export-date fallback)`);
    if (!d.available) out.push(`${d.title}: selected document is unavailable`);
    out.push(...d.warnings.map(w => `${d.title}: ${w}`));
    for (const href of new Set(parseMarkdown(d.content).images)) {
      if (!d.assets[href] && !d.warnings.some(w => w.startsWith(`Image ${href}:`))) out.push(`${d.title}: Image ${href || '(missing src)'}: absent from the snapshot`);
    }
    for (const l of d.links) {
      if (l.issue) out.push(`${d.title}: ${l.href}: ${l.issue}`);
      else if (l.kind === 'markdown' && l.target && !ids.has(l.target)) out.push(`${d.title}: ${l.label || l.href}: referenced document omitted`);
    }
  }
  return [...new Set(out)];
}
