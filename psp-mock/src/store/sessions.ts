import type { AuthorizationOutcomeDetails, AuthorizationRequest } from "../types.js";

export interface CallbackAttempt {
  attempt: number;
  at: string;
  status: number | undefined;
  error: string | undefined;
  // what the retry policy decided after this attempt
  next: string;
}

export interface Session {
  request: AuthorizationRequest;
  // x-correlation-id of the authorization request, replayed on the callback
  correlationId: string;
  outcome: AuthorizationOutcomeDetails;
  // epoch ms from which the outcome is available
  outcomeAt: number;
  // epoch ms after which the POS Gateway rejects the callback
  expiresAt: number;
  attempts: CallbackAttempt[];
}

const sessions = new Map<string, Session>();

export const getSession = (sessionId: string): Session | undefined => sessions.get(sessionId);

export const saveSession = (sessionId: string, session: Session): void => {
  sessions.set(sessionId, session);
};

export const listSessions = (): Array<Session & { sessionId: string }> =>
  [...sessions].map(([sessionId, session]) => ({ sessionId, ...session }));

export const clearSessions = (): void => sessions.clear();
