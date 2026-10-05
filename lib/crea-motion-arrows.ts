/**
 * „Crtaj pokret" (Crea K18, V12): strelice preko prvog kadra postaju rečenice
 * koje model razume. Nijedan model iz kataloga nema „četkicu pokreta" kao polje,
 * pa slika ide kao prvi kadar (režim `image`), a strelice kao opis: KO se pomera
 * (oblast slike na mreži 3×3), KUDA (osam smerova) i KOLIKO (dužina strelice).
 *
 * Koordinate su 0..1 slike (x udesno, y nadole).
 */

export type MotionArrow = { x1: number; y1: number; x2: number; y2: number };

/**
 * Modeli koji oživljavaju sliku (režim `image`), od najjeftinijeg: korisnik bira
 * jedan na dugmetu, sa cenom iz kataloga.
 */
export const DRAW_MOTION_MODELS = ["hailuo-23-fast", "grok-video-15-lite", "minimax-h3-max-turbo", "kling-3-turbo", "veo-31-lite"] as const;

export const MAX_ARROWS = 5;
/** Kraća strelica od ovoga je slučajan dodir, ne pokret. */
export const MIN_ARROW_LENGTH = 0.06;

const ROWS = ["upper", "middle", "lower"] as const;
const COLS = ["left", "center", "right"] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Oblast slike na mreži 3×3, rečima („upper left", „center"). */
export function regionName(x: number, y: number): string {
  const row = ROWS[Math.min(2, Math.floor(clamp01(y) * 3))];
  const col = COLS[Math.min(2, Math.floor(clamp01(x) * 3))];
  if (row === "middle" && col === "center") return "center";
  if (row === "middle") return `middle ${col}`;
  if (col === "center") return `${row} center`;
  return `${row} ${col}`;
}

/** Smer u osam pravaca (ekran: y raste nadole). */
export function directionName(dx: number, dy: number): string {
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // 0 = desno, 90 = gore
  const sectors = ["to the right", "up and to the right", "upward", "up and to the left", "to the left", "down and to the left", "downward", "down and to the right"];
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return sectors[index];
}

export function arrowLength(arrow: MotionArrow): number {
  return Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);
}

function distanceWord(length: number): string {
  if (length < 0.2) return "a little";
  if (length < 0.45) return "a medium distance";
  return "a long way";
}

/** Strelice koje su stvarno pokret (dovoljno duge), najviše `MAX_ARROWS`, redom crtanja. */
export function usableArrows(arrows: readonly MotionArrow[]): MotionArrow[] {
  return arrows.filter((arrow) => arrowLength(arrow) >= MIN_ARROW_LENGTH).slice(0, MAX_ARROWS);
}

/** Jedna rečenica po strelici: „the subject in the upper left of the image moves to the right, a long way". */
export function arrowsToPhrases(arrows: readonly MotionArrow[]): string[] {
  return usableArrows(arrows).map((arrow) => {
    const region = regionName(arrow.x1, arrow.y1);
    const where = region === "center" ? "in the center of the image" : `in the ${region} of the image`;
    return `the subject ${where} moves ${directionName(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1)}, ${distanceWord(arrowLength(arrow))}`;
  });
}

/** Opis za model: korisnikove reči, pa pokreti redom i napomena da se ostalo ne pomera. */
export function motionPrompt(text: string, arrows: readonly MotionArrow[]): string {
  const phrases = arrowsToPhrases(arrows);
  const said = text.trim().replace(/[.\s]+$/, "");
  if (phrases.length === 0) return said;
  const moves = phrases.map((phrase, index) => (phrases.length > 1 ? `${index + 1}) ${phrase}` : phrase)).join("; ");
  const body = `Motion: ${moves}. Everything else keeps its place, the camera stays steady.`;
  return said ? `${said}. ${body}` : body;
}
