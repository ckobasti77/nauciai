export const locales = ["sr", "en"] as const;

export type Locale = (typeof locales)[number];

export type LocalizedText = Record<Locale, string>;

/** Odredište pojma iz trake ishoda; komponenta ga rešava u href kroz `withLocale`. */
export type MarqueeTarget = "va" | "vc" | "studio" | "community";
export type MarqueeItem = { label: string; target: MarqueeTarget };

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
    navStudio: "Studio",
    navPricing: "Pretplata",
    navDashboard: "Dashboard",
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
    navStudio: "Studio",
    navPricing: "Subscription",
    navDashboard: "Dashboard",
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
      // L3.1: portret hero (telefon/tablet) — kratka kopija u 2 reda i kratka CTA labela.
      subheadCompact: "Kratke lekcije i zajednica: praviš video, sajt i AI naraciju bez predznanja.",
      ctaSecondary: "Odgledaj besplatan video",
      ctaSecondaryShort: "Odgledaj video",
      videoAlt: "Isečci iz AI video, audio i web lekcija",
      trustCohort: "Prva generacija upisana",
      trustSerbian: "Kursevi na srpskom",
      trustLessons: "lekcije spremne",
      // L3: 4 kartice na listu sveske u hero videu (3D sloj) / snap red ispod praga.
      // `account` ploča: `signIn` za anonimnog, `dashboard` za ulogovanog (server zna).
      cards: {
        label: "Prečice na svesci",
        courses: { title: "Kursevi", line: "Video, zvuk, sajtovi" },
        studio: { title: "Studio", line: "Generiši slike i video" },
        community: { title: "Zajednica", line: "Pitaj kad zapneš" },
        signIn: { title: "Registracija", line: "Kreni besplatno" },
        dashboard: { title: "Kontrolna tabla", line: "Nastavi gde si stao" },
      },
    },
    marquee: {
      label: "Šta ćeš umeti",
      hint: "Lista se pomera; zadrži kursor ili tab da je zaustaviš.",
      // Redosled je namerno izmešan po kategorijama (va/vc/studio/community) — nikad
      // dva ista tipa zaredom, ni preko šava petlje. `target` se u komponenti razrešava
      // u href kroz `withLocale`. Sinhronizovan 1:1 sa `en.marquee.items` (isti redosled,
      // isti `target`).
      items: [
        { label: "montiraj AI video", target: "va" },
        { label: "napravi sajt bez kodiranja", target: "vc" },
        { label: "generiši slike za Instagram", target: "studio" },
        { label: "kloniraj svoj glas", target: "va" },
        { label: "objavi sajt za jedan dan", target: "vc" },
        { label: "pitaj kad zapneš", target: "community" },
        { label: "napiši scenario za 5 minuta", target: "va" },
        { label: "napravi online prodavnicu", target: "vc" },
        { label: "napravi logo za brend", target: "studio" },
        { label: "sinhronizuj video na engleski", target: "va" },
        { label: "dodaj formu za kontakt", target: "vc" },
        { label: "napravi voiceover bez mikrofona", target: "va" },
        { label: "napravi thumbnail koji se klikće", target: "studio" },
        { label: "poveži domen sa sajtom", target: "vc" },
        { label: "izreži shorts iz dugog videa", target: "va" },
        { label: "pokaži šta si napravio/la", target: "community" },
        { label: "pretvori skicu u sliku", target: "studio" },
        { label: "dodaj titlove jednim klikom", target: "va" },
        { label: "napravi landing stranu za proizvod", target: "vc" },
        { label: "napravi intro za YouTube kanal", target: "va" },
        { label: "napravi vizuale za prezentaciju", target: "studio" },
        { label: "animiraj fotografiju", target: "va" },
        { label: "napravi portfolio sajt", target: "vc" },
        { label: "očisti zvuk snimka", target: "va" },
        { label: "ukloni pozadinu sa fotografije", target: "studio" },
        { label: "uči uz ljude koji pričaju srpski", target: "community" },
        { label: "napravi aplikaciju za zakazivanje", target: "vc" },
        { label: "napravi reklamu za svoj biznis", target: "va" },
        { label: "napravi avatar za profil", target: "studio" },
        { label: "popravi bag bez programera", target: "vc" },
        { label: "pretvori tekst u podkast", target: "va" },
        { label: "napravi plakat za događaj", target: "studio" },
        { label: "napravi svoj blog", target: "vc" },
        { label: "napravi muziku za video", target: "va" },
        { label: "napravi kratki video iz slike", target: "studio" },
        { label: "dobij odgovor od predavača", target: "community" },
        { label: "napravi meni za restoran", target: "vc" },
        { label: "napravi ilustracije za knjigu", target: "studio" },
        { label: "snimi kurs bez kamere", target: "va" },
        { label: "napravi stranicu za događaj", target: "vc" },
      ] as MarqueeItem[],
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
      cta: "Poseti zajednicu",
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
      subheadCompact: "Short lessons and a community: make video, sites and AI voice — no experience needed.",
      ctaSecondary: "Watch the free video",
      ctaSecondaryShort: "Watch video",
      videoAlt: "Clips from the AI video, audio and web lessons",
      trustCohort: "First cohort enrolled",
      trustSerbian: "Courses in Serbian",
      trustLessons: "lessons ready",
      cards: {
        label: "Notebook shortcuts",
        courses: { title: "Courses", line: "Video, sound, websites" },
        studio: { title: "Studio", line: "Generate images and video" },
        community: { title: "Community", line: "Ask when you get stuck" },
        signIn: { title: "Sign up", line: "Start for free" },
        dashboard: { title: "Dashboard", line: "Pick up where you left off" },
      },
    },
    marquee: {
      label: "What you'll be able to do",
      hint: "The list is scrolling; hover or tab to stop it.",
      // Isti redosled i `target` kao `sr.marquee.items` — samo prevedene labele.
      items: [
        { label: "edit AI video", target: "va" },
        { label: "build a site without coding", target: "vc" },
        { label: "generate images for Instagram", target: "studio" },
        { label: "clone your voice", target: "va" },
        { label: "launch a site in a day", target: "vc" },
        { label: "ask when you get stuck", target: "community" },
        { label: "write a script in 5 minutes", target: "va" },
        { label: "build an online store", target: "vc" },
        { label: "make a logo for a brand", target: "studio" },
        { label: "dub a video into English", target: "va" },
        { label: "add a contact form", target: "vc" },
        { label: "make a voiceover without a mic", target: "va" },
        { label: "make a thumbnail people click", target: "studio" },
        { label: "connect a domain to your site", target: "vc" },
        { label: "cut shorts from a long video", target: "va" },
        { label: "show what you made", target: "community" },
        { label: "turn a sketch into an image", target: "studio" },
        { label: "add subtitles in one click", target: "va" },
        { label: "build a landing page for a product", target: "vc" },
        { label: "make an intro for a YouTube channel", target: "va" },
        { label: "make visuals for a presentation", target: "studio" },
        { label: "animate a photo", target: "va" },
        { label: "build a portfolio site", target: "vc" },
        { label: "clean up audio on a recording", target: "va" },
        { label: "remove the background from a photo", target: "studio" },
        { label: "learn with people who speak Serbian", target: "community" },
        { label: "build a booking app", target: "vc" },
        { label: "make an ad for your business", target: "va" },
        { label: "make an avatar for your profile", target: "studio" },
        { label: "fix a bug without a developer", target: "vc" },
        { label: "turn text into a podcast", target: "va" },
        { label: "make a poster for an event", target: "studio" },
        { label: "start your own blog", target: "vc" },
        { label: "make music for a video", target: "va" },
        { label: "make a short video from an image", target: "studio" },
        { label: "get an answer from an instructor", target: "community" },
        { label: "build a menu for a restaurant", target: "vc" },
        { label: "make illustrations for a book", target: "studio" },
        { label: "record a course without a camera", target: "va" },
        { label: "build a page for an event", target: "vc" },
      ] as MarqueeItem[],
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
      cta: "Visit the community",
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
  coursesListing: {
    title: { sr: "Kursevi — Fakultet za AI", en: "Courses — Faculty for AI" },
    description: {
      sr: "Praktični AI kursevi na srpskom — montiran video, sopstveni sajt i naracija sa AI glasom. Kroz kratke lekcije, materijale i zajednicu dolaziš do gotovog rada.",
      en: "Practical AI courses in Serbian — edited video, your own website, and AI-voice narration. Through short lessons, materials, and a community you reach a finished project.",
    },
  },
} as const;

