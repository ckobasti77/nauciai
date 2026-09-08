/**
 * Studio alati MCP servera (MCP-P2-STUDIO, tačka 3; MCP-P3-ULAZI): katalog
 * modela, stanje pristupa i kredita, projekti, okačivanje fajlova, pokretanje
 * generisanja (i sa ulazima), detalj posla, galerija, čekanje na rezultat i
 * URL izlaza. `tools.ts` ih upisuje u registar pozivom `registerStudioTools`;
 * ovaj modul NE uvozi `tools.ts` (samo `toolDefinition.ts`), da ne bi bilo
 * ciklusa - vidi komentar uz poziv u `tools.ts`.
 *
 * Identitet pozivaoca je `principal.userId` iz API ključa, ne Convex Auth
 * sesija - zato svaki alat zove INTERNE varijante studio funkcija
 * (`*Internal`, primaju `userId`) koje dele telo sa javnim (`convex/studio.ts`,
 * `studioActions.ts`, `studioModels.ts`, `studioProjects.ts`, `credits.ts`).
 * Sve provere Studija - kill switch, pristup, limiti, uslovi, rezervacija
 * kredita, dozvola za upload, vlasništvo fajla - žive u tom deljenom telu, pa
 * važe i za ovaj put.
 *
 * Dve vrste grešaka, namerno razdvojene:
 * - neispravan ULAZ (tip, nepoznato polje, van opsega) je protokolska greška
 *   -32602, proverena po JSON Schemi PRE ijednog poziva u Convex;
 * - DOMENSKA greška Studija (STUDIO_PAUZIRAN, NEMA_PRISTUPA, nedovoljno
 *   kredita, limiti, ulaz koji model ne prima...) je `errorResult` sa čitljivom
 *   porukom na srpskom, jer model treba da vidi zašto nije prošlo i da može da
 *   reaguje. Neočekivana greška se ne prevodi - protokolski sloj je vraća kao
 *   -32603.
 */

import type { FunctionReturnType } from "convex/server";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { canMeasure } from "../../lib/media-duration";
import { measureFailureMessage, studioErrorCode, studioErrorMessage } from "../../lib/studio-messages";
import { visibleControls, type ParamValues } from "../../lib/studio-params";
import { optionalSlots } from "../../lib/studio-playground";
import { acceptExtensions, missingInput, slotKind, slotsForMode, type SlotFiles } from "../../lib/studio-slots";
import { UPLOAD_GRANT_TTL_MS } from "../studioCore";
import {
  acceptForSlot,
  type JobInputs,
  jobInputStorageIds,
  MAX_SLOT_BYTES,
  measuredSlotsFor,
  parseContinuationSource,
  parseInputModes,
  parseInputSpec,
  parseQuantitySource,
  sanitizeJobInputs,
} from "../studioJobCore";
import { parseParamSpec, sanitizeSpecParams } from "../studioParamSpec";
import { parsePriceRule } from "../studioPricing";
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "./apiKey";
import { JSON_RPC_ERROR, McpError, type ToolResult } from "./protocol";
import { errorResult, jsonResult, type ToolContext, type ToolDefinition } from "./toolDefinition";

// ── JSON Schema ulaza ──────────────────────────────────────────────────────

/** Podskup JSON Scheme koji šeme alata koriste - toliko i validator razume. */
type JsonSchema = {
  type: "object" | "string" | "integer" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  /** `false` zabranjuje nepoznata polja; šema ih proverava (mapa slot -> niz id-jeva). */
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  default?: number;
};

function invalidParams(path: string, problem: string): McpError {
  return new McpError(JSON_RPC_ERROR.INVALID_PARAMS, `Invalid params: ${path} ${problem}`);
}

