import type { MockConfig } from "../store/mockConfig.js";
import { getSession, type Session } from "../store/sessions.js";
import { nextAttempt } from "./retryPolicy.js";

type CallbackConfig = MockConfig["callback"];

// how long after session expiry the LATE delivery is sent
const LATE_MARGIN_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;
// upper bound of the configurable delays
const MAX_TIMER_MS = 600_000;

const later = (delayMs: number, run: () => void): void => {
  const bounded = delayMs <= MAX_TIMER_MS ? Math.max(0, delayMs) : MAX_TIMER_MS;
  // unref: a pending callback must not keep the process alive on shutdown
  setTimeout(run, bounded).unref();
};

const send = async (sessionId: string, session: Session, callback: CallbackConfig, attempt: number) => {
  // the session was deleted by a configuration reset
  if (getSession(sessionId) !== session) {
    return;
  }
  const base = callback.baseUrl.endsWith("/") ? callback.baseUrl : `${callback.baseUrl}/`;
  const url = new URL(`pos/sessions/${encodeURIComponent(sessionId)}/auth-requests`, base);
  let status: number | undefined;
  let retryAfter: string | null = null;
  let error: string | undefined;
  try {
    // the spec lists the two security schemes as alternatives: the mock sends both
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": callback.apiKey,
        Authorization: `Bearer ${session.request.outcomeAuthToken}`,
        "x-correlation-id": session.correlationId,
      },
      body: JSON.stringify(session.outcome),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
    retryAfter = response.headers.get("retry-after");
    await response.body?.cancel();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const now = Date.now();
  const decision = nextAttempt({ status, retryAfter, attempt, now, expiresAt: session.expiresAt, retry: callback.retry });
  const next = decision.retry ? `retry in ${decision.delayMs} ms` : decision.reason;
  session.attempts.push({ attempt, at: new Date(now).toISOString(), status, error, next });
  console.log(`callback ${sessionId} attempt ${attempt}: ${status ?? error} (${next})`);
  if (decision.retry) {
    later(decision.delayMs, () => void send(sessionId, session, callback, attempt + 1));
  }
};

// callback is the configuration in force when the authorization request was accepted
export const scheduleCallback = (sessionId: string, session: Session, callback: CallbackConfig): void => {
  if (callback.delivery === "NONE") {
    return;
  }
  const firstAt = callback.delivery === "LATE" ? session.expiresAt + LATE_MARGIN_MS : session.outcomeAt;
  later(firstAt - Date.now(), () => void send(sessionId, session, callback, 1));
};
