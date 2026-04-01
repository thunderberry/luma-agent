# Codex Automations Prompt

Use this as the task prompt for a Codex App Automation that runs this repo daily with the Gmail connector instead of local Gmail OAuth.

```text
Run the local Luma monitor in /Users/kevinrochowski/Documents/Developer/repos/luma-agent using the Gmail connector for invite discovery.

Requirements:
- Do not edit repo source files for this run.
- Do not overwrite .env.
- Never print OAuth secrets or token contents.
- Keep browser checks headless only.
- Keep all temporary/input files inside the repo or /tmp.

Execution steps:
1) cd /Users/kevinrochowski/Documents/Developer/repos/luma-agent
2) Use the Gmail connector to search for recent Luma invite emails with a query like:
   from:(lu.ma OR luma-mail.com) newer_than:90d
3) Read the matching messages/threads and extract all Luma event URLs.
4) Write a temporary JSON file at /tmp/luma-invites.json in one of these formats:
   - ["https://lu.ma/foo", "https://lu.ma/bar"]
   - {"invites":["https://lu.ma/foo"]}
   - {"invites":[{"messageId":"abc","threadId":"def","receivedAt":"2026-03-31T00:00:00.000Z","subject":"Invite","rawUrl":"https://lu.ma/foo"}]}
5) Run:
   npm run run-daily -- --input /tmp/luma-invites.json

Post-run validation:
- Confirm these files exist under the output directory:
  - latest.md
  - latest.json
- Parse latest.json and report counts: total, open, approval_required, waitlist, closed, unknown, errors.

Output directory rules:
- Default output directory is repo-local: /Users/kevinrochowski/Documents/Developer/repos/luma-agent/.runtime/output
- If LUMA_OUTPUT_DIR is explicitly set to a trusted path, use that instead.

Error handling:
- If no Luma messages are found, continue with an empty invites file and report zero counts.
- If playwright/chromium is missing, run npm run playwright:install once, then retry.
- If the run fails, include stderr summary and the first actionable fix.

Output format:
- 1 short status line (success/failure).
- 1 short counts line from latest.json when successful.
- 1 short line with output directory path.
```
