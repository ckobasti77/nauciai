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
      buyNow: "Kupi sada",
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
      buyNow: "Buy now",
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

/**
 * Množinske forme za brojanje na srpskom (1 modul / 2 modula / 5 modula,
 * 1 lekcija / 2 lekcije / 5 lekcija). Engleski koristi `one`/`many`.
 * Pravilo za `sr`: 1 (ali ne 11) → one; 2–4 (ali ne 12–14) → few; ostalo → many.
 */
export type PluralForms = { one: string; few: string; many: string };

export function pluralize(locale: Locale, count: number, forms: PluralForms): string {
  if (locale === "en") {
    return count === 1 ? forms.one : forms.many;
  }
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
}

/**
 * Copy za javne stranice kurseva (`/courses/[courseSlug]`). Ista podela kao
 * `marketingContent`: sav tekst živi ovde, nijedan hardkodovan string u komponentama,
 * `sr` i `en` drže istu strukturu. Deo pod `perCourse` je keširan po slug-u kursa
 * (naslov heroja sa marker-isticanjem i FAQ pisan konkretno za taj kurs).
 */
export const coursePageContent = {
  sr: {
    allCourses: "Svi kursevi",
    buyNow: "Kupi sada",
    watchFree: "Odgledaj besplatan video",
    priceAmount: "9,99",
    priceUnit: "EUR mesečno",
    cancelAnytime: "Otkaži kad hoćeš",
    moduleForms: { one: "modul", few: "modula", many: "modula" },
    lessonForms: { one: "lekcija", few: "lekcije", many: "lekcija" },
    outcomes: {
      kicker: "Šta ćeš umeti",
      title: "Na kraju kursa imaš pravi rad.",
    },
    program: {
      kicker: "Program kursa",
      title: "Sve što te čeka unutra.",
      intro: "Svaki modul vodi do konkretnog rezultata. Prva lekcija je otključana — ostale se otvaraju uz pretplatu.",
      moduleLabel: "Modul",
      freeBadge: "BESPLATNO",
      comingSoon: "Uskoro",
      lockedLabel: "Otključava se uz pretplatu",
      emptyTitle: "Program je u pripremi",
      emptyBody: "Lekcije se upravo snimaju i pojaviće se ovde čim budu spremne. Besplatan uvodni video već možeš da pogledaš.",
    },
    faq: {
      title: "Pitanja o ovom kursu",
    },
    finalCta: {
      title: "Tvoj prvi gotov rad je jedan kurs daleko.",
      body: "Odgledaj besplatan video, pa nastavi svojim tempom — pretplata je 9,99 EUR mesečno i otkazuješ kad hoćeš.",
      crossSell: "Pogledaj i drugi kurs",
    },
    perCourse: {
      "video-audio-ai": {
        titleLead: "Kurs za ",
        titleHighlight: "video i audio",
        titleTail: "",
        faq: [
          {
            q: "Treba li mi predznanje za ovaj kurs?",
            a: "Ne. Kurs kreće od temelja produkcije: prvo dobiješ mapu alata i naučiš da postaviš kratak brief, pa tek onda prelaziš na scenario, glas i montažu.",
          },
          {
            q: "Koji alati se koriste?",
            a: "AI alati za pisanje scenarija, generisanje glasa i montažu videa — svi rade u pretraživaču. U lekcijama vidiš tačno gde se šta klikće, a uz kurs ide i mapa alata za preuzimanje.",
          },
          {
            q: "Koliko traje kurs?",
            a: "Oko dva sata video lekcija, od uvoda do finalnog projekta za klijenta. Učiš svojim tempom — lekcije te čekaju i možeš da im se vraćaš dok god traje pretplata.",
          },
          {
            q: "Šta dobijam od materijala?",
            a: "Mapu alata za produkciju, prompt start paket, radni list za scenario, checklist za finalni eksport i brief za završni projekat — sve možeš da preuzmeš i koristiš na svojim projektima.",
          },
        ],
      },
      "vibe-coding": {
        titleLead: "Kurs za ",
        titleHighlight: "web sajtove",
        titleTail: "",
        faq: [
          {
            q: "Treba li mi predznanje za ovaj kurs?",
            a: "Ne, i ne treba ti nijedna linija koda. Kurs te vodi od ideje, preko jasnog brief-a i strukture stranica, do sajta spremnog za objavu.",
          },
          {
            q: "Koji alati se koriste?",
            a: "AI alati za izradu sajtova koji rade u pretraživaču — opišeš šta želiš, gledaš rezultat i popravljaš dok ne bude kako treba. Sve pokazujemo korak po korak u lekcijama.",
          },
          {
            q: "Koliko traje kurs?",
            a: "Lekcije su kratke i praktične, a prolaziš ih svojim tempom. Nove lekcije se objavljuju redom i ulaze u istu pretplatu, bez doplate.",
          },
          {
            q: "Šta dobijam od materijala?",
            a: "Šablon za website brief, liste provera za strukturu, tekst i responsive izgled stranica — sve što ti treba da sajt proveriš pre nego što ga objaviš.",
          },
        ],
      },
    },
  },
  en: {
    allCourses: "All courses",
    buyNow: "Buy now",
    watchFree: "Watch the free video",
    priceAmount: "9,99",
    priceUnit: "EUR / month",
    cancelAnytime: "Cancel anytime",
    moduleForms: { one: "module", few: "modules", many: "modules" },
    lessonForms: { one: "lesson", few: "lessons", many: "lessons" },
    outcomes: {
      kicker: "What you'll be able to do",
      title: "You finish this course with real work.",
    },
    program: {
      kicker: "Course curriculum",
      title: "Everything waiting inside.",
      intro: "Every module leads to a concrete result. The first lesson is unlocked — the rest open with your subscription.",
      moduleLabel: "Module",
      freeBadge: "FREE",
      comingSoon: "Coming soon",
      lockedLabel: "Unlocks with subscription",
      emptyTitle: "The curriculum is in the works",
      emptyBody: "Lessons are being recorded right now and will appear here as soon as they are ready. You can already watch the free intro video.",
    },
    faq: {
      title: "Questions about this course",
    },
    finalCta: {
      title: "Your first finished project is one course away.",
      body: "Watch the free video, then continue at your own pace — the subscription is 9,99 EUR per month and you can cancel anytime.",
      crossSell: "Check out the other course",
    },
    perCourse: {
      "video-audio-ai": {
        titleLead: "The ",
        titleHighlight: "Video and Audio",
        titleTail: " Course",
        faq: [
          {
            q: "Do I need any experience for this course?",
            a: "No. The course starts with production foundations: first you get a tool map and learn to set up a short brief, and only then move on to the script, voice, and editing.",
          },
          {
            q: "Which tools are used?",
            a: "AI tools for writing scripts, generating voice, and editing video — all of them run in the browser. The lessons show you exactly where to click, and the course includes a downloadable tool map.",
          },
          {
            q: "How long does the course take?",
            a: "About two hours of video lessons, from the intro to the client-ready final project. You learn at your own pace — the lessons wait for you and you can revisit them for as long as you're subscribed.",
          },
          {
            q: "What materials do I get?",
            a: "A production tool map, a prompt starter pack, a script worksheet, a final export checklist, and a final project brief — all downloadable and ready to use on your own projects.",
          },
        ],
      },
      "vibe-coding": {
        titleLead: "The ",
        titleHighlight: "Websites",
        titleTail: " Course",
        faq: [
          {
            q: "Do I need any experience for this course?",
            a: "No, and you won't write a single line of code. The course takes you from an idea, through a clear brief and page structure, to a website ready to publish.",
          },
          {
            q: "Which tools are used?",
            a: "AI website-building tools that run in the browser — you describe what you want, watch the result, and refine it until it's right. Everything is shown step by step in the lessons.",
          },
          {
            q: "How long does the course take?",
            a: "The lessons are short and practical, and you go through them at your own pace. New lessons are released in order and join the same subscription at no extra cost.",
          },
          {
            q: "What materials do I get?",
            a: "A website brief template and checklists for structure, copy, and responsive layout — everything you need to review a site before you publish it.",
          },
        ],
      },
    },
  },
} as const;

