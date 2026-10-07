import express, { type Express } from "express";
import type { ProblemJson } from "./types.js";

export const createApp = (): Express => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "UP" });
  });

  app.use((req, res) => {
    const problem: ProblemJson = {
      type: "about:blank",
      title: "Not found",
      status: 404,
      detail: `No mock defined for ${req.method} ${req.path}`,
    };
    res.status(404).json(problem);
  });

  return app;
};
