# Gmail OAuth Setup (Local Only)

## 1) Create local OAuth client credentials

- In Google Cloud Console, create OAuth credentials for a desktop/local app.
- Configure Gmail readonly scope.
- Use redirect URI: `http://127.0.0.1:3000/oauth2callback`.

## 2) Provide credentials via environment variables (recommended)

Add these to `.env` (gitignored):

```bash
LUMA_GMAIL_CLIENT_ID="YOUR_CLIENT_ID"
LUMA_GMAIL_CLIENT_SECRET="YOUR_CLIENT_SECRET"
LUMA_GMAIL_REDIRECT_URI="http://127.0.0.1:3000/oauth2callback"
```

## 3) Run one-time token bootstrap

```bash
cd /Users/kevinrochowski/Documents/Developer/repos/luma-agent
set -a; source .env; set +a
npm run auth:gmail
```

Default behavior:
- Tries to open your browser automatically.
- Tries to capture the OAuth callback automatically from `http://127.0.0.1:3000/oauth2callback`.
- Falls back to manual paste if callback capture fails.

Manual-only mode:

```bash
cd /Users/kevinrochowski/Documents/Developer/repos/luma-agent
npm run build --silent && node dist/src/cli/index.js auth-gmail --manual-auth
```

Token is stored locally at:

`/Users/kevinrochowski/Documents/Developer/repos/luma-agent/.runtime/oauth/gmail-token.json`
