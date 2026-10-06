import { scriptStats, toLatin } from "./crea-ocr";

/**
 * Glasom do opisa (K25, U8): izgovoreno (Web Speech API u pregledaču) se dopisuje u
 * polje. Chrome za `sr-RS` vraća ćirilicu, a naši korisnici pišu uglavnom latinicom -
 * zato se izgovoreno prebaci u latinicu, osim kad je polje već pisano ćirilicom.
 */
export function appendSpoken(current: string, spoken: string, maxLength?: number): string {
  const said = spoken.replace(/\s+/g, " ").trim();
  if (!said) return current;
  const keepCyrillic = scriptStats(current).dominant === "cirilica";
  let piece = keepCyrillic ? said : toLatin(said);
  const base = current.replace(/\s+$/, "");
  if (!base || /[.!?]$/.test(base)) piece = piece.charAt(0).toLocaleUpperCase("sr") + piece.slice(1);
  const next = base ? `${base} ${piece}` : piece;
  return maxLength !== undefined && next.length > maxLength ? next.slice(0, maxLength) : next;
}
