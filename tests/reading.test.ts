import { it, expect } from 'vitest';
import { answerPolicy } from '../src/core/answers.js';
import { discover } from '../src/core/discover.js';
import { renderHTML } from '../src/core/render.js';
import { applyReadingProfile, validatePlan } from '../src/core/model.js';
import { foldedVisibility } from '../src/core/markdown.js';

it('preserves, expands or appends folded answers without changing the stored source', () => {
  const source = '<p>Question</p><details><summary>Reason &amp; evidence</summary><p>ANSWER</p><details><summary>Nested</summary><p>INNER</p></details></details>';
  expect(answerPolicy(source, 'preserve', 'd-a')).toContain('<details><summary>');
  const expanded = answerPolicy(source, 'expand', 'd-a');
  expect(expanded.match(/<details open/g)).toHaveLength(2);
  const appendix = answerPolicy(source, 'appendix', 'd-a');
  expect(appendix).toContain('href="#d-a--answer-1"');
  expect(appendix).toContain('href="#d-a--question-1"');
  expect(appendix).toContain('Reason &amp; evidence');
  expect(appendix.match(/ANSWER/g)).toHaveLength(1);
  expect(appendix.match(/INNER/g)).toHaveLength(1);
  expect(appendix.indexOf('answer-appendix')).toBeLessThan(appendix.indexOf('ANSWER'));
  const collision = answerPolicy('<h2 id="d-a--answer-1">Answer 1</h2><details><summary><em>Qualified</em> answer</summary>Evidence</details>', 'appendix', 'd-a');
  expect(collision).toContain('id="d-a--answer-1-1"');
  expect(collision).toContain('<em>Qualified</em> answer');
});
it('identifies headings hidden inside nested closed answers, excluding fenced examples', () => {
  const visibility = foldedVisibility('# Chapter\n\n<details><summary>Answer</summary>\n\n## Secret\n\n<details open><summary>Nested open</summary>\n\n## Still hidden\n\n</details>\n\n</details>\n\n## Visible\n\n```html\n<details><summary>Example</summary>\n```');
  expect([...visibility.hidden]).toEqual(['secret', 'still-hidden']);
  expect(visibility.closed).toBe(true);
});
it('uses concise navigation, annotation profiles, source qualifications, and preserves heading hierarchy', async () => {
  const p = await discover('examples/style');
  const original = p.documents.map(d => d.content);
  applyReadingProfile(p, 'tablet'); expect(p.settings.marginsMm.right).toBe(40);
  applyReadingProfile(p, 'duplex'); expect(p.settings.marginsMm.left).toBe(25); expect(p.settings.marginsMm.right).toBe(25);
  p.documents[0].freshness = 'superseded'; p.documents[0].supersededBy = '<new report>';
  let html = await renderHTML(p);
  const toc = html.slice(html.indexOf('<section class="navigation toc">'), html.indexOf('</section>'));
  expect(toc).not.toContain('heading-entry');
  expect(html).toContain('Historical source: marked superseded by &lt;new report&gt;');
  expect(html).toContain('Captured ');
  p.settings.tocDepth = 3; html = await renderHTML(p);
  expect(html).toContain('class="heading-entry"');
  expect(p.documents.map(d => d.content)).toEqual(original);
  expect(validatePlan(JSON.parse(JSON.stringify(p)))).toEqual(p);
});
