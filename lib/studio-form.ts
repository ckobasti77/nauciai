import type { Locale } from "./i18n";
import { PROMPT_MAX_LENGTH } from "./studio-messages";

export { PROMPT_MAX_LENGTH };

/** Koliko starijih generacija stoji ispod glavnog rezultata (STUDIO-PLAN A12). */
export const RECENT_JOBS_COUNT = 6;

export type StudioField =
  | { kind: "textarea"; key: string; label: string; maxLength: number }
  | { kind: "select"; key: string; label: string; options: string[] }
  | { kind: "number"; key: string; label: string; min?: number; max?: number };

export type ParamValues = Record<string, string | number>;

/**
 * Forma se gradi iz `modelCatalog.paramSchema`, ali propušta SAMO ono što
 * `studioCore.sanitizeParams` ume da primi: `textarea`/`text`, `select` sa
 * nepraznim skupom i `number`. Polje nepoznatog tipa bi bilo kontrola čiju bi
 * vrednost server tiho bacio, a `select` bez opcija kontrola koja ne može da
 * ponudi nijednu vrednost koju server prihvata - oba se zato ne renderuju.
 */
export function parseParamSchema(schemaJson: string): StudioField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const fields: StudioField[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const field = entry as Record<string, unknown>;
    if (typeof field.key !== "string" || typeof field.type !== "string") continue;
    const label = typeof field.label === "string" ? field.label : field.key;

    if (field.type === "textarea" || field.type === "text") {
      const declared = typeof field.maxLength === "number" ? field.maxLength : PROMPT_MAX_LENGTH;
      fields.push({
        kind: "textarea",
        key: field.key,
        label,
        // Šema sme da bude strožija od servera, ali ne i blaža: brojač koji
        // dozvoljava 5000 znakova vodi pravo u `NEISPRAVAN_PROMPT`.
        maxLength: Math.min(declared, PROMPT_MAX_LENGTH),
      });
      continue;
    }

    if (field.type === "select") {
      const options = Array.isArray(field.options)
        ? field.options.filter((option): option is string => typeof option === "string")
        : [];
      if (options.length === 0) continue;
      fields.push({ kind: "select", key: field.key, label, options });
      continue;
    }

    if (field.type === "number") {
      fields.push({
        kind: "number",
        key: field.key,
        label,
        min: typeof field.min === "number" ? field.min : undefined,
        max: typeof field.max === "number" ? field.max : undefined,
      });
    }
  }

  return fields;
}

/** Prompt polje je jedino koje server prihvata i kad ga šema ne pominje. */
export function promptField(fields: StudioField[]): { key: string; label: string; maxLength: number } {
  const declared = fields.find((field) => field.kind === "textarea" && field.key === "prompt");
  if (declared && declared.kind === "textarea") {
    return { key: declared.key, label: declared.label, maxLength: declared.maxLength };
  }
  return { key: "prompt", label: "Prompt", maxLength: PROMPT_MAX_LENGTH };
}

/** Kontrole ispod prompta: sve iz šeme osim samog prompta. */
export function controlFields(fields: StudioField[]): StudioField[] {
  return fields.filter((field) => field.key !== "prompt");
}

export function clampNumber(value: number, field: { min?: number; max?: number }): number {
  const low = field.min !== undefined ? Math.max(value, field.min) : value;
  return field.max !== undefined ? Math.min(low, field.max) : low;
}

/**
 * Početne vrednosti forme: `modelCatalog.defaultParams` gde je vrednost
 * upotrebljiva, inače prva opcija odnosno `min`. Vrednost iz `defaultParams`
 * koja nije u skupu opcija se ne prikazuje - server bi je odbio
 * (`NEDOZVOLJENA_VREDNOST`), pa forma ne sme da je ponudi.
 *
 * `modelCatalog.listModels` od N2 više ne izlaže `defaultParams` klijentu, pa
 * Studio forma zove ovu funkciju bez drugog argumenta i pada na prvu opciju
 * odnosno `min`. Podrazumevane vrednosti modela i dalje stižu do fal-a -
 * `studioActions.submitJob` ih spaja ispod `job.params`.
 */
export function initialParamValues(fields: StudioField[], defaultParamsJson = "{}"): ParamValues {
  let defaults: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(defaultParamsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      defaults = parsed as Record<string, unknown>;
    }
  } catch {
    defaults = {};
  }

  const values: ParamValues = {};
  for (const field of controlFields(fields)) {
    const fromDefaults = defaults[field.key];

    if (field.kind === "select") {
      values[field.key] =
        typeof fromDefaults === "string" && field.options.includes(fromDefaults)
          ? fromDefaults
          : field.options[0];
      continue;
    }

    if (field.kind === "number") {
      const base =
        typeof fromDefaults === "number" && Number.isFinite(fromDefaults)
          ? fromDefaults
          : (field.min ?? 1);
      values[field.key] = clampNumber(base, field);
      continue;
    }

    values[field.key] = typeof fromDefaults === "string" ? fromDefaults : "";
  }

  return values;
}

/**
 * Objekat koji ide u `createJob`. Prolazi kroz ista pravila kao
 * `sanitizeParams` na serveru: nepoznat ključ ne postoji (gradi se iz šeme),
 * broj se odseca na `min`/`max`, a `select` van skupa ispada umesto da ode do
 * servera i tamo obori posao.
 */
