import { STATUS_CODES } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import type { RequestHandler } from "express";
import { getMockConfig, type MockConfig } from "../store/mockConfig.js";
import { problem } from "../types.js";

// applies the configured delay, then the forced KO or timeout answer, if any, before the handler
export const withMode =
  (operation: keyof MockConfig["operations"]): RequestHandler =>
  async (_req, res, next) => {
    const { mode, koStatus, delayMs, timeoutMs } = getMockConfig().operations[operation];
    await sleep(mode === "TIMEOUT" ? timeoutMs : delayMs);
    if (mode === "OK") {
      next();
      return;
    }
    const status = mode === "KO" ? koStatus : 500;
    const detail = `${operation} is configured in ${mode} mode`;
    res.status(status).json(problem(status, STATUS_CODES[status] ?? "Error", detail));
  };

type Field = (value: unknown) => boolean;

const text: Field = (value) => typeof value === "string" && value !== "";

// required fields of PosRequest and AuthorizationRequest in psp_pos_layer.json, by path
export const POS_REQUEST: Record<string, Field> = {
  "psp.id": text,
  "psp.broker": text,
  "psp.channel": text,
  "creditorInstitution.fiscalCode": (value) => typeof value === "string" && value.length === 11,
};

export const AUTHORIZATION_REQUEST: Record<string, Field> = {
  ...POS_REQUEST,
  amount: (value) => Number.isInteger(value) && (value as number) >= 1,
  terminalId: text,
  outcomeAuthToken: text,
  sessionId: text,
};

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const at = (body: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined,
      body,
    );

// 400 listing the x-correlation-id header and the body fields that are missing or invalid
export const validate =
  (fields: Record<string, Field> = {}): RequestHandler =>
  (req, res, next) => {
    const invalid = Object.entries(fields)
      .filter(([path, isValid]) => !isValid(at(req.body, path)))
      .map(([path]) => path);
    if (!UUID.test(req.get("x-correlation-id") ?? "")) {
      invalid.unshift("x-correlation-id header");
    }
    if (invalid.length === 0) {
      next();
      return;
    }
    res.status(400).json(problem(400, "Bad Request", `Missing or invalid: ${invalid.join(", ")}`));
  };
