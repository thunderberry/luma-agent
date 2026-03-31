# luma-agent

Local-only Luma invite monitor.

## Key Guarantees

- Strict headless browser checks (`headless: true` only).
- No Luma official API usage.
- App data read/write confined to:
  - Repo: `/Users/kevinrochowski/Documents/Developer/repos/luma-agent`
  - Output: `/Users/kevinrochowski/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Core/Integrations/Luma`

## Commands

- `npm run auth:gmail` - initialize Gmail OAuth token.
- `npm run fetch-invites` - fetch invite links from Gmail.
- `npm run check-events` - check event pages and classify status.
- `npm run summarize` - build markdown + JSON summary output.
- `npm run run-daily` - end-to-end run.
- `npm run test` - run unit/integration tests.

See [docs/oauth-setup.md](docs/oauth-setup.md) and [docs/codex-automation.md](docs/codex-automation.md).
