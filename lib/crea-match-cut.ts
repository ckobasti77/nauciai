import { hammingDistance } from "./crea-duplicates";
import { clampKenBurns, coverWindow, kenBurnsWindow, KEN_BURNS_ZOOM_MAX, type CropWindow, type KenBurns } from "./crea-ken-burns";
import { setTransition, TIMELINE_LIMITS, updateMainClip, type CreaTimelineV1, type MainClip, type NewMainClip } from "./crea-timeline";

/**
 * Match-cut po licu (Crea K21, V27; plan K17 §6.3): rez između dva susedna
 * klipa montaže tačno u trenutku kad se kadrovi najviše poklapaju. Uzorci su
 * poslednje 2 s klipa A i prve 2 s klipa B, 8 kadrova u sekundi (lice iz
 * MediaPipe-a i blockhash otisak, `components/crea/video/engine/match-cut-sampler.ts`).
 *
 * Kad oba kadra imaju lice, odlučuje lice (gde je na ekranu i koliko je); bez
 * lica odlučuje sličnost slike (Hamingova razdaljina otisaka, K16). Lice B se
 * zatim mirnim Ken Burnsom (zum ≥ 1, prozor uvek ceo u slici) pomera tamo gde
 * je bilo lice A. Čiste funkcije - korisnik vidi predlog pre primene.
 */

export const MATCH_CUT = { windowS: 2, fps: 8, transition: "pretapanje", transitionS: 0.2 } as const;

/** Lice u delovima kadra (0..1): centar i visina lica / visina kadra. */
export type MatchFace = { cx: number; cy: number; size: number };
/** Jedan uzorak: vreme izvora (s), najveće lice (ili `null`) i blockhash otisak (heks). */
export type MatchSample = { t: number; face: MatchFace | null; hash: string };

export type MatchCut = {
  /** Novi kraj klipa A i novi početak klipa B, u sekundama izvora. */
  aTime: number;
  bTime: number;
  /** Manje je bolje. */
  score: number;
  by: "lice" | "slika";
  aFace: MatchFace | null;
  bFace: MatchFace | null;
};

/**
 * Kako se izvori vide u kadru montaže: prozor izvora A (kraj klipa, sa njegovim
 * Ken Burnsom) i izvora B bez Ken Burnsa (poravnanje ga zamenjuje).
 */
export type MatchCutView = {
  frameAspect: number;
  aWindow: CropWindow;
  bWindow: CropWindow;
  bSourceAspect: number;
  bFit: MainClip["fit"];
};

export type MatchCutRefusal = "NEMA_KLIPA" | "SLIKA" | "BRZINA" | "UNAZAD" | "VAN_OPSEGA";

/** Težine ocene po licu: položaj odlučuje, veličina pomaže, slika samo razdvaja skoro iste parove. */
const FACE_WEIGHTS = { position: 1, size: 0.5, picture: 0.1 } as const;
const EPS = 1e-9;
/** Kraj klipa A se uzorkuje malo pre `out` (dekoder na samom kraju ume da vrati prazno). */
const END_MARGIN_S = 0.001;
/** Poravnanje kome treba zum malo manji od 1 ostaje na 1; ispod ovoga - nema poravnanja. */
const ZOOM_SLACK = 0.1;
/** Prozor koji se od običnog „cover" razlikuje manje od 1 % slike = nema poravnanja. */
const NEGLIGIBLE = 0.01;

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Trenuci uzorkovanja (rastuće): poslednje 2 s klipa A (`end`) ili prve 2 s klipa B (`start`), 8 u sekundi. */
export function matchCutTimes(clip: { in: number; out: number }, edge: "end" | "start"): number[] {
  const step = 1 / MATCH_CUT.fps;
  const count = MATCH_CUT.windowS * MATCH_CUT.fps;
  const times: number[] = [];
  if (edge === "end") {
    const first = Math.max(clip.in + TIMELINE_LIMITS.clipMinS, clip.out - MATCH_CUT.windowS);
    for (let k = 0; k <= count; k += 1) {
      const t = clip.out - END_MARGIN_S - k * step;
      if (t < first - EPS) break;
      times.unshift(round4(t));
    }
  } else {
    const last = Math.min(clip.out - TIMELINE_LIMITS.clipMinS, clip.in + MATCH_CUT.windowS);
    for (let k = 0; k <= count; k += 1) {
      const t = clip.in + k * step;
      if (t > last + EPS) break;
      times.push(round4(t));
    }
  }
  return times;
}

