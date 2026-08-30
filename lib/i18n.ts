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

export function t(locale: Locale, sr: string, en: string): string {
  return locale === "sr" ? sr : en;
}

export function withLocale(locale: Locale, path = ""): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export const dictionary = {
  sr: {
    appName: "Fakultet za AI",
    navCourses: "Kursevi",
    navCommunity: "Zajednica",
    navPricing: "Pretplata",
    signIn: "Prijava",
    startLearning: "Počni učenje",
    openApp: "Otvori platformu",
    dashboard: "Pregled",
    myCourses: "Moji kursevi",
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
    navCourses: "Courses",
    navCommunity: "Community",
    navPricing: "Subscription",
    signIn: "Sign in",
    startLearning: "Start learning",
    openApp: "Open platform",
    dashboard: "Overview",
    myCourses: "My courses",
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

/**
 * Marketing (javni deo sajta) copy. Odvojeno od `dictionary` jer nosi ugnježđene
 * objekte i nizove (marquee, koraci, FAQ) koje ravan `Record<Locale, Record<string,string>>`
 * ne bi primio. Sav novi marketinški tekst živi ovde — nijedan hardkodovan string u
 * komponentama. `sr` i `en` moraju držati istu strukturu.
 */
export const marketingContent = {
  sr: {
    footer: {
      tagline: "Praktični AI kursevi na srpskom — od prve lekcije do gotovog rada koji možeš da objaviš.",
      coursesHeading: "Kursevi",
      platformHeading: "Platforma",
      legalHeading: "Pravno i kontakt",
      community: "Zajednica",
      signIn: "Prijava",
      openApp: "Otvori platformu",
      privacy: "Politika privatnosti",
      terms: "Uslovi korišćenja",
      socialsHeading: "Mreže",
      langLabel: "Promeni jezik",
      switchTo: "English",
      rights: "Sva prava zadržana.",
    },
    hero: {
      titleLead: "Nauči da praviš AI video, sajtove i zvuk — od nule do ",
      titleHighlight: "gotovog rada",
      subhead:
        "Kroz kratke lekcije, materijale i zajednicu praviš prave radove: montiran video, sopstveni sajt i naraciju sa AI glasom. Bez predznanja.",
      ctaSecondary: "Odgledaj besplatan video",
      videoAlt: "Isečci iz AI video, audio i web lekcija",
      trustCohort: "Prva generacija upisana",
      trustSerbian: "Kursevi na srpskom",
      trustLessons: "lekcije spremne",
    },
    marquee: {
      label: "Šta ćeš umeti",
      items: [
        "montiraš AI video",
        "kloniraš glas",
        "napraviš sajt bez kodiranja",
        "pišeš uz AI",
        "vodiš svoju zajednicu",
      ],
    },
    courses: {
      title: "Kursevi koji vode do gotovog rada",
      intro: "Dva kursa, isti cilj: da na kraju imaš pravi rad — ne samo teoriju.",
      outcomesLabel: "Šta ćeš znati",
    },
    steps: {
      title: "Kako izgleda učenje",
      intro: "Tri koraka, uvek isti ritam.",
      items: [
        {
          title: "Gledaš lekciju",
          body: "Kratke, jasne lekcije koje pratiš svojim tempom, kad god stigneš.",
        },
        {
          title: "Radiš uz zajednicu i materijale",
          body: "Uz svaku lekciju ide materijal i prostor da pitaš, podeliš rad i dobiješ savet.",
        },
        {
          title: "Objaviš gotov rad",
          body: "Na kraju svakog kursa imaš pravi rad koji možeš da pokažeš, objaviš ili predaš klijentu.",
        },
      ],
    },
    community: {
      title: "Uz tebe je cela zajednica",
      body: "Deliš svoje radove, gledaš šta drugi prave, tražiš savet i pratiš napredak. Kad izađe nova lekcija, prvi saznaš.",
      points: [
        "Podeli rad i dobij povratnu informaciju",
        "Prati napredak i ostani motivisan",
        "Obaveštenja o novim lekcijama",
      ],
      imageAlt: "Ilustracija zajednice studenata",
    },
    pricing: {
      title: "Jedna cena, sve u kursu",
      intro: "Mesečna pretplata po kursu. Bez skrivenih troškova.",
      includedHeading: "Šta je uključeno",
      includes: ["Sve lekcije i materijali", "Pristup zajednici", "Nove lekcije bez doplate"],
      perMonth: "mesečno",
      cancel: "Otkaži kad hoćeš",
    },
    faq: {
      title: "Česta pitanja",
      items: [
        {
          q: "Treba li mi predznanje?",
          a: "Ne. Kursevi kreću od nule i vode te korak po korak, bez tehničkog žargona.",
        },
        {
          q: "Da li je sve na srpskom?",
          a: "Da. Lekcije, materijali i zajednica su na srpskom.",
        },
        {
          q: "Kako otkazujem?",
          a: "Otkažeš kad hoćeš, u par klikova. Pristup ti ostaje do kraja plaćenog meseca.",
        },
        {
          q: "Koliko traje kurs?",
          a: "Učiš svojim tempom. Lekcije su tu stalno, pa se vraćaš kad god želiš.",
        },
        {
          q: "Da li dobijam materijale?",
          a: "Da. Uz lekcije ideš i radne materijale, promptove i podsetnike koje možeš da preuzmeš.",
        },
        {
          q: "Mogu li oba kursa?",
          a: "Možeš. Svaki kurs ima svoju pretplatu, pa uzimaš jedan ili oba.",
        },
      ],
    },
    finalCta: {
      title: "Spreman da napraviš svoj prvi AI rad?",
      body: "Počni danas — prva lekcija te čeka.",
    },
  },
  en: {
    footer: {
      tagline: "Practical AI courses in Serbian — from your first lesson to finished work you can publish.",
      coursesHeading: "Courses",
      platformHeading: "Platform",
      legalHeading: "Legal & contact",
      community: "Community",
      signIn: "Sign in",
      openApp: "Open platform",
      privacy: "Privacy policy",
      terms: "Terms of use",
      socialsHeading: "Social",
      langLabel: "Change language",
      switchTo: "Srpski",
      rights: "All rights reserved.",
    },
    hero: {
      titleLead: "Learn to make AI video, websites, and sound — from zero to ",
      titleHighlight: "finished work",
      subhead:
        "Through short lessons, materials, and a community you build real work: an edited video, your own website, and narration with an AI voice. No experience needed.",
      ctaSecondary: "Watch the free video",
      videoAlt: "Clips from the AI video, audio and web lessons",
      trustCohort: "First cohort enrolled",
      trustSerbian: "Courses in Serbian",
      trustLessons: "lessons ready",
    },
    marquee: {
      label: "What you'll be able to do",
      items: [
        "edit AI video",
        "clone a voice",
        "build a site without coding",
        "write with AI",
        "run your community",
      ],
    },
    courses: {
      title: "Courses that lead to finished work",
      intro: "Two courses, one goal: you finish with real work in hand — not just theory.",
      outcomesLabel: "What you'll be able to do",
    },
    steps: {
      title: "How the learning works",
      intro: "Three steps, the same rhythm every time.",
      items: [
        {
          title: "Watch the lesson",
          body: "Short, clear lessons you follow at your own pace, whenever it suits you.",
        },
        {
          title: "Build with community and materials",
          body: "Each lesson comes with materials and a space to ask, share your work, and get advice.",
        },
        {
          title: "Publish finished work",
          body: "By the end of each course you have real work to show, publish, or deliver to a client.",
        },
      ],
    },
    community: {
      title: "The whole community is with you",
      body: "Share your work, see what others are making, ask for advice, and track your progress. When a new lesson drops, you're the first to know.",
      points: [
        "Share work and get feedback",
        "Track progress and stay motivated",
        "Get notified about new lessons",
      ],
      imageAlt: "Illustration of the student community",
    },
    pricing: {
      title: "One price, everything in the course",
      intro: "A monthly subscription per course. No hidden costs.",
      includedHeading: "What's included",
      includes: ["All lessons and materials", "Community access", "New lessons at no extra cost"],
      perMonth: "month",
      cancel: "Cancel anytime",
    },
    faq: {
      title: "Frequently asked questions",
      items: [
        {
          q: "Do I need any experience?",
          a: "No. The courses start from zero and guide you step by step, without technical jargon.",
        },
        {
          q: "Is everything in Serbian?",
          a: "Yes. Lessons, materials, and the community are all in Serbian.",
        },
        {
          q: "How do I cancel?",
          a: "Cancel anytime in a couple of clicks. You keep access until the end of the paid month.",
        },
        {
          q: "How long does a course take?",
          a: "You learn at your own pace. The lessons are always there, so you can come back whenever you want.",
        },
        {
          q: "Do I get materials?",
          a: "Yes. Lessons come with worksheets, prompts, and cheat-sheets you can download.",
        },
        {
          q: "Can I take both courses?",
          a: "You can. Each course has its own subscription, so take one or both.",
        },
      ],
    },
    finalCta: {
      title: "Ready to make your first AI project?",
      body: "Start today — your first lesson is waiting.",
    },
  },
} as const;
