/**
 * QR kod u brend bojama (S31, K09): šta ide u kod (link, tekst, Wi-Fi) i da li
 * će ga telefon pročitati (kontrast, tamno na svetlom, dužina). Crtanje radi
 * `qr-code-styling` u `components/crea/tools/qr-tool.tsx`.
 */

import { contrastRatio, hexToRgb, relativeLuminance } from "./crea-palette";

export type QrKind = "link" | "tekst" | "wifi";
export const QR_KINDS: readonly QrKind[] = ["link", "tekst", "wifi"];

export type WifiSecurity = "WPA" | "WEP" | "nopass";
export type QrFields = {
  link: string;
  text: string;
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
};

export const EMPTY_QR_FIELDS: QrFields = { link: "", text: "", ssid: "", password: "", security: "WPA", hidden: false };

/**
 * Najviše bajtova u kodu. QR verzija 40 sa nivoom „Q" prima ~1660 bajtova, ali
 * tako gust kod telefon teško čita sa papira; 900 je razuman plafon za meni ili poruku.
 */
export const QR_MAX_BYTES = 900;

export type QrProblem = "prazno" | "los-link" | "predugo";

/** „nauciai.com" → „https://nauciai.com". Šema koja nije web/mejl/telefon se odbija. */
export function normalizeLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    // Bez tačke u imenu (npr. „https://nauciai") to nije adresa sajta.
    return url.hostname.includes(".") || url.hostname === "localhost" ? withScheme : null;
  }
  return url.protocol === "mailto:" || url.protocol === "tel:" ? withScheme : null;
}

/** Wi-Fi zapis koji čitaju kamere na Androidu i iPhone-u; `\ ; , : "` se pišu sa `\`. */
export function wifiPayload(fields: Pick<QrFields, "ssid" | "password" | "security" | "hidden">): string {
  const escape = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");
  const parts = [`T:${fields.security}`, `S:${escape(fields.ssid)}`];
  if (fields.security !== "nopass") parts.push(`P:${escape(fields.password)}`);
  if (fields.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function qrPayload(kind: QrKind, fields: QrFields): { ok: true; data: string } | { ok: false; problem: QrProblem } {
  let data: string;
  if (kind === "link") {
    if (!fields.link.trim()) return { ok: false, problem: "prazno" };
    const link = normalizeLink(fields.link);
    if (!link) return { ok: false, problem: "los-link" };
    data = link;
  } else if (kind === "tekst") {
    if (!fields.text.trim()) return { ok: false, problem: "prazno" };
    data = fields.text.trim();
  } else {
    if (!fields.ssid.trim() || (fields.security !== "nopass" && !fields.password)) return { ok: false, problem: "prazno" };
    data = wifiPayload(fields);
  }
  return utf8Bytes(data) > QR_MAX_BYTES ? { ok: false, problem: "predugo" } : { ok: true, data };
}

/** Boje QR koda (crtež na platnu, ne `className` - zato HEX). Brend: mastilo, žuta, papir. */
export const QR_COLOR_PRESETS = [
  { id: "mastilo", label: { sr: "Mastilo na papiru", en: "Ink on paper" }, dots: "#0e3158", background: "#fffdf8" },
  { id: "zuta", label: { sr: "Mastilo na žutoj", en: "Ink on yellow" }, dots: "#0e3158", background: "#f4be30" },
  { id: "klasika", label: { sr: "Crno na belom", en: "Black on white" }, dots: "#000000", background: "#ffffff" },
] as const;

/** Ispod ovoga kamere telefona često ne vide kod (posebno na ekranu ili mat papiru). */
export const QR_MIN_CONTRAST = 4;

export type QrColorProblem = "nevazeca-boja" | "slab-kontrast" | "obrnuto";

/**
 * Da li će se kod čitati. Svetle tačke na tamnoj pozadini („obrnuto") mnoge
 * kamere uopšte ne prepoznaju, pa i to vraćamo kao problem.
 */
export function qrColorProblem(dots: string, background: string): QrColorProblem | null {
  const fg = hexToRgb(dots);
  const bg = hexToRgb(background);
  if (!fg || !bg) return "nevazeca-boja";
  if (relativeLuminance(fg) > relativeLuminance(bg)) return "obrnuto";
  if (contrastRatio(fg, bg) < QR_MIN_CONTRAST) return "slab-kontrast";
  return null;
}

/** Ime fajla po sadržaju: „qr-nauciai-com.png", „qr-wifi-kuca.png". */
export function qrFileName(kind: QrKind, fields: QrFields): string {
  const source =
    kind === "link" ? fields.link.replace(/^[a-z]+:\/\//i, "") : kind === "wifi" ? `wifi-${fields.ssid}` : "tekst";
  const slug = source
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "dj")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `qr-${slug || "kod"}.png`;
}
