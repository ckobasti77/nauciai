export const locales = ["sr", "en"] as const;

export type Locale = (typeof locales)[number];

export type LocalizedText = Record<Locale, string>;

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function normalizeLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : "sr";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "sr" ? "en" : "sr";
}

export function localized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.sr;
}

export function withLocale(locale: Locale, path = ""): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export const dictionary = {
  sr: {
    appName: "Fakultet za AI",
    navCourses: "Smerovi",
    navCommunity: "Zajednica",
    navPricing: "Pretplata",
    signIn: "Prijava",
    startLearning: "Počni učenje",
    openApp: "Otvori platformu",
    dashboard: "Pregled",
    myCourses: "Moji smerovi",
    lessons: "Lekcije",
    documents: "Dokumenti",
    community: "Zajednica",
    profile: "Profil",
    billing: "Pretplata",
    admin: "Admin",
    progress: "Napredak",
    continueLesson: "Nastavi lekciju",
    checkout: "Kupi mesečno",
    portal: "Upravljaj pretplatom",
    publish: "Objavi",
    save: "Sačuvaj",
    draft: "Nacrt",
    published: "Objavljeno",
  },
  en: {
    appName: "Faculty for AI",
    navCourses: "Tracks",
    navCommunity: "Community",
    navPricing: "Subscription",
    signIn: "Sign in",
    startLearning: "Start learning",
    openApp: "Open platform",
    dashboard: "Overview",
    myCourses: "My tracks",
    lessons: "Lessons",
    documents: "Documents",
    community: "Community",
    profile: "Profile",
    billing: "Billing",
    admin: "Admin",
    progress: "Progress",
    continueLesson: "Continue lesson",
    checkout: "Buy monthly",
    portal: "Manage subscription",
    publish: "Publish",
    save: "Save",
    draft: "Draft",
    published: "Published",
  },
} as const satisfies Record<Locale, Record<string, string>>;
