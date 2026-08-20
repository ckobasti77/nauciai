/**
 * Čista logika BytePlus callback-a: bez `ctx`, bez baze, bez mreže, bez sata.
 *
 * ZAŠTO OVDE NEMA VERIFIKACIJE POTPISA - a kod fal-a je ima:
 * BytePlus **ne potpisuje pojedinačne callback poruke.** Jedino što postoji je
 * verifikacija SAME PUTANJE pri podešavanju: prvi zahtev nosi polje `challenge`
 * koje se vraća nepromenjeno u roku od 3 sekunde. Posle toga stiže običan POST
 * na svaku promenu statusa, bez ikakvog dokaza da dolazi od BytePlus-a.
 *
 * Posledica je pravilo koje mora da preživi svaki refaktor: **telo callback-a
 * se ne koristi kao izvor istine.** Ono je samo signal "pogledaj zadatak
 * ponovo". Ishod posla se menja tek posle `GET /contents/generations/tasks/{id}`
 * (videti `verifyAndApplyTask` u `convex/providers/byteplus.ts`). Bez toga bi
 * bilo ko sa našim URL-om mogao da pošalje `{"status":"succeeded"}` i da nam
 * naplati posao koji nikad nije odradjen - ili, gore, `{"status":"failed"}` i
 * da svakom korisniku refundira kredite za posao koji jeste odradjen.
 */

/** Vrsta zahteva koji je stigao na `/byteplus/webhook`. */
export type BytePlusCallback =
  | { kind: "challenge"; challenge: string }
  | { kind: "task"; taskId: string }
  | { kind: "unknown" };

/**
 * Telo callback-a. Nepoznat oblik NIJE greška prema BytePlus-u (handler i dalje
 * vraća 200, da callback ne ulazi u beskonačan retry), nego "nemam šta da
 * uradim" - posao ostaje u `running` i pokupi ga reaper.
 */
export function parseCallbackBody(raw: string): BytePlusCallback {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "unknown" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "unknown" };
  const body = parsed as Record<string, unknown>;

  // Verifikacioni zahtev ima prednost nad svim ostalim: on stiže PRE nego što
  // ijedan posao postoji i mora da se odgovori u roku od 3 sekunde, dakle bez
  // ijednog čitanja baze.
  if (typeof body.challenge === "string" && body.challenge.length > 0) {
    return { kind: "challenge", challenge: body.challenge };
  }

  // BytePlus šalje ID zadatka kao `id`; `task_id` je oblik iz starijih primera
  // u dokumentaciji i prihvata se da promena imena ne obori ceo tok.
  const taskId =
    typeof body.id === "string" && body.id.length > 0
      ? body.id
      : typeof body.task_id === "string" && body.task_id.length > 0
        ? body.task_id
        : null;
  if (!taskId) return { kind: "unknown" };

  // Status iz tela se NAMERNO ne čita: sve što nam callback sme da kaže je
  // KOJI zadatak da proverimo, nikad KAKO se završio.
  return { kind: "task", taskId };
}

/**
 * Odgovor na verifikacioni zahtev: `challenge` vraćen nepromenjen. Vraća se
 * pod istim ključem u JSON-u, što je oblik koji BytePlus konzola očekuje.
 */
export function challengeResponseBody(challenge: string): string {
  return JSON.stringify({ challenge });
}

/** Koliko teksta greške ide u `generationJobs.error` - isto kao kod fal-a. */
const MAX_ERROR_LENGTH = 500;

export function bytePlusErrorMessage(error: string | null): string {
  if (!error) return "BytePlus je vratio grešku bez opisa.";

  return error.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Telo za `/images/generations` (Seedream 5 Pro). Oblik je OpenAI-kompatibilan;
 * `size` prima imenovanu rezoluciju ("1.5K", "2K") isto kao i piksele.
 *
 * `watermark: false` je izričito - podrazumevana vrednost kod BytePlus-a ume da
 * bude `true`, a vodeni žig na plaćenoj generaciji je reklamacija.
 */
export function buildImageRequestBody(
  params: Record<string, unknown>,
  inputUrls: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: typeof params.prompt === "string" ? params.prompt : "",
    response_format: "url",
    watermark: false,
  };

  if (typeof params.resolution === "string") body.size = params.resolution;
  if (typeof params.num_images === "number") body.n = params.num_images;
  if (typeof params.layers === "number") body.layers = params.layers;
  if (inputUrls.length > 0) body.image = inputUrls;

  return body;
}

/** Ulazi razvrstani po slotu - video se šalje drugim tipom nego slika. */
export type BytePlusVideoInputs = { images: string[]; videos: string[] };

/**
 * Tarifa koju BytePlus koristi kad zahtev ne kaže ništa, i ujedno NAJSKUPLJA od
 * tri (STUDIO-CATALOG-V4 3.4). Vidi `buildVideoContent` za to zašto je bitno
 * koja je od tri podrazumevana.
 */
export const DEFAULT_SEEDANCE_TIER = "standard";

/**
 * `content` niz za `/contents/generations/tasks` (Seedance). Parametri se kod
 * Ark-a ne šalju kao polja nego kao TEKSTUALNE KOMANDE nalepljene na prompt
 * (`--resolution 720p --duration 5`), pa je gradnja tog stringa ovde, u čistoj
 * funkciji koju test može da pročita.
 *
 * `tier` se šalje SAMO kad nije `standard`, i to je odluka o novcu, ne o stilu:
 * Fast i Mini se naplaćuju JEFTINIJE od Standarda (0,121 vs 0,151 $/s na 720p,
 * 0,077 na Mini). Ako komanda ne stigne do BytePlus-a, on odradi Standard a mi
 * smo naplatili Mini - razliku plaćamo mi. Zato:
 * - `standard` ne šalje ništa, pa podrazumevan put ne može da pukne na
 *   nepoznatu komandu;
 * - `fast`/`mini` šalju komandu, pa je ishod ili tačna tarifa ili greška koja
 *   posao refundira. Tihog gubitka nema ni u jednom slučaju.
 *
 * Video reference idu kao `video_url`, ne `image_url`: u `reference` režimu sa
 * videom se naplaćuje i ULAZNI video (množilac 0,6, katalog 3.4), pa poslati ga
 * kao sliku znači platiti ulaz koji model nikad nije video.
 */
export function buildVideoContent(
  params: Record<string, unknown>,
  inputs: BytePlusVideoInputs,
): unknown[] {
  const commands: string[] = [];
  if (typeof params.resolution === "string") commands.push(`--resolution ${params.resolution}`);
  if (typeof params.duration === "number") commands.push(`--duration ${params.duration}`);
  if (typeof params.tier === "string" && params.tier !== DEFAULT_SEEDANCE_TIER) {
    commands.push(`--tier ${params.tier}`);
  }

  const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const text = [prompt, ...commands].filter((part) => part.length > 0).join(" ");

  const content: unknown[] = [{ type: "text", text }];
  for (const url of inputs.images) {
    content.push({ type: "image_url", image_url: { url } });
  }
  for (const url of inputs.videos) {
    content.push({ type: "video_url", video_url: { url } });
  }

  return content;
}
