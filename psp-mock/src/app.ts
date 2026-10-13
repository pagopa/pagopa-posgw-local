import express, { type ErrorRequestHandler, type Express } from "express";
import { authRequestsRouter } from "./handlers/authRequests.js";
import { mockConfigRouter } from "./handlers/mockConfig.js";
import { terminalsRouter } from "./handlers/terminals.js";
import { problem } from "./types.js";

// body-parser errors carry a 4xx status (malformed JSON, payload too large)
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = Number(err?.status);
  if (status >= 400 && status < 500) {
    res.status(status).json(problem(status, "Bad request", String(err.message)));
    return;
  }
  console.error(err);
  res.status(500).json(problem(500, "Internal server error", "Unexpected error"));
};

export const createApp = (): Express => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "UP" });
  });

  app.use("/config", mockConfigRouter);
  app.use("/pos/terminals", terminalsRouter);
  app.use("/pos/sessions", authRequestsRouter);

  app.use((req, res) => {
    res.status(404).json(problem(404, "Not found", `No mock defined for ${req.method} ${req.path}`));
  });

  app.use(errorHandler);

  return app;
};
