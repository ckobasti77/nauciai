/**
 * Novo svetlo (S18, K12): „sunce" na 3D kugli oko lika → smer, visina, toplina
 * i mekoća svetla → precizan opis za model. Čista matematika i tekst; kugla
 * (three.js) živi u `components/crea/tools/relight-sphere.tsx`.
 *
 * Koordinate su iz ugla gledaoca (kamere): `x` desno, `y` gore, `z` ka kameri.
 * `azimuth` 0° = svetlo spreda (iza kamere), −90° = sleva (leva strana slike),
 * +90° = zdesna, ±180° = otpozadi (kontra svetlo). `elevation` 0° = u visini
 * očiju, 90° = tačno iznad.
 */

import type { Locale, LocalizedText } from "./i18n";

export type LightSoftness = "meko" | "tvrdo";

export type LightSetup = {
  azimuth: number;
  elevation: number;
  /** Temperatura boje u kelvinima: niže = toplije (sveća 1900 K), više = hladnije. */
  kelvin: number;
  softness: LightSoftness;
};

export const LIGHT_LIMITS = {
  elevation: { min: -30, max: 90 },
  kelvin: { min: 1900, max: 10000 },
} as const;

export const DEFAULT_LIGHT: LightSetup = { azimuth: -45, elevation: 30, kelvin: 4500, softness: "meko" };

export type LightPresetId = "zlatni-sat" | "studio" | "podne" | "kontra" | "plavi-sat" | "sveca";

export const LIGHT_PRESETS: ReadonlyArray<{ id: LightPresetId; label: LocalizedText; setup: LightSetup }> = [
  { id: "zlatni-sat", label: { sr: "Zlatni sat", en: "Golden hour" }, setup: { azimuth: -65, elevation: 12, kelvin: 3200, softness: "meko" } },
  { id: "studio", label: { sr: "Studio", en: "Studio" }, setup: { azimuth: -40, elevation: 35, kelvin: 5600, softness: "meko" } },
  { id: "podne", label: { sr: "Podne", en: "Midday" }, setup: { azimuth: 10, elevation: 75, kelvin: 5800, softness: "tvrdo" } },
  { id: "kontra", label: { sr: "Kontra svetlo", en: "Backlight" }, setup: { azimuth: 170, elevation: 20, kelvin: 4200, softness: "meko" } },
  { id: "plavi-sat", label: { sr: "Plavi sat", en: "Blue hour" }, setup: { azimuth: 55, elevation: 8, kelvin: 9000, softness: "meko" } },
  { id: "sveca", label: { sr: "Sveća", en: "Candle" }, setup: { azimuth: 30, elevation: -12, kelvin: 1900, softness: "meko" } },
];

/** Ugao u (−180, 180]. */
export function wrapAzimuth(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let value = ((degrees % 360) + 360) % 360;
  if (value > 180) value -= 360;
  return Math.round(value);
}

export function clampLight(setup: LightSetup): LightSetup {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return {
    azimuth: wrapAzimuth(setup.azimuth),
    elevation: Math.round(clamp(setup.elevation, LIGHT_LIMITS.elevation.min, LIGHT_LIMITS.elevation.max)),
    kelvin: Math.round(clamp(setup.kelvin, LIGHT_LIMITS.kelvin.min, LIGHT_LIMITS.kelvin.max) / 100) * 100,
    softness: setup.softness === "tvrdo" ? "tvrdo" : "meko",
  };
}

export type Vec3 = { x: number; y: number; z: number };

const RAD = Math.PI / 180;

/** Jedinični vektor ka suncu. */
export function lightDirection(azimuth: number, elevation: number): Vec3 {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return { x: Math.cos(e) * Math.sin(a), y: Math.sin(e), z: Math.cos(e) * Math.cos(a) };
}

