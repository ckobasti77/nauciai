// Tema platforme: tri stanja (svetla / tamna / sistem), `system` je podrazumevano.
// Izbor zivi u localStorage i primenjuje se PRE prve boje kroz `THEME_INIT_SCRIPT`
// (inline u <head>), pa nema bleska svetle teme ni na jednoj ruti. Razreseno stanje
// stoji kao `data-theme="light" | "dark"` na <html>; CSS tokeni i Tailwind `dark:`
// varijanta (app/globals.css) citaju samo taj atribut.

export const THEME_STORAGE_KEY = "nauci_theme";
export const THEME_CHANGE_EVENT = "nauci:theme-change";
export const THEME_ATTRIBUTE = "data-theme";

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type ResolvedTheme = "light" | "dark";

// `<meta name="theme-color">` prati podlogu stranice (`--paper`) u obe teme.
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#fffdf8",
  dark: "#0e1a2b",
};

export function parseThemePreference(rawValue: string | null | undefined): ThemePreference {
  return rawValue === "light" || rawValue === "dark" ? rawValue : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function themeColorFor(theme: ResolvedTheme): string {
  return THEME_COLORS[theme];
}

// Ista logika kao `parseThemePreference` + `resolveTheme`, ali kao samostalan ES5
// string bez zavisnosti, jer mora da se izvrsi pre nego sto se bilo sta hidrira.
// `try` stiti od blokiranog localStorage-a (privatni rezim) - tada ostaje sistem.
export const THEME_INIT_SCRIPT = [
  "(function(){try{",
  `var p=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  'var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);',
  `document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},d?"dark":"light");`,
  "var m=document.querySelectorAll('meta[name=\"theme-color\"]');",
  `for(var i=0;i<m.length;i++){m[i].setAttribute("content",d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)});}`,
  "}catch(e){}})();",
].join("");