/**
 * Meta naslovi/opisi za javne stranice koje NEMAJU sopstveni dinamički izvor mete
 * (početna + auth-utility strane). Kurs/Studio/community/pravne strane nose svoj
 * tekst; ove statične žive ovde da nijedan meta string ne bude hardkodovan u ruti.
 */
export const publicMeta = {
  home: {
    title: {
      sr: "Fakultet za AI — nauči AI video, sajtove i glas",
      en: "Faculty for AI — learn AI video, websites, and voice",
    },
    description: {
      sr: "Praktični AI kursevi na srpskom — kroz kratke lekcije, materijale i zajednicu praviš montiran video, sopstveni sajt i naraciju sa AI glasom. Bez predznanja.",
      en: "Practical AI courses in Serbian — through short lessons, materials, and a community you build edited video, your own website, and AI-voice narration. No experience needed.",
    },
  },
  signIn: {
    title: { sr: "Prijava — Fakultet za AI", en: "Sign in — Faculty for AI" },
    description: {
      sr: "Prijavi se i nastavi tamo gde si stao — kursevi, napredak i zajednica te čekaju.",
      en: "Sign in and pick up right where you left off — your courses, progress, and community are waiting.",
    },
  },
  resetPassword: {
    title: { sr: "Postavi novu lozinku — Fakultet za AI", en: "Set a new password — Faculty for AI" },
    description: {
      sr: "Postavi novu lozinku za svoj nalog na Fakultetu za AI.",
      en: "Set a new password for your Faculty for AI account.",
    },
  },
  verifyEmail: {
    title: { sr: "Potvrda email adrese — Fakultet za AI", en: "Verify your email — Faculty for AI" },
    description: {
      sr: "Potvrdi email adresu da aktiviraš nalog na Fakultetu za AI.",
      en: "Verify your email to activate your Faculty for AI account.",
    },
  },
} as const;

