/**
 * Uglovi kamere (S19, K12): JEDNA generacija pravi mrežu 3×3 - devet uglova
 * istog subjekta - a mreža se na uređaju iseče u 9 zasebnih radova. Jeftinije je
 * jer se plaća jedna slika (veće rezolucije) umesto devet, a uglovi su iz istog
 * poziva pa su lik, odeća i svetlo isti.
 *
 * Čista logika: polja mreže, spisak uglova, opis za model, prepoznavanje rada
 * koji je mreža i račun uštede. Crtanje i čuvanje su u `uglovi-tool.tsx`.
 */

import type { Locale, LocalizedText } from "./i18n";

export const GRID_ROWS = 3;
export const GRID_COLS = 3;

/**
 * Koliko se odseče sa svake strane polja (udeo kraće stranice polja): model ume
 * da nacrta tanku liniju između kadrova, pa se ivica polja ne uzima.
 */
export const GRID_INSET = 0.012;

export type GridCell = { index: number; row: number; col: number; x: number; y: number; width: number; height: number };

/**
 * Polja mreže u pikselima, redom sleva nadesno pa odozgo nadole. Ivice su
 * zaokružene na ceo piksel, pa polja bez `inset`-a pokrivaju celu sliku tačno
 * jednom (ostatak deljenja ide poljima redom, ne poslednjem).
 */
export function gridCells(width: number, height: number, rows = GRID_ROWS, cols = GRID_COLS, inset = 0): GridCell[] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const xs = Array.from({ length: cols + 1 }, (_, i) => Math.round((i * w) / cols));
  const ys = Array.from({ length: rows + 1 }, (_, i) => Math.round((i * h) / rows));
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellWidth = xs[col + 1]! - xs[col]!;
      const cellHeight = ys[row + 1]! - ys[row]!;
      const pad = Math.min(Math.floor((Math.min(cellWidth, cellHeight) - 1) / 2), Math.round(Math.min(cellWidth, cellHeight) * Math.max(0, inset)));
      cells.push({
        index: row * cols + col,
        row,
        col,
        x: xs[col]! + pad,
        y: ys[row]! + pad,
        width: cellWidth - pad * 2,
        height: cellHeight - pad * 2,
      });
    }
  }
  return cells;
}

export type CameraAngleId =
  | "spreda"
  | "tri-cetvrtine-levo"
  | "profil-levo"
  | "tri-cetvrtine-desno"
  | "profil-desno"
  | "odozgo"
  | "odozdo"
  | "krupno"
  | "otpozadi";

/** Devet uglova, redom polja u mreži (gore levo → dole desno). */
export const CAMERA_ANGLES: ReadonlyArray<{ id: CameraAngleId; label: LocalizedText; prompt: LocalizedText }> = [
  {
    id: "spreda",
    label: { sr: "Spreda", en: "Front" },
    prompt: { sr: "spreda, kamera u visini očiju", en: "from the front, camera at eye level" },
  },
  {
    id: "tri-cetvrtine-levo",
    label: { sr: "Tri četvrtine levo", en: "Three-quarter left" },
    prompt: { sr: "iz tri četvrtine sleva (okrenut 45°)", en: "three-quarter view from the left (turned 45°)" },
  },
  {
    id: "profil-levo",
    label: { sr: "Profil levo", en: "Left profile" },
    prompt: { sr: "iz profila sleva (okrenut 90°)", en: "left profile (turned 90°)" },
  },
  {
    id: "tri-cetvrtine-desno",
    label: { sr: "Tri četvrtine desno", en: "Three-quarter right" },
    prompt: { sr: "iz tri četvrtine zdesna (okrenut 45°)", en: "three-quarter view from the right (turned 45°)" },
  },
  {
    id: "profil-desno",
    label: { sr: "Profil desno", en: "Right profile" },
    prompt: { sr: "iz profila zdesna (okrenut 90°)", en: "right profile (turned 90°)" },
  },
  {
    id: "odozgo",
    label: { sr: "Odozgo", en: "High angle" },
    prompt: { sr: "odozgo, kamera visoko i gleda naniže", en: "high angle, camera above looking down" },
  },
  {
    id: "odozdo",
    label: { sr: "Odozdo", en: "Low angle" },
    prompt: { sr: "odozdo, kamera nisko i gleda naviše", en: "low angle, camera low looking up" },
  },
  {
    id: "krupno",
    label: { sr: "Krupni plan", en: "Close-up" },
    prompt: { sr: "krupni plan lica ili glavnog detalja", en: "close-up of the face or the main detail" },
  },
  {
    id: "otpozadi",
    label: { sr: "Otpozadi", en: "From behind" },
    prompt: { sr: "otpozadi, preko ramena", en: "from behind, over the shoulder" },
  },
];

