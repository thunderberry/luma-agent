# luma-agent

Luma event helper plus an input-driven processing CLI for Codex Automations.

## Workflow

The intended flow is:

1. Codex Automation uses the Gmail connector to find recent Luma invite emails.
2. The automation extracts Luma event URLs from those messages.
3. The automation writes a normalized invite JSON file locally or in `/tmp`.
4. The repo command processes that file, tracks which message IDs and event URLs are new, and calls the deployed MCP helper for new event URLs.
5. The run merges helper facts into a durable local event cache.
6. A helper-facts snapshot is written for agent review.
6. The automation agent reads those helper facts, writes the final Markdown digest, and adds qualitative assessment.

The CLI does not own Gmail OAuth or Gmail fetching anymore.

## Command

- `npm run process:invites -- --input /path/to/invites.json`
  - consumes normalized invite input
  - persists message/event state for future runs
  - updates `.runtime/state/event-cache.json`
  - writes `.runtime/state/latest-invites.json`
  - writes `.runtime/output/latest.json`

Accepted input formats:

- `["https://lu.ma/foo", "https://lu.ma/bar"]`
- `{ "invites": ["https://lu.ma/foo"] }`
- `{ "invites": [{ "messageId": "123", "threadId": "456", "receivedAt": "2026-04-01T00:00:00.000Z", "subject": "Invite", "rawUrl": "https://lu.ma/foo" }] }`

## Runtime Files

Durable state:

- `.runtime/state/message-state.json`
  - tracks processed Gmail message IDs and previously seen event URLs
- `.runtime/state/event-cache.json`
  - durable cache keyed by canonical URL with latest helper facts and source message IDs

Current-run artifacts:

- `.runtime/state/latest-invites.json`
  - normalized invites for the current run
  - marks `is_new_message` and `is_new_event_url`
- `.runtime/output/latest.json`
  - helper facts snapshot from the full event cache
- `.runtime/output/latest.md`
  - written later by the automation agent, not by the CLI

## Helper

The deployed helper is the source of event facts. The CLI connects to the helper over MCP and calls `fetch_luma_event` for each new event URL.

## Notes

- No Luma official API usage.
- Repo-local runtime/output by default under `.runtime/`.
- `LUMA_OUTPUT_DIR` can override the output location if needed.

See [docs/codex-automation.md](docs/codex-automation.md).