export function buildJobParams(
  fields: StudioField[],
  values: ParamValues,
  prompt: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = { prompt };

  for (const field of controlFields(fields)) {
    const value = values[field.key];
    if (value === undefined || value === "") continue;

    if (field.kind === "select") {
      if (typeof value === "string" && field.options.includes(value)) params[field.key] = value;
      continue;
    }

    if (field.kind === "number") {
      const asNumber = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(asNumber)) continue;
      params[field.key] = clampNumber(asNumber, field);
      continue;
    }

    if (typeof value === "string") params[field.key] = value;
  }

  return params;
}

/**
 * Posao kome je `crons.expireGenerationFiles` obrisao fajl: rok postoji, a
 * fajla nema. Red u bazi namerno ostaje (STUDIO-PLAN 0.2), pa kartica ume da
 * kaže da je fajl istekao umesto da prikaže praznu sliku. Ne čita sat - stanje
 * se vidi iz same kombinacije polja.
 */
export function isExpiredOutput(job: {
  status: string;
  outputUrl?: string | null;
  expiresAt?: number;
}): boolean {
  return job.status === "done" && job.expiresAt !== undefined && !job.outputUrl;
}

/** Šta stoji na sitnoj pločici u traci ranijih generacija. */
export function jobTileState(job: {
  status: string;
  outputUrl?: string | null;
  expiresAt?: number;
}): "image" | "refunded" | "expired" | "pending" {
  if (job.outputUrl) return "image";
  if (job.status === "failed" || job.status === "refunded") return "refunded";
  if (isExpiredOutput(job)) return "expired";
  return "pending";
}

/**
 * Poruka koju posao nosi na kartici rezultata. `refunded` uvek kaže i da su
 * krediti vraćeni - to je jedino što korisnika u tom trenutku zanima.
 */
export function jobStatusText(
  job: { status: string; error?: string; outputUrl?: string | null; expiresAt?: number },
  locale: Locale,
): string {
  if (job.status === "reserved") {
    return locale === "sr" ? "Posao je u redu za obradu…" : "The job is queued…";
  }
  if (job.status === "running") {
    return locale === "sr" ? "Model radi na tvojoj slici…" : "The model is working on your image…";
  }
  if (job.status === "failed") {
    return locale === "sr" ? "Generacija nije uspela. Vraćamo kredite…" : "The generation failed. Refunding credits…";
  }
  if (job.status === "refunded") {
    return locale === "sr"
      ? "Generacija nije uspela - krediti su ti vraćeni."
      : "The generation failed - your credits have been refunded.";
  }
  if (job.status === "done" && !job.outputUrl) {
    if (isExpiredOutput(job)) {
      return locale === "sr"
        ? "Fajlu je istekao rok čuvanja. Prompt i model su ostali - generiši ponovo."
        : "The file's retention window has passed. The prompt and model remain - generate it again.";
    }
    // `IZLAZ_NIJE_SACUVAN` iz `persistOutput`: model je isporučio, fajl nije
    // stigao do nas. Namerno bez refunda, pa poruka to i kaže.
    return job.error
      ? locale === "sr"
        ? "Slika je generisana, ali nije uspela da se sačuva. Javi podršci."
        : "The image was generated but could not be saved. Please contact support."
      : locale === "sr"
        ? "Preuzimamo sliku…"
        : "Fetching the image…";
  }

  return locale === "sr" ? "Gotovo." : "Done.";
}

/** Prompt izvučen iz `generationJobs.params` za naslov kartice u galeriji. */
export function jobPrompt(paramsJson: string): string {
  try {
    const parsed: unknown = JSON.parse(paramsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    const prompt = (parsed as Record<string, unknown>).prompt;
    return typeof prompt === "string" ? prompt : "";
  } catch {
    return "";
  }
}

/**
 * Koliko slika forma naručuje. Matematika je namerno DUPLIRANA iz
 * `convex/studioCore.ts` (isti obrazac kao `lib/studio-admin.ts`) - "use
 * client" komponente u ovom repou ne uvoze `convex/*.ts` module direktno;
 * `lib/studio-form.test.ts` uvozi obe strane i tvrdi da se poklapaju.
 */
function requestedImageCount(params: Record<string, unknown>): number {
  const count = params.num_images;
  if (typeof count !== "number" || !Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

/**
 * Cena posla koju vidi korisnik: cena modela iz kataloga puta broj naručenih
 * slika. Mora da se poklapa sa `studioCore.computeCreditCost`, inače dugme
 * obeća jednu cifru a `createJob` skine drugu.
 */
export function jobCreditCost(creditCost: number, params: Record<string, unknown>): number {
  return creditCost * requestedImageCount(params);
}

/**
 * Tekst dugmeta. Cena je uvek u njemu i uvek dolazi iz kataloga (STUDIO-PLAN
 * 2.5) - nema stanja u kojem se dugme prikaže bez cene.
 */
export function generateButtonLabel(creditCost: number, locale: Locale): string {
  return locale === "sr" ? `Generiši - ${creditCost} kr` : `Generate - ${creditCost} cr`;
}