/**
 * Prozor izvora koji se vidi u kadru (delovi slike). „Cover" je isečak (Ken
 * Burns u trenutku `progress`), „contain" je prozor veći od slike u pravcu u
 * kom ostaje traka.
 */
export function clipScreenWindow(clip: Pick<MainClip, "fit" | "kenBurns">, sourceAspect: number, frameAspect: number, progress = 1): CropWindow {
  if (clip.fit === "contain") {
    const ratio = frameAspect / sourceAspect;
    const w = ratio > 1 ? ratio : 1;
    const h = ratio > 1 ? 1 : 1 / ratio;
    return { x: 0.5 - w / 2, y: 0.5 - h / 2, w, h };
  }
  return clip.kenBurns ? kenBurnsWindow(clip.kenBurns, progress, sourceAspect, frameAspect) : coverWindow(sourceAspect, frameAspect);
}

export function matchCutView(a: MainClip, b: MainClip, aSourceAspect: number, bSourceAspect: number, frameAspect: number): MatchCutView {
  return {
    frameAspect,
    aWindow: clipScreenWindow(a, aSourceAspect, frameAspect, 1),
    bWindow: clipScreenWindow({ fit: b.fit }, bSourceAspect, frameAspect),
    bSourceAspect,
    bFit: b.fit,
  };
}

/** Lice izvora → lice na ekranu (delovi kadra). */
export function faceOnScreen(face: MatchFace, window: CropWindow): MatchFace {
  return { cx: (face.cx - window.x) / window.w, cy: (face.cy - window.y) / window.h, size: face.size / window.h };
}

/** Razlika slike 0..1 (deo različitih bitova), ili `null` kad otisci ne mogu da se uporede. */
function pictureDistance(a: string, b: string): number | null {
  if (!a || a.length !== b.length) return null;
  const distance = hammingDistance(a, b);
  return Number.isFinite(distance) ? distance / (a.length * 4) : null;
}

/** Bolji par: manja ocena; za isto - kasniji kraj A, pa raniji početak B (najmanje se odseca). */
function better(next: MatchCut, best: MatchCut): boolean {
  if (next.score < best.score - EPS) return true;
  if (next.score > best.score + EPS) return false;
  if (next.aTime !== best.aTime) return next.aTime > best.aTime;
  return next.bTime < best.bTime;
}

/**
 * Najbolji par (kraj A, početak B). Ako bar jedan par ima lice u oba kadra,
 * gledaju se samo takvi parovi (položaj i veličina lica na ekranu, slika tek
 * kao razdvajanje); inače samo sličnost slike.
 */
export function findMatchCut(aSamples: readonly MatchSample[], bSamples: readonly MatchSample[], view: MatchCutView): MatchCut | null {
  const byFace = aSamples.some((sample) => sample.face) && bSamples.some((sample) => sample.face);
  let best: MatchCut | null = null;
  for (const a of aSamples) {
    for (const b of bSamples) {
      const picture = pictureDistance(a.hash, b.hash);
      let score: number;
      if (byFace) {
        if (!a.face || !b.face) continue;
        const onA = faceOnScreen(a.face, view.aWindow);
        const onB = faceOnScreen(b.face, view.bWindow);
        const position = Math.hypot((onA.cx - onB.cx) * view.frameAspect, onA.cy - onB.cy);
        const size = Math.abs(onA.size - onB.size) / Math.max(onA.size, onB.size, EPS);
        score = FACE_WEIGHTS.position * position + FACE_WEIGHTS.size * size + FACE_WEIGHTS.picture * (picture ?? 1);
      } else {
        if (picture === null) continue;
        score = picture;
      }
      const candidate: MatchCut = { aTime: a.t, bTime: b.t, score, by: byFace ? "lice" : "slika", aFace: a.face, bFace: b.face };
      if (!best || better(candidate, best)) best = candidate;
    }
  }
  return best;
}

/**
 * Mirni Ken Burns (`from` = `to`) za klip B: lice B (u delovima izvora B) staje
 * tamo gde je na ekranu bilo lice A (`aFace`, u delovima kadra) i iste je
 * veličine - koliko dozvoljavaju zum 1..2 i prozor koji ostaje ceo u slici.
 * `null` kad bi trebalo udaljiti (zum < 1, video bi pokazao ivicu) ili kad je
 * pomak zanemarljiv.
 */
