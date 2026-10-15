# Running headers, page numbers, and paper margins

The default print profile follows yzane Markdown PDF 2.2.0 at commit
`37bee5a16aa63773c3081b23e607248fcb2c8be8`: A4 portrait, scale 1, background
printing, 15 mm top paper margin, and 10 mm right/bottom/left paper margins.
The authoritative settings are in the [pinned upstream configuration schema](https://github.com/yzane/vscode-markdown-pdf/blob/37bee5a16aa63773c3081b23e607248fcb2c8be8/package.json).
The upstream CSS body padding and browser body margin remain separate from
these paper margins. Effective text coordinates are checked against a matched
reference rendered by the same Chromium version; they are not used to infer
the intended paper margins.

## Defaults and choices

Every source page, including continuation pages, has its Markdown filename at
the upper left and a UTC export date at the upper right. Only the filename is
shown, not a full local path or remote query string. Long names are truncated
with an ellipsis to avoid colliding with the date; system font fallback supports
Korean filenames. Existing in-body source labels remain part of the document.

The default centered footer is packet `current / total`. Packet totals include
all TOC and relationship-graph pages. Settings also offer:

- `document`: `Document current / total`, resetting at each source, including
  in book mode. Leading TOC/graph pages use `Navigation current / total`.
- `both`: `Document current / total · Packet current / total`; navigation pages
  replace `Document` with `Navigation`.
- `none`: omit page numbers. Running headers are controlled independently.

Navigation pages use `Navigation` in the header rather than claiming to belong
to a Markdown source. With `headerDate: "source-created"`, their date is blank.

## Creation dates and source provenance

`headerDate` can be `export` (the yzane default, UTC calendar date), `none`, or
`source-created`. The last option only uses explicitly supplied metadata:

```json
"sourceCreatedDate": {
  "date": "2026-10-01",
  "provenance": "user-provided"
}
```

This optional document field is editable source annotation, outside the digest
of parsed Markdown content. Local and remote sources follow the same rule.
Neither filesystem modification/birth time, HTTP Last-Modified, snapshot time,
nor export time is silently treated as the author's creation date. When a
source date is unavailable, the date is blank and diagnostics explain the
missing metadata. Dates must be valid ISO calendar dates; user-supplied dates
have no timezone conversion. One UTC timestamp is captured for each export so
all export-date headers in that packet agree.

## Settings, overrides, UI, and CLI

Saved-plan `settings` fields are:

```json
{
  "marginsMm": { "top": 15, "right": 10, "bottom": 10, "left": 10 },
  "runningHeader": true,
  "headerDate": "export",
  "pageNumbers": "packet"
}
```

Existing plans without these fields receive the new default profile on load.
An existing per-document `marginMm` remains an explicit uniform override in
per-document mode. Leaving that override blank uses the four profile margins;
editing font size no longer creates a hidden uniform-margin override. Book mode
uses the shared profile. Custom top/bottom margins must be at least 10 mm when
the corresponding header/footer is enabled; invalid combinations fail before
starting the browser, rather than allowing overlapping text.

The editor exposes margins, header date, running-header visibility, page-number
scope, and a creation-date field for the focused document. The HTML preview
shows source content; final pagination and running furniture appear in the PDF.
CLI exports use the same saved settings, with optional overrides:

```powershell
npm run ordv -- export reading-plan.json -o edition.pdf --mode book --page-numbers both --header-date source-created --margins 15,10,10,10 --source-date DOCUMENT_ID=2026-10-01
```

`--source-date` is repeatable. `--running-header` enables the header and
`--no-running-header` disables just the header;
`--page-numbers none` disables the footer. Paper format remains selectable as A4
or Letter, with A4 the compatibility default.

## Rendering and verification

Content is printed with the explicit profile and empty Chromium header/footer
templates. After PDF assembly, source-start destinations determine each source's
final page range. A transparent Chromium-rendered overlay supplies Unicode
headers and final counters. This preserves book composition, per-document styles,
and rebuilt internal links while avoiding prematurely restarted global counters.
Header/footer font size is 9 px, with the default 1 cm side insets and centered
footer. The overlay's placement includes Chromium's 1 px internal vertical inset,
verified against a reference in the same browser.

`npm run test:marginals` requires Chromium and Poppler (`pdftotext`, `pdftoppm`).
It verifies both modes and all four counter scopes on a public multi-page fixture,
TOC/graph navigation, source transitions, missing/user-provided dates, Unicode and
long filenames, Letter/no-navigation output, uniform overrides, final link
destinations, saved plans, and CLI equivalence. It compares body/header/footer
coordinates to upstream CSS plus independently specified declared print defaults,
and checks raster ink on first and continuation source pages. It is a controlled
compatibility reference, not a claim that a particular VS Code installation has
no user overrides. The browser version is printed in the test output.