/**
 * Vidljivi tekst javne listing strane kurseva (/courses). Isti obrazac kao
 * `communityListingContent` — nijedan hardkodovan string na javnoj strani.
 */
export const coursesListingContent = {
  sr: {
    kicker: "Svi kursevi",
    heroTitleLead: "Kursevi koji vode do ",
    heroTitleHighlight: "gotovog rada",
    subtitle:
      "Praktični AI kursevi na srpskom — kroz kratke lekcije, materijale i zajednicu dolaziš do pravog rada, ne samo teorije.",
    breadcrumbHome: "Početna",
    breadcrumbCourses: "Kursevi",
    viewAll: "Svi kursevi →",
  },
  en: {
    kicker: "All courses",
    heroTitleLead: "Courses that lead to a ",
    heroTitleHighlight: "finished project",
    subtitle:
      "Practical AI courses in Serbian — through short lessons, materials, and a community you reach a real project, not just theory.",
    breadcrumbHome: "Home",
    breadcrumbCourses: "Courses",
    viewAll: "All courses →",
  },
} as const;

/**
 * Vidljivi tekst javne listing strane zajednice (/community).
 */
export const communityListingContent = {
  sr: {
    kicker: "Javna zajednica",
    title: "Zajednica i diskusije",
    heroTitleLead: "Zajednica i ",
    heroTitleHighlight: "diskusije",
    subtitle:
      "Pitanja, radovi i iskustva polaznika — sve o AI videu, sajtovima i zvuku na jednom mestu.",
    metaTitle: "Zajednica — Fakultet za AI",
    metaDescription:
      "Javne diskusije, pitanja i iskustva polaznika Fakulteta za AI. Pridruži se razgovoru o praktičnoj primeni AI alata.",
    askQuestion: "Postavi pitanje",
    signInToAsk: "Prijavi se i postavi pitanje",
    signInToParticipate: "Prijavi se za učešće",
    noPosts: "Trenutno nema objavljenih diskusija.",
    emptyStateSubtext:
      "Budi prvi koji će pokrenuti temu ili postaviti pitanje zajednici.",
    comments: "odgovora",
    netVotes: "neto glasova",
    prevPage: "Prethodna",
    nextPage: "Sledeća",
    page: "Strana",
    courseLabel: "Kurs",
    breadcrumbHome: "Početna",
    breadcrumbCommunity: "Zajednica",
    openDiscussion: "Otvori diskusiju →",
  },
  en: {
    kicker: "Public community",
    title: "Community & Discussions",
    heroTitleLead: "Community & ",
    heroTitleHighlight: "discussions",
    subtitle:
      "Questions, projects, and student experiences — everything about AI video, websites, and sound in one place.",
    metaTitle: "Community — Faculty for AI",
    metaDescription:
      "Public discussions, questions, and experiences from Faculty for AI students. Join the conversation on practical AI tools.",
    askQuestion: "Ask a question",
    signInToAsk: "Sign in to ask a question",
    signInToParticipate: "Sign in to participate",
    noPosts: "No public discussions found.",
    emptyStateSubtext:
      "Be the first to start a thread or ask a question to the community.",
    comments: "replies",
    netVotes: "net votes",
    prevPage: "Previous",
    nextPage: "Next",
    page: "Page",
    courseLabel: "Course",
    breadcrumbHome: "Home",
    breadcrumbCommunity: "Community",
    openDiscussion: "View discussion →",
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
    breadcrumbHome: "Početna",
    breadcrumbCommunity: "Zajednica",
    moreThreadsTitle: "Još pitanja iz zajednice",
    moreThreadsSubtitle:
      "Pogledaj šta ostali polaznici i članovi pitaju, istražuju i prave.",
    viewDiscussion: "Otvori diskusiju →",
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
    breadcrumbHome: "Home",
    breadcrumbCommunity: "Community",
    moreThreadsTitle: "More community questions",
    moreThreadsSubtitle:
      "See what other students and members are asking, discovering, and building.",
    viewDiscussion: "View discussion →",
  },
} as const;

