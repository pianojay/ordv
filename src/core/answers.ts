import { parseDocument, DomUtils } from 'htmlparser2';
import { escape } from './markdown.js';
import type { Plan } from './model.js';

/** Operates only on already sanitized HTML; source Markdown/snapshot stays intact. */
export function answerPolicy(html: string, policy: Plan['settings']['answers'], namespace: string): string {
  const dom = parseDocument(html);
  const details = DomUtils.getElementsByTagName('details', dom.children, true);
  if (!details.length) return html;
  if (policy === 'preserve') return `<p class="answer-policy">Folded answers: source visibility preserved. Closed answers are not printed; choose Expand or Appendix to include them.</p>${html}`;
  for (const node of details) node.attribs.open = '';
  if (policy === 'expand') return `<p class="answer-policy">Folded answers: expanded for this edition.</p>${DomUtils.getInnerHTML(dom)}`;
  const top = details.filter(node => { let parent = node.parent; while (parent) { if ('name' in parent && parent.name === 'details') return false; parent = parent.parent; } return true; });
  const used = new Set(DomUtils.findAll(node => !!node.attribs.id, dom.children).map(node => node.attribs.id));
  const allocate = (base: string) => { let id = base, suffix = 0; while (used.has(id)) id = `${base}-${++suffix}`; used.add(id); return id; };
  const answers: string[] = [];
  for (const [i, node] of top.entries()) {
    const summary = node.children.find(c => 'name' in c && c.name === 'summary');
    const title = summary ? DomUtils.textContent(summary) : 'Answer';
    const summaryHTML = summary ? DomUtils.getInnerHTML(summary) : 'Answer';
    if (summary) DomUtils.removeElement(summary);
    const answer = allocate(`${namespace}--answer-${i + 1}`), origin = allocate(`${namespace}--question-${i + 1}`);
    answers.push(`<div class="answer"><h3 id="${escape(answer)}"><a class="heading-link" href="#${escape(answer)}">${i + 1}. ${summaryHTML}</a></h3>${DomUtils.getInnerHTML(node)}<p><a href="#${escape(origin)}">Return to question ${i + 1}</a></p></div>`);
    const replacement = parseDocument(`<p class="answer-reference" id="${escape(origin)}"><a href="#${escape(answer)}">Answer ${i + 1}: ${escape(title)} (see source answer appendix)</a></p>`).children[0];
    DomUtils.replaceElement(node, replacement);
  }
  return `${DomUtils.getInnerHTML(dom)}<section class="answer-appendix"><h2>Answers for this source</h2>${answers.join('')}</section>`;
}
