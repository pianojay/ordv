# Print-layout regression validation: #20 and #21

Validated 19 November 2026 (Asia/Seoul). These related rendering issues share one PR on the representative #20 branch.

## Behavior

- Tables wrap long identifiers and retain a minimum cell width. Print media and the actual printable viewport are applied before measuring ordinary content. Unresolvable horizontal overflow fails before PDF printing rather than silently reducing the book's body text.
- Readable figures compare portrait and landscape frames using paper margins and caption/body allowance. A readable single page wins over tiling. The prior 550 px SVG cap is removed on dedicated figure pages.
- If both single-page fits fall below the 12 CSS px label threshold, detail windows cover the source with 10% overlap; they do not clamp the last tile into a near-duplicate. The overview retains context. Detail captions identify adjacent rows/columns, and outlines mark actual SVG crop boundaries. Content is centered in its page frame.

## Checks performed

- `npm test`: 44 tests passed; `npm run build` passed (existing bundle-size warning remains).
- `npm run test:layout`: both book and per-document modes preserve 10.5 pt glyphs in the unaffected chapter AND the table-bearing source. All eight long identifiers are recovered completely from the emitted PDF. Mixed page sizes are present. A 30-column table fails clearly before printing.
- Figure regressions measure emitted glyph sizes, orientation, page count, SVG tile coverage, and overlap: reported tall geometry 527.125 x 942 fits one portrait page; a wide fixture fits one landscape page; near-threshold wide and oversized tall fixtures each use an overview and two readable detail pages. Measured detail/single-page labels are at least 9 pt.
- Existing core PDF/image acceptance, substantial reading acceptance, marginal/header comparisons, and UI save/load/export acceptance passed. The approved private TTA corpus also exported in both modes with valid destinations.
- Re-exported actual saved incident snapshots using `src/core/export.ts`, without importing the ephemeral workaround helpers: KeOS 91 pages / 428 valid internal destinations; Week 4 13 pages / 40 valid destinations. Ordinary Segoe UI text is predominantly 10.5 pt in both. The previously fragmented KeOS tall figure is now one portrait figure. The larger Week 4 diagram still requires detail pages, now with bounded overlap and continuation cues.
- Poppler renders of representative table, portrait figure, and detail pages were visually inspected. Private snapshots, source material, and generated PDFs remain ignored.

## Limits for independent review

Tiling is geometric, not node-aware. Crop boundaries can still intersect nodes or feedback edges; the full overview, explicit adjacency captions, crop outlines, and overlapping source coverage are the continuity mechanism. The overview may have smaller labels; the single-page or detail views carry the readability threshold. Unusual SVG transforms or image text are not covered by a universal glyph-size guarantee. Large dedicated figures can leave unused space on the preceding page. These changes do not claim Goodnotes, physical-printer, or cross-platform reader validation. No upstream licensed CSS assets were edited.
## Independent-review repair, 28 November 2026

The first independent review of 43eb067 found a real regression: high-resolution image elements were assigned a fabricated label size and rejected by the diagram tile-count limit. Image layout now has an explicit absent label requirement. It chooses the best single-page fit and never promises or produces diagram detail tiles. Small images remain inline.

New regressions cover 6000 x 4000 and 4000 x 6000 raster images in book/per-document and readable/fit modes. They verify a single complete image, source dimensions, page orientation, image bounds/aspect ratio, rendered color at all four corners, and absence of detail-tile captions. The original base-versus-head probe now accepts one figure on both versions.

`npm test` passes 46 tests outside the Windows sandbox. `npm run build`, `npm run test:layout`, and `git diff --check` pass. A sandbox-only unit assertion compared differently cased temporary package paths; the same assertion passes outside the sandbox. No discovery code or tests were changed for that environment difference. A fresh independent merge decision must cover the repaired head.
