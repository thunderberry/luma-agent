import { describe, expect, it } from 'vitest';

import {
  buildChromiumLaunchOptions,
  resolveStrictHeadlessSetting,
} from '../../src/checker/headless-policy.js';

describe('headless policy', () => {
  it('defaults to strict headless true', () => {
    expect(resolveStrictHeadlessSetting(undefined)).toBe(true);
  });

  it('accepts true values', () => {
    expect(resolveStrictHeadlessSetting('true')).toBe(true);
    expect(resolveStrictHeadlessSetting('1')).toBe(true);
    expect(resolveStrictHeadlessSetting('yes')).toBe(true);
  });

  it('rejects non-headless values', () => {
    expect(() => resolveStrictHeadlessSetting('false')).toThrow(/must remain true/i);
    expect(() => resolveStrictHeadlessSetting('0')).toThrow(/must remain true/i);
  });

  it('builds chromium options with hardcoded headless true', () => {
    const options = buildChromiumLaunchOptions();
    expect(options.headless).toBe(true);
  });
});
