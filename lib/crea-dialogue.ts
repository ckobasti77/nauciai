import { jobCredits, type PricedModel } from "./crea-job-price";
import { buildSpeechJob, sanitizeVoiceSettings, speechChars, type SpeechJob, type VoiceMood } from "./crea-voice-tags";
import { DEFAULT_VOICE, isVoiceEngineId, voiceById, type VoiceEngineId } from "./crea-voices";

/**
 * Dijalog i podkast (Crea K22, A5/A6): do 10 govornika, replika po replika. Svaka
 * replika je JEDAN posao govora, pa izmena jedne replike pravi (i naplaćuje) samo
 * nju - ostale ostaju sa svojim gotovim snimkom. Snimci se spajaju na uređaju
 * (`concatSpeech`, 0 kr).
 *
 * Otisak replike (`lineFingerprint`) je tačan posao koji bi otišao serveru
 * (model + parametri): ista replika istim glasom = isti otisak = nema novog
 * posla. Promena glasa govornika menja otiske SAMO njegovih replika.
 */

export const DIALOGUE_LIMITS = { speakers: 10, lines: 40, lineChars: 600, nameChars: 24, titleChars: 80 } as const;

/** Tišina između dve replike u spojenom snimku (s). */
export const DIALOGUE_GAP_S = 0.35;

export type DialogueSpeaker = { id: string; name: string; engine: VoiceEngineId; voiceId: string; mood: VoiceMood };
export type DialogueLine = { id: string; speakerId: string; text: string };
export type DialogueDoc = { v: 1; title: string; speakers: DialogueSpeaker[]; lines: DialogueLine[] };

/** Gotov snimak replike: posao i otisak sa kojim je napravljen. */
export type LineTake = { jobId: string; fingerprint: string };
export type LineTakes = Readonly<Record<string, LineTake>>;

/** Podrazumevani glasovi novih govornika: smenjuju se žena i muškarac. */
const SPEAKER_VOICES: Record<VoiceEngineId, readonly string[]> = {
  gemini: ["Sulafat", "Achird", "Kore", "Charon", "Leda", "Puck", "Despina", "Iapetus", "Aoede", "Umbriel"],
  eleven: ["Aria", "George", "Sarah", "Liam", "Laura", "Roger", "Alice", "Charlie", "Charlotte", "Callum"],
};

export function newSpeaker(index: number, engine: VoiceEngineId = "gemini", name?: string): DialogueSpeaker {
  const voices = SPEAKER_VOICES[engine];
  return {
    id: `g${index + 1}`,
    name: (name ?? `Govornik ${index + 1}`).slice(0, DIALOGUE_LIMITS.nameChars),
    engine,
    voiceId: voices[index % voices.length] ?? DEFAULT_VOICE[engine],
    mood: 0,
  };
}

export function emptyDialogue(): DialogueDoc {
  const speakers = [newSpeaker(0, "gemini", "Ana"), newSpeaker(1, "gemini", "Marko")];
  return {
    v: 1,
    title: "",
    speakers,
    lines: [
      { id: "r1", speakerId: speakers[0]!.id, text: "" },
      { id: "r2", speakerId: speakers[1]!.id, text: "" },
    ],
  };
}

