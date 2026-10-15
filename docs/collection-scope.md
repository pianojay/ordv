# Collection scope and editorial metadata

`ordv discover notes/sub/head.md --root notes --origin-root ssh://host/home/user/notes -o plan.json`

The authorized root is explicit. Its default is the supplied folder or the head's parent; choosing a head never expands it. A directory input scans that directory; links can reach other documents within the authorized root. Real-path checks also reject escaping symlinks. GitHub `blob` URLs, including line fragments, remain web references; use raw public Markdown URLs for import.

Each newly captured document records its canonical identity, import location, original location, capture time, remote fetch time and cache status. Original roots for transferred files are user-provided claims, not independently verified SSH metadata. Older snapshots retain unknown provenance rather than inventing it.

Role (`chapter`, `prerequisite`, `related`, `evidence`, `historical`, `mirror`) and source status (`unreviewed`, `current`, `historical`, `superseded`) are editorial metadata. They do not silently include or exclude documents. The reading tree is the sole selection/order authority. Set these in the graph inspector, or use `ordv edit plan.json --role ID=evidence --exclude ID -o edited.json`. Supersession notes print with the source; original claims remain intact.

`ordv check plan.json` emits records with stable `code`, `severity`, `message`, and optional `documentId`/`href`. It exits nonzero for errors. Codes distinguish scope exclusions, traversal/document limits, unavailable sources/targets/assets, omitted documents, broken anchors, invalid math, unknown provenance, stale capture age, and superseded sources. UI notices use the same records. Snapshot age is an advisory review interval, not a claim about the original document's modification time.

`--offline` permits only cached remote resources. `--refresh` fetches again explicitly. Saved-plan export never fetches source documents or assets. Editor Refresh and `ordv edit plan.json --refresh -o refreshed.json` retain the tree, roles, statuses, dates, and export settings; previously selected sources are rechecked even when no longer linked; unreadable or removed sources remain unavailable placeholders and block export if selected. Review the result before replacing the saved edition.
