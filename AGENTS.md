# Development workflow

These rules govern development of ordv, not how end users author Markdown or
generate reading editions.

## Choose the development path

### Path 1: issue-driven work

- Work undertaken to resolve a GitHub issue follows:
  issue post -> issue branch -> commits and validation -> PR -> independent
  decision -> merge. Identify the issue before starting its implementation.
- Start an issue branch from current `origin/main`, normally named
  `codex/issue-<number>-<short-description>`. Reuse the existing issue branch and
  PR when continuing its work. Do not resolve an issue by pushing directly to main.
- Keep each PR focused on its issue. Combining issues requires explicit user
  direction. Preserve unrelated work in the shared checkout.
- Validate the change, push the issue branch, and open a PR targeting main.
  Reference the issue and state the resulting behavior, validation performed,
  and remaining risks or acceptance checks.
- After the PR is actually merged, switch to its target branch (normally main)
  and update it from the remote before starting further work. Acceptance alone
  is not a completed merge. Preserve uncommitted or unrelated work when switching;
  never discard it to perform this step.

### Path 2: internal session work

- Changes that do not resolve a GitHub issue may be validated, committed on the
  current branch, and pushed directly, including when that branch is main.
  No issue, new branch, PR, or independent merge decision is required.
- Internal maintenance such as updating this AGENTS.md can use this path. Do not
  relabel issue-driven work as internal maintenance to bypass Path 1.
- Direct work stays within the purpose of the current branch. If it would add
  unrelated changes to an open issue PR, use an appropriate existing branch or
  ask before creating a separate branch; preserve unrelated checkout state.
- Do not create branches outside Path 1 unless the user explicitly requests it.
  Read-only investigation needs no branch or PR.
- Git tags may mark meaningful internal milestones when requested by the user;
  they are not required for routine changes and do not replace PR review for
  issue-driven work.

### Future reference: sector branches (not used in ordv)

A larger project could keep one long-lived branch per sector: merge the target
branch into it, open a separately reviewed PR for each change, and continue on
the sector branch afterward. This can group history without many branch names.
This is only a reference, not permission to adopt that workflow here. Ordv uses
the two paths above and returns to the target branch after a PR merge unless
the user explicitly adopts a different policy.

## Independent merge decision

These rules apply to PRs, not direct commits permitted by Path 2.

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
