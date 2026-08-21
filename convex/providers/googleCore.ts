/**
 * Čista logika Google video provajdera: bez `ctx`, bez baze, bez mreže, bez
 * sata. Gradi telo zahteva za Veo 3.1 Fast i za Gemini Omni, i drži tri
 * ograničenja Omnija koja moraju da budu **poruka**, a ne tiha greška
 * (STUDIO-CATALOG-V4 3.8).
 *
 * OBLIK ZAHTEVA NIJE POTVRDJEN PROTIV ŽIVOG API-JA - pravila run-a zabranjuju
 * poziv ka Google-u. Zato je sve što se šalje ovde, u funkciji koju test čita,
 * a ne razbacano po akciji: kad Jovan pusti prvu generaciju i vidi šta Google
 * traži, menja se jedno mesto.
 */

/** Ulazni fajl već pročitan iz Convex storage-a i spreman za `inline` slanje. */
export type GoogleInputFile = { mimeType: string; base64: string };

export type GoogleInputs = {
  image: GoogleInputFile[];
  video: GoogleInputFile[];
  audio: GoogleInputFile[];
};

export const EMPTY_GOOGLE_INPUTS: GoogleInputs = { image: [], video: [], audio: [] };

/**
 * Tri ograničenja Gemini Omnija iz kataloga 3.8. Stoje u `capabilities` reda
 * modela, pa ih forma prikazuje **pre** nego što korisnik okači fajl - i
 * ponavljaju se kao poruka greške ako ipak stigne posao koji ih krši.
 */
export const OMNI_UPLOADED_VIDEO_ERROR =
  "IZMENA_UPLOADOVANOG_VIDEA_NIJE_DOZVOLJENA: Gemini Omni sme da menja samo video koji je sam napravio. Izmena okačenog videa nije dozvoljena iz EEA, Švajcarske i Ujedinjenog Kraljevstva, pa je isključena za sve. Krediti su vraćeni.";

export const OMNI_AUDIO_REFERENCE_ERROR =
  "AUDIO_REFERENCA_NE_RADI: Gemini Omni ima dokumentovan upload audio referenci, ali on ne radi. Zvuk se dobija nativno, iz samog modela. Krediti su vraćeni.";

/**
 * Jedina kapija izmedju Omni forme i Google-a. Vraća poruku koja se koristi
 * doslovno kao greška posla (dakle i kao refund razlog), ili `null`.
 *
 * ZAŠTO SE OKAČEN VIDEO ODBIJA UMESTO DA SE POŠALJE: katalog kaže da izmena
 * uploadovanog videa nije dozvoljena iz EEA/Švajcarske/UK. Odakle je korisnik
 * ne znamo (a ni Google ne pita nas nego gleda sam zahtev), pa je jedini izbor
 * koji ne rizikuje odbijen račun - odbiti unapred i reći zašto. Izmena videa
 * koji je model sam napravio time nije zatvorena: ona ide preko
 * `previous_interaction_id`, ne preko okačenog fajla.
 */
export function omniInputRestriction(inputMode: string, inputs: GoogleInputs): string | null {
  if (inputs.audio.length > 0) return OMNI_AUDIO_REFERENCE_ERROR;
  if (inputMode === "video" && inputs.video.length > 0) return OMNI_UPLOADED_VIDEO_ERROR;

  return null;
}

function promptOf(params: Record<string, unknown>): string {
  return typeof params.prompt === "string" ? params.prompt : "";
}

function inlinePart(file: GoogleInputFile): Record<string, unknown> {
  return { bytesBase64Encoded: file.base64, mimeType: file.mimeType };
}

/**
 * `POST /models/{model}:predictLongRunning` (Veo 3.1 Fast, katalog 3.7).
 *
 * Režimi i gde ulaz ide u telu:
 * - `text` - samo prompt;
 * - `image` - prva slika je početni kadar;
 * - `first_last` - prva slika je početni, druga završni kadar;
 * - `reference` - sve slike idu kao reference (Lite ovaj režim NEMA);
 * - `video` - produžavanje postojećeg klipa (Lite ga takodje nema).
 *
 * Nepotpun ulaz baca PRE mreže, sa porukom koju forma već koristi ("Dodaj
 * završni kadar", katalog sekcija 5) - posao se tada refundira, a Google nije
 * ni pozvan.
 */
