import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { CliConfig } from './config.js';
import { readJsonFile, readJsonFileIfExists } from './fs.js';

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

async function loadOAuthClientConfig(config: CliConfig): Promise<OAuthClientConfig> {
  const fromEnv = readClientConfigFromEnv(process.env);
  if (fromEnv) {
    return fromEnv;
  }

  return readJsonFile<OAuthClientConfig>(config.gmailClientConfigPath);
}

export async function getAuthorizedGmailClient(config: CliConfig): Promise<OAuth2Client> {
  const oauthConfig = await loadOAuthClientConfig(config);
  const token = await readJsonFileIfExists<StoredToken>(config.gmailTokenPath);
  if (!token) {
    throw new Error(
      `Missing Gmail token at ${config.gmailTokenPath}. Use the existing local OAuth setup before running sync:gmail.`,
    );
  }

  const client = new google.auth.OAuth2(
    oauthConfig.clientId,
    oauthConfig.clientSecret,
    oauthConfig.redirectUri,
  );
  client.setCredentials(token);
  return client;
}
