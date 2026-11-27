# Runtime CI

The [runtime workflow](../.github/workflows/ci.yml) validates the packed application on GitHub-hosted Windows 2025 and Ubuntu 24.04 runners. Each operating system runs Node 22 and Node 24. These versions satisfy the package's Node `>=22.12` requirement.

## Checks and order

Every matrix job installs dependencies with `npm ci`, builds the application, records runtime metadata, and runs `npm test`. An isolated online production install then fills the npm cache with dependency tarballs and registry metadata. Its log is separate from the offline test. A restored cache is an optimization, not a prerequisite. `npm run test:runtime` then packs the current build and performs a production-only `npm install --offline` in a fresh temporary directory outside the checkout. `npm run test:agent` follows with the installed local-agent wrapper checks from another working directory. These checks do not establish Codex host registration or an actual Codex skill invocation.

The Node 24 job on each operating system then runs these checks in order.

1. `npm run test:acceptance` creates the synthetic saved plan and PDFs.
2. `npm run test:ui` loads that plan and the built editor.
3. `npm run test:layout` inspects table text, page orientation, figure labels, and raster coverage with Python `pdfplumber`.

The full editor and layout suite runs once per operating system. Both Node versions retain the installed-runtime PDF and server checks. Each job finishes with a Poppler check that opens the installed-runtime PDF and extracts its Korean fixture text.

## Runner dependencies

The workflow skips Puppeteer's browser download and explicitly sets `ORDV_BROWSER` to the runner's system Google Chrome. The application's browser sandbox stays enabled. Ubuntu installs `fonts-noto-cjk` and `poppler-utils` through apt. Windows installs a static Noto Sans CJK KR font in the current user's font directory and registers it before any browser starts. The font source is pinned to the [Noto CJK Sans 2.004 commit](https://github.com/notofonts/noto-cjk/commit/523d033d6cb47f4a80c58a35753646f5c3608a78). Windows installs Poppler through Chocolatey.

Every job selects Python 3.12 and installs `pdfplumber==0.11.11`. The font check asks Chrome which font rendered the Korean fixture. A missing Noto Korean font fails the job. System browser, operating system package, and transitive Python versions can change with runner updates. `output/ci/versions.json` records the tested commit, source commit, runner image, OS, Node, npm, Chrome path and version, Python, pdfplumber, Poppler, actual Korean fonts, package version, and lockfile hash. Pull request runs test GitHub's merge commit and record the proposed head separately as the source commit.

## Evidence and permissions

Each job uploads the tarball, the installed-runtime and installed-agent PDFs, named synthetic acceptance PDFs and screenshots, command logs, and metadata. The artifact allowlist names each output category. It does not upload the entire `output` directory, imported documents, local caches, or saved reading plans. Artifacts expire after 14 days.

The workflow runs on pull requests, pushes to `main`, and manual dispatch. It requests only `contents: read`, does not persist Git checkout credentials, and has no publish or merge step. The official checkout, setup-node, setup-python, and upload-artifact actions are pinned to release commit SHAs.

## Validation status

The workflow definition and helper scripts can be checked locally. Hosted Windows and Ubuntu certification requires a successful run of this workflow at the reviewed commit. A local Windows pass does not establish a GitHub runner pass. PDF generation and automated inspection do not establish reader-device acceptance.
