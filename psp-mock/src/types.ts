import type { components } from "./generated/psp-pos-layer.js";

type Schemas = components["schemas"];

export type ProblemJson = Schemas["ProblemJson"];
export type AuthorizationOutcome = Schemas["AuthorizationOutcome"];
export type AuthorizationRequest = Schemas["AuthorizationRequest"];
export type PosTerminal = Schemas["PosTerminal"];
export type PosResponse = Schemas["PosResponse"];
export type AuthorizationOutcomeDetails = Schemas["AuthorizationOutcomeDetails"];

export const problem = (status: number, title: string, detail: string): ProblemJson => ({
  type: "about:blank",
  title,
  status,
  detail,
});
