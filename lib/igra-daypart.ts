import type { IgraArtId } from "./igra-art";
import { IGRA_DASHBOARD_COPY } from "./igra-copy";
import { belgradeHour } from "./igra-time";
import type { Locale, LocalizedText } from "./i18n";

const COPY = IGRA_DASHBOARD_COPY;

/**
 * Doba dana na kontrolnoj tabli (K08, plan K07 §1.3): bira scenu heroja i pozdrav. Računa se
 * po satu u Beogradu, kao i ostali dnevni ključevi u repou; server ga šalje kao prop, pa je
 * scena u HTML-u i nema neslaganja pri hidrataciji.
 */

export const IGRA_DAYPARTS = ["jutro", "dan", "vece", "noc"] as const;
export type IgraDaypart = (typeof IGRA_DAYPARTS)[number];

/** jutro 05-10:59 · dan 11-16:59 · veče 17-21:59 · noć 22-04:59. Loš ulaz → dan. */
export function igraDaypart(hour: number): IgraDaypart {
  if (!Number.isFinite(hour)) return "dan";
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 11) return "jutro";
  if (h >= 11 && h < 17) return "dan";
  if (h >= 17 && h < 22) return "vece";
  return "noc";
}

export function igraDaypartAt(timestamp: number): IgraDaypart {
  return igraDaypart(belgradeHour(timestamp));
}

/** Doba dana u ovom trenutku (poziva ga server u `app/[locale]/app/page.tsx`). */
export function igraDaypartNow(): IgraDaypart {
  return igraDaypartAt(Date.now());
}

const SCENE = {
  jutro: "scena.dashboard-jutro",
  dan: "scena.dashboard-dan",
  vece: "scena.dashboard-vece",
  noc: "scena.dashboard-noc",
} as const satisfies Record<IgraDaypart, IgraArtId>;

export function dashboardSceneArt(daypart: IgraDaypart): IgraArtId {
  return SCENE[daypart];
}

const GREETING = {
  jutro: COPY.greetingJutro,
  dan: COPY.greetingDan,
  vece: COPY.greetingVece,
  noc: COPY.greetingNoc,
} satisfies Record<IgraDaypart, LocalizedText>;

const ROBI_LINE = {
  jutro: COPY.robiJutro,
  dan: COPY.robiDan,
  vece: COPY.robiVece,
  noc: COPY.robiNoc,
} satisfies Record<IgraDaypart, LocalizedText>;

/** „Dobro jutro, Mila"; bez imena samo pozdrav. */
export function dashboardGreeting(daypart: IgraDaypart, name: string | null | undefined, locale: Locale): string {
  const who = name?.trim();
  return who ? `${GREETING[daypart][locale]}, ${who}` : GREETING[daypart][locale];
}

/** Robijeva rečenica u oblačiću: zavisi samo od doba dana, pa se ne menja kad stignu podaci. */
export function dashboardRobiLine(daypart: IgraDaypart, locale: Locale): string {
  return ROBI_LINE[daypart][locale];
}
