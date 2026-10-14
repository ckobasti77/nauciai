/**
 * Zvuk IGRA-e (K03, plan K01 §3.3). Nema svog prekidača: sluša postojeći
 * (`components/app/sound-toggle.tsx`, ključ ispod). Fajlovi su postojeći CC0 zvuci iz
 * `public/brand/crea/sfx` - mapu na katalog čuva `lib/igra-sound.test.ts`, a katalog se
 * ovde namerno ne uvozi (ceo spisak zvukova ne treba ljusci aplikacije).
 */

const SOUND_KEY = "nauciai-chat-sound";

/** Događaj → postojeći zvuk. `success` (K24) je tost uspeha: kratak stakleni zvon. */
export const IGRA_SFX = {
  level: "pojacanje",
  badge: "potvrda",
  course: "dzingl-pizzicato",
  success: "stakleni-zvon",
} as const;
export type IgraSfx = keyof typeof IGRA_SFX;

export const IGRA_SFX_VOLUME = 0.4;

export function igraSfxUrl(sfx: IgraSfx): string {
  return `/brand/crea/sfx/${IGRA_SFX[sfx]}.mp3`;
}

/** Zvuk je uključen dok ga korisnik ne isključi (isto pravilo kao `SoundToggle`). */
export function isIgraSoundEnabled(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return false;
  }
}

/** Pusti zvuk ako je uključen. Pregledač sme da odbije (nema gesta korisnika) - tada je tišina. */
export function playIgraSfx(sfx: IgraSfx): void {
  if (!isIgraSoundEnabled()) return;
  const audio = new Audio(igraSfxUrl(sfx));
  audio.volume = IGRA_SFX_VOLUME;
  void audio.play().catch(() => undefined);
}
