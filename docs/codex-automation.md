# Codex Automations Prompt

Use this as the task prompt for a Codex Automation that owns Gmail discovery and agent-authored output.

```text
Run the Luma invite processing workflow in /Users/kevinrochowski/Documents/Developer/repos/luma-agent.

Requirements:
- Do not edit repo source files during the automation run.
- Do not overwrite .env.
- Never print bearer tokens, OAuth secrets, or token contents.
- Keep temporary files inside the repo or /tmp.
- Use the Gmail connector, not local Gmail OAuth.

Execution steps:
1) cd /Users/kevinrochowski/Documents/Developer/repos/luma-agent
2) If .runtime/state/message-state.json exists, read it first and use it to avoid refetching already-processed Gmail message IDs.
3) Use the Gmail connector to search for recent Luma invite emails. Prefer a query like:
   from:(lu.ma OR luma-mail.com) newer_than:90d
4) Read matching messages and extract Luma event URLs.
5) Write a temporary JSON file at /tmp/luma-invites.json in one of these formats:
   - ["https://lu.ma/foo", "https://lu.ma/bar"]
   - {"invites":["https://lu.ma/foo"]}
   - {"invites":[{"messageId":"abc","threadId":"def","receivedAt":"2026-04-01T00:00:00.000Z","subject":"Invite","sender":"Luma <invite@lu.ma>","rawUrl":"https://lu.ma/foo"}]}
6) Run:
   npm run process:invites -- --input /tmp/luma-invites.json
7) Read these files:
   - .runtime/state/latest-invites.json
   - .runtime/output/latest.json
8) Treat .runtime/output/latest.json as helper facts only. Do not rewrite it into a different JSON shape.
9) Write .runtime/output/latest.md yourself as the agent. Format it as a concise event digest for the user. For now, use a simple flat structure per event:
   - title
   - event URL
   - start time
   - city
   - hosts
   - ticket price
   - 1 short “worthwhile” note based only on the visible event facts and description

Output directory rules:
- Default output directory is /Users/kevinrochowski/Documents/Developer/repos/luma-agent/.runtime/output
- If LUMA_OUTPUT_DIR is explicitly set, use that instead

Error handling:
- If no new Luma messages are found, still write /tmp/luma-invites.json and run the command.
- If latest.json is empty, write latest.md explaining that no new event URLs were discovered in this run.
- If the processing command fails, report the stderr summary and the first actionable fix.

Final response format:
- 1 short status line
- 1 short line with counts from latest-invites.json: new messages, repeated messages, new event URLs
- 1 short line with the output directory path
```
