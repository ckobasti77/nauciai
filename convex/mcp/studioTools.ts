/**
 * Studio alati MCP servera (MCP-P2-STUDIO, tačka 3): katalog modela, stanje
 * pristupa i kredita, projekti, pokretanje generisanja, detalj posla i
 * galerija. `tools.ts` ih upisuje u registar pozivom `registerStudioTools`;
 * ovaj modul NE uvozi `tools.ts` (samo `toolDefinition.ts`), da ne bi bilo
 * ciklusa - vidi komentar uz poziv u `tools.ts`.
 *
 * Identitet pozivaoca je `principal.userId` iz API ključa, ne Convex Auth
 * sesija - zato svaki alat zove INTERNE varijante studio funkcija
 * (`*Internal`, primaju `userId`) koje dele telo sa javnim (`convex/studio.ts`,
 * `studioModels.ts`, `studioProjects.ts`, `credits.ts`). Sve provere Studija -
 * kill switch, pristup, limiti, uslovi, rezervacija kredita - žive u tom
 * deljenom telu, pa važe i za ovaj put.
 *
 * Dve vrste grešaka, namerno razdvojene:
 * - neispravan ULAZ (tip, nepoznato polje, van opsega) je protokolska greška
 *   -32602, proverena po JSON Schemi PRE ijednog poziva u Convex;
 * - DOMENSKA greška Studija (STUDIO_PAUZIRAN, NEMA_PRISTUPA, nedovoljno
 *   kredita, limiti...) je `errorResult` sa čitljivom porukom na srpskom, jer
 *   model treba da vidi zašto nije prošlo i da može da reaguje.
 *   Neočekivana greška se ne prevodi - protokolski sloj je vraća kao -32603.
 */

import type { FunctionReturnType } from "convex/server";

import { internal } from "../_generated/api";
import { studioErrorCode, studioErrorMessage } from "../../lib/studio-messages";
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "./apiKey";
import { JSON_RPC_ERROR, McpError, type ToolResult } from "./protocol";
import { errorResult, jsonResult, type ToolContext, type ToolDefinition } from "./toolDefinition";

// ── JSON Schema ulaza ──────────────────────────────────────────────────────

/** Podskup JSON Scheme koji šeme alata koriste - toliko i validator razume. */
type JsonSchema = {
  type: "object" | "string" | "integer";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
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

/** Domenska greška `createJob`-a -> čitljiv tekst za model; `null` za neočekivanu. */
function studioErrorResult(error: unknown): ToolResult | null {
  const raw = error instanceof Error ? error.message : String(error);
  const code = studioErrorCode(raw);
  if (!code) return null;

  return errorResult(`${studioErrorMessage(code, "sr")} (${code})`);
}

// ── alati ──────────────────────────────────────────────────────────────────

type StudioToolInput = {
  create_generation: { modelSlug: string; params: Record<string, unknown>; projectId?: string };
  get_job: { jobId: string };
  list_my_jobs: { limit?: number; kind?: JobKind; modelSlug?: string; projectId?: string; cursor?: string };
};

const STUDIO_TOOLS: Record<string, ToolDefinition> = {
  list_models: {
    description:
      "Uključeni Studio modeli: slug, vrsta (image/video/audio), provajder, porodica, nazivi, ulazni režimi, specifikacija parametara (paramSpec), cenovno pravilo i mogućnosti.",
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

  create_generation: {
    description:
      "Pokreće generisanje u Studiju i TROŠI KREDITE pozivaoca. `params` su parametri modela po njegovom paramSpec-u (prompt i ostalo). Vraća jobId, status, cenu u kreditima i slug modela; status se prati kroz get_job.",
    inputSchema: {
      type: "object",
      properties: {
        modelSlug: { type: "string", minLength: 1, description: "Slug modela iz list_models." },
        params: { type: "object", description: "Parametri modela (npr. { \"prompt\": \"...\" }), po paramSpec-u modela." },
        projectId: { type: "string", minLength: 1, description: "Id projekta iz list_projects (opciono)." },
      },
      required: ["modelSlug", "params"],
      additionalProperties: false,
    },
    scope: MCP_SCOPE_WRITE,
    handler: async (input, ctx) => {
      const { modelSlug, params, projectId } = input as StudioToolInput["create_generation"];
      const userId = ctx.principal.userId;

      let created: FunctionReturnType<typeof internal.studio.createJobInternal>;
      try {
        // `createJob` prima `params` kao JSON string - alat prima objekat i serijalizuje ga.
        created = await ctx.convex.runMutation(internal.studio.createJobInternal, {
          userId,
          modelSlug,
          params: JSON.stringify(params),
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
