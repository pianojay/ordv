# ordv

**ordv**, from **Ord(V)**, is a local editor and CLI for selecting and ordering a Markdown graph into a human reading edition. Start with a head document or a folder, review the suggested tree, choose documents and reading order, and export a PDF.

![A folder of linked Markdown notes becomes a graph, then a reading tree, then a sequence, and is exported as one bound PDF.](docs/assets/ordv-demo.gif)

## Start

Requires Node.js 22.12+ (tested with Node 24 on Windows).

```powershell
npm ci
npm run dev
```

Open the localhost URL printed by the CLI. Enter a Markdown file, a folder, or a public raw Markdown URL. The editor supports graph selection, section names, parent selection, drag reordering, up/down ordering, snapshot preview, and JSON plan save/load.

For a quicker production startup:

```powershell
npm run build
npm run packet -- serve examples/notes --production
```

The example folder includes a remote link, so initial discovery can need network access. Preview and export thereafter use captured sources. **Refresh** rereads sources, refreshes remote cache, and rebuilds the suggested tree; save custom arrangements first.

## CLI

```powershell
npm run packet -- discover ./notes -o ./reading-plan.json
npm run packet -- open --plan ./reading-plan.json
npm run packet -- export ./reading-plan.json -o ./reading-packet.pdf
npm run packet -- export ./reading-plan.json --mode documents --graph -o ./document-packet.pdf
```

- A head file follows reachable Markdown links in appearance order. A folder also includes disconnected candidates and ranks likely heads: a root README first, then zero incoming links, coverage, and stable path order.
- Cycles and shared children appear once in the suggested tree. The graph retains other relationships. Reading order is the preorder traversal of the edited tree, independently of graph edges.
- Excluding a document promotes its children; it does not discard those selections. Changing the head resets the tree.
- `--refresh` on `discover` refreshes remote content. Remote cache is stored in `.reading-packet/cache` beneath the chosen folder, or the working directory for a remote head.

## PDF output

**Book** composes selected Markdown with consistent styling and page breaks between sources. **Per-document packet** renders each source separately and concatenates the PDFs with generated navigation. Select a graph node to set that document's font size and margin in per-document mode. Both modes rebuild TOC and cross-document destinations against final PDF pages.

The renderer supports tables, task lists, highlighted code, Markdown and raw HTML raster/SVG images, Korean text through system fonts, KaTeX formulas, and Mermaid diagrams. HTML images use the same bounded snapshot resolver as Markdown images. Invalid math is reported in preview and stops export before browser startup; explicitly disabling math retains literal source. Undecodable captured images stop export. It uses `vscode-markdown-pdf` as a feature reference; neither VS Code nor Obsidian is required.

Tree TOC is enabled by default. A separate relationship graph is optional (up to 30 selected documents). Its solid edges follow actual links represented in the reading tree; dashed edges show cross-links. Preview shows content; final page margins and pagination are applied on export.

PDF links remain source references. Importing or appending existing PDFs, wiki links, HTML article extraction, authenticated URLs, and desktop packaging are deferred. Omitted local Markdown references are readable labels rather than links to local files in the output. Unavailable selected documents and invalid Mermaid diagrams stop export; missing images and unresolved references produce visible notices.

## Browser setup

Puppeteer normally downloads Chromium during installation. To use an existing browser instead:

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm ci
$env:PACKET_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run dev
```

Exports use a new temporary browser profile and close it after printing. This workstation's sandbox blocks Chromium launch; run the app from a normal terminal for PDF export. Chromium launch and both export modes were verified outside that sandbox.

## Saved plans and local service

Version-2 JSON plans contain the selected root/input/head, document content and hashes, link graph, heading metadata, image snapshots and hashes, editable tree, ranked heads, and print settings. Text hashes cover the exact UTF-8 content stored in the snapshot after an initial BOM is removed; `sourceHash` retains the original byte hash. Source title/heading/link metadata has a separate digest. Loading or exporting a stale/tampered snapshot fails with an actionable error; ordinary reading-tree/title/order edits remain supported. Hashes detect inconsistency, not malicious forgery or source authenticity.

Valid version-1 plans are checked and upgraded when loaded. Their source byte hashes are preserved, including BOM-prefixed sources. Image and derived-metadata digests are established from the stored legacy snapshot with an explicit migration warning; original legacy images cannot be independently verified. Rediscover sources if an old plan has a mismatched text hash or metadata. Treat saved plans as copies of your source material. CLI and UI validate the same schema and export without rereading source documents or fetching network assets.

Remote Markdown is identified by its normalized final URL. Redirect aliases are retained on the document and all graph references are remapped to the canonical ID. If another alias returns changed content during one discovery, ordv keeps the first captured snapshot and reports it rather than silently mixing revisions.

The service binds to `127.0.0.1`; API requests require the token in the printed launch URL and pass host/origin checks. Source HTML is sanitized, document scripts are removed, and the preview runs in a sandboxed iframe. File reads stay within the selected root, including symlink resolution. Public HTTP(S) fetching rejects private network addresses at URL validation and socket resolution, and rechecks redirects.

Default limits: 500 discovered documents, eight remote link hops, five redirects, a 15-second fetch deadline, 5 MB per Markdown document, 15 MB per image, and 60 MB of source/asset content per snapshot. Remote resources are cached; saved plans preserve the preview/export snapshot. Fonts are platform dependent; install a Korean font on machines without one.

## Verification

```powershell
npm run build
npm test
npm run test:acceptance
npm run test:ui
npm run test:remote
```

`test:acceptance` uses deterministic remote fixture content and writes both PDFs and a saved plan under `output/acceptance`. It verifies final page references for every internal link. `test:ui` uses that plan and the production build to exercise selection, sections, preview, and HTTP export. `test:remote` separately checks a real public Markdown fetch, cache readback, and private-URL rejection.

Core modules live in `src/core`; `src/cli.ts` and `src/server.ts` expose them to command-line and editor workflows. The UI is React/React Flow; rendering uses Markdown-it, KaTeX, Mermaid, Puppeteer, and pdf-lib.

## Project direction

The private source repository is [pianojay/ordv](https://github.com/pianojay/ordv). `npm run ordv -- ...` and the existing `npm run packet -- ...` invoke the same CLI. The original pitch in `docs/motive.md` remains archived unchanged.

- [Product framing and real-workspace audit](docs/product-framing-audit.md)
- [Agent integration implementation plan](docs/agent-integration-plan.md)
- [Style licensing and attribution review](docs/style-licensing.md)
- [Reliability findings beyond page layout](docs/reliability-audit.md)

Agent skill/MCP/plugin integrations are planned. The standalone VS Code styling preset is available by default. Follow-up work is tracked in [GitHub issues](https://github.com/pianojay/ordv/issues). The four original core defects have regression fixes; broader discovery, packaging, and reading controls remain separate work. Imported private lessons and generated PDFs are excluded from Git.

## Default reading style

The standalone default uses pinned VS Code and yzane Markdown PDF CSS, with the original highlight.js theme. Full third-party notices accompany the source and rendered HTML. See [licensing and compatibility](docs/style-licensing.md) for print-setting differences and redistribution requirements. Run `npm run test:style` for the layout fixture.

## Running headers and page numbers

The default print profile uses yzane’s declared A4 portrait settings: 15 mm top and 10 mm other paper margins, filename/UTC export-date headers, and packet-wide page numbers. The editor and CLI also support document-relative or combined numbering, custom margins, and explicitly supplied source-creation dates. See [marginals and print settings](docs/marginals.md) for options and provenance rules. Verify both modes with `npm run test:marginals` (Chromium and Poppler required).
