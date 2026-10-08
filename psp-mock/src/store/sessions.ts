import type { AuthorizationOutcomeDetails, AuthorizationRequest } from "../types.js";

export interface Session {
  request: AuthorizationRequest;
  outcome: AuthorizationOutcomeDetails;
  // epoch ms from which the outcome is available
  outcomeAt: number;
}

const sessions = new Map<string, Session>();

export const getSession = (sessionId: string): Session | undefined => sessions.get(sessionId);

export const saveSession = (sessionId: string, session: Session): void => {
  sessions.set(sessionId, session);
};

export const clearSessions = (): void => sessions.clear();
