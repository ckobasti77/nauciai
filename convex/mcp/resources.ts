/**
 * MCP resursi (MCP-P5-PRIMITIVI, tačka 2): sadržaj koji korisnik ili model
 * PRIKAČI kao kontekst, bez poziva alata - katalog modela dok model razmišlja
 * šta da generiše, stanje kredita, detalj jednog posla. Oblici odgovora su iz
 * MCP spec-a (server/resources): `resources/list`, `resources/templates/list`,
 * `resources/read` -> `{ contents: [{ uri, mimeType, text }] }`.
 *
 * Svaki resurs je vezan za pozivaoca (`principal.userId`), traži opseg
 * `mcp:read` PRE ijednog poziva u Convex, i ide kroz ISTE interne funkcije
 * koje alati već koriste (`listModelsInternal`, `getModelBySlug`,
 * `getBalanceInternal`, `getStudioStateInternal`, `getJobForDetailInternal`)
 * - nema nove logike pristupa. Nepoznat URI, ugašen model, tuđ ili nepostojeći
 * posao su -32602, nikad -32603: tuđ posao daje ISTU rečenicu kao `get_job`,
 * pa se ne otkriva ni da red postoji. Rate limit je transportni (60/min, svaki
 * zahtev), isti kao za čitanje alatima.
 */

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { paramValuesForMode } from "../../lib/studio-params";
import { parseInputModes } from "../studioJobCore";
import { parseParamSpec } from "../studioParamSpec";
import { MCP_SCOPE_READ } from "./apiKey";
import {
  JSON_RPC_ERROR,
  McpError,
  type ResourceDescriptor,
  type ResourceProvider,
  type ResourceReadResult,
  type ResourceTemplateDescriptor,
} from "./protocol";
import { toMcpJob, toMcpModel } from "./studioTools";
import type { ToolContext } from "./toolDefinition";

export const RESOURCE_SCHEME = "nauciai://";
const JSON_MIME = "application/json";
/** Isti kod kao transportni `UNAUTHORIZED` u `handler.ts`. */
export const MISSING_SCOPE_ERROR_CODE = -32001;

/** Zamena za prazan podrazumevani `prompt` u primeru - prazan opis server ne prima. */
const EXAMPLE_PROMPT = "Lisica trči kroz snežnu šumu u zlatni sat, filmski kadar";

export const RESOURCES: ResourceDescriptor[] = [
  {
    uri: `${RESOURCE_SCHEME}models`,
    name: "models",
    title: "Katalog modela",
    description:
      "Svi uključeni Studio modeli: slug, vrsta (image/video/audio), provajder, nazivi, ulazni režimi (inputModes), slotovi (inputSpec), parametri (paramSpec), cenovno pravilo (priceRule) i mogućnosti (capabilities).",
    mimeType: JSON_MIME,
  },
  {
    uri: `${RESOURCE_SCHEME}credits`,
    name: "credits",
    title: "Krediti i limiti",
    description:
      "Saldo kredita pozivaoca (balance, lifetimePurchased, lifetimeSpent), aktivni poslovi i limit istovremenih poslova, i da li Studio sme da se koristi (enabled, hasStudioAccess, accessReason, hasAcceptedTerms).",
    mimeType: JSON_MIME,
  },
];

export const RESOURCE_TEMPLATES: ResourceTemplateDescriptor[] = [
  {
    uriTemplate: `${RESOURCE_SCHEME}models/{slug}`,
    name: "model",
    title: "Jedan model",
    description:
      "Isti podaci kao u katalogu za jedan model po slugu, plus `example` - inputMode i params objekat koji prolazi validaciju (podrazumevane vrednosti kontrola za prvi režim).",
    mimeType: JSON_MIME,
  },
  {
    uriTemplate: `${RESOURCE_SCHEME}jobs/{jobId}`,
    name: "job",
    title: "Jedan posao",
    description:
      "Detalj jednog posla pozivaoca po jobId-ju: status, model, cena, vreme, parametri i URL izlaza kad je gotov - isti oblik kao alat get_job.",
    mimeType: JSON_MIME,
  },
];

function notFound(uri: string, message = "Resource not found"): McpError {
  return new McpError(JSON_RPC_ERROR.INVALID_PARAMS, message, { uri });
}