/** Obrnuto od `lightDirection` (uglovi zaokruženi na ceo stepen). */
export function anglesFromDirection(direction: Vec3): { azimuth: number; elevation: number } {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const y = Math.max(-1, Math.min(1, direction.y / length));
  const elevation = Math.round(Math.asin(y) / RAD);
  const azimuth = wrapAzimuth(Math.atan2(direction.x, direction.z) / RAD);
  return { azimuth, elevation };
}

/**
 * Tačka na kugli ispod prsta: `nx`, `ny` u [−1, 1] (centar kugle 0,0; `ny` gore).
 * Prednja polulopta (ka kameri) - kontra svetlo se bira klizačem ili presetom.
 * Tačka van kugle se svodi na ivicu (bočno svetlo).
 */
export function anglesFromSpherePoint(nx: number, ny: number): { azimuth: number; elevation: number } {
  let x = nx;
  let y = ny;
  const r2 = x * x + y * y;
  if (r2 > 1) {
    const r = Math.sqrt(r2);
    x /= r;
    y /= r;
  }
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return anglesFromDirection({ x, y, z });
}

/**
 * Boja svetla iz temperature (aproksimacija Tannera Hellanda, 1000-40000 K) -
 * za pregled na kugli; 0..255 po kanalu.
 */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const clamp = (value: number) => Math.round(Math.min(255, Math.max(0, value)));
  const red = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(red), clamp(green), clamp(blue)];
}

type Words = { sr: string; en: string };

/** Odakle dolazi, vodoravno. */
export function horizontalWords(azimuth: number): Words {
  const a = wrapAzimuth(azimuth);
  const abs = Math.abs(a);
  if (abs <= 20) return { sr: "spreda", en: "from the front" };
  if (abs >= 160) return { sr: "otpozadi (kontra svetlo)", en: "from behind (backlight)" };
  const left = a < 0;
  if (abs < 65) return left ? { sr: "spreda sleva", en: "from the front left" } : { sr: "spreda zdesna", en: "from the front right" };
  if (abs <= 115) return left ? { sr: "sleva", en: "from the left" } : { sr: "zdesna", en: "from the right" };
  return left ? { sr: "sleva i otpozadi", en: "from behind on the left" } : { sr: "zdesna i otpozadi", en: "from behind on the right" };
}

/** Odakle dolazi, uspravno. */
export function verticalWords(elevation: number): Words {
  if (elevation < -10) return { sr: "odozdo", en: "from below" };
  if (elevation <= 10) return { sr: "u visini lica", en: "at face height" };
  if (elevation <= 35) return { sr: "malo odozgo", en: "from slightly above" };
  if (elevation <= 65) return { sr: "odozgo", en: "from above" };
  return { sr: "skoro tačno iznad", en: "from almost directly above" };
}

/** Toplina rečima koje početnik razume. */
export function warmthWords(kelvin: number): Words {
  if (kelvin < 2400) return { sr: "vrlo toplo, kao plamen sveće", en: "very warm, like candlelight" };
  if (kelvin < 3600) return { sr: "toplo, kao zalazak sunca", en: "warm, like a sunset" };
  if (kelvin < 4800) return { sr: "blago toplo", en: "slightly warm" };
  if (kelvin < 6200) return { sr: "neutralno, kao dnevno svetlo", en: "neutral, like daylight" };
  if (kelvin < 7500) return { sr: "hladnije, kao oblačan dan", en: "cooler, like an overcast day" };
  return { sr: "hladno i plavičasto, kao plavi sat", en: "cold and bluish, like the blue hour" };
}

