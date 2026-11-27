import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from '../dist/core/export.js';

const out = 'output/ci';
await fs.mkdir(out, { recursive: true });
const npm = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : await fs.realpath(path.join(path.dirname(process.execPath), 'npm'));
const write = (name, data) => fs.writeFile(`${out}/${name}.json`, `${JSON.stringify(data, null, 2)}\n`);
const command = (name, args) => {
  const result = spawnSync(name, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${name} failed: ${result.error || result.stderr || result.stdout}`);
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
};

if (process.argv[2] === 'versions') {
  const { browser, close } = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent('<p id="korean" style="font-family:\'Noto Sans CJK KR\'">한국어 오프라인 자료</p>');
    await page.evaluate(() => document.fonts.ready);
    const session = await page.createCDPSession();
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#korean' });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
    await write('versions', {
      commit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceCommit: process.env.ORDV_CI_SOURCE_SHA || null,
      run: process.env.GITHUB_RUN_ID || null,
      runnerImage: process.env.ImageOS || null,
      runnerImageVersion: process.env.ImageVersion || null,
      os: { platform: process.platform, release: os.release(), arch: process.arch },
      node: process.version,
      npm: command(process.execPath, [npm, '--version']),
      python: command(process.env.ORDV_TEST_PYTHON || 'python', ['--version']),
      pdfplumber: command(process.env.ORDV_TEST_PYTHON || 'python', ['-c', 'import pdfplumber; print(pdfplumber.__version__)']),
      poppler: command('pdftotext', ['-v']),
      browserPath: process.env.ORDV_BROWSER,
      browser: await browser.version(),
      koreanFonts: fonts,
      package: { name: pkg.name, version: pkg.version },
      lockfileSha256: createHash('sha256').update(await fs.readFile('package-lock.json')).digest('hex'),
    });
    assert(fonts.some(font => /Noto Sans CJK KR/i.test(font.familyName) && font.glyphCount > 0), JSON.stringify(fonts));
    console.log('Runtime versions and actual Noto Korean glyph usage recorded.');
  } finally { await close(); }
} else if (process.argv[2] === 'pdf') {
  const file = 'output/runtime/installed-offline.pdf';
  const info = command('pdfinfo', [file]);
  const text = command('pdftotext', ['-enc', 'UTF-8', file, '-']);
  assert.match(info, /Pages:\s+[1-9]\d*/);
  assert.match(text, /한국어 오프라인 자료/);
  await write('pdf-inspection', { file, info, koreanTextExtracted: true });
  console.log('Poppler opened the installed-runtime PDF and extracted its Korean fixture.');
} else {
  throw new Error('Use versions or pdf.');
}