/**
 * Vidljivi tekst javne listing strane zajednice (/community).
 */
export const communityListingContent = {
  sr: {
    kicker: "Javna zajednica",
    title: "Zajednica i diskusije",
    subtitle:
      "Pitanja, radovi i iskustva polaznika — sve o AI videu, sajtovima i zvuku na jednom mestu.",
    metaTitle: "Zajednica — Fakultet za AI",
    metaDescription:
      "Javne diskusije, pitanja i iskustva polaznika Fakulteta za AI. Pridruži se razgovoru o praktičnoj primeni AI alata.",
    askQuestion: "Postavi pitanje",
    signInToAsk: "Prijavi se i postavi pitanje",
    signInToParticipate: "Prijavi se za učešće",
    noPosts: "Trenutno nema objavljenih diskusija.",
    comments: "odgovora",
    netVotes: "neto glasova",
    prevPage: "Prethodna",
    nextPage: "Sledeća",
    page: "Strana",
    courseLabel: "Kurs",
  },
  en: {
    kicker: "Public community",
    title: "Community & Discussions",
    subtitle:
      "Questions, projects, and student experiences — everything about AI video, websites, and sound in one place.",
    metaTitle: "Community — Faculty for AI",
    metaDescription:
      "Public discussions, questions, and experiences from Faculty for AI students. Join the conversation on practical AI tools.",
    askQuestion: "Ask a question",
    signInToAsk: "Sign in to ask a question",
    signInToParticipate: "Sign in to participate",
    noPosts: "No public discussions found.",
    comments: "replies",
    netVotes: "net votes",
    prevPage: "Previous",
    nextPage: "Next",
    page: "Page",
    courseLabel: "Course",
  },
} as const;

/**
 * Vidljivi tekst javne strane teme (community detalj). Izdvojeno iz komponente da
 * ne ostane hardkodovanog stringa na javnoj strani (pravilo iz `marketingContent`).
 */
export const communityThreadContent = {
  sr: {
    back: "Nazad na sve diskusije",
    kicker: "Javna diskusija",
    netVotes: "neto glasova",
    comments: "komentara",
    signInToAct: "Prijavi se za akcije",
    signInToReply: "Prijavi se da odgovoriš",
    signInBannerText: "Želiš da postaviš pitanje ili ostaviš odgovor?",
    commentsHeading: "Komentari i odgovori",
    noComments: "Još nema komentara na ovu temu.",
    replies: "odgovora",
    showMore: "Prikaži još",
    loading: "Učitavanje…",
    collapse: "Sažmi",
    showReplies: "Prikaži",
  },
  en: {
    back: "Back to all discussions",
    kicker: "Public discussion",
    netVotes: "net votes",
    comments: "comments",
    signInToAct: "Sign in to interact",
    signInToReply: "Sign in to reply",
    signInBannerText: "Want to ask a question or leave a reply?",
    commentsHeading: "Comments & replies",
    noComments: "No comments on this thread yet.",
    replies: "replies",
    showMore: "Show more",
    loading: "Loading…",
    collapse: "Collapse",
    showReplies: "Show",
  },
} as const;
