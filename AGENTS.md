# Development workflow

These rules govern development of ordv, not how end users author Markdown or
generate reading editions.

## Required order

GitHub issue -> issue branch -> pull request -> independent decision -> merge.

- Identify the issue before making development changes. If none exists, create
  a focused issue first, or obtain an explicit user-requested exception.
- Start an issue branch from current `origin/main`, normally named
  `codex/issue-<number>-<short-description>`. Reuse the existing issue branch and
  PR when continuing its work. Do not commit development changes directly to main.
- Do not create branches outside this pipeline unless the user explicitly
  requests an exception. Read-only investigation needs no branch or PR.
- Keep each PR focused on its issue. Combining issues requires explicit user
  direction. Preserve unrelated work in the shared checkout.
- Validate the change, push the issue branch, and open a PR targeting main.
  Reference the issue and state the resulting behavior, validation performed,
  and remaining risks or acceptance checks.

## Independent merge decision

- The implementing agent must not authorize its own PR for merge.
- The user or a separate reviewing agent may authorize merging after inspecting
  the current PR diff, validation evidence, and remaining risks. A separate
  reviewer must make its own decision; the author's self-review is insufficient.
- Record the reviewer identity, reviewed commit SHA, decision, and rationale on
  the PR. A review requesting changes is not merge authorization.
- Passing automated checks, opening or pushing a PR, and a request to implement
  or fix an issue do not authorize merging. Do not enable auto-merge or enqueue
  a merge before independent authorization.
- The reviewer may merge an approved PR or explicitly delegate execution to the
  implementing agent. Authorization applies to the reviewed commit; subsequent
  changes require a renewed independent decision before merging.
- Without that authorization, stop at the PR and report its link and outstanding
  checks. Distinguish implemented, validated, PR opened, and merged.

## Validation

- Use the commands in `package.json` appropriate to the change. For code changes,
  run `npm test` and `npm run build`; run relevant PDF/UI acceptance scripts when
  rendering or editor behavior changes. Report checks that could not run.
- Documentation-only changes need content review and `git diff --check`; no
  application tests are required.
- Keep private imported documents, generated PDFs, and local audit files out of
  commits. Do not claim reader-device validation from PDF generation alone.
