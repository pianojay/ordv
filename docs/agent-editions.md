# Compact local edition operations

`ordv agent <operation> --request <file>` accepts compact JSON. Use `--request -`
for stdin. The compiled CLI also works as `node <package>/dist/cli.js` from any
working directory. Existing `discover`, `edit`, `check`, `export`, and `open`
commands keep their existing interfaces.

Each operation writes one JSON result to stdout. Failure sets a nonzero exit code.
Errors use `{ "ok": false, "status": "error", "operation": "...",
"error": { "code": "...", "message": "..." }, "diagnostics": [...] }`.
Success uses `ok:true` and an operation-specific status. Diagnostic records carry
`code`, `severity`, `message`, `stage`, and source/reference fields when available.
Operational logs belong on stderr. Requests are limited to 1 MB.

## Handles, roots, and revisions

The absolute saved-plan path is the persistent handle. The saved plan is also the
edition manifest, not a second state store. A revision is SHA-256 of the entire
saved JSON file, including tree, title, settings, and whitespace. There is no
registry or daemon. GUI edits therefore invalidate a previously captured revision.

Every request supplies absolute `sourceRoot` and `outputRoot`, both existing
directories. Plan and artifact paths are absolute or relative to `outputRoot`.
Local heads, includes, and document selections are relative to the source root.
Paths must stay inside their authorized root after symlink/junction resolution.
Saved plans require `.json`, previews `.html`, and exports `.pdf`. An output
cannot replace a captured source, asset, or local reference, including aliases.
The API reads saved snapshots even if original files have been removed. Existing
source symlinks that now escape the root are rejected.

Create, preview, and export require `expectedRevision`. A mismatch returns
`STALE_REVISION`. `inspect` may omit it to read the current revision and metadata.
Inspect does not refresh sources. Rediscovery is an explicit operation that saves
a new collection. Replacing any output requires `overwrite:true`; the default is
false. Temporary writes and per-destination locks protect output publication.
The boundary checks assume other local processes do not maliciously replace
directories during an operation.

## Discover

```json
{
  "sourceRoot":"/work/notes",
  "outputRoot":"/work/editions",
  "planPath":"collection.json",
  "include":["chapters/*.md", "overview.md"],
  "allowRemote":false,
  "offset":0,
  "limit":50
}
```

`head` is optional. Without a head or includes, discovery scans the directory.
Includes use Node's built-in glob syntax and choose starting files; linked local
Markdown remains discoverable within the root. An explicit head is also a seed.
Remote Markdown and remote images require `allowRemote:true`, even if cached.
Remote URLs use the existing public-address checks. Export and preview never fetch.

The result contains `planPath`, `revision`, document IDs, paths, titles, headings,
links, availability, and candidate heads. No document body or asset base64 is
returned. Discovery keeps the full snapshots in the saved plan.

Metadata pages default to 50 documents and allow 1–100. `nextOffset` identifies
the next page. Each document returns at most 50 headings and 50 links, with total
counts. Candidate heads are limited to 20. Long metadata strings are clipped to
1,024 characters. `pathTruncated` identifies clipped paths; document IDs remain
usable for selection. Use the saved source path to read a document when necessary.

## Create

```json
{
  "sourceRoot":"/work/notes",
  "outputRoot":"/work/editions",
  "planPath":"collection.json",
  "expectedRevision":"<revision from discover>",
  "outputPlanPath":"study.json",
  "title":"Study edition",
  "selection":[
    {"document":"results.md"},
    {"section":"Foundations","children":[
      {"document":"overview.md"},
      {"section":"Method","children":[{"document":"chapters/method.md"}]}
    ]}
  ],
  "settings":{"tocDepth":2}
}
```

`document` accepts a discovered ID, source path, or captured URL. Section nodes
contain a name and nonempty `children`. Documents may appear once. Empty,
unavailable, unknown, ambiguous, and excessively deep selections fail. The exact
preorder is retained. Unselected documents remain snapshots available to the GUI,
but are not printed. Source prose is unchanged.

`settings` accepts the existing print-settings fields. Omitted fields preserve the
collection's defaults. `readingProfile` applies its margins before explicit
settings overrides. Running headers remain enabled by default. The title appears
on the contents page. The result returns the new plan's revision, `manifestPath`,
settings, order, TOC outline, and preflight diagnostics.

## Inspect, preview, and export

Inspect accepts roots, `planPath`, optional `expectedRevision`, `offset`, and
`limit`. It returns the current revision and bounded metadata without changing
the plan. Order and TOC are bounded to 500 entries and include total counts.
Diagnostics are bounded to 100 with `diagnosticCount` and `diagnosticsTruncated`.

Preview and export accept the same render request:

```json
{
  "sourceRoot":"/work/notes",
  "outputRoot":"/work/editions",
  "planPath":"study.json",
  "expectedRevision":"<revision from create>",
  "outputPath":"study.pdf",
  "overwrite":false
}
```

For preview, choose an `.html` output path. Preview validates the PDF render path
and then publishes self-contained HTML. Its page count describes the validated
PDF, not browser-window pagination. Export publishes PDF and returns `pdfPath`
and `pageCount`; preview returns `previewPath` and `pageCount`. Both return the
same saved-plan `manifestPath`, revision, settings, order, and diagnostics.

`browser` is an optional Chrome/Edge/Chromium executable override. Missing
renderers return `RENDERER_UNAVAILABLE`, malformed diagrams `DIAGRAM_INVALID`,
and other renderer failures `RENDER_FAILED`. Invalid math and unavailable selected
snapshots block publication. Missing images retain the shared core's warning
severity; corrupted embedded images fail during rendering. No partial artifact
is published on failure or cancellation. SIGINT/SIGTERM cancel the CLI operation.

## Shared API and packaged skill

`ordv/editions` exports `discoverCollection`, `createEdition`, `inspectEdition`,
`previewEdition`, and `exportEdition`. These functions throw on failure.
`runEditionOperation(operation, request, {signal})` returns the same success/error
envelope as the CLI. The rendering operations accept cancellation signals.

The npm tarball includes `skills/ordv-reading/SKILL.md` and its thin CLI wrapper.
An agent can read that skill in the installed package and invoke its wrapper
without changing host configuration. If a host requires copying the skill into
a discoverable skill directory, do so only when requested, and set `ORDV_CLI` to
the installed compiled CLI. This repository does not install global skills,
hooks, plugin manifests, or MCP servers. Host registration/lifecycle acceptance
and cross-client parity remain separate work.
