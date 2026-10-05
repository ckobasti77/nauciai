import type { MatchCutRefusal } from "./crea-match-cut";
import type { LocalizedText } from "./i18n";

/**
 * Tekstovi K21 alata „Retro efekti" (V27) i dugmeta „Match-cut po licu" u
 * montaži. Nazivi i opisi efekata i klizača su uz presete (`lib/crea-retro.ts`).
 * Uvoze ih samo alat i inspektor montaže (lenji chunk-ovi).
 */

type T = LocalizedText;

export const CREA_RETRO_COPY = {
  // ── Retro efekti (V27) ───────────────────────────────────────────────────
  run: { sr: "Primeni efekat", en: "Apply the effect" } as T,
  effect: { sr: "Efekat", en: "Effect" } as T,
  strength: { sr: "Jačina", en: "Strength" } as T,
  settings: { sr: "Podešavanja efekta", en: "Effect settings" } as T,
  frame: { sr: "Kadar za pregled", en: "Frame for the preview" } as T,
  previewLabel: { sr: "Kadar sa izabranim efektom", en: "A frame with the chosen effect" } as T,
  previewLoading: { sr: "Pripremam pregled…", en: "Preparing the preview…" } as T,
  noWebgl: {
    sr: "Tvoj pregledač ne ume da nacrta ovaj efekat (treba mu WebGL2). Probaj Chrome ili Edge na računaru.",
    en: "Your browser cannot draw this effect (it needs WebGL2). Try Chrome or Edge on a computer.",
  } as T,
  stamp: { sr: "Natpis „PLAY ▶“ i datum u uglu", en: "“PLAY ▶” sign and date in the corner" } as T,
  date: { sr: "Datum na snimku", en: "Date on the recording" } as T,
  dateMissing: { sr: "Izaberi datum - bez njega natpisa nema.", en: "Pick a date - without it there is no sign." } as T,
  title: { sr: "Naslov koji se kuca (do 60 slova)", en: "Typed title (up to 60 characters)" } as T,
  titlePlaceholder: { sr: "npr. Leto u Beogradu, 1996.", en: "e.g. Summer in Belgrade, 1996" } as T,
  titleHint: {
    sr: "Kuca se slovo po slovo od početka videa. Prazno polje = bez naslova.",
    en: "It types itself letter by letter from the start of the video. Empty = no title.",
  } as T,

  // ── Match-cut po licu (montaža) ──────────────────────────────────────────
  matchTitle: { sr: "Match-cut po licu", en: "Match cut by face" } as T,
  matchHint: {
    sr: "Crea pogleda poslednje 2 sekunde ovog klipa i prve 2 sekunde sledećeg i nađe trenutak u kom se kadrovi najviše poklapaju - lice na istom mestu. Prvi put preuzima mali model za lica.",
    en: "Crea looks at the last 2 seconds of this clip and the first 2 seconds of the next one and finds the moment where the shots match best - the face in the same place. The first time it downloads a small face model.",
  } as T,
  matchFind: { sr: "Nađi rez", en: "Find the cut" } as T,
  matchWorking: { sr: "Gledam kadrove… {p} %", en: "Looking at the frames… {p} %" } as T,
  matchByFace: { sr: "Rez na {a} → {b}, lice poravnato", en: "Cut at {a} → {b}, face aligned" } as T,
  matchByFaceOnly: { sr: "Rez na {a} → {b}, po licu", en: "Cut at {a} → {b}, by face" } as T,
  matchByPicture: { sr: "Rez na {a} → {b}, po sličnosti kadra", en: "Cut at {a} → {b}, by how alike the shots are" } as T,
  matchExplain: {
    sr: "Prvo vreme je novi kraj ovog klipa, drugo novi početak sledećeg. Između njih ide kratko pretapanje (0,2 s).",
    en: "The first time is this clip's new end, the second the next clip's new start. A short cross-fade (0.2 s) goes between them.",
  } as T,
  matchApply: { sr: "Primeni", en: "Apply" } as T,
  matchCancel: { sr: "Odustani", en: "Cancel" } as T,
  matchNone: { sr: "Nismo našli trenutak za rez. Probaj sa dužim klipovima.", en: "We did not find a moment for the cut. Try longer clips." } as T,
  matchFailed: {
    sr: "Klipove nismo uspeli da pregledamo. Probaj ponovo ili u Chrome-u na računaru.",
    en: "We could not look through the clips. Try again or in Chrome on a computer.",
  } as T,
  matchWait: { sr: "Sačekaj da se oba klipa učitaju.", en: "Wait until both clips have loaded." } as T,
  matchRefusals: {
    NEMA_KLIPA: { sr: "Match-cut ide između dva klipa, a posle ovog nema sledećeg.", en: "A match cut goes between two clips, and there is no next one." },
    SLIKA: { sr: "Match-cut radi samo između dva videa, ne sa fotkom.", en: "A match cut only works between two videos, not with a photo." },
    BRZINA: {
      sr: "Vrati oba klipa na normalnu brzinu (1×, bez rampe), pa probaj ponovo.",
      en: "Set both clips back to normal speed (1×, no ramp), then try again.",
    },
    UNAZAD: { sr: "Match-cut ne radi sa klipom unazad ni sa bumerangom.", en: "A match cut does not work with a reversed or boomerang clip." },
    VAN_OPSEGA: { sr: "Klipovi su se u međuvremenu promenili - potraži rez ponovo.", en: "The clips changed in the meantime - look for the cut again." },
  } satisfies Record<MatchCutRefusal, T>,
};
