# Default reading preset: licensing and compatibility

Audited 14 October 2026 for issue #1. ordv now uses a standalone default preset adapted from VS Code and yzane's Markdown PDF extension. VS Code does not need to be installed.

## Pinned assets and permission

The two Markdown CSS files are unmodified copies from [yzane/vscode-markdown-pdf 2.2.0](https://github.com/yzane/vscode-markdown-pdf/tree/37bee5a16aa63773c3081b23e607248fcb2c8be8/styles), commit `37bee5a16aa63773c3081b23e607248fcb2c8be8`. Their SHA256 digests, the Microsoft license revision, and the selected theme version are recorded in [the asset manifest](../assets/styles/vscode/manifest.json).

- `markdown.css` retains its Microsoft copyright header and is accompanied by the full [Microsoft MIT license](../assets/styles/vscode/LICENSE-microsoft.txt).
- `markdown-pdf.css` is accompanied by the full [yzane MIT license](../assets/styles/vscode/LICENSE-yzane.txt).
- `highlight-default.css` is copied from highlight.js 11.12.0, with its theme header and full [BSD 3-Clause license](../assets/styles/vscode/LICENSE-highlightjs.txt). This verified dependency theme is the issue's allowed alternative to the extension's Tomorrow theme. We do not redistribute that Tomorrow file or claim its asset-level provenance is settled.

The MIT grants allow copying, modification, and commercial redistribution when their copyright and permission notices accompany copies or substantial portions. They do not require a visible credit banner in generated PDFs. The BSD text also requires its conditions and disclaimer in source and binary distributions and forbids implied endorsement. Copying these styles without retaining the applicable notices would not satisfy those conditions.

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) contains the complete applicable texts. The source asset directory includes individual licenses. Standalone rendered HTML includes the full notices in CSS comments. CSS-only extraction must retain those comments or supply the notices alongside the CSS. A PDF contains the rendered appearance rather than these CSS source files; ordv's application distribution still carries the notices. This audit covers these stylesheet assets, not unrelated logos, fonts, or a complete extension redistribution, and does not assign a license to ordv's own code.

## Verified cascade and deliberate differences

Upstream's 2.2.0 `buildStyleTags` applies `markdown.css`, the selected highlight theme, then `markdown-pdf.css`. ordv follows that order, then adds narrowly scoped reading-packet structure and print-safety rules. It retains the 14px body, 22px line height, normal-weight ruled H1, 23px code padding, #f8f8f8 code background, 5px quotation border, and upstream inline-code color. Korean fallback fonts are added; math, Mermaid, source labels, TOC, and source page breaks remain ordv features. The original default theme changes syntax colors from Tomorrow, so this is a compatibility preset rather than a pixel-identical extension clone.

The extension's defaults are A4 portrait, scale 1, background printing enabled, top margin 15mm and other margins 10mm, with a title/date header and current/total-page footer. ordv keeps its existing A4 portrait and background printing, **18mm margins and no running header/footer**. Per-document margin/font overrides still apply. This avoids adding a current-date/file-URL running header and restarting page counts in concatenated parts. Existing source labels are still printed. The preview has a screen-width constraint and padding; only print media uses the 12px upstream body padding. Do not infer print geometry from the screen preview. Future configurable running furniture belongs in reader-navigation issue #9.

## Distribution and verification

Run `npm test`, `npm run build`, and `npm run test:style`. The style tests hash-check pinned assets and verify notices/order. Browser acceptance checks computed print styles and generates A4 PDFs in both modes with Korean, tables, code, math, Mermaid, and cross-document links. Existing PDF acceptance verifies final internal destinations.

Run `npm pack --dry-run --json --ignore-scripts` when packaging. The package must include `assets/styles/vscode/`, `THIRD_PARTY_NOTICES.md`, and `src/core/style.ts`; the package-content test enforces those entries. Desktop/plugin packaging has not been implemented. Any future bundle must carry this asset directory and root notices or inline the same notices, and must apply the same package-content gate. The runtime fails clearly if required CSS/notices are absent instead of silently falling back to uncredited copies.
