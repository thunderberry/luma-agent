import { describe, expect, it } from 'vitest';

import { classifyStatus } from '../../src/classifier/status-classifier.js';

describe('status classifier', () => {
  it('classifies open', () => {
    const result = classifyStatus({
      pageText: 'Reserve your spot now',
      ctaTexts: [],
    });

    expect(result.status).toBe('open');
  });

  it('classifies approval required', () => {
    const result = classifyStatus({
      pageText: 'This event requires approval before joining',
      ctaTexts: ['Request to join'],
    });

    expect(result.status).toBe('approval_required');
  });

  it('classifies waitlist', () => {
    const result = classifyStatus({
      pageText: 'Join waitlist if spots open up',
      ctaTexts: [],
    });

    expect(result.status).toBe('waitlist');
  });

  it('classifies closed and applies precedence over open signals', () => {
    const result = classifyStatus({
      pageText: 'Event sold out. You can still register your interest.',
      ctaTexts: ['Register'],
    });

    expect(result.status).toBe('closed');
  });

  it('returns unknown when no signals are present', () => {
    const result = classifyStatus({
      pageText: 'Welcome to event page',
      ctaTexts: ['Learn more'],
    });

    expect(result.status).toBe('unknown');
  });
});
