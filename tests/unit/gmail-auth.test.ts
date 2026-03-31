import { describe, expect, it } from 'vitest';

import { canUseLoopbackRedirectUri } from '../../src/gmail/auth.js';

describe('gmail auth helpers', () => {
  it('accepts localhost and loopback http redirect uris', () => {
    expect(canUseLoopbackRedirectUri('http://127.0.0.1:3000/oauth2callback')).toBe(true);
    expect(canUseLoopbackRedirectUri('http://localhost:3000/oauth2callback')).toBe(true);
  });

  it('rejects non-loopback or non-http redirect uris', () => {
    expect(canUseLoopbackRedirectUri('https://127.0.0.1:3000/oauth2callback')).toBe(false);
    expect(canUseLoopbackRedirectUri('http://example.com/callback')).toBe(false);
    expect(canUseLoopbackRedirectUri('not-a-url')).toBe(false);
  });
});
