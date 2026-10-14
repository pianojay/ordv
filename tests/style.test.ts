import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { readingStyle } from '../src/core/style.js';
import { discover } from '../src/core/discover.js';
import { renderHTML } from '../src/core/render.js';

describe('licensed default reading preset', () => {
  it('ships the exact pinned assets and their complete notices', async () => {
    const root = new URL('../assets/styles/vscode/', import.meta.url);
    const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
    for (const [name, hash] of Object.entries(manifest.files)) {
      const bytes = await fs.readFile(new URL(name, root));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    }
    const notices = await fs.readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
    for (const name of ['LICENSE-microsoft.txt', 'LICENSE-yzane.txt', 'LICENSE-highlightjs.txt']) {
      expect(notices.replace(/\r\n/g, '\n')).toContain((await fs.readFile(new URL(name, root), 'utf8')).replace(/\r\n/g, '\n'));
    }
  });

  it('preserves the upstream cascade and embeds notices in standalone HTML', async () => {
    const css = await readingStyle();
    expect(css.indexOf('Copyright (c) Microsoft Corporation')).toBeGreaterThan(0);
    expect(css).toContain('Copyright (c) yzane');
    expect(css).toContain('Copyright (c) 2006, Ivan Sagalaev');
    expect(css.indexOf('Theme: Default')).toBeGreaterThan(css.indexOf('body.scrollBeyondLastLine'));
    expect(css.indexOf('Markdown PDF CSS')).toBeGreaterThan(css.indexOf('Theme: Default'));
    const plan = await discover('examples/style', { fetcher: async () => { throw Error('Offline test'); } });
    const html = await renderHTML(plan);
    expect(html).toContain(css);
    expect(html).not.toContain('<link rel="stylesheet"');
  });
});