export function buildVeoRequest(
  params: Record<string, unknown>,
  inputs: GoogleInputs,
  inputMode: string,
): Record<string, unknown> {
  const instance: Record<string, unknown> = { prompt: promptOf(params) };
  const parameters: Record<string, unknown> = {};

  // Rezolucija ide malim slovima ("4K" -> "4k"): Google je tako piše, a katalog
  // je velikim jer je to labela u UI-ju.
  if (typeof params.resolution === "string") parameters.resolution = params.resolution.toLowerCase();
  if (typeof params.duration === "number") parameters.durationSeconds = params.duration;
  // Zvuk je naplaćen kroz `lookup` (`720p|on`), pa mora i da se traži izričito -
  // podrazumevana vrednost kod Google-a nije garantovana.
  if (typeof params.audio === "boolean") parameters.generateAudio = params.audio;

  if (inputMode === "image" || inputMode === "first_last") {
    const first = inputs.image[0];
    if (!first) throw new Error("NEPOTPUN_ULAZ: Dodaj početni kadar.");
    instance.image = inlinePart(first);
  }

  if (inputMode === "first_last") {
    const last = inputs.image[1];
    if (!last) throw new Error("NEPOTPUN_ULAZ: Dodaj završni kadar.");
    parameters.lastFrame = inlinePart(last);
  }

  if (inputMode === "reference") {
    if (inputs.image.length === 0) throw new Error("NEPOTPUN_ULAZ: Dodaj bar jednu referencu.");
    parameters.referenceImages = inputs.image.map((file) => ({
      image: inlinePart(file),
      referenceType: "asset",
    }));
  }

  if (inputMode === "video") {
    const video = inputs.video[0];
    if (!video) throw new Error("NEPOTPUN_ULAZ: Dodaj video koji se produžava.");
    instance.video = inlinePart(video);
  }

  return { instances: [instance], parameters };
}

/**
 * `POST /interactions` (Gemini Omni, katalog 3.8) - **ne** `generateContent`.
 *
 * Izlaz je 3-10 s, 720p, 24 fps, sa nativnim zvukom, i samo 16:9 ili 9:16.
 * Rezolucija je zato ovde konstanta, a ne parametar: kontrola sa jednom
 * opcijom je kontrola koja laže da ima izbora.
 *
 * `previous_interaction_id` je kanal za višekružnu izmenu (izmena videa koji je
 * model sam napravio). Prosledjuje se kad ga pozivalac ima - `video` rezim
 * Omnija sad ga postavlja iz `sourceJobId`-ja koji `createJob` proveri i upiše
 * u `params` (`studio.ts`, `capabilities.continuation`, nalaz S3 iz W7). Videti
 * i ODLUKE u `docs/STUDIO-PROGRESS.md`, sekcija S4, gde je ovo bilo odloženo.
 */
export const OMNI_RESOLUTION = "720p";

/**
 * `providerRequestId` jednog Omni posla je `normalizeOperationPath`-ovan
 * (`lib/google-video.ts`): go `id` iz Interactions API-ja dobije prefiks
 * `interactions/` da bi poller znao odakle dolazi. Za `previous_interaction_id`
 * Google traži go ID, pa se prefiks ovde skida - to je jedini oblik koji je
 * ikad upisan (`startGoogleOperation`), pa nema nagadjanja oko drugog oblika.
 */
const INTERACTIONS_PATH_PREFIX = "interactions/";

export function bareInteractionId(providerRequestId: string): string {
  return providerRequestId.startsWith(INTERACTIONS_PATH_PREFIX)
    ? providerRequestId.slice(INTERACTIONS_PATH_PREFIX.length)
    : providerRequestId;
}

export function buildOmniRequest(
  model: string,
  params: Record<string, unknown>,
  inputs: GoogleInputs,
  inputMode: string,
  previousInteractionId?: string,
): Record<string, unknown> {
  const parts: unknown[] = [{ text: promptOf(params) }];
  for (const file of inputs.image) {
    parts.push({ inline_data: { mime_type: file.mimeType, data: file.base64 } });
  }
  // Video se dodaje samo u režimima koji ga primaju kao referencu; `video`
  // režim sa okačenim fajlom uopšte ne stigne dovde (`omniInputRestriction`).
  if (inputMode !== "video") {
    for (const file of inputs.video) {
      parts.push({ inline_data: { mime_type: file.mimeType, data: file.base64 } });
    }
  }

  const config: Record<string, unknown> = { resolution: OMNI_RESOLUTION };
  if (typeof params.aspect_ratio === "string") config.aspect_ratio = params.aspect_ratio;
  if (typeof params.duration === "number") config.duration_seconds = params.duration;

  return {
    model,
    inputs: parts,
    config,
    ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
  };
}

/**
 * Izlazni fajl Veo-a i Omnija stoji na `generativelanguage.googleapis.com` i
 * **traži ključ** - bez njega `persistOutput` dobije 403, posao ostane `done`
 * bez fajla, a korisnik je platio. Ključ ide u zaglavlje samo za Google host;
 * fal i BytePlus URL-ovi su potpisani i ne smeju da vide naš ključ.
 */
const GOOGLE_DOWNLOAD_HOST = "generativelanguage.googleapis.com";

export function googleDownloadHeaders(
  url: string,
  apiKey: string | undefined,
): Record<string, string> {
  if (!apiKey) return {};
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return {};
  }

  return host === GOOGLE_DOWNLOAD_HOST ? { "x-goog-api-key": apiKey } : {};
}

/**
 * Konverzija u base64 bez `Buffer`-a (Convex V8 runtime ga nema). Ide u
 * komadima jer `String.fromCharCode(...niz)` na velikom fajlu prekorači limit
 * argumenata i pukne usred posla.
 */
const BASE64_CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }

  return btoa(binary);
}
