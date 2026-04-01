interface RateLimitState {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const states = new Map<string, RateLimitState>();

export function enforceRateLimit(
  clientId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): { ok: boolean; retryAfterSeconds?: number } {
  const limit = Number.parseInt(env.RATE_LIMIT_PER_MINUTE ?? '60', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: true };
  }

  const existing = states.get(clientId);
  if (!existing || existing.resetAt <= now) {
    states.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true };
}
