import { isDeepStrictEqual } from "node:util";
import { Router } from "express";
import { scheduleCallback } from "../callback/scheduler.js";
import { getMockConfig } from "../store/mockConfig.js";
import { getSession, saveSession } from "../store/sessions.js";
import { problem, type AuthorizationOutcomeDetails, type AuthorizationRequest } from "../types.js";
import { AUTHORIZATION_REQUEST, validate, withMode } from "./common.js";

export const authRequestsRouter = Router();

const PATH = "/:sessionId/auth-requests";

// SANP: the session expires after the terminal authorizationTimeout plus a 10 s grace period
const GRACE_MS = 10_000;

// mock card data from the spec examples
const CARD = {
  bin: "400000",
  lastFourDigits: "1234",
  paymentAuthCode: "889900",
  rrn: "123456789012",
  brand: "VISA",
} as const;

const buildOutcome = (request: AuthorizationRequest, outcomeAt: number): AuthorizationOutcomeDetails => {
  const { outcome } = getMockConfig().callback;
  return {
    outcome,
    terminalId: request.terminalId,
    timestamp: new Date(outcomeAt).toISOString(),
    amount: request.amount,
    details:
      outcome === "AUTHORIZED"
        ? { paymentType: "CARD", details: CARD }
        : { errorDescription: `Mocked ${outcome} outcome` },
  };
};

authRequestsRouter.post(PATH, withMode("authRequest"), validate(AUTHORIZATION_REQUEST), (req, res) => {
  const sessionId = String(req.params.sessionId);
  const request = req.body as AuthorizationRequest;
  const existing = getSession(sessionId);
  const { terminals, callback } = getMockConfig();
  const terminal = terminals.find(({ id }) => id === request.terminalId);

  if (request.sessionId !== sessionId) {
    res.status(400).json(problem(400, "Bad Request", "sessionId in the body differs from the path"));
  } else if (existing) {
    // retries on 5xx: the same request is accepted again, a different one is a conflict
    if (isDeepStrictEqual(existing.request, request)) {
      res.status(204).end();
    } else {
      res.status(409).json(problem(409, "Conflict", `Session ${sessionId} exists with a different request`));
    }
  } else if (!terminal) {
    res.status(404).json(problem(404, "Not Found", `Unknown terminal ${request.terminalId}`));
  } else {
    const now = Date.now();
    const outcomeAt = now + callback.delayMs;
    const session = {
      request,
      correlationId: req.get("x-correlation-id") ?? "",
      outcome: buildOutcome(request, outcomeAt),
      outcomeAt,
      expiresAt: now + terminal.authorizationTimeout * 1000 + GRACE_MS,
      attempts: [],
    };
    saveSession(sessionId, session);
    scheduleCallback(sessionId, session, callback);
    res.status(204).end();
  }
});

authRequestsRouter.get(PATH, withMode("sessionOutcome"), validate(), (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = getSession(sessionId);
  const { pendingStatus } = getMockConfig().operations.sessionOutcome;

  if (!session) {
    res.status(404).json(problem(404, "Not Found", `Unknown session ${sessionId}`));
  } else if (Date.now() < session.outcomeAt) {
    // the spec has no representation for a pending session
    res.status(pendingStatus).json(problem(pendingStatus, "Outcome not available", `Session ${sessionId} is pending`));
  } else {
    res.json(session.outcome);
  }
});
