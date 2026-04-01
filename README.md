# luma-agent

Local-first Luma event pipeline, currently reset around MVP Phase 0 retrieval proof.

## Current Scope

- Phase 0 only: prove one Luma event URL can be fetched from the intended runtime.
- Persist raw HTML plus compact response metadata under repo-local `.runtime/`.
- No Gmail sync, recommendation pass, or broad extraction work is required to start.

## Key Guarantees

- Event checks rely on HTTP fetch + HTML/JSON-LD extraction, not a browser runtime.
- No Luma official API usage.
- Repo-local runtime/output by default under `.runtime/`.
- App data read/write confined to:
  - Repo: `/Users/kevinrochowski/Documents/Developer/repos/luma-agent`
  - Optional explicit output override via `LUMA_OUTPUT_DIR`

## Commands

- `npm run phase0:fetch -- --url https://lu.ma/...` - fetch one event page, persist raw HTML + metadata, and stop.
- `npm run auth:gmail` - optional one-time Gmail OAuth token setup for local-only fetches.
- `npm run fetch-invites` - fetch invite links from Gmail.
- `npm run check-events` - fetch event pages, extract facts, and classify status.
- `npm run summarize` - build markdown + JSON summary output.
- `npm run run-daily` - end-to-end run.
- `npm run run-daily -- --input /path/to/invites.json` - end-to-end run from connector-fed invites, without local Gmail access.
- `npm run test` - run unit/integration tests.

## Phase 0 Output

Running the Phase 0 command writes:

- raw HTML to `.runtime/cache/phase0-fetch/*.html`
- response metadata to `.runtime/state/phase0-fetch/*.json`
- latest run pointer to `.runtime/state/phase0-fetch/latest.json`

The JSON metadata includes:

- requested URL
- final URL after redirects
- HTTP status
- content type
- content length
- first compact HTML excerpt

## Later Pipeline Stages

The existing Gmail/extraction code remains in the repo, but the current reset point is retrieval proof first. Once a single page fetch is working reliably in the real runtime, the next step is deterministic single-page fact extraction from saved HTML fixtures.

## Connector-Driven Automation

For Codex/ChatGPT automation, prefer this flow:

1. Use the Gmail connector to search/read Luma invite emails.
2. Write normalized invite JSON to a repo-local or `/tmp` file.
3. Run `npm run run-daily -- --input /path/to/invites.json`.

Accepted input formats:

- `["https://lu.ma/foo", "https://lu.ma/bar"]`
- `{ "invites": ["https://lu.ma/foo"] }`
- `{ "invites": [{ "messageId": "123", "rawUrl": "https://lu.ma/foo" }] }`

The run persists normalized invite state under `.runtime/state/latest-invites.json` and summary output under `.runtime/output` unless `LUMA_OUTPUT_DIR` is set explicitly.

See [docs/oauth-setup.md](docs/oauth-setup.md) and [docs/codex-automation.md](docs/codex-automation.md).
