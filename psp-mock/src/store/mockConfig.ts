import { config, isHttpUrl } from "../config.js";
import type { AuthorizationOutcome } from "../types.js";

const MODES = ["OK", "KO", "TIMEOUT"] as const;
const DELIVERIES = ["SEND", "NONE", "LATE"] as const;
const OUTCOMES = [
  "AUTHORIZED",
  "DECLINED",
  "REFUSED",
  "CANCELED_BY_USER",
  "TIMEOUT",
] as const satisfies readonly AuthorizationOutcome[];

// error statuses declared by psp_pos_layer.json for each operation
const KO_STATUSES = {
  terminals: [400, 401, 404, 500],
  authRequest: [400, 401, 404, 409, 422, 429, 500, 502, 503, 504],
  sessionOutcome: [400, 404, 429, 500],
} as const;

const MAX_MS = 600_000;

export interface OperationConfig {
  mode: (typeof MODES)[number];
  koStatus: number;
  delayMs: number;
  timeoutMs: number;
}

export interface MockConfig {
  operations: Record<keyof typeof KO_STATUSES, OperationConfig>;
  callback: {
    baseUrl: string;
    apiKey: string;
    outcome: AuthorizationOutcome;
    delivery: (typeof DELIVERIES)[number];
    delayMs: number;
    retry: { minDelayMs: number; maxAttempts: number };
  };
}

const defaultOperation = (): OperationConfig => ({
  mode: "OK",
  koStatus: 500,
  delayMs: 0,
  timeoutMs: 30_000,
});

const defaults = (): MockConfig => ({
  operations: {
    terminals: defaultOperation(),
    authRequest: defaultOperation(),
    sessionOutcome: defaultOperation(),
  },
  callback: {
    baseUrl: config.callbackBaseUrl,
    apiKey: config.callbackApiKey,
    outcome: "AUTHORIZED",
    delivery: "SEND",
    delayMs: 0,
    // SANP: at least 2s between attempts, retry until session expiry.
    // 50 is above what the longest session (60 s + 10 s grace) allows, so expiry stops the retries.
    retry: { minDelayMs: 2000, maxAttempts: 50 },
  },
});

// returns an error message, or undefined when the value is valid
type Check = (value: unknown) => string | undefined;
interface Schema {
  [key: string]: Check | Schema;
}

const oneOf =
  (allowed: readonly (string | number)[]): Check =>
  (value) =>
    allowed.includes(value as string | number) ? undefined : `must be one of ${allowed.join(", ")}`;

const intBetween =
  (min: number, max: number): Check =>
  (value) =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max
      ? undefined
      : `must be an integer between ${min} and ${max}`;

const operationSchema = (koStatuses: readonly number[]): Schema => ({
  mode: oneOf(MODES),
  koStatus: oneOf(koStatuses),
  delayMs: intBetween(0, MAX_MS),
  timeoutMs: intBetween(0, MAX_MS),
});

const schema: Schema = {
  operations: {
    terminals: operationSchema(KO_STATUSES.terminals),
    authRequest: operationSchema(KO_STATUSES.authRequest),
    sessionOutcome: operationSchema(KO_STATUSES.sessionOutcome),
  },
  callback: {
    baseUrl: (value) => (isHttpUrl(value) ? undefined : "must be an http(s) URL"),
    apiKey: (value) =>
      typeof value === "string" && value !== "" ? undefined : "must be a non-empty string",
    outcome: oneOf(OUTCOMES),
    delivery: oneOf(DELIVERIES),
    delayMs: intBetween(0, MAX_MS),
    retry: {
      minDelayMs: intBetween(0, MAX_MS),
      maxAttempts: intBetween(1, 100),
    },
  },
};

type Node = Record<string, unknown>;

// deep-merges patch into current, collecting an error for every unknown or invalid property.
// Written property names come from the schema, never from the request body.
const merge = (rules: Schema, current: Node, patch: unknown, path: string, errors: string[]): Node => {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    errors.push(`${path || "body"}: must be an object`);
    return current;
  }
  const body = patch as Node;
  const at = (key: string): string => (path ? `${path}.${key}` : key);
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(rules, key)) {
      errors.push(`${at(key)}: unknown property`);
    }
  }
  const next = { ...current };
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(body, key)) {
      continue;
    }
    const value = body[key];
    if (typeof rule !== "function") {
      next[key] = merge(rule, current[key] as Node, value, at(key), errors);
      continue;
    }
    const error = rule(value);
    if (error === undefined) {
      next[key] = value;
    } else {
      errors.push(`${at(key)}: ${error}`);
    }
  }
  return next;
};

let current = defaults();

export const getMockConfig = (): MockConfig => current;

// applies the patch only if all of it is valid; returns the validation errors
export const updateMockConfig = (patch: unknown): string[] => {
  const errors: string[] = [];
  const next = merge(schema, current as unknown as Node, patch, "", errors);
  if (errors.length === 0) {
    current = next as unknown as MockConfig;
  }
  return errors;
};

export const resetMockConfig = (): void => {
  current = defaults();
};
