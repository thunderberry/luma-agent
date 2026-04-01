import { describe, expect, it } from 'vitest';

import { authenticateHeaders } from '../src/auth.js';

const env = {
  MCP_BEARER_TOKEN: 'secret-token',
  MCP_ALLOWED_CLIENT_IDS: 'cli,agent',
};

describe('helper auth', () => {
  it('rejects requests without a bearer token', () => {
    const result = authenticateHeaders({}, env);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects requests without a client id', () => {
    const result = authenticateHeaders(
      { authorization: 'Bearer secret-token' },
      env,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects disallowed client ids', () => {
    const result = authenticateHeaders(
      {
        authorization: 'Bearer secret-token',
        'x-client-id': 'intruder',
      },
      env,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
