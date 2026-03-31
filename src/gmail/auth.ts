import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { AppConfig } from '../config/env.js';
import { PathPolicy } from '../util/path-policy.js';
import {
  safeFileExists,
  safeReadJson,
  safeWriteJsonAtomic,
} from '../util/safe-fs.js';

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface StoredToken {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

interface AuthorizationOptions {
  preferBrowserLogin?: boolean;
}

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const BROWSER_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

function readClientConfigFromEnv(env: NodeJS.ProcessEnv): OAuthClientConfig | null {
  const clientId = env.LUMA_GMAIL_CLIENT_ID;
  const clientSecret = env.LUMA_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: env.LUMA_GMAIL_REDIRECT_URI ?? 'http://127.0.0.1:3000/oauth2callback',
  };
}

async function loadOAuthClientConfig(
  config: AppConfig,
  policy: PathPolicy,
): Promise<OAuthClientConfig> {
  const fromEnv = readClientConfigFromEnv(process.env);
  if (fromEnv) {
    return fromEnv;
  }

  const exists = await safeFileExists(policy, config.gmailClientConfigPath);
  if (!exists) {
    throw new Error(
      [
        'Missing Gmail OAuth client configuration.',
        `Set LUMA_GMAIL_CLIENT_ID and LUMA_GMAIL_CLIENT_SECRET, or create ${config.gmailClientConfigPath}.`,
      ].join(' '),
    );
  }

  const parsed = await safeReadJson<OAuthClientConfig>(
    policy,
    config.gmailClientConfigPath,
  );
  if (
    parsed.clientId.includes('PASTE_YOUR_CLIENT_ID_HERE') ||
    parsed.clientSecret.includes('PASTE_YOUR_CLIENT_SECRET_HERE')
  ) {
    throw new Error(
      `OAuth client file ${config.gmailClientConfigPath} still has placeholders. Replace with real Google OAuth client values.`,
    );
  }

  return parsed;
}

async function promptForAuthorizationCode(authUrl: string): Promise<string> {
  process.stdout.write('\nAuthorize Gmail access for read-only invite extraction:\n');
  process.stdout.write(`${authUrl}\n\n`);
  process.stdout.write(
    'If browser capture did not complete, open the URL manually and paste the redirect URL/code.\n',
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const rawInput = await rl.question(
      'Paste the full redirected URL or the authorization code: ',
    );

    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new Error('No authorization code was provided.');
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const code = parsed.searchParams.get('code');
      if (!code) {
        throw new Error('Redirect URL did not include a code parameter.');
      }
      return code;
    }

    return trimmed;
  } finally {
    rl.close();
  }
}

export function canUseLoopbackRedirectUri(redirectUri: string): boolean {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:') {
      return false;
    }
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

function openInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'open';
      args = [url];
    } else if (platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', url];
    } else {
      command = 'xdg-open';
      args = [url];
    }

    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function waitForAuthorizationCodeFromLoopback(
  redirectUri: string,
  timeoutMs = BROWSER_AUTH_TIMEOUT_MS,
): Promise<string> {
  const redirectUrl = new URL(redirectUri);
  const listenHost = redirectUrl.hostname;
  const listenPort = Number(redirectUrl.port || '80');
  const expectedPath = redirectUrl.pathname || '/';

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = new URL(
        req.url ?? '/',
        `http://${req.headers.host ?? `${listenHost}:${listenPort}`}`,
      );

      if (requestUrl.pathname !== expectedPath) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const error = requestUrl.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`OAuth authorization failed: ${error}`);
        cleanup();
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Missing authorization code in callback URL.');
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        [
          '<!doctype html>',
          '<html lang="en">',
          '<head>',
          '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>Luma Agent OAuth Complete</title>',
          '  <style>',
          '    :root {',
          '      color-scheme: light;',
          '      --bg: radial-gradient(1200px 600px at 15% 5%, #d2f6ee 0%, #f2fbf8 40%, #f6f9ff 100%);',
          '      --card: rgba(255, 255, 255, 0.94);',
          '      --text: #152235;',
          '      --muted: #4d5d74;',
          '      --accent: #0f9f7f;',
          '      --accent-dark: #0a6f58;',
          '      --ring: rgba(15, 159, 127, 0.2);',
          '      --border: rgba(17, 36, 64, 0.1);',
          '    }',
          '    * { box-sizing: border-box; }',
          '    body {',
          '      margin: 0;',
          '      min-height: 100vh;',
          '      display: grid;',
          '      place-items: center;',
          '      background: var(--bg);',
          '      color: var(--text);',
          '      font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;',
          '      padding: 24px;',
          '    }',
          '    .card {',
          '      width: min(680px, 100%);',
          '      border: 1px solid var(--border);',
          '      background: var(--card);',
          '      border-radius: 20px;',
          '      box-shadow:',
          '        0 18px 50px rgba(21, 34, 53, 0.15),',
          '        0 3px 10px rgba(21, 34, 53, 0.08);',
          '      overflow: hidden;',
          '    }',
          '    .hero {',
          '      padding: 22px 24px 14px;',
          '      background: linear-gradient(135deg, #0f9f7f 0%, #22b8a0 55%, #7dd6c6 100%);',
          '      color: #effffb;',
          '      position: relative;',
          '    }',
          '    .hero::after {',
          '      content: "";',
          '      position: absolute;',
          '      inset: 0;',
          '      background: radial-gradient(420px 180px at 95% -20%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%);',
          '      pointer-events: none;',
          '    }',
          '    .badge {',
          '      display: inline-flex;',
          '      align-items: center;',
          '      gap: 8px;',
          '      padding: 7px 12px;',
          '      border-radius: 999px;',
          '      background: rgba(255, 255, 255, 0.15);',
          '      border: 1px solid rgba(255, 255, 255, 0.26);',
          '      font-size: 12px;',
          '      letter-spacing: 0.08em;',
          '      text-transform: uppercase;',
          '      font-weight: 700;',
          '    }',
          '    h1 {',
          '      margin: 14px 0 6px;',
          '      font-size: clamp(1.4rem, 2.6vw, 2rem);',
          '      line-height: 1.15;',
          '    }',
          '    .subhead {',
          '      margin: 0;',
          '      font-size: 0.98rem;',
          '      color: rgba(239, 255, 251, 0.9);',
          '    }',
          '    .body {',
          '      padding: 22px 24px 24px;',
          '    }',
          '    .status {',
          '      display: flex;',
          '      gap: 12px;',
          '      align-items: flex-start;',
          '      padding: 14px;',
          '      border-radius: 14px;',
          '      background: #f4fffb;',
          '      border: 1px solid #d6f6ec;',
          '      margin-bottom: 16px;',
          '    }',
          '    .status-dot {',
          '      width: 14px;',
          '      height: 14px;',
          '      border-radius: 999px;',
          '      background: var(--accent);',
          '      box-shadow: 0 0 0 8px var(--ring);',
          '      margin-top: 4px;',
          '      flex: 0 0 auto;',
          '    }',
          '    .status strong {',
          '      display: block;',
          '      margin-bottom: 4px;',
          '      font-size: 1rem;',
          '    }',
          '    .status p {',
          '      margin: 0;',
          '      color: var(--muted);',
          '      line-height: 1.45;',
          '    }',
          '    .steps {',
          '      margin: 0;',
          '      padding-left: 1.1rem;',
          '      color: var(--muted);',
          '      line-height: 1.5;',
          '    }',
          '    .steps li + li { margin-top: 6px; }',
          '    .footer {',
          '      margin-top: 16px;',
          '      font-size: 0.88rem;',
          '      color: #5a6a80;',
          '    }',
          '    .footer code {',
          '      background: #edf2fa;',
          '      padding: 0.12rem 0.36rem;',
          '      border-radius: 6px;',
          '      border: 1px solid #dde5f2;',
          '      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
          '      color: var(--accent-dark);',
          '      font-size: 0.82rem;',
          '    }',
          '    @media (max-width: 520px) {',
          '      .hero, .body { padding-left: 18px; padding-right: 18px; }',
          '      .card { border-radius: 16px; }',
          '    }',
          '  </style>',
          '</head>',
          '<body>',
          '  <main class="card">',
          '    <section class="hero">',
          '      <span class="badge">OAuth Complete</span>',
          '      <h1>Gmail connection authorized</h1>',
          '      <p class="subhead">Luma Agent received your OAuth callback successfully.</p>',
          '    </section>',
          '    <section class="body">',
          '      <div class="status">',
          '        <span class="status-dot" aria-hidden="true"></span>',
          '        <div>',
          '          <strong>You can close this tab.</strong>',
          '          <p>The terminal process is finishing token exchange and storing credentials locally.</p>',
          '        </div>',
          '      </div>',
          '      <ol class="steps">',
          '        <li>Return to your terminal window.</li>',
          '        <li>Wait for the confirmation message that auth is complete.</li>',
          '        <li>Run your monitor command when ready.</li>',
          '      </ol>',
          '      <p class="footer">Local-only flow. Token path: <code>.runtime/oauth/gmail-token.json</code></p>',
          '    </section>',
          '  </main>',
          '</body>',
          '</html>',
        ].join('\n'),
      );
      cleanup();
      resolve(code);
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for OAuth callback on ${redirectUri}. Falling back to manual code entry.`,
        ),
      );
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timer);
      server.close();
    }

    server.on('error', (error) => {
      cleanup();
      reject(error);
    });

    server.listen(listenPort, listenHost);
  });
}

async function getAuthorizationCode(authUrl: string, redirectUri: string): Promise<string> {
  process.stdout.write('\nAuthorize Gmail access for read-only invite extraction:\n');
  process.stdout.write(`${authUrl}\n\n`);

  if (!canUseLoopbackRedirectUri(redirectUri)) {
    process.stdout.write(
      'Redirect URI is not loopback HTTP. Falling back to manual copy/paste authorization.\n',
    );
    return promptForAuthorizationCode(authUrl);
  }

  const callbackPromise = waitForAuthorizationCodeFromLoopback(redirectUri);
  const opened = await openInBrowser(authUrl);

  if (opened) {
    process.stdout.write(
      'Opened browser for OAuth consent. Waiting for callback to complete automatically...\n',
    );
  } else {
    process.stdout.write(
      'Could not auto-open browser. Open the URL above manually; callback capture remains active.\n',
    );
  }

  try {
    return await callbackPromise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${message}\n`);
    return promptForAuthorizationCode(authUrl);
  }
}

