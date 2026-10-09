// transient errors the PSP must retry on (from the DR)
const RETRYABLE = [429, 500, 502, 503, 504];

export interface AttemptResult {
  // undefined when the call failed without an HTTP response
  status: number | undefined;
  retryAfter: string | null;
  attempt: number;
  now: number;
  // epoch ms after which the session is expired for the POS Gateway
  expiresAt: number;
  retry: { minDelayMs: number; maxAttempts: number };
}

export type Decision = { retry: true; delayMs: number } | { retry: false; reason: string };

// Retry-After is a number of seconds or an HTTP date
const retryAfterMs = (value: string | null, now: number): number => {
  if (!value) {
    return 0;
  }
  const ms = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? ms : 0;
};

// SANP: retry on transient errors, at least minDelayMs apart, until success, 422 or session expiry
export const nextAttempt = (result: AttemptResult): Decision => {
  const { status, attempt, now, expiresAt, retry } = result;
  if (status !== undefined && status >= 200 && status < 300) {
    return { retry: false, reason: "delivered" };
  }
  if (status === 422) {
    return { retry: false, reason: "session expired for the receiver" };
  }
  if (status !== undefined && !RETRYABLE.includes(status)) {
    return { retry: false, reason: `status ${status} is not retryable` };
  }
  if (attempt >= retry.maxAttempts) {
    return { retry: false, reason: "max attempts reached" };
  }
  const wait = status === 429 ? retryAfterMs(result.retryAfter, now) : 0;
  const delayMs = Math.max(retry.minDelayMs, wait);
  if (now + delayMs >= expiresAt) {
    return { retry: false, reason: "session expired" };
  }
  return { retry: true, delayMs };
};
