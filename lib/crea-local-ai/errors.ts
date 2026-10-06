import { CREA_LOCAL_AI_ERROR_COPY } from "../crea-copy";
import type { Locale } from "../i18n";

/**
 * Greške lokalnog AI-ja (K04). Kod je ono što UI razlikuje; rečenicu za
 * korisnika daje `localAiErrorMessage` - nikad sirov tekst izuzetka iz WASM-a.
 */
export const LOCAL_AI_ERROR_CODES = [
  "ABORTED",
  "NETWORK",
  "INTEGRITY",
  "QUOTA",
  "UNSUPPORTED",
  "TOO_HEAVY",
  "BAD_INPUT",
  "MODEL_LOAD_FAILED",
  "INFERENCE_FAILED",
] as const;
export type LocalAiErrorCode = (typeof LOCAL_AI_ERROR_CODES)[number];

export class CreaLocalAiError extends Error {
  readonly code: LocalAiErrorCode;

  constructor(code: LocalAiErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "CreaLocalAiError";
    this.code = code;
  }
}

/** Bilo koja greška → kod. Odustajanje (`AbortError`) i pun disk se prepoznaju po imenu. */
export function toLocalAiError(error: unknown, fallback: LocalAiErrorCode): CreaLocalAiError {
  if (error instanceof CreaLocalAiError) return error;
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "AbortError") return new CreaLocalAiError("ABORTED", error);
  if (name === "QuotaExceededError") return new CreaLocalAiError("QUOTA", error);
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return new CreaLocalAiError("NETWORK", error);
  }
  return new CreaLocalAiError(fallback, error);
}

export function localAiErrorMessage(code: LocalAiErrorCode, locale: Locale): string {
  return CREA_LOCAL_AI_ERROR_COPY[code][locale];
}