export function faceAlignment(aFace: MatchFace, bFace: MatchFace, sourceAspect: number, frameAspect: number): KenBurns | null {
  if (!(aFace.size > 0) || !(bFace.size > 0) || !(sourceAspect > 0) || !(frameAspect > 0)) return null;
  const base = coverWindow(sourceAspect, frameAspect);
  // Lice B na ekranu je visoko bFace.size / h prozora; treba da bude aFace.size.
  const wanted = (base.h * aFace.size) / bFace.size;
  if (wanted < 1 - ZOOM_SLACK) return null;
  const zoom = Math.min(KEN_BURNS_ZOOM_MAX, Math.max(1, wanted));
  const w = base.w / zoom;
  const h = base.h / zoom;
  // Centar prozora koji lice B stavlja na mesto lica A, pa pomeraj −1..1 (kenBurnsWindow).
  const pan = (center: number, side: number) => (side >= 1 - EPS ? 0 : Math.max(-1, Math.min(1, (center - 0.5) / (0.5 - side / 2))));
  const point = { zoom: round4(zoom), x: round4(pan(bFace.cx + w * (0.5 - aFace.cx), w)), y: round4(pan(bFace.cy + h * (0.5 - aFace.cy), h)) };
  const kb = clampKenBurns({ from: point, to: { ...point } });
  const window = kenBurnsWindow(kb, 0, sourceAspect, frameAspect);
  if (Math.abs(window.x - base.x) < NEGLIGIBLE && Math.abs(window.y - base.y) < NEGLIGIBLE && Math.abs(window.w - base.w) < NEGLIGIBLE) {
    return null;
  }
  return kb;
}

/** Poravnanje za izabran par: samo za rez po licu i kad je B „cover". */
export function matchCutAlignment(cut: MatchCut, view: MatchCutView): KenBurns | null {
  if (cut.by !== "lice" || !cut.aFace || !cut.bFace || view.bFit !== "cover") return null;
  return faceAlignment(faceOnScreen(cut.aFace, view.aWindow), cut.bFace, view.bSourceAspect, view.frameAspect);
}

/**
 * Zašto match-cut ne može posle klipa `aClipId` (ili `null`): treba sledeći
 * klip, oba moraju biti video normalne brzine, bez rampe, unazad i bumeranga.
 */
export function matchCutBlocker(timeline: CreaTimelineV1, aClipId: string): MatchCutRefusal | null {
  const index = timeline.main.findIndex((clip) => clip.id === aClipId);
  const a = index >= 0 ? timeline.main[index] : undefined;
  const b = index >= 0 ? timeline.main[index + 1] : undefined;
  if (!a || !b) return "NEMA_KLIPA";
  if (a.media !== "video" || b.media !== "video") return "SLIKA";
  if ([a, b].some((clip) => clip.speed !== 1 || clip.speedKeys)) return "BRZINA";
  if ([a, b].some((clip) => clip.reverse || clip.boomerang)) return "UNAZAD";
  return null;
}

export type MatchCutResult = { ok: true; timeline: CreaTimelineV1 } | { ok: false; reason: MatchCutRefusal };

/**
 * Primena predloga: kraj A = `aTime`, početak B = `bTime`, Ken Burns klipa B =
 * poravnanje (samo kad je B „cover"; bez poravnanja stari se uklanja) i kratko
 * pretapanje (0,2 s) između njih. Vraća novu vremensku liniju ili razlog.
 */
export function applyMatchCut(
  timeline: CreaTimelineV1,
  aClipId: string,
  cut: Pick<MatchCut, "aTime" | "bTime">,
  alignment: KenBurns | null,
): MatchCutResult {
  const blocker = matchCutBlocker(timeline, aClipId);
  if (blocker) return { ok: false, reason: blocker };
  const index = timeline.main.findIndex((clip) => clip.id === aClipId);
  const a = timeline.main[index];
  const b = timeline.main[index + 1];
  const min = TIMELINE_LIMITS.clipMinS;
  const aValid = Number.isFinite(cut.aTime) && cut.aTime >= a.in + min - EPS && cut.aTime <= a.out + EPS;
  const bValid = Number.isFinite(cut.bTime) && cut.bTime >= b.in - EPS && cut.bTime <= b.out - min + EPS;
  if (!aValid || !bValid) return { ok: false, reason: "VAN_OPSEGA" };

  let next = updateMainClip(timeline, a.id, { out: Math.min(a.out, Math.max(a.in + min, cut.aTime)) });
  const patch: Partial<NewMainClip> = { in: Math.max(b.in, Math.min(b.out - min, cut.bTime)) };
  if (b.fit === "cover") patch.kenBurns = alignment ?? undefined;
  next = updateMainClip(next, b.id, patch);
  next = setTransition(next, a.id, MATCH_CUT.transition, MATCH_CUT.transitionS);
  return { ok: true, timeline: next };
}
