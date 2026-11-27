import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { discover } from '../src/core/discover.js';
import { exportPDF } from '../src/core/export.js';
const out = path.resolve('output/table-regression');
await fs.mkdir(out, { recursive: true });
const identifiers = Array.from({ length: 8 }, (_, i) => `IDENTIFIER_${i}_${'very_long_symbol_'.repeat(12)}END${i}`);
await fs.writeFile(path.join(out, 'README.md'), '# Unaffected chapter\n\nBODY_SENTINEL Ordinary text must remain ten point five points.\n\n[Matrix](matrix.md)');
await fs.writeFile(path.join(out, 'matrix.md'), '# Matrix\n\nMATRIX_SENTINEL Ordinary matrix text.\n\n| Name | Implementation |\n| --- | --- |\n' + identifiers.map(s => '| Entry | `'+s+'` |').join('\n') + '\n\n```mermaid\nflowchart LR\nA-->B-->C-->D-->E-->F-->G-->H-->I-->J\n```');
const plan = await discover(out); plan.settings.figures = 'readable';
for (const mode of ['book', 'documents'] as const) {
  plan.settings.mode = mode;
  const result = await exportPDF(plan), file = path.join(out, mode + '.pdf');
  await fs.writeFile(file, result.bytes);
  execFileSync(process.env.ORDV_TEST_PYTHON || 'python', ['-c', `import pdfplumber
with pdfplumber.open(${JSON.stringify(file)}) as d:
 fonts={hit['chars'][0]['fontname'] for page in d.pages for hit in page.search('IDENTIFIER_',return_chars=True)}
 text=''.join(page.filter(lambda c: c.get('fontname') in fonts).extract_text() or '' for page in d.pages).replace('\\n','').replace(' ','')
 for identifier in ${JSON.stringify(identifiers)}: assert identifier in text,identifier
 for sentinel in ['BODY_SENTINEL','MATRIX_SENTINEL']:
  hits=[hit for page in d.pages for hit in page.search(sentinel,return_chars=True)]
  assert len(hits)==1,sentinel
  assert all(abs(c['size']-10.5)<0.1 for c in hits[0]['chars']),hits[0]
 assert any(page.width>page.height for page in d.pages),'Expected mixed orientation'
 print('${mode}: both source glyphs 10.5pt; all identifiers complete; mixed page sizes; pages',len(d.pages))
`], { stdio: 'inherit' });
}
await fs.writeFile(path.join(out, 'overflow.md'), '# Too many columns\n\n|' + Array(30).fill('Column').join('|') + '|\n|' + Array(30).fill('---').join('|') + '|\n|' + Array(30).fill('Value').join('|') + '|');
await assert.rejects(exportPDF(await discover(path.join(out, 'overflow.md'))), /Print layout overflow/);
console.log('Unresolvable table overflow fails before printing.');
