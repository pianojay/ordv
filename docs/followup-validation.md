# Scoped follow-up validation (#7, #8, #9)

Validated on 16 October 2026 (Asia/Seoul). No other issues are included in this change.

## Discovery (#7)

Explicit root/head separation, GitHub blob line references, original-location identity distinct from import location, capture/cache provenance, diagnostic codes/severity, role/status controls, age review, and order-preserving refresh are implemented. Selected sources are rechecked even if their original incoming link disappears. Unit and UI saved-plan tests pass. CLI and UI use the same snapshot/tree validation.

## Runtime (#8)

Windows: a tarball was installed with production dependencies only into an unrelated temporary directory. The installed CLI and packaged UI/assets work outside repo cwd. Both PDF modes export after deleting the original source files. Overwrite refusal, explicit replacement, invalid browser overrides, competing API requests, and cancellation cleanup pass. The filesystem tests cover failed rendering, cancellation, a competing writer, and a destination created by another program during rendering. All 41 unit tests pass outside the Windows sandbox, which disallows hard links.

Linux: a production npm installation on keos (Node 24.21.0 from its user-local VS Code server) passes installed CLI startup, discovery, snapshot/diagnostic readback, and missing-browser errors. Browser download on that host failed Google-storage DNS resolution. A transferred Chrome headless shell reaches startup but the host rejects its sandbox; no host security settings were changed. On vilab204 (Ubuntu 22.04.5, Node 24.21.0), a fresh production npm install and installed `ordv` bin run outside the repo pass. Both PDF modes export after deleting sources, using an isolated Chrome headless shell 148.0.7778.97 with sandboxing enabled. Overwrite refusal/replacement and browser overrides/errors also pass. All temporary installation/browser directories were removed by the validation script. This establishes Linux runtime/PDF operation on that host, while keos still requires administrator-side sandbox configuration.

The browser launcher retains sandboxing and gives a specific configuration error for sandbox denial. Full preset notices remain in packaged assets and standalone HTML.

## Reading (#9)

Build, 41 unit tests, UI saved-plan/export acceptance, core PDF acceptance, and all existing marginal/header/reference comparisons pass. The public substantial four-document fixture passes both modes with preserve/expand/appendix answer policies: 13–17 pages, four landscape pages each, and 28–48 validated internal links. Tests distinguish hidden-answer references from printed destinations and avoid generated appendix-anchor collisions.

The already approved private four-lesson corpus passes with tablet margins and readable figures: book 52 pages/52 validated internal links; per-document 54 pages/54 links. Its 39 notices are 32 retained GitHub web references, six scope exclusions, and one unavailable target. Sources and PDFs remain ignored. Representative final text/table/math and landscape detail pages were rendered with Poppler and inspected for legibility and placement. Readable diagrams add an overview and detail pages, so this opt-in profile deliberately produces a longer edition than portrait fitting.

Actual Goodnotes/iPad import, annotation persistence/export, and physical duplex-print/binding checks remain unverified. Keep #9 open for that reader-side acceptance; PDF generation and visual inspection do not substitute for it. See `docs/reading.md` for the device checklist.