async function loadStoredToken(
  config: AppConfig,
  policy: PathPolicy,
): Promise<StoredToken | null> {
  const exists = await safeFileExists(policy, config.gmailTokenPath);
  if (!exists) {
    return null;
  }

  return safeReadJson<StoredToken>(policy, config.gmailTokenPath);
}

async function saveStoredToken(
  config: AppConfig,
  policy: PathPolicy,
  token: StoredToken,
): Promise<void> {
  await safeWriteJsonAtomic(policy, config.gmailTokenPath, token);
}

function normalizeStoredToken(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
}): StoredToken {
  const normalized: StoredToken = {};
  if (typeof tokens.access_token === 'string') {
    normalized.access_token = tokens.access_token;
  }
  if (typeof tokens.refresh_token === 'string') {
    normalized.refresh_token = tokens.refresh_token;
  }
  if (typeof tokens.scope === 'string') {
    normalized.scope = tokens.scope;
  }
  if (typeof tokens.token_type === 'string') {
    normalized.token_type = tokens.token_type;
  }
  if (typeof tokens.expiry_date === 'number') {
    normalized.expiry_date = tokens.expiry_date;
  }
  return normalized;
}

export async function getAuthorizedGmailClient(
  config: AppConfig,
  policy: PathPolicy,
  interactiveAuth: boolean,
  options: AuthorizationOptions = {},
): Promise<OAuth2Client> {
  const oauthConfig = await loadOAuthClientConfig(config, policy);
  const oauth2Client = new google.auth.OAuth2(
    oauthConfig.clientId,
    oauthConfig.clientSecret,
    oauthConfig.redirectUri,
  );

  const storedToken = await loadStoredToken(config, policy);
  if (storedToken) {
    oauth2Client.setCredentials(storedToken);
    return oauth2Client;
  }

  if (!interactiveAuth) {
    throw new Error(
      `Missing Gmail token at ${config.gmailTokenPath}. Run auth-gmail first for one-time setup.`,
    );
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [GMAIL_SCOPE],
    prompt: 'consent',
  });

  const preferBrowserLogin = options.preferBrowserLogin ?? true;
  const code = preferBrowserLogin
    ? await getAuthorizationCode(authUrl, oauthConfig.redirectUri)
    : await promptForAuthorizationCode(authUrl);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    process.stdout.write(
      'Warning: refresh token missing. Re-run auth and ensure consent is forced.\n',
    );
  }

  oauth2Client.setCredentials(tokens);
  await saveStoredToken(config, policy, normalizeStoredToken(tokens));

  return oauth2Client;
}

export async function authorizeGmail(
  config: AppConfig,
  policy: PathPolicy,
  options: AuthorizationOptions = {},
): Promise<void> {
  await getAuthorizedGmailClient(config, policy, true, options);
}
