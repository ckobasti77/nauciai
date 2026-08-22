"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  THEME_ATTRIBUTE,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  themeColorFor,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
// Mora da bude duze od CSS prelaza (150ms u globals.css) da ga ne presece.
const THEME_SWITCH_CLASS = "theme-switching";
const THEME_SWITCH_MS = 220;

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  setPreference: () => {},
});

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribeToPreference(onChange: () => void) {
  // `storage` pokriva druge tabove; custom event pokriva ovaj tab.
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function getServerPreference(): ThemePreference {
  return "system";
}

function applyResolvedTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", themeColorFor(theme));
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribeToPreference, readStoredPreference, getServerPreference);

  // Inline skripta iz <head> je vec postavila atribut pre prve boje; ovde se samo
  // prati promena izbora i, dok je izbor "sistem", promena OS teme u toku sesije.
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const sync = () => applyResolvedTheme(resolveTheme(preference, media.matches));
    sync();
    if (preference !== "system") return;
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Privatni rezim / blokiran storage: tema se i dalje menja za ovu sesiju.
    }
    // Kratak prelaz boja samo na izricit klik (ne pri ucitavanju); CSS ga gasi pod
    // prefers-reduced-motion.
    const root = document.documentElement;
    root.classList.add(THEME_SWITCH_CLASS);
    window.setTimeout(() => root.classList.remove(THEME_SWITCH_CLASS), THEME_SWITCH_MS);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
