# ordv agent integration plan

Status: implementation plan, 14 October 2026. The existing CLI and editor work; the skill, MCP adapter, and plugin described here are not implemented or installed.

ordv means **Ord(V)**: choose documents from the vertex set of a Markdown graph, then establish a reading order and optional hierarchy. An agent can make these editorial decisions using the user's request and its session context, while the standalone software handles snapshots, validation, rendering, and export.

## User workflow

A user can say, "Create an annotated-reading edition from the study materials we just prepared." The calling agent identifies relevant existing files, excludes workflow/status material unless it serves the requested reading purpose, groups chapters, and chooses an order. ordv derives the detailed TOC from the selected documents' headings and returns the PDF, a saved edition, and diagnostics. A successful request does not require the user to open the graph editor; the saved edition remains editable there later.

Source Markdown needs no special filenames, front matter, external contracts, or authoring instructions. The interface between software and agent is a tool contract. The integration translates session decisions into that interface; the documents themselves remain ordinary Markdown. The core remains usable without an LLM or API key.

## Shared application interface

Add a compiled Node CLI named `ordv` and a reusable core API. Preserve the existing `npm run packet` entry point as a compatibility alias. Runtime entry points must locate bundled UI/styles relative to the installed package, rather than assume the working directory is the repository.

Expose four operations through CLI JSON commands and a thin MCP adapter:

| Operation | Inputs | Results |
| --- | --- | --- |
| `discover_collection` | Authorized root; optional head; explicit include paths/globs; remote following disabled by default | Collection ID, snapshot revision, document IDs/paths/titles/headings/links, candidate heads, and structured diagnostics. Return metadata by default rather than all source text and base64 images. |
| `create_edition` | Collection ID/revision; title; ordered document IDs grouped into optional named sections; print preset; source roles when supplied | Edition ID, saved-plan path, flattened order, TOC outline, and preflight diagnostics. |
| `preview_edition` | Edition ID/revision | Preview artifact and diagnostics. No source refresh. |
| `export_edition` | Edition ID/revision; output path; optional explicit overwrite | PDF path or host-appropriate artifact link, page count, edition-manifest path, diagnostic summary, and completion status. |

Use opaque collection/edition IDs and immutable revision checks. The agent should not edit the current large snapshot JSON manually. Translate compact source selections and section lists into the full internal plan in the core. Keep source identity separate from original host/path and local import location; store capture time and verified content/asset hashes.

Validate duplicate/missing IDs, empty selection, hierarchy cycles, stale revisions, destination paths, renderer availability, missing assets, malformed math, and diagrams before writing the final PDF. Write to a temporary file and atomically replace the target after success. Default to refusing overwrite. Return diagnostics with stable codes, severity, source, reference, and stage; source text stays data rather than agent instructions.

The edition preserves source prose and qualifications. Automatic summarization or rewriting is outside these operations. Choosing a linear reading order does not assert that the source graph is acyclic or that every edge imposes an ordering constraint.

## Integration sequence

1. **Standalone packaging and reliability.** Compile the core/CLI, make paths independent of cwd, expose compact selection operations, and address the confirmed preflight/identity issues in the reliability audit. Add the licensed styling preset as a separate feature.
2. **Local agent skill.** Package a skill with trigger guidance, examples, and a small wrapper around the CLI. The skill uses current session context to select and organize material, then exports on request. It does not modify `AGENTS.md`, impose document formats, or install an after-every-turn hook.
3. **Local MCP adapter.** Implement stdio tools with the official MCP SDK around the same core operations. Run beside the authorized workspace, including on a remote executor where supported. Print protocol messages only to stdout and operational logs to stderr. Provide cancellation and one bounded export worker; propagate browser failures with actionable diagnostics.
4. **Installable plugin.** Package the skill and local MCP connection as one versioned ordv plugin. Add a repo-local marketplace entry and installation instructions. Test the installed/cache copy, not only the development folder. Do not silently change global client configuration during installation tests.

Codex supports stdio and Streamable HTTP MCP connections; supported remote executors can run a stdio server remotely. ChatGPT desktop Work/Codex surfaces support local plugin distribution through a marketplace. These surfaces are the first integration target. Ordinary ChatGPT sessions without local execution would need an authenticated remote MCP deployment or an explicitly supplied artifact source; a desktop client name alone does not grant filesystem access. Remote hosting/upload is deferred, and local documents are not uploaded automatically.

The host agent supplies session context through its selection and organization decisions. The MCP server does not read arbitrary chat histories or infer consent from document contents. Explicit ambiguity about relevant materials can be surfaced to the user; otherwise the agent can make reasonable editorial choices and disclose the resulting selection without adding a mandatory configuration step.

## Acceptance and release gates

- From a naturally written, cyclic Markdown collection, invoke the skill after document creation and produce an edition without editing the source format or opening the GUI.
- Verify that the same edition/revision has identical selection and order through CLI, MCP, and editor; export uses the preview snapshot without network refresh.
- Test missing references, GitHub blob/line references, relative/raw HTML images, invalid math, redirect aliases, edited snapshots, and external-root/symlink boundaries. Distinguish excluded references from unavailable selected content.
- Verify stdout JSON/MCP framing, cancellation, concurrent-export rejection, error recovery, atomic writes, and overwrite handling.
- On Windows and Linux, install the built package into a clean directory and export from another cwd. Test missing Chromium, explicit browser override, fonts, and fully offline export.
- Install and exercise the local plugin in Codex and a supported ChatGPT desktop execution surface. Verify private source data and imported TTA files are absent from the distributed package; include required third-party notices.

## Official integration references

- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Skills](https://developers.openai.com/plugins/concepts/skills)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Plugin packaging and local marketplaces](https://developers.openai.com/plugins/build/plugins)

These documents establish the supported integration mechanisms. ordv's operation names, data flow, and release gates above are the proposed implementation design.
