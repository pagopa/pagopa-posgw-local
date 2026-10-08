import { Router } from "express";
import { getMockConfig, resetMockConfig, updateMockConfig } from "../store/mockConfig.js";
import { clearSessions } from "../store/sessions.js";
import { problem } from "../types.js";

export const mockConfigRouter = Router();

mockConfigRouter.get("/", (_req, res) => {
  res.json(getMockConfig());
});

// partial update: only the properties in the body change
mockConfigRouter.patch("/",(req, res) => {
  const errors = updateMockConfig(req.body);
  if (errors.length > 0) {
    res.status(400).json(problem(400, "Invalid configuration", errors.join("; ")));
    return;
  }
  res.json(getMockConfig());
});

mockConfigRouter.delete("/", (_req, res) => {
  resetMockConfig();
  clearSessions();
  res.status(204).end();
});
