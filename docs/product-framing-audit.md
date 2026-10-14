# Reading editions for agent workspaces

Audit date: 14 October 2026, Asia/Seoul.

The project helps a person read and annotate a structured collection of agent artifacts on a tablet or on paper. Its main object is a **reading edition**: a selected, ordered, dated view of a workspace, with its sources and important relationships preserved. PDF is the delivery format for that edition.

The primary workflow is to choose a reading purpose, select material from the workspace, arrange it into a coherent edition, inspect its pagination, and export it for reading and annotation. The existing Markdown graph and saved reading plan are useful foundations for this workflow.

## Collections and reading needs

The audit used live SSH inventories, document-shape summaries, and targeted index and lesson reads. The counts below describe the folders actually inspected; the audit did not transfer private backup or workflow records. Link and markup counts from remote summaries are descriptive, not a complete link-validity test.

| Collection | Observed structure | Suitable reading edition |
| --- | --- | --- |
| `keos:~/keos/jw_docs/study/` | 48 Markdown files: a shared index, Rust appendix, template, and five project packs. Each pack has an overview, six numbered chapters, an implementation map, and checkpoints. Across the study subtree, 15 Mermaid fences and 83 folded-answer blocks occur. | A project study workbook, with prerequisites as optional background, chapters in their declared order, implementation evidence in an appendix, and an explicit answer policy. |
| `vilab204:~/jw_tta/docs/study/` | 10 Markdown files. The dated overview links concepts, CRISP, TTA-COPE, FoundationPose/Event6D, experiments, and later discussion. Separate consolidated Notion drafts overlap the individual lessons. | Either a concepts-to-mechanisms lesson collection or a chronological research record. Combining every draft and mirror would duplicate substantial material. |
| `vilab204:~/jw_soflow/FastGen-SoFlow/docs/` | 20 Markdown files and one existing training-observations PDF. Theory, integration, fixed protocols, results, status, and a research log coexist. The originally suggested `~/jw_soflow/docs/` does not exist. | An audit edition linking rationale, the later implementation contract, the frozen protocol, and completed results. The AYF-inspired adversarial work needs its historical and superseding statements preserved. |

The KeOS root README is primarily a workflow index and lists many filenames in backticks. The study index is the useful curriculum entry point. A root README filename alone therefore cannot determine the right head for a human reading task.

The Project 3 overview links prerequisites before its numbered chapter list. It also links implementation evidence, source code, and workflow state. Those links have different purposes: their appearance order does not by itself establish chapter order, and following them all would widen the packet beyond a single project.

The TTA overview explicitly distinguishes assistant-prepared lessons from completed personal study. Its consolidated Notion draft contains exported HTML tables and custom date markup. An edition must preserve substantive claims while handling these export-specific forms clearly.

The SoFlow integration note explicitly supersedes some architecture and recipe recommendations in the preserved theory report. The completed pilot report qualifies its result and retains the protocol. A reading edition should make that relationship visible while keeping the historical documents intact.

## Product objects

**Collection:** the source workspace, including Markdown, evidence references, figures, code references, and prior document versions. A snapshot should preserve original host/path, source hash, and capture time. Transferring a file to Windows must not make the Windows import path its only provenance.

**Reading edition:** a human-reviewed selection with a purpose, scope, reading hierarchy, and source snapshot. A person can create several editions from the same collection: study, review, or chronological record. Documents and links should be distinguishable as chapters, prerequisites, related reading, evidence, or historical material. Automatic role suggestions need review; they should not silently turn references into chapters.

**PDF:** a paginated rendition of the reading edition, designed for tablet annotation or physical print. The document tree guides reading order; the graph remains useful for choosing scope and showing relationships. PDF export must retain qualifications, equations, citations, and the difference between proposed and completed work.

Goodnotes is a target reading and annotation destination. This audit generated and inspected a standard PDF; it did not test a Goodnotes import or annotation round trip.

## Real corpus test

With explicit user approval, four educational TTA lessons were copied into ignored `output/audit/tta-study/`: concepts, CRISP, TTA-COPE, and FoundationPose/Event6D. Their Markdown contents were retained. A reading plan placed them in that order beneath one named section and displayed their original `vilab204` source paths.

The current product generated `output/audit/tta-study-reading-edition.pdf`: **29 A4 pages, 90 validated internal destinations, and seven rendered Mermaid diagrams**. A contact sheet covered all pages; full-page checks examined representative equations, tables, and diagrams. Source caveats remained present. References to experiments and other documents outside the approved four lessons were retained as references and reported as unavailable in this limited import.

The test establishes that the existing renderer handles a substantial real lesson collection. It also shows why a successful PDF conversion is only part of the reading-edition problem:

- The detailed TOC spills onto a mostly empty second page. A concise chapter/section TOC and a separate detailed outline would be more useful.
- Printed navigation has no page numbers, running chapter label, or edition metadata. Clickable destinations help digital reading but do not provide paper navigation.
- Some horizontal diagrams shrink to small labels when fitted into portrait pages. Large figures need a readable page layout or a landscape figure page.
- A short trailing paragraph occupies its own page. Pagination needs control over paragraphs, heading groups, and document boundaries.
- Annotation space is incidental to the current margins. Tablet and duplex-print profiles should provide deliberate writing space and binding allowance.
- KeOS checkpoint answers need a deliberate print policy. The current sanitizer removes `details`/`summary` structure, so hiding, expanding, or moving answers into an appendix is not an implemented edition option.

## Recommended next iteration

First, make purpose and scope explicit when creating an edition. Let the user choose a study collection, an audit trail, or a chronological record; select a head and show suggested chapter order separately from prerequisites and evidence. Manual correction remains essential.

Second, add tablet and print layouts with page numbers, a concise TOC, running headings, edition date/source metadata, annotation margins, and readable figures. Validate these against the four-lesson TTA packet before increasing input-format coverage.

Third, preserve document roles and history. Support explicit prerequisite/evidence inclusion, folded-answer treatment, overlap warnings for consolidated mirrors, and visible supersession notes. These are editorial controls over source artifacts; automatic summarization or rewriting should be a separate, explicit operation.

The existing graph editor can remain the selection workbench. The first product success criterion should be: **a researcher can turn an agent workspace into a trustworthy edition that is comfortable to read, navigate, and annotate away from the development environment.**

## Naming direction

The user selected **ordv**, from **Ord(V)**, on 14 October 2026. It describes selecting vertices from a Markdown document graph and establishing a reading order. The earlier Readweave/Orvertex suggestions remain part of the naming discussion; the current project name is ordv. The descriptor is **Reading editions for agent workspaces**.

Suggested pitch: *Turn an agent's working documents into a coherent reading edition for your tablet or printer, preserving sources, relationships, and evidence.*

The name is selected; the next-iteration edition controls remain recommendations. The later naming change updates the application's identity without implementing those controls.
