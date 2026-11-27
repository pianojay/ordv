# Reading editions and reader validation

The PDF is a rendition of the saved source snapshot. It does not summarize or rewrite qualifications, historical claims, or evidence. New editions show original source location (including user-supplied transfer provenance), capture time, editorial role, and review status. Superseded sources receive a visible note while retaining the original content. Source heading levels remain unchanged beneath section breadcrumbs.

The default contents page lists sections and documents. `tocDepth: 1..6` adds source headings through that level; `0` keeps a concise reading TOC. The relationship graph is a separate optional page and never determines reading order. Both modes preserve final destinations across portrait/landscape pages.

Choose a reading profile in the editor or `--profile` on export:

- `standard`: the licensed upstream-style profile, 15/10/10/10 mm paper margins.
- `tablet`: 18/40/18/15 mm, leaving a deliberate right annotation column.
- `duplex`: 18/25/20/25 mm, symmetric side space for notes and binding on either side. This does not insert blank recto pages or depend on a printer's duplex setting; choose long-edge duplex in the reader/print dialog.

Profiles set editable margins; selecting one reapplies its defaults. Margins exclude upstream body padding. Per-document uniform overrides take precedence in per-document mode, including its landscape figure pages.

Folded-answer policies apply to sanitized HTML `details` blocks without modifying the stored Markdown:

- `preserve`: retain source open/closed state, with an explicit note that closed content is absent from the printed PDF. PDF readers cannot expand a closed HTML disclosure. Links to headings inside closed answers are reported; expand or append answers for a complete printed edition.
- `expand`: print all disclosures inline, including nested ones.
- `appendix`: replace each top-level disclosure with a numbered link and move its content, with nested disclosures expanded, to an answer appendix at the end of that source. Return links lead back to the question. Each source's page range includes its appendix in both PDF modes.

`figures: fit` retains portrait fitting. `figures: readable` compares portrait and landscape frames and places oversized Mermaid diagrams and images on the best fitting dedicated pages. A readable single page is preferred. Diagrams get an overview plus vector tiles only when neither orientation can preserve 12 CSS pixels (9 pt) labels. Detail tiles use evenly distributed windows with 10% overlap and captions identifying adjacent rows/columns where cropped connections continue. Tile coordinates preserve the original layout; diagrams are not rewritten. More than 24 tiles for one diagram fails clearly rather than producing an unreadable edition. Image text has no semantic size information, so images get a larger dedicated page but cannot receive the same label-size guarantee. Recheck diagrams that use unusual SVG transforms/fonts.

```sh
ordv export plan.json -o study.pdf --profile tablet --answers appendix --figures readable --toc-depth 0
```

`npm run test:reading` checks public substantial multi-document fixtures in both modes with all answer policies, source qualifications, Korean/math/tables, mixed page sizes, and valid link destinations. When the already approved four-lesson private TTA corpus is present under ignored `output/audit/tta-study`, it also validates both modes against those sources. Private materials and generated PDFs must remain ignored. Poppler page renders are used for visual review.

PDF creation and link validation are distinct from reader usability. The remaining device acceptance is: import an edition into the actual target reader (e.g. Goodnotes on iPad), follow TOC/cross-links, annotate portrait and landscape pages, close/reopen, export the annotated copy, and verify retained notes/page order. For paper, print representative duplex pages to inspect binding and writing space. Record app/device/version and the observed result; do not label a generated PDF as a passed device test. No Goodnotes import, annotation round trip, or physical-print acceptance has been claimed by the automated suite.

Tables wrap long identifiers while retaining minimum cell width. Before PDF printing, ordinary content is checked in print media at the selected paper's printable width. Unresolvable overflow fails clearly instead of silently shrinking the packet. `npm run test:layout` checks actual emitted glyph sizes and figure pages (requires Python with pdfplumber; set `ORDV_TEST_PYTHON` if it is not the default Python).
