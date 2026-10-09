import { Router } from "express";
import { getMockConfig } from "../store/mockConfig.js";
import type { PosResponse } from "../types.js";
import { POS_REQUEST, validate, withMode } from "./common.js";

export const terminalsRouter = Router();

terminalsRouter.post("/", withMode("terminals"), validate(POS_REQUEST), (_req, res) => {
  const body: PosResponse = { terminals: getMockConfig().terminals };
  res.json(body);
});