/** Ulaz alata protiv njegove šeme; baca -32602 na prvo odstupanje. */
function assertMatches(schema: JsonSchema, value: unknown, path: string): void {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") throw invalidParams(path, "must be a string");
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        throw invalidParams(path, "must not be empty");
      }
      if (schema.enum && !schema.enum.includes(value)) {
        throw invalidParams(path, `must be one of: ${schema.enum.join(", ")}`);
      }
      return;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) throw invalidParams(path, "must be an integer");
      if (schema.minimum !== undefined && value < schema.minimum) {
        throw invalidParams(path, `must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        throw invalidParams(path, `must be at most ${schema.maximum}`);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) throw invalidParams(path, "must be an array");
      if (schema.items) value.forEach((item, index) => assertMatches(schema.items as JsonSchema, item, `${path}[${index}]`));
      return;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw invalidParams(path, "must be an object");
      }
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in record)) throw invalidParams(`${path}.${key}`, "is required");
      }
      for (const [key, child] of Object.entries(record)) {
        const childSchema = schema.properties?.[key];
        if (!childSchema) {
          if (schema.additionalProperties === false) throw invalidParams(`${path}.${key}`, "is not an allowed property");
          if (typeof schema.additionalProperties === "object") {
            assertMatches(schema.additionalProperties, child, `${path}.${key}`);
          }
          continue;
        }
        assertMatches(childSchema, child, `${path}.${key}`);
      }
    }
  }
}

const NO_INPUT: JsonSchema = { type: "object", properties: {}, required: [], additionalProperties: false };

const JOB_KINDS = ["image", "video", "audio"] as const;
type JobKind = (typeof JOB_KINDS)[number];

const DEFAULT_JOBS_LIMIT = 20;
const MAX_JOBS_LIMIT = 50;

const DEFAULT_WAIT_SECONDS = 30;
/** Gornja granica čekanja: `wait_for_job` ne sme da drži HTTP akciju duže od minuta. */
const MAX_WAIT_SECONDS = 60;
const WAIT_POLL_INTERVAL_MS = 2_000;

/**
 * Koliko puta `register_upload` proba merenje u JEDNOM pozivu. Ponavlja se
 * samo nečitanje zaglavlja (`Range` zahtev koji padne) - nepoznat format i VBR
 * su deterministički, ponavljanje bi samo trošilo brojač neuspeha na fajlu.
 */
const MEASURE_ATTEMPTS = 3;
const RETRYABLE_MEASURE_REASON = "ZAGLAVLJE_NIJE_PROCITANO";

// ── oblici izlaza ──────────────────────────────────────────────────────────

type JobDetail = NonNullable<FunctionReturnType<typeof internal.studio.getJobForDetailInternal>>;

/** `params` je JSON string u bazi; modelu ide kao objekat. Sirov tekst ostaje ako nije JSON. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Jedan posao kako ga vide `get_job` i `list_my_jobs`: status, cena, vreme,
 * parametri i potpisan URL izlaza SAMO kad je posao gotov. Interna polja
 * (`outputStorageId`, `posterStorageId`) ne izlaze - modelu ne znače ništa.
 */
function toMcpJob(job: JobDetail) {
  return {
    jobId: job._id,
    status: job.status,
    modelSlug: job.modelSlug,
    kind: job.kind,
    creditCost: job.creditCost,
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    params: parseJson(job.params),
    outputUrl: job.status === "done" ? job.outputUrl : null,
    expiresAt: job.expiresAt ?? null,
    error: job.error ?? null,
    isMock: job.isMock,
  };
}

/**
 * Da li je posao stigao do kraja: `failed` i `refunded` uvek, a `done` tek kad
 * je izlaz i SAČUVAN (`persistOutput` ga skida od provajdera posle webhook-a)
 * ili kad je to čuvanje palo (`error`). "Gotov" bez fajla je stanje koje
 * traje sekund-dva, a agent koji na njega dobije "done" odmah zove
 * `get_output_url` i dobije "još se preuzima" - pa se čeka i taj korak.
 */
function isSettled(job: JobDetail): boolean {
  if (job.status === "failed" || job.status === "refunded") return true;

  return job.status === "done" && (job.outputStorageId !== undefined || job.error !== undefined);
}

/**
 * Potpisani URL-ovi izlaza gotovog posla, ili razlog zašto ih nema. Poster se
 * potpisuje ovde, u akciji - detalj posla ga nosi samo kao `storageId`.
 */
async function outputLinks(
  ctx: ToolContext,
  job: JobDetail,
): Promise<{ ok: true; outputs: { outputUrl: string; posterUrl: string | null; expiresAt: number | null } } | { ok: false; message: string }> {
  if (job.status !== "done") {
    return { ok: false, message: `Posao je u stanju "${job.status}"; izlaz postoji samo za status "done". (POSAO_NIJE_GOTOV)` };
  }
  if (job.outputStorageId === undefined) {
    return job.error !== undefined
      ? { ok: false, message: `Izlaz posla nije sačuvan: ${job.error}` }
      : { ok: false, message: "Izlaz se još preuzima od provajdera. Pozovi ponovo za koji sekund. (IZLAZ_U_PRIPREMI)" };
  }
  if (!job.outputUrl) {
    return { ok: false, message: "Izlaz posla je istekao i obrisan je iz skladišta. (IZLAZ_ISTEKAO)" };
  }
  const posterUrl = job.posterStorageId ? await ctx.convex.storage.getUrl(job.posterStorageId) : null;

  return { ok: true, outputs: { outputUrl: job.outputUrl, posterUrl, expiresAt: job.expiresAt ?? null } };
}

/** Domenska greška `createJob`-a -> čitljiv tekst za model; `null` za neočekivanu. */
function studioErrorResult(error: unknown): ToolResult | null {
  const raw = error instanceof Error ? error.message : String(error);
  const code = studioErrorCode(raw);
  if (!code) return null;

  return errorResult(`${studioErrorMessage(code, "sr")} (${code})`);
}

/**
 * Greške upload lanca koje `lib/studio-messages` ne poznaje - klijentska forma
 * ih nikad ne prikazuje (grant i storageId ne dolaze od korisnika), a MCP
 * agentu su jedini trag šta da ispravi.
 */
const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  FAJL_NE_POSTOJI:
    "Fajl sa tim storageId-jem ne postoji u skladištu. Proveri da je upload na uploadUrl prošao i da prosleđuješ storageId iz odgovora na upload.",
  NEDOZVOLJEN_UPLOAD:
    "Dozvola za upload nije važeća: ne postoji, nije tvoja, već je iskorišćena, istekla je ili je fajl okačen pre nego što je izdata. Pozovi create_upload_url ponovo i okači fajl na nov uploadUrl.",
  NEISPRAVAN_SLOT:
    "Slot u pozivu se ne poklapa sa slotom za koji je dozvola izdata. Prosledi isti slot kao u create_upload_url, ili zatraži novu dozvolu za pravi slot.",
};

function uploadErrorResult(error: unknown): ToolResult | null {
  const raw = error instanceof Error ? error.message : String(error);
  for (const [code, message] of Object.entries(UPLOAD_ERROR_MESSAGES)) {
    if (raw.includes(code)) return errorResult(`${message} (${code})`);
  }

  return studioErrorResult(error);
}

/**
 * Odbijanje fajla po tipu/veličini pri prijavi (MCP-P3b). Server baca
 * `KOD:detalj` (lista tipova, odnosno granica u bajtima); odavde ide rečenica
 * koja kaže šta slot prima i šta je urađeno sa fajlom. `null` za sve ostalo.
 */
function rejectedFileMessage(error: unknown, slot: string): string | null {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /(NEISPRAVAN_TIP_FAJLA|FAJL_PREVELIK|PRAZAN_FAJL)(?::([^\s"']*))?/.exec(raw);
  if (!match) return null;
  const [, code, detail = ""] = match;
  const cleanup = "Fajl je obrisan iz skladišta; pozovi create_upload_url ponovo i okači ispravan fajl.";

  if (code === "NEISPRAVAN_TIP_FAJLA") {
    return `Slot "${slot}" prima ${acceptExtensions(detail.split(",").filter(Boolean))}, a okačen fajl ima drugi tip ili je poslat bez Content-Type zaglavlja. ${cleanup} (${code})`;
  }
  if (code === "FAJL_PREVELIK") {
    return `Fajl je veći od ${Math.round(Number(detail) / (1024 * 1024))} MB koliko slot "${slot}" prima. ${cleanup} (${code})`;
  }

  return `Okačen fajl je prazan. ${cleanup} (${code})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── provera narudžbine pre poziva u Convex ─────────────────────────────────

type OrderInput = {
  params: Record<string, unknown>;
  inputMode?: string;
  inputs?: JobInputs;
  sourceJobId?: string;
};

/** `{ image: [] }` je isto što i bez slota - i server prazan niz ne broji. */
function nonEmptyInputs(inputs: Record<string, string[]> | undefined): JobInputs {
  const clean: JobInputs = {};
  for (const [slot, ids] of Object.entries(inputs ?? {})) {
    if (ids.length > 0) clean[slot] = ids;
  }

  return clean;
}

/** `missingInput` broji fajlove po slotu; ostala polja `SlotFile`-a mu ne trebaju. */
function asSlotFiles(inputs: JobInputs): SlotFiles {
  const files: SlotFiles = {};
  for (const [slot, ids] of Object.entries(inputs)) {
    files[slot] = ids.map((storageId) => ({ storageId, name: storageId, mime: "", size: 0 }));
  }

  return files;
}

function describeSlots(spec: ReturnType<typeof slotsForMode>): string {
  return spec.map((entry) => `"${entry.slot}" (${slotKind(entry.accept)}, najviše ${entry.max})`).join(", ");
}

/**
 * Isti redosled provera kao `buildCatalogOrder` u `studio.ts` - režim, ulazi,
 * parametri, obavezni slotovi, izvor za nastavak, izmereno trajanje - ali
 * PRE poziva u Convex i sa rečenicom koja kaže šta tačno da se ispravi
 * (MCP-P3-ULAZI, tačka 3). Server posle ovoga radi SVE svoje provere iznova;
 * ovo je prevod, ne zamena. `null` znači "nema šta da se prevede unapred".
 */
async function describeOrderProblem(
  ctx: ToolContext,
  model: Doc<"models">,
  order: OrderInput,
): Promise<string | null> {
  const label = model.slug;
  const modes = parseInputModes(model.inputModes);
  const mode = order.inputMode ?? modes[0];
  if (mode === undefined || !modes.includes(mode)) {
    return `Model "${label}" nema ulazni režim "${order.inputMode ?? "-"}". Dostupni režimi: ${modes.join(", ")}. (NEISPRAVAN_REZIM)`;
  }

  const inputSpec = parseInputSpec(model.inputSpec);
  const slots = slotsForMode(inputSpec, mode);
  const inputs = order.inputs ?? {};
  const sanitizedInputs = sanitizeJobInputs(inputs, inputSpec, mode);
  if (!sanitizedInputs.ok) {
    const [reason, slot] = sanitizedInputs.reason.split(":");
    if (reason === "PREVISE_FAJLOVA") {
      const allowed = slots.find((entry) => entry.slot === slot);
      return `Model "${label}" u slotu "${slot}" prima najviše ${allowed?.max ?? 1} fajl(ova). (NEISPRAVNI_ULAZI)`;
    }

    return `Model "${label}" u režimu "${mode}" ne prima slot "${slot}". ${
      slots.length > 0 ? `Dostupni slotovi: ${describeSlots(slots)}.` : "Ovaj režim ne prima fajlove."
    } (NEISPRAVNI_ULAZI)`;
  }

  const spec = parseParamSpec(model.paramSpec);
  const rule = parsePriceRule(model.priceRule);
  // Neispravan katalog red server odbija kao MODEL_NEDOSTUPAN - nema šta da se prevodi.
  if (!spec || !rule) return null;

  const controls = visibleControls(spec, mode);
  const unknown = Object.keys(order.params).find((key) => !controls.some((control) => control.key === key));
  if (unknown !== undefined) {
    return `Model "${label}" u režimu "${mode}" nema parametar "${unknown}". Dostupni parametri: ${
      controls.map((control) => control.key).join(", ") || "nijedan"
    }. (NEISPRAVNI_PARAMETRI)`;
  }
  const sanitizedParams = sanitizeSpecParams(spec, rule, order.params, mode);
  if (!sanitizedParams.ok) {
    const [reason, detail] = sanitizedParams.reason.split(":");
    const control = controls.find((candidate) => candidate.key === detail);
    if (reason === "NEPOZNATA_VREDNOST_PARAMETRA") {
      return `Parametar "${detail}" modela "${label}" prima samo: ${(control?.options ?? [])
        .map((option) => option.value)
        .join(", ")}. (NEISPRAVNI_PARAMETRI)`;
    }
    if (reason === "VAN_OPSEGA") {
      return `Parametar "${detail}" modela "${label}" je daleko van opsega (min ${control?.min ?? "-"}, max ${control?.max ?? "-"}). (NEISPRAVNI_PARAMETRI)`;
    }

    return `Kombinacija parametara ${detail} nema cenu za model "${label}"; izaberi drugu vrednost. (NEISPRAVNI_PARAMETRI)`;
  }

  // Obavezni slotovi po istim pravilima koja zaključavaju dugme u formi
  // (`lib/studio-slots.ts`): prvi i poslednji kadar traže oba, reference bar
  // jedan, ostali režimi po jedan u svakom slotu koji parametar nije isključio.
  const missing = missingInput(inputSpec, mode, asSlotFiles(inputs), optionalSlots(spec, order.params as ParamValues, inputSpec, mode));
  if (missing) {
    const how = "Okači fajl kroz create_upload_url i register_upload, pa prosledi storageId u inputs.";
    if (missing.kind === "frame") {
      return `Model "${label}" u režimu "${mode}" traži dva kadra (prvi i poslednji) u slotu "image". ${how} (NEPOTPUN_ULAZ)`;
    }
    if (missing.kind === "any") {
      return `Model "${label}" u režimu "${mode}" traži bar jedan fajl u nekom od slotova: ${describeSlots(slots)}. ${how} (NEPOTPUN_ULAZ)`;
    }
    const slot = slots.find((entry) => entry.slot === missing.slot);

    return `Model "${label}" u režimu "${mode}" traži ulaz tipa ${slotKind(slot?.accept ?? [])} u slotu "${missing.slot}". ${how} (NEPOTPUN_ULAZ)`;
  }

  const continuation = parseContinuationSource(model.capabilities);
  if (continuation && mode === continuation.mode) {
    if (!order.sourceJobId) {
      return `Režim "${mode}" modela "${label}" se naručuje izborom ranije generacije: prosledi sourceJobId (posao ISTOG modela sa statusom done). (IZVOR_NIJE_IZABRAN)`;
    }
  } else if (order.sourceJobId) {
    return `Model "${label}" u režimu "${mode}" ne prima sourceJobId${
      continuation ? ` - prima ga samo režim "${continuation.mode}"` : ""
    }. (IZVOR_NIJE_PODRZAN)`;
  }

  // Model koji se naplaćuje po trajanju okačenog snimka sme da krene tek kad
  // je server to trajanje pročitao iz zaglavlja (`register_upload` ga meri).
  // Bez ovoga bi posao pao na sirovo MERENJE_NIJE_DOSTUPNO - a agentu treba
  // da zna DA LI da ponovi ili da okači drugi fajl.
  const source = parseQuantitySource(model.capabilities);
  if (source && source.from !== "text_length") {
    const measuredSlots = measuredSlotsFor(source).filter((slot) => Object.hasOwn(inputs, slot));
    const ids = jobInputStorageIds(Object.fromEntries(measuredSlots.map((slot) => [slot, inputs[slot]])));
    if (ids.length > 0) {
      const uploads = await ctx.convex.runQuery(internal.studio.getUploadsForInputsInternal, {
        userId: ctx.principal.userId,
        storageIds: ids,
      });
      if (ids.some((id) => uploads[id] === null)) {
        return `${studioErrorMessage("TUDJI_FAJL", "sr")} (TUDJI_FAJL)`;
      }
      if (!ids.some((id) => (uploads[id]?.durationS ?? 0) > 0)) {
        const failures = Math.max(...ids.map((id) => uploads[id]?.measureFailures ?? 0));

        return `Model "${label}" se naplaćuje po trajanju snimka, a fajl u slotu "${measuredSlots.join("/")}" još nije izmeren${
          failures > 0 ? ` (merenje je palo ${failures}x)` : ""
        }. Pozovi register_upload za taj fajl (on pokreće merenje) pa ponovi za koji sekund - posao NIJE poslat. (MERENJE_NIJE_DOSTUPNO)`;
      }
    }
  }

  return null;
}

// ── alati ──────────────────────────────────────────────────────────────────

type StudioToolInput = {
  create_generation: {
    modelSlug: string;
    params: Record<string, unknown>;
    projectId?: string;
    inputMode?: string;
    inputs?: Record<string, string[]>;
    sourceJobId?: string;
  };
  create_upload_url: { slot: string };
  register_upload: { storageId: string; grantId: string; slot: string };
  get_job: { jobId: string };
  wait_for_job: { jobId: string; timeoutSeconds?: number };
  list_my_jobs: { limit?: number; kind?: JobKind; modelSlug?: string; projectId?: string; cursor?: string };
};

const STUDIO_TOOLS: Record<string, ToolDefinition> = {
  list_models: {
    description:
      "Uključeni Studio modeli: slug, vrsta (image/video/audio), provajder, porodica, nazivi, ulazni režimi (inputModes), slotovi po režimu (inputSpec), specifikacija parametara (paramSpec), cenovno pravilo i mogućnosti.",
    inputSchema: NO_INPUT,
    scope: MCP_SCOPE_READ,
    handler: async (_input, ctx) => {
      const models = await ctx.convex.runQuery(internal.studioModels.listModelsInternal, {
        userId: ctx.principal.userId,
      });

      return jsonResult(
        models.map((model) => ({
          slug: model.slug,
          kind: model.kind,
          provider: model.provider,
          family: model.family,
          labelSr: model.labelSr,
          labelEn: model.labelEn,
          taglineSr: model.taglineSr,
          inputModes: parseJson(model.inputModes),
          inputSpec: parseJson(model.inputSpec),
          paramSpec: parseJson(model.paramSpec),
          priceRule: parseJson(model.priceRule),
          capabilities: parseJson(model.capabilities),
        })),
      );
    },
  },

  get_studio_state: {
    description:
      "Stanje Studija za pozivaoca: da li je uključen, da li korisnik ima pristup i zašto ne, aktivni poslovi i limit, prihvaćeni uslovi, i saldo kredita.",
    inputSchema: NO_INPUT,
    scope: MCP_SCOPE_READ,
    handler: async (_input, ctx) => {
      const userId = ctx.principal.userId;
      const [state, credits] = await Promise.all([
        ctx.convex.runQuery(internal.studio.getStudioStateInternal, { userId }),
        ctx.convex.runQuery(internal.credits.getBalanceInternal, { userId }),
      ]);

      return jsonResult({ ...state, credits });
    },
  },

  list_projects: {
    description: "Nearhivirani Studio projekti pozivaoca: id, ime i datum nastanka.",
    inputSchema: NO_INPUT,
    scope: MCP_SCOPE_READ,
    handler: async (_input, ctx) => {
      const projects = await ctx.convex.runQuery(internal.studioProjects.listActiveProjectsInternal, {
        userId: ctx.principal.userId,
      });

      return jsonResult({ projects });
    },
  },

  create_upload_url: {
    description:
      "Korak 1 okačivanja ulaznog fajla (slika, video, zvuk) za create_generation. Vraća uploadUrl na koji se fajl šalje HTTP POST-om (telo = sirovi bajtovi, Content-Type = MIME tip, OBAVEZNO), grantId koji se vraća u register_upload, i šta slot prima (accept, maxBytes) - fajl van toga register_upload odbija i briše. Dozvola važi jednom i sat vremena.",
    inputSchema: {
      type: "object",
      properties: {
        slot: {
          type: "string",
          minLength: 1,
          description: "Slot u koji fajl ide, iz inputSpec-a modela za izabrani režim (npr. image, video, audio).",
        },
      },
      required: ["slot"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_WRITE,
    handler: async (input, ctx) => {
      const { slot } = input as StudioToolInput["create_upload_url"];

      let grant: FunctionReturnType<typeof internal.studio.createInputUploadUrlInternal>;
      try {
        grant = await ctx.convex.runMutation(internal.studio.createInputUploadUrlInternal, {
          userId: ctx.principal.userId,
          slot,
        });
      } catch (error) {
        const domain = uploadErrorResult(error);
        if (domain) return domain;
        throw error;
      }

      const accept = acceptForSlot(slot);

      return jsonResult({
        uploadUrl: grant.uploadUrl,
        grantId: grant.grantId,
        slot,
        accept,
        maxBytes: MAX_SLOT_BYTES[slotKind(accept)],
        grantExpiresInSeconds: UPLOAD_GRANT_TTL_MS / 1000,
        instructions: `Pošalji sadržaj fajla HTTP POST zahtevom na uploadUrl: telo su sirovi bajtovi fajla, zaglavlje Content-Type je MIME tip fajla i OBAVEZNO je (slot "${slot}" prima: ${accept.join(", ")}; najviše ${Math.round(MAX_SLOT_BYTES[slotKind(accept)] / (1024 * 1024))} MB). Odgovor je JSON {"storageId": "..."}. Zatim pozovi register_upload sa tim storageId-jem, ovim grantId-jem i istim slotom; fajl pogrešnog tipa ili veličine register_upload odbija i briše.`,
      });
    },
  },

  register_upload: {
    description:
      "Korak 2 okačivanja: prijavljuje fajl okačen na uploadUrl iz create_upload_url. Server proverava tip (Content-Type iz skladišta mora da bude u accept listi slota) i veličinu (maxBytes); fajl koji ne prođe se odbija I BRIŠE iz skladišta (NEISPRAVAN_TIP_FAJLA, FAJL_PREVELIK, PRAZAN_FAJL). Za video i zvuk odmah meri trajanje iz zaglavlja fajla (durationS) - bez njega modeli koji se naplaćuju po trajanju ne primaju posao. Vraća uploadId, storageId, slot, bytes, mimeType i durationS (null kad merenje nije primenjivo ili nije uspelo; tada i measureError).",
    inputSchema: {
      type: "object",
      properties: {
        storageId: { type: "string", minLength: 1, description: "storageId iz JSON odgovora na upload." },
        grantId: { type: "string", minLength: 1, description: "grantId iz create_upload_url." },
        slot: { type: "string", minLength: 1, description: "Isti slot kao u create_upload_url." },
      },
      required: ["storageId", "grantId", "slot"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_WRITE,
    handler: async (input, ctx) => {
      const { storageId, grantId, slot } = input as StudioToolInput["register_upload"];
      const userId = ctx.principal.userId;

      let registered: FunctionReturnType<typeof internal.studio.registerInputUploadInternal>;
      try {
        registered = await ctx.convex.runMutation(internal.studio.registerInputUploadInternal, {
          userId,
          storageId,
          grantId,
          slot,
        });
      } catch (error) {
        // Fajl pogrešnog tipa ili veličine (MCP-P3b): mutacija ga je odbila
        // POSLE vezivanja dozvole, pa je dokazano svež upload ovog ključa - i
        // briše se ODAVDE, iz akcije, jer bi brisanje u mutaciji otišlo sa
        // rollback-om. Bez ovoga bi 300 MB bez ijednog reda ostalo u skladištu
        // zauvek: `crons.expireGenerationFiles` briše samo prijavljene fajlove.
        const rejected = rejectedFileMessage(error, slot);
        if (rejected) {
          await ctx.convex.storage.delete(storageId as Id<"_storage">);

          return errorResult(rejected);
        }
        const domain = uploadErrorResult(error);
        if (domain) return domain;
        throw error;
      }

      // Merenje samo za snimke: MIME iz `_storage` je prvi izbor, a slot
      // "video"/"audio" pokriva upload bez Content-Type zaglavlja - parser
      // zaglavlja format ionako prepoznaje iz bajtova.
      const isRecording =
        canMeasure(registered.mimeType ?? "") || registered.slot === "video" || registered.slot === "audio";
      let durationS = registered.durationS;
      let failure: string | null = null;
      let attempts = 0;
      if (durationS === null && isRecording) {
        while (attempts < MEASURE_ATTEMPTS) {
          attempts += 1;
          const measured = await ctx.convex.runAction(internal.studioActions.measureInputUploadInternal, {
            userId,
            storageId,
          });
          if (measured.ok) {
            durationS = measured.seconds;
            failure = null;
            break;
          }
          failure = measured.reason;
          if (measured.reason !== RETRYABLE_MEASURE_REASON) break;
        }
      }

      return jsonResult({
        uploadId: registered.uploadId,
        storageId,
        slot: registered.slot,
        bytes: registered.bytes,
        mimeType: registered.mimeType,
        durationS,
        measured: isRecording,
        ...(failure
          ? {
              measureError: `${measureFailureMessage(failure, "sr")}${
                attempts >= MEASURE_ATTEMPTS
                  ? ` Merenje je palo ${attempts} puta u ovom pozivu; ako ponovo padne, okači fajl iznova kao MP4 ili WAV.`
                  : ""
              } (${failure})`,
            }
          : {}),
      });
    },
  },

  create_generation: {
    description:
      "Pokreće generisanje u Studiju i TROŠI KREDITE pozivaoca. `params` su parametri modela po njegovom paramSpec-u (prompt i ostalo). Za image-to-video i slične režime prosledi `inputMode` (iz inputModes modela) i `inputs` ({ slot: [storageId] } iz register_upload); za režime sa capabilities.continuation prosledi `sourceJobId`. Vraća jobId, status, cenu u kreditima i slug modela; rezultat se čeka kroz wait_for_job.",
    inputSchema: {
      type: "object",
      properties: {
        modelSlug: { type: "string", minLength: 1, description: "Slug modela iz list_models." },
        params: { type: "object", description: "Parametri modela (npr. { \"prompt\": \"...\" }), po paramSpec-u modela." },
        inputMode: {
          type: "string",
          minLength: 1,
          description: "Ulazni režim iz inputModes modela (npr. text, image, video). Podrazumevano prvi režim modela.",
        },
        inputs: {
          type: "object",
          description:
            "Okačeni fajlovi po slotu: { \"image\": [\"<storageId>\"] }. storageId dolazi iz register_upload; slotovi po inputSpec-u modela za izabrani režim.",
          additionalProperties: { type: "array", items: { type: "string", minLength: 1 } },
        },
        sourceJobId: {
          type: "string",
          minLength: 1,
          description: "Id ranije gotove generacije ISTOG modela - samo za režim iz capabilities.continuation.",
        },
        projectId: { type: "string", minLength: 1, description: "Id projekta iz list_projects (opciono)." },
      },
      required: ["modelSlug", "params"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_WRITE,
    handler: async (input, ctx) => {
      const { modelSlug, params, projectId, inputMode, sourceJobId } = input as StudioToolInput["create_generation"];
      const rawInputs = (input as StudioToolInput["create_generation"]).inputs;
      const inputs = rawInputs === undefined ? undefined : nonEmptyInputs(rawInputs);
      const userId = ctx.principal.userId;

      // Prevod neispravne narudžbine u rečenicu PRE poziva u Convex (tačka 3).
      // Stari `modelCatalog` nema režime ni slotove - njemu ulazi ne mogu ni da
      // se pošalju; nepostojeći slug ide serveru, koji ga odbija kao i do sada.
      const model = await ctx.convex.runQuery(internal.studioModels.getModelBySlug, { slug: modelSlug });
      if (model) {
        if (model.isEnabled) {
          const problem = await describeOrderProblem(ctx, model, { params, inputMode, inputs, sourceJobId });
          if (problem) return errorResult(problem);
        }
      } else if (inputMode !== undefined || inputs !== undefined || sourceJobId !== undefined) {
        return errorResult(
          `Model "${modelSlug}" nije u katalogu sa ulaznim režimima, pa inputMode, inputs i sourceJobId ne može da primi. (MODEL_NEDOSTUPAN)`,
        );
      }

      let created: FunctionReturnType<typeof internal.studio.createJobInternal>;
      try {
        // `createJob` prima `params` i `inputs` kao JSON stringove - alat prima objekte i serijalizuje ih.
        created = await ctx.convex.runMutation(internal.studio.createJobInternal, {
          userId,
          modelSlug,
          params: JSON.stringify(params),
          ...(inputMode !== undefined ? { inputMode } : {}),
          ...(inputs !== undefined ? { inputs: JSON.stringify(inputs) } : {}),
          ...(sourceJobId !== undefined ? { sourceJobId } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        });
      } catch (error) {
        const domain = studioErrorResult(error);
        if (domain) return domain;
        throw error;
      }

      // Pogodak blok liste nije izuzetak nego povratna vrednost (F2.5) - modelu
      // ide ista rečenica kao korisniku u formi, plus kategorija.
      if (typeof created !== "string") {
        return errorResult(
          `${studioErrorMessage("NEISPRAVAN_PROMPT:ZABRANJEN_POJAM", "sr")} (ZABRANJEN_POJAM: ${created.moderationBlocked.category})`,
        );
      }

      const job = await ctx.convex.runQuery(internal.studio.getJobForDetailInternal, { userId, jobId: created });

      return jsonResult({
        jobId: created,
        status: job?.status ?? "reserved",
        creditCost: job?.creditCost ?? null,
        modelSlug,
      });
    },
  },

  get_job: {
    description:
      "Jedan posao pozivaoca po jobId-ju: status (reserved/running/done/failed/refunded), model, cena, vreme, parametri i URL izlaza kad je gotov.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string", minLength: 1, description: "Id posla iz create_generation ili list_my_jobs." } },
      required: ["jobId"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_READ,
    handler: async (input, ctx) => {
      const { jobId } = input as StudioToolInput["get_job"];
      const job = await ctx.convex.runQuery(internal.studio.getJobForDetailInternal, {
        userId: ctx.principal.userId,
        jobId,
      });
      // Tuđ, nepostojeći i neparsiv id daju istu rečenicu - ne otkriva se ni da red postoji.
      if (!job) return errorResult("Posao nije pronađen.");

      return jsonResult(toMcpJob(job));
    },
  },

  wait_for_job: {
    description:
      `Čeka da posao stigne u završno stanje (done sa sačuvanim izlazom, failed ili refunded), najviše timeoutSeconds (podrazumevano ${DEFAULT_WAIT_SECONDS}, najviše ${MAX_WAIT_SECONDS}). Vraća {status, jobId, creditCost, outputs?, error?, timedOut}; kad istekne, timedOut je true i poziv se prosto ponavlja - to nije greška.`,
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", minLength: 1, description: "Id posla iz create_generation." },
        timeoutSeconds: {
          type: "integer",
          minimum: 1,
          maximum: MAX_WAIT_SECONDS,
          default: DEFAULT_WAIT_SECONDS,
          description: `Koliko sekundi najduže da se čeka (1-${MAX_WAIT_SECONDS}).`,
        },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_READ,
    handler: async (input, ctx) => {
      const { jobId, timeoutSeconds = DEFAULT_WAIT_SECONDS } = input as StudioToolInput["wait_for_job"];
      const userId = ctx.principal.userId;

      // Budžet se troši po iteracijama, ne po satu: zbir spavanja je tačno
      // `timeoutSeconds`, pa akcija ne živi duže od toga plus koji upit.
      let remainingMs = timeoutSeconds * 1000;
      for (;;) {
        const job = await ctx.convex.runQuery(internal.studio.getJobForDetailInternal, { userId, jobId });
        if (!job) return errorResult("Posao nije pronađen.");

        if (isSettled(job)) {
          const links = job.status === "done" ? await outputLinks(ctx, job) : null;

          return jsonResult({
            status: job.status,
            jobId: job._id,
            creditCost: job.creditCost,
            ...(links?.ok ? { outputs: links.outputs } : {}),
            ...(job.error !== undefined ? { error: job.error } : {}),
            timedOut: false,
          });
        }
        if (remainingMs <= 0) {
          return jsonResult({
            status: job.status,
            jobId: job._id,
            creditCost: job.creditCost,
            timedOut: true,
            message:
              job.status === "done"
                ? `Posao je gotov, ali se izlaz još čuva u skladištu. Pozovi wait_for_job ponovo.`
                : `Posao je i dalje u stanju "${job.status}" posle ${timeoutSeconds} s. Pozovi wait_for_job ponovo.`,
          });
        }

        const wait = Math.min(WAIT_POLL_INTERVAL_MS, remainingMs);
        await sleep(wait);
        remainingMs -= wait;
      }
    },
  },

  get_output_url: {
    description:
      "Potpisani URL-ovi izlaza gotovog posla: outputUrl (fajl), posterUrl (sličica videa, ako postoji) i expiresAt - trenutak (ms od epohe) kad izlaz ističe iz skladišta i URL prestaje da radi.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string", minLength: 1, description: "Id gotovog posla." } },
      required: ["jobId"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_READ,
    handler: async (input, ctx) => {
      const { jobId } = input as StudioToolInput["get_job"];
      const job = await ctx.convex.runQuery(internal.studio.getJobForDetailInternal, {
        userId: ctx.principal.userId,
        jobId,
      });
      // Ista rečenica kao `get_job`: tuđ posao ne sme da se razlikuje od nepostojećeg.
      if (!job) return errorResult("Posao nije pronađen.");

      const links = await outputLinks(ctx, job);
      if (!links.ok) return errorResult(links.message);

      return jsonResult({ jobId: job._id, kind: job.kind, ...links.outputs });
    },
  },

  list_my_jobs: {
    description:
      "Galerija pozivaoca, najnoviji prvo, sa filtrima po vrsti, modelu i projektu. Vraća { jobs, nextCursor, isDone }; `nextCursor` ide u `cursor` sledećeg poziva.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_JOBS_LIMIT,
          default: DEFAULT_JOBS_LIMIT,
          description: `Koliko poslova po strani (1-${MAX_JOBS_LIMIT}, podrazumevano ${DEFAULT_JOBS_LIMIT}).`,
        },
        kind: { type: "string", enum: JOB_KINDS, description: "Samo jedna vrsta izlaza." },
        modelSlug: { type: "string", minLength: 1, description: "Samo poslovi ovog modela." },
        projectId: { type: "string", minLength: 1, description: "Samo poslovi ovog projekta." },
        cursor: { type: "string", minLength: 1, description: "`nextCursor` iz prethodnog odgovora." },
      },
      required: [],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_READ,
    handler: async (input, ctx) => {
      const { limit = DEFAULT_JOBS_LIMIT, kind, modelSlug, projectId, cursor } = input as StudioToolInput["list_my_jobs"];
      const result = await ctx.convex.runQuery(internal.studio.listMyJobsInternal, {
        userId: ctx.principal.userId,
        paginationOpts: { numItems: limit, cursor: cursor ?? null },
        ...(kind !== undefined ? { kind } : {}),
        ...(modelSlug !== undefined ? { modelSlug } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });

      return jsonResult({
        jobs: result.page.map(toMcpJob),
        nextCursor: result.isDone ? null : result.continueCursor,
        isDone: result.isDone,
      });
    },
  },
};

export const STUDIO_TOOL_NAMES = Object.keys(STUDIO_TOOLS);

/**
 * Upis u registar sa validacijom ulaza ispred svakog handlera - jedna tačka,
 * pa nijedan alat ne može da zaboravi proveru pre poziva u Convex.
 */
export function registerStudioTools(registry: Map<string, ToolDefinition>): void {
  for (const [name, tool] of Object.entries(STUDIO_TOOLS)) {
    registry.set(name, {
      ...tool,
      handler: (input: Record<string, unknown>, ctx: ToolContext) => {
        assertMatches(tool.inputSchema as JsonSchema, input, "arguments");
        return tool.handler(input, ctx);
      },
    });
  }
}
