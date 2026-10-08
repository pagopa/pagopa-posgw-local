import type { components } from "./generated/psp-pos-layer.js";

type Schemas = components["schemas"];

export type ProblemJson = Schemas["ProblemJson"];
export type AuthorizationOutcome = Schemas["AuthorizationOutcome"];

export const problem = (status: number, title: string, detail: string): ProblemJson => ({
  type: "about:blank",
  title,
  status,
  detail,
});
