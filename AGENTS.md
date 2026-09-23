# Festival contribution and release policy

All changes, including fixes, documentation, benchmarks and deployment configuration, must arrive on `develop` before `main`. Start feature/fix branches from current `develop` (use `codex/` for agent branches) and integrate them into `develop`. Never commit or push directly to `main`, and never merge a feature/fix branch straight into `main`.

Deploy and validate `develop` at `https://dev.festivals.prishi.in`. Release through a pull request from `develop` to `main` only, after the user's release approval and required checks. Use a merge commit to preserve shared history; then fast-forward `develop` to the merged `main` commit so the branches start the next cycle together. Do not squash or rebase release PRs. GitHub must require a pull request for `main`, including administrators, and disallow force pushes and deletion.

A request to synchronise branches does not override an explicit request to keep production unchanged. If a documentation/benchmark-only release is approved without deployment, cancel its automatic production build and verify the existing production alias remains on the previous release. Future approved application releases deploy normally. Never promote a Preview build to Production: its embedded settings may point to the dev database. See [hosting and release workflow](docs/HOSTING.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