/** Kuda padaju senke (suprotno od svetla). */
export function shadowWords(azimuth: number, elevation: number): Words {
  const a = wrapAzimuth(azimuth);
  const abs = Math.abs(a);
  if (abs >= 160) return { sr: "Lice je delom u senci, a svetao rub ocrtava obris.", en: "The face is partly in shadow and a bright rim outlines the silhouette." };
  if (elevation > 65) return { sr: "Senke padaju pravo nadole, ispod nosa i brade.", en: "Shadows fall straight down, under the nose and chin." };
  const side = abs <= 20 ? null : a < 0 ? { sr: "udesno", en: "to the right" } : { sr: "ulevo", en: "to the left" };
  const down = elevation < -10 ? { sr: "nagore", en: "upwards" } : { sr: "nadole", en: "downwards" };
  if (!side) return { sr: `Senke su blage i padaju ${down.sr} iza lika.`, en: `Shadows are soft and fall ${down.en} behind the subject.` };
  return { sr: `Senke padaju ${side.sr} i ${down.sr}.`, en: `Shadows fall ${side.en} and ${down.en}.` };
}

/** Kratak opis za ekran: „Sleva, malo odozgo · toplo (3200 K) · meko". */
export function lightSummary(setup: LightSetup, locale: Locale): string {
  const light = clampLight(setup);
  const where = `${horizontalWords(light.azimuth)[locale]}, ${verticalWords(light.elevation)[locale]}`;
  const soft = light.softness === "meko" ? { sr: "meko", en: "soft" } : { sr: "tvrdo", en: "hard" };
  return `${where.charAt(0).toUpperCase()}${where.slice(1)} · ${warmthWords(light.kelvin)[locale]} (${light.kelvin} K) · ${soft[locale]}`;
}

/**
 * Ceo opis za model: smer rečima i u stepenima, toplina, mekoća, senke i šta
 * ostaje isto. `extra` je ono što je korisnik dopisao.
 */
export function relightPrompt(setup: LightSetup, locale: Locale, extra = ""): string {
  const said = extra.trim();
  const light = clampLight(setup);
  const side = Math.abs(light.azimuth);
  const horizontal = horizontalWords(light.azimuth)[locale];
  const vertical = verticalWords(light.elevation)[locale];
  const warmth = warmthWords(light.kelvin)[locale];
  const shadows = shadowWords(light.azimuth, light.elevation)[locale];
  if (locale === "sr") {
    const sideText = side <= 20 ? "skoro iz pravca kamere" : `oko ${side}° ${light.azimuth < 0 ? "levo" : "desno"} od kamere`;
    const heightText = light.elevation === 0 ? "u visini očiju" : `${Math.abs(light.elevation)}° ${light.elevation > 0 ? "iznad" : "ispod"} visine očiju`;
    const softText = light.softness === "meko" ? "meko i rasuto, sa blagim prelazima senki" : "tvrdo i usmereno, sa oštrim ivicama senki";
    return (
      `Promeni samo osvetljenje ove fotografije. Glavno svetlo dolazi ${horizontal} i ${vertical} (${sideText}, ${heightText}). ` +
      `Svetlo je ${warmth} (oko ${light.kelvin} K), ${softText}. ${shadows} ` +
      `Osoba, lice, izraz, poza, odeća, predmeti, pozadina i kadar ostaju potpuno isti - menjaju se samo svetlo, senke i odsjaji.` +
      (said ? ` Dodatno: ${said}.` : "")
    );
  }
  const sideText = side <= 20 ? "almost from the camera direction" : `about ${side}° to the ${light.azimuth < 0 ? "left" : "right"} of the camera`;
  const heightText = light.elevation === 0 ? "at eye level" : `${Math.abs(light.elevation)}° ${light.elevation > 0 ? "above" : "below"} eye level`;
  const softText = light.softness === "meko" ? "soft and diffused, with gentle shadow transitions" : "hard and directional, with crisp shadow edges";
  return (
    `Change only the lighting of this photo. The key light comes ${horizontal} and ${vertical} (${sideText}, ${heightText}). ` +
    `The light is ${warmth} (about ${light.kelvin} K), ${softText}. ${shadows} ` +
    `The person, face, expression, pose, clothes, objects, background and framing stay exactly the same - only the light, shadows and highlights change.` +
    (said ? ` Also: ${said}.` : "")
  );
}
