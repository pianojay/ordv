import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

it('keeps preset assets and notices in the npm distribution', () => {
  const require = createRequire(import.meta.url);
  const npm = process.env.npm_execpath || path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  // Use the current Node installation's npm; avoid a shell/cmd wrapper on Windows.
  const result = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
  const files = new Set(result[0].files.map((f: { path: string }) => f.path));
  expect(files.has('THIRD_PARTY_NOTICES.md')).toBe(true);
  const pkg = require('../package.json');
  expect(pkg.files).toContain('dist/');
  expect(pkg.bin.ordv).toBe('dist/cli.js');
  const manifest = require('../assets/styles/vscode/manifest.json');
  for (const name of ['manifest.json', ...Object.keys(manifest.files)]) {
    expect(files.has(`assets/styles/vscode/${name}`)).toBe(true);
  }
}, 30000);