function jsonContents(uri: string, value: unknown): ResourceReadResult {
  // Uvučen JSON: resurs čita čovek u biraču konteksta, ne samo model.
  return { contents: [{ uri, mimeType: JSON_MIME, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Primer narudžbine za model: prvi ulazni režim i podrazumevane vrednosti
 * svih kontrola vidljivih u njemu - tačno ono što forma pošalje bez ijednog
 * klika, pa prolazi `sanitizeSpecParams` po konstrukciji. `prompt` je prazan
 * po katalogu, a prazan opis server odbija, pa dobija primer teksta.
 */
function exampleOrder(model: Doc<"models">) {
  const inputMode = parseInputModes(model.inputModes)[0];
  const spec = parseParamSpec(model.paramSpec) ?? [];
  const params = paramValuesForMode(spec, inputMode);
  if (params.prompt === "") params.prompt = EXAMPLE_PROMPT;

  return { ...(inputMode !== undefined ? { inputMode } : {}), params };
}

/**
 * `nauciai://<kolekcija>[/<id>]`. Bez dekodiranja: slugovi i Convex id-jevi
 * nemaju znakove koji se kodiraju, a `/` u id-ju ionako ne sme.
 */
function parseUri(uri: string): { collection: string; id?: string } | null {
  if (!uri.startsWith(RESOURCE_SCHEME)) return null;
  const path = uri.slice(RESOURCE_SCHEME.length);
  const slash = path.indexOf("/");
  if (slash === -1) return path.length > 0 ? { collection: path } : null;
  const collection = path.slice(0, slash);
  const id = path.slice(slash + 1);
  if (collection.length === 0 || id.length === 0 || id.includes("/")) return null;

  return { collection, id };
}

async function readResource(ctx: ToolContext, uri: string): Promise<ResourceReadResult> {
  const parsed = parseUri(uri);
  if (!parsed) throw notFound(uri);
  const userId = ctx.principal.userId;

  if (parsed.collection === "models" && parsed.id === undefined) {
    const models = await ctx.convex.runQuery(internal.studioModels.listModelsInternal, { userId });

    return jsonContents(uri, models.map(toMcpModel));
  }

  if (parsed.collection === "models" && parsed.id !== undefined) {
    const model = await ctx.convex.runQuery(internal.studioModels.getModelBySlug, { slug: parsed.id });
    // Ugašen model se ne razlikuje od nepostojećeg - ni katalog ga ne lista.
    if (!model || !model.isEnabled) throw notFound(uri);

    return jsonContents(uri, { ...toMcpModel(model), example: exampleOrder(model) });
  }

  if (parsed.collection === "credits" && parsed.id === undefined) {
    const [credits, state] = await Promise.all([
      ctx.convex.runQuery(internal.credits.getBalanceInternal, { userId }),
      ctx.convex.runQuery(internal.studio.getStudioStateInternal, { userId }),
    ]);

    return jsonContents(uri, {
      credits,
      limits: { activeJobs: state.activeJobs, maxActiveJobs: state.maxActiveJobs },
      studio: {
        enabled: state.enabled,
        hasStudioAccess: state.hasStudioAccess,
        accessReason: state.accessReason,
        hasAcceptedTerms: state.hasAcceptedTerms,
      },
    });
  }

  if (parsed.collection === "jobs" && parsed.id !== undefined) {
    const job = await ctx.convex.runQuery(internal.studio.getJobForDetailInternal, { userId, jobId: parsed.id });
    // Ista rečenica kao `get_job`: tuđ, nepostojeći i neparsiv id su jedno.
    if (!job) throw notFound(uri, "Posao nije pronađen.");

    return jsonContents(uri, toMcpJob(job));
  }

  throw notFound(uri);
}

/** Resursi vezani za jednog pozivaoca - oblik koji `protocol.ts` traži. */
export function bindResources(ctx: ToolContext): ResourceProvider {
  return {
    list: () => RESOURCES,
    templates: () => RESOURCE_TEMPLATES,
    read: async (uri) => {
      // Opseg PRE izvršavanja (tačka 4), kao kod alata. Nema `isError`
      // kanala za resurse, pa je ovo JSON-RPC greška - isti kod kojim
      // transport kaže "nemaš pravo" (401 / -32001), ne -32602 koji bi lagao
      // da je URI loš.
      if (!ctx.principal.scopes.includes(MCP_SCOPE_READ)) {
        throw new McpError(MISSING_SCOPE_ERROR_CODE, `Key is missing scope "${MCP_SCOPE_READ}" required to read resources.`);
      }

      return readResource(ctx, uri);
    },
  };
}