/** Sledeći slobodan id sa prefiksom (`g3`, `r12`). */
export function nextId(prefix: string, taken: readonly { id: string }[]): string {
  let max = 0;
  for (const entry of taken) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(entry.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

/** Posao govora za repliku, ili `null` za praznu repliku / nepoznatog govornika. */
export function lineJob(doc: DialogueDoc, line: DialogueLine): SpeechJob | null {
  const speaker = doc.speakers.find((entry) => entry.id === line.speakerId);
  const text = line.text.trim();
  if (!speaker || text.length === 0) return null;
  return buildSpeechJob({
    engine: speaker.engine,
    voiceId: speaker.voiceId,
    text,
    settings: sanitizeVoiceSettings({ mood: speaker.mood }),
  });
}

export function lineFingerprint(job: SpeechJob): string {
  const keys = Object.keys(job.params).sort();
  return JSON.stringify([job.modelSlug, job.inputMode, keys.map((key) => [key, job.params[key]])]);
}

export type LineStatus = "prazna" | "gotova" | "nova" | "izmenjena";

export function lineStatus(doc: DialogueDoc, line: DialogueLine, takes: LineTakes): LineStatus {
  const job = lineJob(doc, line);
  if (!job) return "prazna";
  const take = takes[line.id];
  if (!take) return "nova";
  return take.fingerprint === lineFingerprint(job) ? "gotova" : "izmenjena";
}

/** Replike koje treba napraviti: nove i izmenjene. Gotove se NE prave ponovo. */
export function linesToMake(doc: DialogueDoc, takes: LineTakes): Array<{ line: DialogueLine; job: SpeechJob; fingerprint: string }> {
  const out: Array<{ line: DialogueLine; job: SpeechJob; fingerprint: string }> = [];
  for (const line of doc.lines) {
    const status = lineStatus(doc, line, takes);
    if (status !== "nova" && status !== "izmenjena") continue;
    const job = lineJob(doc, line)!;
    out.push({ line, job, fingerprint: lineFingerprint(job) });
  }
  return out;
}

/**
 * Cena SAMO replika koje se prave (zbir cena pojedinačnih poslova, ista računica
 * kao server). `null` kad neki model nije u katalogu.
 */
export function dialogueCost(doc: DialogueDoc, takes: LineTakes, catalog: readonly PricedModel[]): { credits: number | null; lines: number; chars: number } {
  const todo = linesToMake(doc, takes);
  let credits: number | null = 0;
  let chars = 0;
  for (const entry of todo) {
    const count = speechChars(entry.job);
    chars += count;
    const price = jobCredits({ modelSlug: entry.job.modelSlug, inputMode: entry.job.inputMode, params: entry.job.params, measured: { char_count: count } }, catalog);
    credits = price === null || credits === null ? null : credits + price;
  }
  return { credits, lines: todo.length, chars };
}

/** Redosled spajanja: samo replike sa gotovim snimkom, redom scenarija. */
export function mergeOrder(doc: DialogueDoc, takes: LineTakes): Array<{ lineId: string; jobId: string }> {
  return doc.lines.filter((line) => lineStatus(doc, line, takes) === "gotova").map((line) => ({ lineId: line.id, jobId: takes[line.id]!.jobId }));
}

/**
 * Spojen snimak: mono uzorci redom, sa tišinom između replika. Svi delovi moraju
 * biti na istoj frekvenciji (dekoder ih tako i daje).
 */
export function concatSpeech(parts: readonly Float32Array[], sampleRate: number, gapS = DIALOGUE_GAP_S): Float32Array {
  const gap = Math.max(0, Math.round(gapS * sampleRate));
  const total = parts.reduce((sum, part) => sum + part.length, 0) + gap * Math.max(0, parts.length - 1);
  const out = new Float32Array(total);
  let offset = 0;
  parts.forEach((part, index) => {
    out.set(part, offset);
    offset += part.length + (index < parts.length - 1 ? gap : 0);
  });
  return out;
}

/**
 * Scenario iz teksta „Ime: replika" (red po red). Nepoznato ime postaje nov
 * govornik (do 10); red bez imena nastavlja prethodnog govornika.
 */
export function parseScript(script: string, base: DialogueDoc = emptyDialogue()): DialogueDoc {
  const speakers: DialogueSpeaker[] = [];
  const lines: DialogueLine[] = [];
  const engine = base.speakers[0]?.engine ?? "gemini";
  const findOrAdd = (name: string): DialogueSpeaker | null => {
    const key = name.trim().toLowerCase();
    const known = speakers.find((speaker) => speaker.name.toLowerCase() === key);
    if (known) return known;
    if (speakers.length >= DIALOGUE_LIMITS.speakers) return null;
    const template = base.speakers[speakers.length];
    const speaker = template
      ? { ...template, id: `g${speakers.length + 1}`, name: name.trim().slice(0, DIALOGUE_LIMITS.nameChars) }
      : newSpeaker(speakers.length, engine, name.trim());
    speakers.push(speaker);
    return speaker;
  };
  let current: DialogueSpeaker | null = null;
  for (const raw of script.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const match = /^([^:]{1,24}):\s*(.+)$/.exec(row);
    if (match) current = findOrAdd(match[1]!) ?? current;
    const text = (match ? match[2]! : row).slice(0, DIALOGUE_LIMITS.lineChars);
    if (!current) current = findOrAdd(base.speakers[0]?.name ?? "Ana");
    if (!current || lines.length >= DIALOGUE_LIMITS.lines) continue;
    lines.push({ id: `r${lines.length + 1}`, speakerId: current.id, text });
  }
  if (speakers.length === 0) return base;
  return { v: 1, title: base.title, speakers, lines };
}

/** Dokument iz nepouzdanog izvora (`localStorage`); loš oblik = `null`. */
export function sanitizeDialogueDoc(raw: unknown): DialogueDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { v?: unknown; title?: unknown; speakers?: unknown; lines?: unknown };
  if (record.v !== 1 || !Array.isArray(record.speakers) || !Array.isArray(record.lines)) return null;
  const speakers: DialogueSpeaker[] = [];
  for (const entry of record.speakers.slice(0, DIALOGUE_LIMITS.speakers)) {
    if (!entry || typeof entry !== "object") continue;
    const speaker = entry as Record<string, unknown>;
    if (typeof speaker.id !== "string" || !/^g\d{1,3}$/.test(speaker.id) || !isVoiceEngineId(speaker.engine)) continue;
    const voiceId = typeof speaker.voiceId === "string" && voiceById(speaker.engine, speaker.voiceId) ? speaker.voiceId : DEFAULT_VOICE[speaker.engine];
    speakers.push({
      id: speaker.id,
      name: typeof speaker.name === "string" && speaker.name.trim() ? speaker.name.trim().slice(0, DIALOGUE_LIMITS.nameChars) : speaker.id,
      engine: speaker.engine,
      voiceId,
      mood: sanitizeVoiceSettings({ mood: speaker.mood }).mood,
    });
  }
  if (speakers.length === 0) return null;
  const ids = new Set(speakers.map((speaker) => speaker.id));
  const lines: DialogueLine[] = [];
  for (const entry of record.lines.slice(0, DIALOGUE_LIMITS.lines)) {
    if (!entry || typeof entry !== "object") continue;
    const line = entry as Record<string, unknown>;
    if (typeof line.id !== "string" || !/^r\d{1,4}$/.test(line.id) || typeof line.speakerId !== "string" || !ids.has(line.speakerId)) continue;
    lines.push({ id: line.id, speakerId: line.speakerId, text: typeof line.text === "string" ? line.text.slice(0, DIALOGUE_LIMITS.lineChars) : "" });
  }
  return { v: 1, title: typeof record.title === "string" ? record.title.slice(0, DIALOGUE_LIMITS.titleChars) : "", speakers, lines };
}

/** Uzmi gotove snimke iz nepouzdanog izvora: samo za replike koje postoje. */
export function sanitizeTakes(raw: unknown, doc: DialogueDoc): Record<string, LineTake> {
  const out: Record<string, LineTake> = {};
  if (!raw || typeof raw !== "object") return out;
  const ids = new Set(doc.lines.map((line) => line.id));
  for (const [lineId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(lineId) || !value || typeof value !== "object") continue;
    const take = value as Record<string, unknown>;
    if (typeof take.jobId === "string" && typeof take.fingerprint === "string") out[lineId] = { jobId: take.jobId, fingerprint: take.fingerprint };
  }
  return out;
}