/**
 * Rich-text editor + prikaz za diskusije u Zajednici (preset "community").
 * Editor i renderer su locale-svesni, pa svi labeli/aria idu odavde, bez
 * hardkodovanih stringova u komponentama.
 */
export const communityRichText = {
  sr: {
    bold: "Podebljano",
    italic: "Kurziv",
    strike: "Precrtano",
    underline: "Podvučeno",
    spoiler: "Spojler",
    image: "Ubaci sliku",
    undo: "Poništi",
    redo: "Ponovi",
    altPlaceholder: "Opis slike (opciono)",
    removeImage: "Ukloni sliku",
    uploading: "Slanje slike…",
    revealSpoiler: "Prikaži spojler",
    hideSpoiler: "Sakrij spojler",
    errorType: "Dozvoljene su samo JPG, PNG, WEBP ili GIF slike.",
    errorSize: "Slika mora biti manja od 5 MB.",
    errorCount: "Najviše 6 slika po diskusiji.",
    errorUpload: "Slanje slike nije uspelo. Pokušaj ponovo.",
    uploadErrorTitle: "Slika nije poslata",
  },
  en: {
    bold: "Bold",
    italic: "Italic",
    strike: "Strikethrough",
    underline: "Underline",
    spoiler: "Spoiler",
    image: "Insert image",
    undo: "Undo",
    redo: "Redo",
    altPlaceholder: "Image description (optional)",
    removeImage: "Remove image",
    uploading: "Uploading image…",
    revealSpoiler: "Reveal spoiler",
    hideSpoiler: "Hide spoiler",
    errorType: "Only JPG, PNG, WEBP or GIF images are allowed.",
    errorSize: "The image must be smaller than 5 MB.",
    errorCount: "At most 6 images per discussion.",
    errorUpload: "Uploading the image failed. Try again.",
    uploadErrorTitle: "Image not uploaded",
  },
} as const;

/**
 * Stranica 404. `not-found.tsx` u App Router-u ne dobija route params, pa se jezik
 * izvlači iz `usePathname()` na klijentu; ton je topao i školski kao ostatak sajta,
 * a ne suvo „stranica ne postoji".
 */
export const notFoundContent = {
  sr: {
    eyebrow: "Greška 404",
    title: "Ova stranica je zalutala",
    body: "Link koji si otvorio/la ne postoji ili je u međuvremenu premešten. Vrati se na sigurno tlo:",
    home: "Početna",
    courses: "Kursevi",
    community: "Zajednica",
  },
  en: {
    eyebrow: "Error 404",
    title: "This page wandered off",
    body: "The link you opened doesn't exist, or it moved somewhere else. Head back to solid ground:",
    home: "Home",
    courses: "Courses",
    community: "Community",
  },
} as const;
