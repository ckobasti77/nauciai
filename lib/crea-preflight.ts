import type { LocalizedText } from "./i18n";
import type { ExportPreset } from "./crea-export-presets";
import { mainLayout, rectInside, timelineDuration, type CreaTimelineV1 } from "./crea-timeline";
import { EXPORT_MAX_BYTES } from "./crea-video-caps";

/**
 * „Proveri pre objave" (Crea K19, V30): pre izvoza montaža se proverava za
 * izabranu mrežu - dužina, odnos, rezolucija, kuka u prve 2 s, natpisi i
 * titlovi, sigurna zona, zvuk i veličina fajla. Svaka stavka ima srpsku
 * rečenicu i, gde postoji, dugme „Popravi" sa automatskom popravkom.
 *
 * Čista funkcija: zvučne mere (vrh, tišina na početku) dolaze iz miksa koji je
 * već napravljen za pregled (`renderMix`), pa provera ne pravi ništa ponovo.
 */

export type PreflightLevel = "ok" | "tip" | "warn" | "block";

export type PreflightFix =
  | { kind: "skrati"; seconds: number }
  | { kind: "odnos" }
  | { kind: "sigurna-zona" }
  | { kind: "utisaj" }
  | { kind: "naslov-na-pocetak" }
  | { kind: "manja-rezolucija" };

export type PreflightCheckId =
  | "duzina"
  | "prekratko"
  | "odnos"
  | "rezolucija"
  | "kuka"
  | "tisina-na-pocetku"
  | "natpisi"
  | "sigurna-zona"
  | "zvuk-vrh"
  | "bez-zvuka"
  | "velicina";

export type PreflightItem = {
  id: PreflightCheckId;
  level: PreflightLevel;
  message: LocalizedText;
  fix?: PreflightFix;
};

export type PreflightAudio = {
  /** Ima li čujnog zvuka u miksu. */
  audible: boolean;
  peakDb: number;
  leadingSilenceS: number;
  /** Ima li u montaži govora (glas ili klip označen kao govor). */
  hasVoice: boolean;
};

export type PreflightInput = {
  timeline: CreaTimelineV1;
  preset: ExportPreset;
  output: { width: number; height: number };
  /** Najduži izvoz koji ovaj uređaj sme u ovoj rezoluciji. */
  deviceMaxS: number;
  estimatedBytes: number;
  /** `null` dok se miks ne napravi (ili za GIF, koji nema zvuk). */
  audio: PreflightAudio | null;
};

/** Kuka: nešto mora da se desi u prve 2 s (natpis ili promena kadra). */
export const HOOK_S = 2;
/** Prvi kadar duži od ovoga, bez natpisa, je „spor početak". */
export const HOOK_FIRST_CUT_S = 2.5;

/** Trajanje za poruku: „1 min 5 s", „12,5 s" (sr) ili „12.5 s" (en). */
export function formatSeconds(seconds: number, locale: "sr" | "en"): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds - minutes * 60);
    return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const text = `${Math.round(seconds * 10) / 10} s`;
  return locale === "sr" ? text.replace(".", ",") : text;
}

function aspectOf(size: { width: number; height: number }): number {
  return size.width / size.height;
}

