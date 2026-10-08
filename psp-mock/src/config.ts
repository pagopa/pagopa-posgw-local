const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`);
  }
  return value;
};

export const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);

const urlFromEnv = (name: string, fallback: string): string => {
  const value = process.env[name] || fallback;
  if (!isHttpUrl(value)) {
    throw new Error(`Invalid ${name}: expected an http(s) URL, got "${value}"`);
  }
  return value;
};

export const config = {
  port: intFromEnv("PORT", 3000),
  callbackBaseUrl: urlFromEnv("CALLBACK_BASE_URL", "http://pagopa-posgw-transactions-handler:8080"),
  callbackApiKey: process.env.CALLBACK_API_KEY || "psp-mock-api-key",
};
