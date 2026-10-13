# Markdown Reading Packet

A local editor and CLI for turning a Markdown link graph into a printable reading packet. Start with a head document or a folder, review the suggested tree, choose documents and reading order, and export a PDF.

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

The renderer supports tables, task lists, highlighted code, raster/SVG images, Korean text through system fonts, KaTeX formulas, and Mermaid diagrams. It uses `vscode-markdown-pdf` as a feature reference; neither VS Code nor Obsidian is required.

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

Version-1 JSON plans contain the selected root/input/head, document content and hashes, link graph, heading metadata, image snapshots, editable tree, ranked heads, and print settings. Treat saved plans as copies of your source material. CLI and UI validate the same schema and export without rereading source documents or fetching network assets.

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
