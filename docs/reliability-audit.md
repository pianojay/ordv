# Reliability audit beyond page layout

Audit date: 14 October 2026. These findings describe the current implementation; the proposed repairs are not implemented by this audit.

## TTA test outcome

The user-approved four-lesson export completed twice using Chromium outside the Windows sandbox. It produced 29 A4 pages, 90 internal link destinations pointing to pages in the assembled PDF, and seven rendered Mermaid diagrams. No fatal export or Mermaid error occurred in those runs.

It was **not an error-free end-to-end test**. The successful export returned eight diagnostics: one intentionally unfollowed GitHub Markdown reference and seven references to files outside the four-lesson import. Those seven represent six distinct omitted local targets, because the CRISP smoke record is referenced by two lessons. This is a bounded import, not evidence that the original workspace has broken links.

The workflow required explicit SSH transfer approval, manual copying, a script to choose the four lessons/order, and manual restoration of original host/path provenance. The initial browser launch was blocked by the local sandbox; the test used an authorized normal-permission process. Standard-PDF generation and inspection passed, but Goodnotes import/annotation, Linux installation, and remote-source browsing from the GUI were not tested.

The destination checks validate page references, not a user clicking every citation or a pixel-level assertion of every anchor coordinate. Generated source copies, PDFs, plans, and probe artifacts remain in ignored `output/` and are not part of the GitHub repository.

## Confirmed functional defects

Focused offline probes reproduced these four issues independently of the private TTA lessons:

| Priority | Finding | Reproduction | Required repair |
| --- | --- | --- | --- |
| P1 | Raw HTML images are not included in the asset snapshot and do not produce a missing-asset diagnostic. Their relative `src` survives sanitization, while offline printing cannot resolve it. | A Markdown file containing `<img src="figure.png" alt="Figure evidence">` yields an empty asset map and no warning. | Parse supported HTML image references into the same resolver/snapshot path as Markdown images; report unresolved or unsupported sources before export. |
| P1 | Invalid math can be rendered as a KaTeX error without export/preflight diagnostics. | A display formula using `\\notARealCommand{a}` produces `katex-error` markup while `diagnostics(plan)` is empty. | Collect math diagnostics with source locations; make the default export fail on invalid math, with an explicit option to retain literal source if requested. |
| P1 | Saved-plan validation does not check source-hash/content consistency or regenerate metadata after content edits. | Editing document content while retaining its old hash/headings passes `validatePlan`. | Define canonical snapshot hashes, validate content/assets, and distinguish intentional edits from the captured source. Stale headings/links must be reparsed or rejected. |
| P2 | Redirect aliases can duplicate a single canonical document in the reading tree. | Two linked Markdown URLs both redirect to the same final URL, but discovery creates two IDs and two selected documents. | Track final URL identity and redirect aliases, deduplicate before traversal/selection, and preserve requested URLs as provenance. |

These probes do not establish that the TTA PDF contains those four defects. Its inputs used Markdown links and valid formulas; the probes exercise additional supported or plausible input forms.

## Operational and integration limitations

- **Reference classification:** GitHub `blob/.../README.md#L189` is treated as importable Markdown even though the URL returns an HTML page and the fragment names a code-view line. In the TTA test traversal was disabled, so the warning records the limit rather than a failed fetch. Blob references need explicit web-reference handling or a deliberate raw-URL conversion with appropriate anchor treatment.
- **Source scope:** A file head sets the allowed root to that file's parent. A nested chapter cannot automatically include an otherwise legitimate sibling prerequisite outside that directory. Discovery needs separate authorized-root and head inputs; it must preserve root boundaries rather than silently widen them.
- **Reference diagnostics:** Intentional omissions, depth limits, missing files, and unresolved anchors currently appear as prose warnings. Stable codes and severity are needed so an agent can decide what blocks export and what remains a reference.
- **Snapshot provenance:** Source IDs derive from local absolute paths. Relocated files get new IDs, and the test displayed original host/path by editing `source`. Identity, local access location, and original provenance need separate fields.
- **Cached sources:** Cache reuse has no expiry or automatic revision comparison. Explicit refresh works, but an edition must visibly state its snapshot date and distinguish freshness from reproducibility.
- **Content boundaries:** The default folder scan ignores selected special directory names and dotfiles, but it does not implement repository ignore rules or infer which files are chapter material. Backtick filename mentions are not graph edges. Role selection and scope controls are needed before returning a collection to an agent.
- **Distribution:** The current build checks TypeScript and builds the UI; CLI execution still uses development `tsx`, and UI/static paths depend on cwd. A clean installed package and plugin need compiled entry points and package-relative asset paths.
- **Output persistence:** CLI export writes directly to its destination and can overwrite it. Atomic output and explicit overwrite behavior are release requirements for agent use.

## Existing protections and practical limits

The service has localhost binding and host/origin/token checks. Local source reads check the selected root and resolved symlinks. Public network fetching validates socket-resolved addresses and redirects and enforces size/time limits. Source HTML is sanitized; PDF printing blocks external fetches and uses embedded assets. Existing tests cover these core boundaries and common graph cases, but they are not a comprehensive security certification or a cross-platform release test.

Private source text in a future MCP integration must be treated as data. Collection metadata should be returned by default; the current full-plan JSON can include source content and base64 images and is too large for ordinary agent-tool responses. The agent supplies session-aware selection; document instructions must not expand filesystem/network scope.

## Release priorities

Before releasing an agent-facing adapter, repair image/math preflight and snapshot consistency, introduce explicit scope plus compact structured diagnostics, and implement compiled package paths with atomic output. Then validate the same saved edition through CLI, MCP, and GUI. Redirect identity, remote-reference normalization, cache freshness, and reader-side annotation tests should be part of the next acceptance corpus.
