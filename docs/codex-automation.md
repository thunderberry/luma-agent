# Codex Automations Prompt

Use this as the task prompt for a Codex App Automation that runs this repo daily.

```text
Run the local Luma monitor in /Users/kevinrochowski/Documents/Developer/repos/luma-agent.

Requirements:
- Do not edit repo files for this run.
- Do not overwrite .env.
- Never print OAuth secrets or token contents.
- Keep browser checks headless only.

Execution steps:
1) cd /Users/kevinrochowski/Documents/Developer/repos/luma-agent
2) Load env vars: set -a; source .env; set +a
3) Validate required vars exist: LUMA_GMAIL_CLIENT_ID, LUMA_GMAIL_CLIENT_SECRET
4) Run: ./scripts/run-daily-sandbox.sh

Post-run validation:
- Confirm these files exist under $LUMA_OUTPUT_DIR:
  - latest.md
  - latest.json
- Parse latest.json and report counts: total, open, approval_required, waitlist, closed, unknown, errors.

Error handling:
- If .env is missing or required vars are missing: stop and report exact missing keys.
- If Gmail token is missing/expired and auth is required: stop and report "Run npm run auth:gmail interactively".
- If playwright/chromium is missing: run npm run playwright:install once, then retry run.
- If sandbox-exec is unavailable and script refuses unsandboxed run: stop and report the refusal (do not force override automatically).
- If command fails, include stderr summary and the first actionable fix.

Output format:
- 1 short status line (success/failure).
- 1 short counts line from latest.json when successful.
- 1 short line with output directory path.
```