/** Prvi red opisa - po njemu se rad prepoznaje kao mreža uglova (detalj nudi „Iseci u 9 radova"). */
export const ANGLES_PROMPT_MARKER: LocalizedText = {
  sr: "Mreža 3×3 od devet kadrova istog subjekta.",
  en: "A 3×3 grid of nine frames of the same subject.",
};

export function anglesGridPrompt(locale: Locale, extra = ""): string {
  const said = extra.trim();
  const cells = CAMERA_ANGLES.map((angle, index) => `${index + 1}. ${angle.prompt[locale]}`).join("; ");
  if (locale === "sr") {
    return (
      `${ANGLES_PROMPT_MARKER.sr} Napravi JEDNU kvadratnu sliku podeljenu na 9 jednakih kvadratnih polja (3 reda × 3 kolone), bez razmaka, okvira, brojeva i teksta. ` +
      `U svakom polju je isti subjekat sa priložene fotografije - isti lik ili predmet, odeća, boje, svetlo i okruženje - samo snimljen iz drugog ugla kamere, redom sleva nadesno pa odozgo nadole: ${cells}. ` +
      `Subjekat je u svakom polju ceo i u sredini kadra.` +
      (said ? ` Dodatno: ${said}.` : "")
    );
  }
  return (
    `${ANGLES_PROMPT_MARKER.en} Make ONE square image split into 9 equal square cells (3 rows × 3 columns), with no gaps, borders, numbers or text. ` +
    `Every cell shows the same subject from the attached photo - the same character or object, clothes, colours, light and surroundings - only shot from a different camera angle, left to right and top to bottom: ${cells}. ` +
    `The subject is whole and centred in every cell.` +
    (said ? ` Also: ${said}.` : "")
  );
}

/** Da li je ovo opis mreže uglova (posao iz ovog alata). */
export function isAnglesGridPrompt(prompt: string | null | undefined): boolean {
  if (!prompt) return false;
  const start = prompt.trimStart();
  return start.startsWith(ANGLES_PROMPT_MARKER.sr) || start.startsWith(ANGLES_PROMPT_MARKER.en);
}

/** Parametri posla mreže: kvadrat, 4K (svako polje ~1365 px). */
export const ANGLES_GRID_PARAMS = { aspect_ratio: "1:1", resolution: "4K" } as const;

/**
 * Zašto je jeftinije: jedna mreža naspram 9 zasebnih slika (najjeftinije
 * podešavanje istog modela). `null` kad cena jedne od dve nije poznata.
 */
export function anglesSavings(gridCredits: number | null, singleCredits: number | null) {
  if (gridCredits === null || singleCredits === null || gridCredits <= 0 || singleCredits <= 0) return null;
  const separately = singleCredits * CAMERA_ANGLES.length;
  return {
    grid: gridCredits,
    separately,
    perAngle: Math.round((gridCredits / CAMERA_ANGLES.length) * 10) / 10,
    saved: Math.max(0, separately - gridCredits),
    percent: Math.max(0, Math.round((1 - gridCredits / separately) * 100)),
  };
}

/** Ime fajla jednog ugla: `crea-ugao-3-profil-levo.jpg`. */
export function angleFileName(index: number, type: string): string {
  const angle = CAMERA_ANGLES[index];
  const extension = type === "image/png" ? "png" : "jpg";
  return `crea-ugao-${index + 1}-${angle?.id ?? "polje"}.${extension}`;
}
