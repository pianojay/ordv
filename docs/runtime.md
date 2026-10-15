# Standalone runtime and safe output

Build and package from the repository:

```sh
npm ci
npm run build
npm pack
```

Install the resulting tarball with `npm install -g /path/to/ordv-0.1.0.tgz`. Node 22.12+ is required. The installed `ordv` command runs compiled JavaScript with production dependencies; it does not require tsx, a development checkout, or the repository as cwd. `ordv serve` serves its packaged UI. Source development still uses `npm run dev`.

PDF printing requires Chrome, Edge, or Chromium. Use `ordv export plan.json -o packet.pdf --browser /absolute/path/to/chromium`, `ORDV_BROWSER`, or legacy `PACKET_BROWSER`. An explicit invalid override fails rather than silently selecting a different browser. Without an override, ordv searches Puppeteer's managed browser and common system paths. It always uses an isolated temporary profile and retains the browser sandbox. Linux installations also need the browser's system libraries and suitable fonts; install Korean fonts when printing Korean material.

Plan writes and CLI PDF output reserve a sibling `.ordv-lock` file, create a unique sibling temporary file, flush it, then publish the complete result. Existing destinations are refused by default; `--force` explicitly replaces them. The old file survives rendering failure or cancellation. Concurrent ordv writes to the same path fail with an actionable reservation message. Default publication also refuses files created by other programs during rendering. Atomic publication requires a filesystem supporting hard links (for no-clobber writes) and atomic rename (for replacement), such as NTFS/ext4. No unsafe overwrite fallback is used.

Ctrl+C/SIGTERM cancels CLI export, closes the browser and removes temporary output/reservations. A killed process or machine crash may leave a lock; inspect its PID and verify no exporter is running before removing it. The local API rejects concurrent discovery/export with HTTP 409 and cancels export when the client disconnects. Saved-plan export uses embedded source/assets and does not fetch remote content. Offline discovery requires a populated cache; `--offline --refresh` is rejected.

`npm run test:runtime` packs a production-only installation, runs from an unrelated directory, checks both PDF modes after deleting source files, serves the installed UI/assets, and verifies overwrite refusal, browser errors, concurrent API requests, and cancellation cleanup. Run it on each supported OS. A Windows pass does not establish clean-machine or Linux validation. Full upstream preset notices are included in the tarball and embedded HTML.