export function runPreflight(input: PreflightInput): PreflightItem[] {
  const { timeline, preset, output, audio } = input;
  const items: PreflightItem[] = [];
  const duration = timelineDuration(timeline);
  const gif = preset.format === "gif";
  const label = preset.label;

  // Dužina: platforma i uređaj.
  const limit = Math.min(preset.maxDurationS, input.deviceMaxS);
  if (duration < 1) {
    items.push({
      id: "prekratko",
      level: "block",
      message: { sr: "Montaža je kraća od 1 sekunde. Dodaj još klipova ili fotki.", en: "The edit is shorter than 1 second. Add more clips or photos." },
    });
  } else if (duration > limit + 0.05) {
    const byDevice = input.deviceMaxS < preset.maxDurationS;
    items.push({
      id: "duzina",
      level: "block",
      message: byDevice
        ? {
            sr: `Video traje ${formatSeconds(duration, "sr")}, a na ovom uređaju izvoz ide najviše do ${formatSeconds(limit, "sr")}. Skrati ga ili izvezi na računaru.`,
            en: `The video is ${formatSeconds(duration, "en")} long, and this device can export at most ${formatSeconds(limit, "en")}. Trim it or export on a computer.`,
          }
        : {
            sr: `Video traje ${formatSeconds(duration, "sr")}, a ${label.sr} prima najviše ${formatSeconds(limit, "sr")} (okvirno).`,
            en: `The video is ${formatSeconds(duration, "en")} long, and ${label.en} takes at most ${formatSeconds(limit, "en")} (approx.).`,
          },
      fix: { kind: "skrati", seconds: limit },
    });
  } else {
    items.push({
      id: "duzina",
      level: "ok",
      message: { sr: `Dužina ${formatSeconds(duration, "sr")} - u redu za ${label.sr}.`, en: `Length ${formatSeconds(duration, "en")} - fine for ${label.en}.` },
    });
  }

  // Odnos stranica.
  const presetAspect = preset.width / preset.height;
  if (!gif && Math.abs(aspectOf(output) - presetAspect) > 0.02) {
    items.push({
      id: "odnos",
      level: "warn",
      message: {
        sr: `Montaža je ${timeline.aspect}, a ${label.sr} je ${preset.aspect}. Platforma će dodati trake ili iseći ivice.`,
        en: `The edit is ${timeline.aspect}, and ${label.en} is ${preset.aspect}. The platform will add bars or crop the edges.`,
      },
      fix: { kind: "odnos" },
    });
  }

  // Rezolucija (GIF je namerno mali).
  if (!gif) {
    const short = Math.min(output.width, output.height);
    items.push(
      short < 720
        ? {
            id: "rezolucija",
            level: "tip",
            message: {
              sr: `Izvoz je ${output.width}×${output.height}: na ovom uređaju ide manja rezolucija. Za oštriji video izvezi na računaru.`,
              en: `The export is ${output.width}×${output.height}: this device exports a smaller size. Export on a computer for a sharper video.`,
            },
          }
        : {
            id: "rezolucija",
            level: "ok",
            message: { sr: `Rezolucija ${output.width}×${output.height}.`, en: `Resolution ${output.width}×${output.height}.` },
          },
    );
  }

  // Kuka u prve 2 s: natpis koji se pojavi, ili promena kadra.
  // Titlovi (K21) se računaju kao natpis: titl u prve 2 s je takođe udica.
  const cues = timeline.captions?.cues ?? [];
  const earlyTitle = timeline.titles.some((title) => title.start < HOOK_S && title.text.trim().length > 0) || cues.some((cue) => cue.start < HOOK_S);
  const firstClipEnd = timeline.main.length > 1 ? firstCutAt(timeline) : Infinity;
  if (duration >= 1) {
    items.push(
      earlyTitle || firstClipEnd <= HOOK_FIRST_CUT_S
        ? {
            id: "kuka",
            level: "ok",
            message: { sr: "Prve 2 sekunde imaju udicu (natpis ili brz rez).", en: "The first 2 seconds have a hook (a caption or a quick cut)." },
          }
        : {
            id: "kuka",
            level: "warn",
            message: {
              sr: "U prve 2 sekunde nema ni natpisa ni promene kadra. Ljudi listaju dalje za sekundu-dve - dodaj naslov na početak ili skrati prvi klip.",
              en: "The first 2 seconds have no caption and no cut. People scroll on within a second or two - add a title at the start or shorten the first clip.",
            },
            fix: { kind: "naslov-na-pocetak" },
          },
    );
  }

  // Natpisi i titlovi: mnogi gledaju bez zvuka.
  const hasText = timeline.titles.some((title) => title.text.trim().length > 0) || cues.length > 0;
  const hasSubtitles = timeline.titles.some((title) => title.style === "titl" && title.text.trim().length > 0) || cues.length > 0;
  if (audio?.hasVoice && !hasSubtitles) {
    items.push({
      id: "natpisi",
      level: "warn",
      message: {
        sr: "U videu se govori, a nema titla. Većina ljudi gleda bez zvuka - dodaj natpis stila „Titl\" uz ono što se kaže.",
        en: "Someone talks in the video, but there are no subtitles. Most people watch muted - add a \"Subtitle\" caption for what is said.",
      },
    });
  } else if (!hasText && !gif) {
    items.push({
      id: "natpisi",
      level: "tip",
      message: {
        sr: "Nema nijednog natpisa. Jedna rečenica na ekranu pomaže onima koji gledaju bez zvuka.",
        en: "There is no caption. One sentence on screen helps people who watch muted.",
      },
    });
  } else {
    items.push({ id: "natpisi", level: "ok", message: { sr: "Natpisi su tu.", en: "Captions are there." } });
  }

  // Sigurna zona.
  const outside = [...timeline.titles.filter((title) => title.text.trim().length > 0), ...timeline.stickers].filter(
    (item) => !rectInside(item.rect, preset.safeZone),
  );
  if (outside.length > 0) {
    items.push({
      id: "sigurna-zona",
      level: "warn",
      message: {
        sr: `${outside.length === 1 ? "Jedan natpis ili nalepnica je" : `${outside.length} natpisa i nalepnica je`} van sigurne zone - ${label.sr} ih može pokriti dugmadima ili opisom.`,
        en: `${outside.length === 1 ? "One caption or sticker is" : `${outside.length} captions and stickers are`} outside the safe zone - ${label.en} may cover them with buttons or the caption.`,
      },
      fix: { kind: "sigurna-zona" },
    });
  } else if (timeline.titles.length + timeline.stickers.length > 0) {
    items.push({ id: "sigurna-zona", level: "ok", message: { sr: "Natpisi su u sigurnoj zoni.", en: "Captions are inside the safe zone." } });
  }

  // Zvuk (GIF nema zvuk).
  if (!gif && audio) {
    if (!audio.audible) {
      items.push({
        id: "bez-zvuka",
        level: "tip",
        message: {
          sr: `Video nema zvuk. Na mreži kao ${label.sr} muzika mnogo pomaže - dodaj pesmu u „Zvuk".`,
          en: `The video has no sound. On a network like ${label.en} music helps a lot - add a song under "Sound".`,
        },
      });
    } else {
      if (audio.leadingSilenceS > 1) {
        items.push({
          id: "tisina-na-pocetku",
          level: "warn",
          message: {
            sr: `Prvih ${formatSeconds(audio.leadingSilenceS, "sr")} nema zvuka. Pomeri muziku ili govor na sam početak.`,
            en: `The first ${formatSeconds(audio.leadingSilenceS, "en")} are silent. Move the music or speech to the very start.`,
          },
        });
      }
      items.push(
        audio.peakDb > -1
          ? {
              id: "zvuk-vrh",
              level: "warn",
              message: {
                sr: "Zvuk je preglasan na vrhovima i može da „krči\" na telefonu. Utišaj ga malo.",
                en: "The sound is too loud at its peaks and may crackle on a phone. Turn it down a little.",
              },
              fix: { kind: "utisaj" },
            }
          : { id: "zvuk-vrh", level: "ok", message: { sr: "Jačina zvuka je u redu.", en: "The loudness is fine." } },
      );
    }
  }

  // Veličina fajla.
  if (!gif && input.estimatedBytes > EXPORT_MAX_BYTES) {
    items.push({
      id: "velicina",
      level: "block",
      message: {
        sr: "Video bi bio veći od 190 MB, koliko galerija prima. Izvezi u 720p ili skrati.",
        en: "The video would be larger than 190 MB, the most the gallery takes. Export in 720p or trim it.",
      },
      fix: { kind: "manja-rezolucija" },
    });
  }

  return items;
}

/** Kada je prvi rez: trenutak kad počinje drugi klip (i prelaz u njega). */
function firstCutAt(timeline: CreaTimelineV1): number {
  return mainLayout(timeline)[1]?.start ?? Infinity;
}

export function canExport(items: readonly PreflightItem[]): boolean {
  return !items.some((item) => item.level === "block");
}
