import { toPublicPath } from "./routes";

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

/**
 * Gradi javni URL za dati jezik. Tanak omotač nad `toPublicPath` (jedina tačka
 * istine u `lib/routes.ts`): `path` je KANONSKA putanja (`/courses`, `/pricing`,
 * `/app/...`), a izlaz je javni URL — `sr` bez prefiksa i sa prevedenim prvim
 * segmentom (`/kursevi`), `en` sa `/en` (`/en/courses`).
 */
export function withLocale(locale: Locale, path = ""): string {
  return toPublicPath(locale, path);
}

export const dictionary = {
  sr: {
    appName: "Nauči AI",
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
    // Meni naloga (N9) — isti redovi na javnim stranama i u dashboardu.
    accountMenu: "Meni naloga",
    accountSettings: "Podešavanja",
    upgradePlan: "Unapredi plan",
    signOut: "Odjavi se",
  },
  en: {
    appName: "Nauči AI",
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
    accountMenu: "Account menu",
    accountSettings: "Settings",
    upgradePlan: "Upgrade plan",
    signOut: "Sign out",
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
    contactRail: {
      phoneLabel: "Pozovi telefonom",
      emailLabel: "Pošalji email",
      socialsLabel: "Društvene mreže",
      socialsCloseLabel: "Zatvori društvene mreže",
    },
    hero: {
      titleLead: "Nauči da praviš AI video, sajtove i zvuk — od nule do ",
      titleHighlight: "gotovog rada",
      subhead:
        "Kroz kratke lekcije, materijale i zajednicu praviš prave radove: montiran video, sopstveni sajt i naraciju sa AI glasom. Bez predznanja.",
      // L3.1: portret hero (telefon/tablet) — kratka kopija u 2 reda i kratka CTA labela.
      subheadCompact: "Kratke lekcije i zajednica: praviš video, sajt i AI naraciju bez predznanja.",
      // N3: leva CTA vodi na besplatan video kursa, desna pravo u Studio.
      ctaFreeVideo: "Besplatan video",
      ctaStudio: "Otvori Studio",
      // Duža forma iste ponude — koristi je kartica kursa (`course-card.tsx`).
      ctaSecondary: "Odgledaj besplatan video",
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
      titleLead: "Kursevi koji vode do ",
      titleHighlight: "gotovog rada",
      intro: "Dva kursa, isti cilj: da na kraju imaš pravi rad — ne samo teoriju.",
      outcomesLabel: "Šta ćeš znati",
      buyNow: "Kupi sada",
      viewCourse: "Pogledaj kurs",
    },
    steps: {
      title: "Kako izgleda učenje",
      titleLead: "Kako izgleda ",
      titleHighlight: "učenje",
      intro: "Tri koraka, uvek isti ritam.",
      items: [
        {
          title: "Gledaš lekciju",
          body: "Kratke, jasne lekcije koje pratiš svojim tempom, kad god stigneš.",
          cta: "Pogledaj besplatan video",
        },
        {
          title: "Radiš uz zajednicu i materijale",
          body: "Uz svaku lekciju ide materijal i prostor da pitaš, podeliš rad i dobiješ savet.",
          cta: "Otvori Studio",
        },
        {
          title: "Objaviš gotov rad",
          body: "Na kraju svakog kursa imaš pravi rad koji možeš da pokažeš, objaviš ili predaš klijentu.",
          cta: "Uđi u zajednicu",
        },
      ],
    },
    community: {
      title: "Uz tebe je cela zajednica",
      titleLead: "Uz tebe je ",
      titleHighlight: "cela zajednica",
      body: "Deliš svoje radove, gledaš šta drugi prave, tražiš savet i pratiš napredak. Kad izađe nova lekcija, prvi saznaš.",
      points: [
        "Podeli rad i dobij povratnu informaciju",
        "Prati napredak i ostani motivisan",
        "Obaveštenja o novim lekcijama",
      ],
      imageAlt: "Ilustracija zajednice studenata",
      cta: "Uđi u zajednicu",
    },
    pricing: {
      title: "Dva plana, jedan cilj — gotov rad",
      titleLead: "Dva plana, jedan cilj —",
      titleHighlight: "gotov rad",
      intro: "Mesečno, bez skrivenih troškova. Otkaži kad hoćeš.",
      perMonth: "mesečno",
      popular: "Najpopularnije",
      // N6: vodi na posebnu stranu pretplate (tabela razlika, pojedinačni kursevi, naplata).
      compareCta: "Uporedi planove detaljno",
      // Sitan red ispod kartica — vlasnik menja kad krene paywall.
      soon: "Plaćanje se uvodi uskoro — do tada je sav objavljeni sadržaj besplatan uz registraciju.",
      basic: {
        name: "Basic",
        features: [
          "Sve lekcije i materijali",
          "Pristup zajednici",
          "Nove lekcije bez doplate",
          "Kredite za Studio kupuješ posebno",
        ],
        cta: "Počni sa Basic",
      },
      premium: {
        name: "Premium",
        // "%CREDITS%" se u komponenti zamenjuje brojem kredita iz baze (ako
        // postoji plan „premium"); u suprotnom stoji tekst bez broja.
        features: [
          "Sve iz Basic-a",
          "Pro lekcije (napredni moduli)",
          "%CREDITS%",
          "Prioritetni odgovori u zajednici",
        ],
        creditsWithNumber: "{n} Studio kredita svakog meseca",
        creditsNoNumber: "Studio krediti svakog meseca",
        cta: "Izaberi Premium",
      },
    },
    faq: {
      title: "Česta pitanja",
      titleLead: "Česta ",
      titleHighlight: "pitanja",
      items: [
        {
          q: "Treba li mi predznanje ili jak kompjuter?",
          a: "Ne i ne. Krećemo od toga šta je uopšte prompt, a sve se radi u pregledaču — dovoljan je laptop star i pet godina i pristojan internet. Ako umeš da pošalješ mejl, umećeš i ovo.",
        },
        {
          q: "Koliko vremena mi treba nedeljno?",
          a: "Tri do četiri sata. Lekcije traju 5 do 12 minuta pa staju u pauzu ili vožnju autobusom, a zadatak posle svake radiš svojim tempom. Nema roka ni ispita.",
        },
        {
          q: "Šta konkretno imam kad završim?",
          a: "Gotov rad, ne sertifikat koji niko ne gleda: montiran video sa AI naracijom, sajt koji je živ na tvom domenu i set slika u tvom stilu. Sve to odmah ide u portfolio ili kod klijenta.",
        },
        {
          q: "Moram li da plaćam ChatGPT, Midjourney i ostalo?",
          a: "Ne. Studio je u platformi, u njemu generišeš slike, video i glas kroz svoj nalog. Kad ti zatreba alat sa strane, uvek pokažemo i besplatnu varijantu.",
        },
        {
          q: "Zapnem u pola lekcije — ko mi pomaže?",
          a: "Zajednica. Postaviš pitanje uz sliku ekrana, odgovaraju ti drugi studenti i predavači, obično isti dan. Nema glupog pitanja, svi smo počeli od nule.",
        },
        {
          q: "Mogu li da otkažem?",
          a: "Možeš, u dva klika, bez zvanja i objašnjavanja. Pretplata radi do kraja plaćenog meseca, a sve što si napravio ostaje tvoje.",
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
    contactRail: {
      phoneLabel: "Call by phone",
      emailLabel: "Send an email",
      socialsLabel: "Social media",
      socialsCloseLabel: "Close social media",
    },
    hero: {
      titleLead: "Learn to make AI video, websites, and sound — from zero to ",
      titleHighlight: "finished work",
      subhead:
        "Through short lessons, materials, and a community you build real work: an edited video, your own website, and narration with an AI voice. No experience needed.",
      subheadCompact: "Short lessons and a community: make video, sites and AI voice — no experience needed.",
      ctaFreeVideo: "Free lesson",
      ctaStudio: "Open Studio",
      ctaSecondary: "Watch the free video",
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
      titleLead: "Courses that lead to ",
      titleHighlight: "finished work",
      intro: "Two courses, one goal: you finish with real work in hand — not just theory.",
      outcomesLabel: "What you'll be able to do",
      buyNow: "Buy now",
      viewCourse: "View course",
    },
    steps: {
      title: "How the learning works",
      titleLead: "How the ",
      titleHighlight: "learning works",
      intro: "Three steps, the same rhythm every time.",
      items: [
        {
          title: "Watch the lesson",
          body: "Short, clear lessons you follow at your own pace, whenever it suits you.",
          cta: "Watch the free video",
        },
        {
          title: "Build with community and materials",
          body: "Each lesson comes with materials and a space to ask, share your work, and get advice.",
          cta: "Open Studio",
        },
        {
          title: "Publish finished work",
          body: "By the end of each course you have real work to show, publish, or deliver to a client.",
          cta: "Enter the community",
        },
      ],
    },
    community: {
      title: "You have a whole community",
      titleLead: "You have ",
      titleHighlight: "a whole community",
      body: "Share your work, see what others are making, ask for advice, and track your progress. When a new lesson drops, you're the first to know.",
      points: [
        "Share work and get feedback",
        "Track progress and stay motivated",
        "Get notified about new lessons",
      ],
      imageAlt: "Illustration of the student community",
      cta: "Enter the community",
    },
    pricing: {
      title: "Two plans, one goal — finished work",
      titleLead: "Two plans, one goal —",
      titleHighlight: "finished work",
      intro: "Monthly, no hidden costs. Cancel anytime.",
      perMonth: "month",
      popular: "Most popular",
      // N6: leads to the dedicated subscription page (difference table, single courses, billing).
      compareCta: "Compare plans in detail",
      // Small line below the cards — owner edits this when the paywall goes live.
      soon: "Payments are coming soon — until then, all published content is free with sign-up.",
      basic: {
        name: "Basic",
        features: [
          "All lessons and materials",
          "Community access",
          "New lessons at no extra cost",
          "Buy Studio credits separately",
        ],
        cta: "Start with Basic",
      },
      premium: {
        name: "Premium",
        // "%CREDITS%" is replaced in the component with the credit count from
        // the database (if a "premium" plan exists); otherwise the no-number text stays.
        features: [
          "Everything in Basic",
          "Pro lessons (advanced modules)",
          "%CREDITS%",
          "Priority answers in the community",
        ],
        creditsWithNumber: "{n} Studio credits every month",
        creditsNoNumber: "Studio credits every month",
        cta: "Choose Premium",
      },
    },
    faq: {
      title: "Frequent questions",
      titleLead: "Frequent ",
      titleHighlight: "questions",
      items: [
        {
          q: "Do I need experience or a powerful computer?",
          a: "Neither. We start from what a prompt even is, and everything runs in your browser — a five-year-old laptop and a decent connection are enough. If you can send an email, you can do this.",
        },
        {
          q: "How much time do I need each week?",
          a: "Three to four hours. Lessons run 5 to 12 minutes, so they fit into a break or a bus ride, and you do the task after each one at your own pace. No deadlines, no exams.",
        },
        {
          q: "What exactly do I have when I finish?",
          a: "Finished work, not a certificate nobody looks at: an edited video with AI narration, a site that's live on your own domain, and a set of images in your style. All of it goes straight into your portfolio or to a client.",
        },
        {
          q: "Do I have to pay for ChatGPT, Midjourney, and the rest?",
          a: "No. The Studio is built into the platform — you generate images, video, and voice through your own account. When you do need an outside tool, we always show a free option too.",
        },
        {
          q: "I get stuck halfway through a lesson — who helps me?",
          a: "The community. Post your question with a screenshot and other students and instructors answer, usually the same day. There's no stupid question — we all started from zero.",
        },
        {
          q: "Can I cancel?",
          a: "You can, in two clicks, with no phone calls or explanations. Your subscription runs to the end of the paid month, and everything you've made stays yours.",
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
      sr: "Nauči AI — video, sajtovi i glas uz pomoć AI-ja",
      en: "Nauči AI — learn AI video, websites, and voice",
    },
    description: {
      sr: "Praktični AI kursevi na srpskom — kroz kratke lekcije, materijale i zajednicu praviš montiran video, sopstveni sajt i naraciju sa AI glasom. Bez predznanja.",
      en: "Practical AI courses in Serbian — through short lessons, materials, and a community you build edited video, your own website, and AI-voice narration. No experience needed.",
    },
  },
  signIn: {
    title: { sr: "Prijava — Nauči AI", en: "Sign in — Nauči AI" },
    description: {
      sr: "Prijavi se i nastavi tamo gde si stao — kursevi, napredak i zajednica te čekaju.",
      en: "Sign in and pick up right where you left off — your courses, progress, and community are waiting.",
    },
  },
  resetPassword: {
    title: { sr: "Postavi novu lozinku — Nauči AI", en: "Set a new password — Nauči AI" },
    description: {
      sr: "Postavi novu lozinku za svoj nalog na Nauči AI.",
      en: "Set a new password for your Nauči AI account.",
    },
  },
  verifyEmail: {
    title: { sr: "Potvrda email adrese — Nauči AI", en: "Verify your email — Nauči AI" },
    description: {
      sr: "Potvrdi email adresu da aktiviraš nalog na Nauči AI.",
      en: "Verify your email to activate your Nauči AI account.",
    },
  },
  pricing: {
    title: { sr: "Pretplata i cene — Nauči AI", en: "Pricing and plans — Nauči AI" },
    description: {
      sr: "Uporedi Basic i Premium plan, vidi šta tačno ulazi u koji, uzmi pojedinačan kurs po jednokratnoj ceni i pročitaj odgovore na česta pitanja o naplati.",
      en: "Compare the Basic and Premium plans, see exactly what each one includes, buy a single course for a one-time price, and read the answers to common billing questions.",
    },
  },
  coursesListing: {
    title: { sr: "Kursevi — Nauči AI", en: "Courses — Nauči AI" },
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
    // N7: naslov, podnaslov i CTA heroja strane; `subtitle` je i opis strane u JSON-LD.
    heroTitleLead: "Dva kursa, jedan ",
    heroTitleHighlight: "gotov rad",
    subtitle:
      "Svaki kurs se završava pravim radom — montiranim videom ili sajtom koji je živ, ne spiskom odgledanih lekcija.",
    heroCtaCourses: "Pogledaj kurseve",
    heroCtaPlans: "Uporedi planove",
    heroMediaAlt: "Isečci iz lekcija o AI videu i pravljenju sajtova",
    breadcrumbHome: "Početna",
    breadcrumbCourses: "Kursevi",
    viewAll: "Svi kursevi →",
  },
  en: {
    kicker: "All courses",
    heroTitleLead: "Two courses, one ",
    heroTitleHighlight: "finished project",
    subtitle:
      "Every course ends with real work — an edited video or a site that's actually live, not a list of watched lessons.",
    heroCtaCourses: "View courses",
    heroCtaPlans: "Compare plans",
    heroMediaAlt: "Clips from the AI video and website-building lessons",
    breadcrumbHome: "Home",
    breadcrumbCourses: "Courses",
    viewAll: "All courses →",
  },
} as const;

/**
 * Vidljivi tekst javne strane pretplate (`/pretplata`, en `/pricing`) — N6.
 *
 * Strana je detaljnija verzija sekcije „#pricing" sa landinga, pa NAMERNO ne
 * prepisuje ono što tamo već postoji: imena planova, „mesečno", bedž
 * „Najpopularnije" i CTA dugmad i dalje dolaze iz `marketingContent.pricing`.
 * Ovde živi samo ono što je novo: duži spiskovi stavki na karticama, tabela
 * razlika, blok pojedinačnih kurseva, pitanja o naplati i završni CTA.
 *
 * `sr` i `en` moraju držati istu strukturu (isti broj stavki i redova) — čuva je
 * `lib/pricing-page.test.ts`.
 */
export const pricingPageContent = {
  sr: {
    hero: {
      titleLead: "Izaberi kako ",
      titleHighlight: "učiš",
      subtitle:
        "Uporedi šta tačno dobijaš uz Basic i Premium, ili uzmi samo onaj kurs koji ti sada treba.",
    },
    plans: {
      // Duži spisak nego na landingu — ista imena, cene i dugmad, više redova.
      basicFeatures: [
        "Sve lekcije i materijali",
        "Pristup zajednici",
        "Nove lekcije bez doplate",
        "Napredak ti se pamti na svim uređajima",
        "Kredite za Studio kupuješ posebno",
        "Otkazuješ kad hoćeš",
      ],
      // "%CREDITS%" zamenjuje broj kredita iz baze — isti obrazac kao na landingu.
      premiumFeatures: [
        "Sve iz Basic-a",
        "Pro lekcije (napredni moduli)",
        "%CREDITS%",
        "Prioritetni odgovori u zajednici",
        "Rani pristup novim kursevima",
        "Otkazuješ kad hoćeš",
      ],
    },
    compare: {
      titleLead: "Šta ulazi u ",
      titleHighlight: "koji plan",
      intro: "Isti sadržaj, dva nivoa pristupa. Red po red.",
      featureHeading: "Mogućnost",
      included: "uključeno",
      excluded: "nije uključeno",
      rows: [
        { label: "Sve lekcije", basic: true, premium: true },
        { label: "Zajednica", basic: true, premium: true },
        { label: "Pro lekcije", basic: false, premium: true },
        { label: "Studio krediti mesečno", basic: false, premium: true },
        { label: "Prioritetni odgovori", basic: false, premium: true },
        { label: "Rani pristup novim kursevima", basic: false, premium: true },
      ],
    },
    courses: {
      titleLead: "Ili uzmi samo ",
      titleHighlight: "jedan kurs",
      intro: "Platiš jednom, bez mesečne pretplate.",
      oneTime: "jednokratno",
    },
    faq: {
      titleLead: "Česta pitanja o ",
      titleHighlight: "naplati",
      items: [
        {
          q: "Kada počinje naplata?",
          a: "Trenutno je sav objavljeni sadržaj besplatan uz registraciju; kad naplata krene, javljamo ti mejlom najmanje sedam dana ranije i ništa ti se ne skida bez tvoje potvrde.",
        },
        {
          q: "Kako se plaća?",
          a: "Karticom, preko domaćeg platnog operatera. Račun stiže na mejl odmah posle uplate.",
        },
        {
          q: "Mogu li da promenim plan?",
          a: "Možeš u svakom trenutku. Prelazak na Premium važi odmah, a razlika se obračuna srazmerno danima do kraja meseca.",
        },
        {
          q: "Šta se dešava kad otkažem?",
          a: "Pretplata radi do kraja plaćenog meseca. Sve što si napravio u Studiju i sve tvoje teme u zajednici ostaju tvoji.",
        },
        {
          q: "Da li izdajete račun za firmu?",
          a: "Da. U podešavanjima naloga upišeš podatke firme i račun stiže sa njima.",
        },
      ],
    },
    finalCta: {
      title: "Kreni od prve lekcije",
      body: "Napravi nalog i vidi platformu iznutra — plan biraš kad ti zatreba.",
    },
  },
  en: {
    hero: {
      titleLead: "Choose how you ",
      titleHighlight: "learn",
      subtitle:
        "Compare exactly what Basic and Premium give you, or just take the one course you need right now.",
    },
    plans: {
      basicFeatures: [
        "All lessons and materials",
        "Community access",
        "New lessons at no extra cost",
        "Your progress is saved across devices",
        "Buy Studio credits separately",
        "Cancel whenever you want",
      ],
      premiumFeatures: [
        "Everything in Basic",
        "Pro lessons (advanced modules)",
        "%CREDITS%",
        "Priority answers in the community",
        "Early access to new courses",
        "Cancel whenever you want",
      ],
    },
    compare: {
      titleLead: "What's in ",
      titleHighlight: "which plan",
      intro: "Same content, two levels of access. Row by row.",
      featureHeading: "Feature",
      included: "included",
      excluded: "not included",
      rows: [
        { label: "All lessons", basic: true, premium: true },
        { label: "Community", basic: true, premium: true },
        { label: "Pro lessons", basic: false, premium: true },
        { label: "Monthly Studio credits", basic: false, premium: true },
        { label: "Priority answers", basic: false, premium: true },
        { label: "Early access to new courses", basic: false, premium: true },
      ],
    },
    courses: {
      titleLead: "Or take just ",
      titleHighlight: "one course",
      intro: "Pay once, no monthly subscription.",
      oneTime: "one-time",
    },
    faq: {
      titleLead: "Common questions about ",
      titleHighlight: "billing",
      items: [
        {
          q: "When does billing start?",
          a: "Right now everything published is free once you sign up; when billing does start, we email you at least seven days ahead and nothing is charged without your confirmation.",
        },
        {
          q: "How do I pay?",
          a: "By card, through a local payment provider. The receipt lands in your inbox right after the payment.",
        },
        {
          q: "Can I change my plan?",
          a: "Any time. Premium starts the moment you switch, and the difference is worked out pro rata for the days left in the month.",
        },
        {
          q: "What happens when I cancel?",
          a: "Your subscription runs to the end of the month you paid for. Everything you made in the Studio and every thread of yours in the community stays yours.",
        },
        {
          q: "Do you invoice companies?",
          a: "Yes. Enter your company details in account settings and the invoice comes out with them on it.",
        },
      ],
    },
    finalCta: {
      title: "Start with the first lesson",
      body: "Create an account and see the platform from the inside — pick a plan when you actually need one.",
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
    // N7: naslov, podnaslov i CTA heroja strane; `subtitle` je i opis strane u JSON-LD.
    heroTitleLead: "Uči javno, ",
    heroTitleHighlight: "napreduj brže",
    subtitle:
      "Pitaš kad zapneš, pokazuješ šta si napravio i gledaš radove drugih — sve na jednom mestu, na srpskom.",
    heroCtaEnter: "Uđi u zajednicu",
    heroCtaDiscussions: "Pogledaj diskusije",
    heroMediaAlt: "Ilustracija zajednice polaznika",
    metaTitle: "Zajednica — Nauči AI",
    metaDescription:
      "Javne diskusije, pitanja i iskustva naših polaznika. Pridruži se razgovoru o praktičnoj primeni AI alata.",
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
    heroTitleLead: "Learn in the open, ",
    heroTitleHighlight: "get better faster",
    subtitle:
      "Ask when you're stuck, show what you made, and watch what everyone else is building — all in one place.",
    heroCtaEnter: "Enter the community",
    heroCtaDiscussions: "Browse discussions",
    heroMediaAlt: "Illustration of the student community",
    metaTitle: "Community — Nauči AI",
    metaDescription:
      "Public discussions, questions, and experiences from Nauči AI students. Join the conversation on practical AI tools.",
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

/**
 * Blaga gamifikacija zajednice (N12): traka nivoa, značke i iskra na glas.
 * Funkcije umesto niski tamo gde u tekst ulazi broj — da se ne slaže rečenica
 * spajanjem parčadi po komponentama.
 */
export const communityGamificationContent = {
  sr: {
    levelLabel: (level: number) => `Nivo ${level}`,
    toNextLevel: (xp: number, level: number) => `još ${xp} XP do nivoa ${level}`,
    meterLabel: (level: number) => `Napredak do nivoa ${level}`,
    badgesLabel: "Značke člana",
    badges: {
      first_thread: { title: "Prva tema", body: "Pokrenuo/la je prvu temu u zajednici." },
      ten_comments: { title: "Deset komentara", body: "Napisao/la je bar deset komentara." },
      first_helpful: { title: "Koristan odgovor", body: "Odgovor mu/joj je označen kao koristan." },
      week_streak: { title: "Sedam dana zaredom", body: "Sedam dana zaredom sa aktivnošću." },
    },
    upvoteSpark: "Nov glas na tvoj sadržaj",
  },
  en: {
    levelLabel: (level: number) => `Level ${level}`,
    toNextLevel: (xp: number, level: number) => `${xp} XP to level ${level}`,
    meterLabel: (level: number) => `Progress to level ${level}`,
    badgesLabel: "Member badges",
    badges: {
      first_thread: { title: "First topic", body: "Started their first topic in the community." },
      ten_comments: { title: "Ten comments", body: "Wrote at least ten comments." },
      first_helpful: { title: "Helpful answer", body: "Had an answer marked as helpful." },
      week_streak: { title: "Seven days in a row", body: "Active seven days in a row." },
    },
    upvoteSpark: "A new vote on your post",
  },
} as const;

/**
 * API ključevi za MCP server (MCP-P2-STUDIO, tačka 5): strana pod
 * podešavanjima naloga, `/app/profile/api-keys`. Pun ključ se vidi tačno
 * jednom, pa poruke oko toga stoje ovde da budu iste u obe teme i oba jezika.
 */
export const apiKeysContent = {
  sr: {
    title: "API ključevi",
    body: "Ključevima Claude Code, Claude Desktop ili drugi MCP klijent pristupa tvom Studiju u tvoje ime. Pun ključ se prikazuje samo jednom, pri kreiranju.",
    backToProfile: "Nazad na profil",
    profileLinkTitle: "API ključevi (MCP)",
    profileLinkBody: "Ključevi kojima MCP klijenti (Claude Code, Claude Desktop) čitaju tvoj Studio ili pokreću generisanje u tvoje ime.",
    profileLinkCta: "Upravljaj ključevima",
    newKey: "Novi ključ",
    emptyTitle: "Još nemaš nijedan ključ",
    emptyBody: "Napravi ključ, nalepi ga u MCP klijent i alati Studija se pojavljuju u razgovoru.",
    prefixHint: "prefiks",
    created: "Kreiran",
    lastUsed: "Poslednja upotreba",
    neverUsed: "još nije korišćen",
    revoked: "Opozvan",
    scopeRead: "čitanje",
    scopeWrite: "pisanje",
    revoke: "Opozovi",
    revokeTitle: "Opozvati ključ?",
    revokeBody: (name: string) => `Ključ „${name}“ odmah prestaje da radi. Klijent koji ga koristi moraće da dobije nov.`,
    revokeConfirm: "Opozovi ključ",
    cancel: "Odustani",
    close: "Zatvori",
    createTitle: "Novi API ključ",
    createBody: "Nazovi ključ po klijentu koji će ga koristiti, pa izaberi šta sme.",
    nameLabel: "Ime ključa",
    namePlaceholder: "npr. Claude Code na laptopu",
    scopeLabel: "Šta ključ sme",
    readOnlyTitle: "Samo čitanje",
    readOnlyBody: "Katalog modela, stanje Studija, projekti i galerija. Ne može da pokrene generisanje.",
    readWriteTitle: "Čitanje i pisanje",
    readWriteBody: "Sve iz čitanja, plus pokretanje generisanja (create_generation).",
    writeWarning:
      "Pisanje TROŠI TVOJE KREDITE: svaku generaciju koju klijent pokrene plaćaš sa svog salda, isto kao da si je pokrenuo/la iz Studija.",
    create: "Napravi ključ",
    createdTitle: "Ključ je napravljen",
    createdBody: "Kopiraj ga odmah. Ključ se više neće prikazati - ako ga izgubiš, napravi nov.",
    copy: "Kopiraj",
    copied: "Kopirano",
    copyFailed: "Kopiranje nije uspelo. Selektuj ključ i kopiraj ga ručno.",
    done: "Sačuvao/la sam ključ",
    invalidName: "Ime ključa mora imati od 1 do 64 znaka.",
    genericError: "Nešto nije prošlo. Pokušaj ponovo.",
    signIn: "Prijavi se da bi upravljao/la API ključevima.",
    signInCta: "Prijavi se",
    noConvex: "Ključevi žive u Convex bazi; bez NEXT_PUBLIC_CONVEX_URL strana nema šta da prikaže.",
    // Povezane aplikacije (MCP-P4-OAUTH): pristup dobijen preko OAuth-a, bez ručnog ključa.
    connectionsTitle: "Povezane aplikacije",
    connectionsBody:
      "Aplikacije koje su dobile pristup preko „Connect” dugmeta (OAuth), bez lepljenja ključa. Opoziv odmah gasi pristup.",
    connectionsEmptyTitle: "Još nema povezanih aplikacija",
    connectionsEmptyBody:
      "Kad u Claude Desktop ili claude.ai dodaš server samo URL-om i odobriš pristup, aplikacija se pojavljuje ovde.",
    connectedAt: "Povezano",
    disconnect: "Opozovi pristup",
    disconnectTitle: "Opozvati pristup aplikaciji?",
    disconnectBody: (name: string) =>
      `Aplikacija „${name}“ odmah gubi pristup. Da bi ponovo radila, moraćeš ponovo da je povežeš i odobriš.`,
    disconnectConfirm: "Opozovi pristup",
  },
  en: {
    title: "API keys",
    body: "Keys let Claude Code, Claude Desktop or another MCP client access your Studio on your behalf. The full key is shown only once, when it is created.",
    backToProfile: "Back to profile",
    profileLinkTitle: "API keys (MCP)",
    profileLinkBody: "Keys that let MCP clients (Claude Code, Claude Desktop) read your Studio or start generations on your behalf.",
    profileLinkCta: "Manage keys",
    newKey: "New key",
    emptyTitle: "You have no keys yet",
    emptyBody: "Create a key, paste it into your MCP client, and the Studio tools appear in the conversation.",
    prefixHint: "prefix",
    created: "Created",
    lastUsed: "Last used",
    neverUsed: "never used",
    revoked: "Revoked",
    scopeRead: "read",
    scopeWrite: "write",
    revoke: "Revoke",
    revokeTitle: "Revoke this key?",
    revokeBody: (name: string) => `The key "${name}" stops working immediately. Any client using it will need a new key.`,
    revokeConfirm: "Revoke key",
    cancel: "Cancel",
    close: "Close",
    createTitle: "New API key",
    createBody: "Name the key after the client that will use it, then choose what it may do.",
    nameLabel: "Key name",
    namePlaceholder: "e.g. Claude Code on my laptop",
    scopeLabel: "What the key may do",
    readOnlyTitle: "Read only",
    readOnlyBody: "Model catalog, Studio state, projects and gallery. Cannot start a generation.",
    readWriteTitle: "Read and write",
    readWriteBody: "Everything in read, plus starting generations (create_generation).",
    writeWarning:
      "Write SPENDS YOUR CREDITS: every generation the client starts is paid from your balance, exactly as if you started it in the Studio.",
    create: "Create key",
    createdTitle: "Key created",
    createdBody: "Copy it now. The key will not be shown again - if you lose it, create a new one.",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copying failed. Select the key and copy it manually.",
    done: "I saved the key",
    invalidName: "The key name must be 1 to 64 characters long.",
    genericError: "Something went wrong. Try again.",
    signIn: "Sign in to manage API keys.",
    signInCta: "Sign in",
    noConvex: "Keys live in the Convex database; without NEXT_PUBLIC_CONVEX_URL this page has nothing to show.",
    connectionsTitle: "Connected apps",
    connectionsBody:
      "Apps that got access through a “Connect” button (OAuth), without pasting a key. Revoking cuts access immediately.",
    connectionsEmptyTitle: "No connected apps yet",
    connectionsEmptyBody:
      "When you add the server in Claude Desktop or claude.ai by URL alone and approve access, the app shows up here.",
    connectedAt: "Connected",
    disconnect: "Revoke access",
    disconnectTitle: "Revoke this app's access?",
    disconnectBody: (name: string) =>
      `The app "${name}" loses access immediately. To use it again you will need to connect and approve it again.`,
    disconnectConfirm: "Revoke access",
  },
} as const;

/** Ekran pristanka `/oauth/authorize` (MCP-P4-OAUTH): ko traži pristup, šta traži, dozvoli/odbij. */
export const oauthConsentContent = {
  sr: {
    metaTitle: "Odobri pristup",
    eyebrow: "Zahtev za pristup (MCP)",
    title: (client: string) => `${client} traži pristup tvom Studiju`,
    body: "Aplikacija bi radila u tvoje ime kroz MCP server - isto što i API ključ, samo bez ručnog lepljenja.",
    signedInAs: "Prijavljen/a kao",
    redirectsTo: "Posle odluke vraćaš se na",
    scopesLabel: "Šta aplikacija traži",
    scopeReadTitle: "Čitanje",
    scopeReadBody: "Katalog modela, stanje Studija, projekti, poslovi i galerija.",
    scopeWriteTitle: "Pisanje",
    scopeWriteBody: "Pokretanje generisanja (create_generation) i okačivanje fajlova.",
    writeWarning:
      "Pisanje TROŠI TVOJE KREDITE: svaku generaciju koju aplikacija pokrene plaćaš sa svog salda, isto kao da si je pokrenuo/la iz Studija.",
    approve: "Dozvoli pristup",
    deny: "Odbij",
    revokeHint: "Pristup možeš da opozoveš kad god hoćeš, u profilu pod „API ključevi” → „Povezane aplikacije”.",
    loading: "Proveravamo zahtev…",
    redirecting: "Vraćamo te u aplikaciju…",
    errorTitle: "Zahtev nije ispravan",
    errorUnknownClient:
      "Aplikacija nije registrovana na ovom serveru, pa te ne šaljemo nikud. Poveži je ponovo iz klijenta - registracija ide automatski.",
    errorRedirect:
      "Adresa povratka nije registrovana za ovu aplikaciju, pa te ne šaljemo nikud. Poveži aplikaciju ponovo iz klijenta.",
    errorInvalidRequest:
      "Zahtev ne ispunjava OAuth 2.1 (PKCE S256, opsezi, resource). Vraćamo te u aplikaciju sa opisom greške.",
    genericError: "Nešto nije prošlo. Pokušaj ponovo.",
    noConvex: "Ekran pristanka radi nad Convex bazom; bez NEXT_PUBLIC_CONVEX_URL nema šta da prikaže.",
    backHome: "Nazad na početnu",
  },
  en: {
    metaTitle: "Approve access",
    eyebrow: "Access request (MCP)",
    title: (client: string) => `${client} wants to access your Studio`,
    body: "The app would act on your behalf through the MCP server - the same as an API key, just without pasting one.",
    signedInAs: "Signed in as",
    redirectsTo: "After you decide, you return to",
    scopesLabel: "What the app is asking for",
    scopeReadTitle: "Read",
    scopeReadBody: "Model catalog, Studio state, projects, jobs and gallery.",
    scopeWriteTitle: "Write",
    scopeWriteBody: "Starting generations (create_generation) and uploading files.",
    writeWarning:
      "Write SPENDS YOUR CREDITS: every generation the app starts is paid from your balance, exactly as if you started it in the Studio.",
    approve: "Allow access",
    deny: "Deny",
    revokeHint: "You can revoke access at any time in your profile under “API keys” → “Connected apps”.",
    loading: "Checking the request…",
    redirecting: "Taking you back to the app…",
    errorTitle: "The request is not valid",
    errorUnknownClient:
      "This app is not registered with this server, so we are not sending you anywhere. Connect it again from the client - registration is automatic.",
    errorRedirect:
      "The return address is not registered for this app, so we are not sending you anywhere. Connect the app again from the client.",
    errorInvalidRequest:
      "The request does not meet OAuth 2.1 (PKCE S256, scopes, resource). We are taking you back to the app with the error.",
    genericError: "Something went wrong. Try again.",
    noConvex: "The consent screen runs on the Convex database; without NEXT_PUBLIC_CONVEX_URL there is nothing to show.",
    backHome: "Back home",
  },
} as const;

/**
 * Javna strana `/3d` (3D-FAZA5): pregled maskote (basic/premium) sa R3F canvas-om,
 * idle animacijom i klizačima koji voze pojedinačne zglobove iz `RIG.md` — dokaz da
 * rig radi. Nijedan hardkodovan string u komponentama, isti obrazac kao
 * `marketingContent`. `sr` i `en` drže istu strukturu.
 */
export const mascotPageContent = {
  sr: {
    metaTitle: "3D maskota — Nauči AI",
    metaDescription:
      "Pregled naše 3D maskote u pregledaču: basic i premium varijanta, idle animacija i klizači koji pokreću pojedinačne zglobove.",
    hero: {
      titleLead: "Upoznaj našu ",
      titleHighlight: "3D maskotu",
      subtitle: "Basic i premium varijanta, prava idle animacija i klizači koji pokreću svaki zglob posebno.",
    },
    variant: {
      label: "Varijanta",
      basic: "Basic",
      premium: "Premium",
    },
    playback: {
      play: "Pusti animaciju",
      pause: "Pauziraj animaciju",
      reset: "Vrati u početni položaj",
    },
    joints: {
      groupLabel: "Zglobovi",
      neck: "Vrat",
      head: "Glava",
      shoulders: "Ramena",
      elbows: "Laktovi",
      antenna: "Antena",
    },
    canvasLabel: "3D prikaz maskote — okreni i zumiraj mišem ili dodirom",
    loading: "Učitavanje 3D modela…",
    reducedMotionNote: "Pokret je isključen u podešavanjima sistema — model stoji u mirnoj pozi; klizači i dalje rade.",
    stats: {
      triangles: "trouglova",
      fileSize: "veličina fajla",
    },
    orbitHint: "Prevuci da okreneš, skroluj/uštini da zumiraš.",
  },
  en: {
    metaTitle: "3D mascot — Nauči AI",
    metaDescription:
      "A browser preview of the Nauči AI 3D mascot: basic and premium variants, an idle animation, and sliders that drive individual joints.",
    hero: {
      titleLead: "Meet our ",
      titleHighlight: "3D mascot",
      subtitle: "Basic and premium variants, a real idle animation, and sliders that drive every joint on its own.",
    },
    variant: {
      label: "Variant",
      basic: "Basic",
      premium: "Premium",
    },
    playback: {
      play: "Play animation",
      pause: "Pause animation",
      reset: "Reset to starting pose",
    },
    joints: {
      groupLabel: "Joints",
      neck: "Neck",
      head: "Head",
      shoulders: "Shoulders",
      elbows: "Elbows",
      antenna: "Antenna",
    },
    canvasLabel: "3D mascot preview — drag or touch to orbit, scroll or pinch to zoom",
    loading: "Loading the 3D model…",
    reducedMotionNote: "Motion is turned off in your system settings — the model holds a still pose; the sliders still work.",
    stats: {
      triangles: "triangles",
      fileSize: "file size",
    },
    orbitHint: "Drag to rotate, scroll or pinch to zoom.",
  },
} as const;

/**
 * Javna strana MCP servera (MCP-P6-JAVNA-STRANA): kako se Nauči AI dodaje u
 * Claude Desktop/Code/claude.ai. Sav tekst OKO kataloga (hero, koraci, opsezi)
 * ima sr/en; imena i opisi alata/resursa/promptova dolaze iz Convex registra i
 * NAMERNO su samo na srpskom (isti tekst koji `tools/list` vraća modelu) — vidi
 * `convex/mcp/catalog.ts`. Strana je uvod za čoveka koji prvi put čuje za MCP,
 * ne referenca — puna referenca je `docs/mcp-server.md`.
 */
export const mcpPageContent = {
  sr: {
    metaTitle: "MCP server — poveži Nauči AI sa Claude-om",
    metaDescription:
      "Poveži Nauči AI sa Claude Desktop, Claude Code ili claude.ai preko MCP servera i iz razgovora generiši slike i video, pratiš poslove i kredite.",
    hero: {
      kicker: "MCP server",
      titleLead: "Poveži Nauči AI sa ",
      titleHighlight: "Claude-om",
      body:
        "Povežeš Nauči AI sa Claude-om i onda pravo iz razgovora praviš slike i video, gledaš svoje poslove i koliko ti je ostalo kredita. Ne treba ti ništa sem naloga na Nauči AI i Claude klijenta.",
    },
    connect: {
      title: "Kako se dodaje",
      serverLabel: "Adresa servera",
      recommendedBadge: "Preporučeno",
      copyLabel: "Kopiraj",
      copiedLabel: "Kopirano",
      oauth: {
        title: "Preko URL-a (OAuth)",
        body: "Nalepiš adresu servera, klikneš „Connect”, prijaviš se i odobriš pristup. Nema kucanja ključa.",
        steps: [
          "U Claude klijentu otvori podešavanja konektora/MCP servera i izaberi „Add custom connector” (ili ekvivalentnu opciju za dodavanje MCP servera preko URL-a).",
          "Nalepi adresu servera ispod i sačuvaj.",
          "Klikni „Connect” — otvara se prijava na Nauči AI (ako već nisi prijavljen/a) i ekran pristanka sa traženim opsezima.",
          "Odobri pristup. Alati se pojavljuju u razgovoru odmah.",
        ],
      },
      apiKey: {
        title: "Preko API ključa (Bearer)",
        body: "Za skripte, agente i alate koji ne prolaze kroz browser — ključ se stavlja u Authorization zaglavlje.",
        steps: [
          "Napravi ključ na strani za API ključeve (link ispod). Izaberi „Samo čitanje” ili „Čitanje i pisanje” — pisanje troši kredite.",
          "Kopiraj ključ — prikazuje se tačno jednom.",
          "U podešavanjima klijenta dodaj MCP server sa istom adresom i zaglavljem Authorization: Bearer <ključ>.",
        ],
        keysLinkLabel: "Otvori stranu za API ključeve",
      },
    },
    scopes: {
      title: "Opsezi pristupa",
      read: {
        title: "mcp:read — čitanje",
        body: "Katalog modela, stanje Studija, poslovi i krediti. Ne troši kredite. Podrazumevan opseg svakog novog ključa.",
      },
      write: {
        title: "mcp:write — pisanje i generisanje",
        body: "Pokreće generisanje i troši kredite sa naloga vlasnika ključa, isto kao klik na „Generiši” u Studiju. Bira se svesno pri pravljenju ključa ili u ekranu pristanka OAuth-a.",
      },
    },
    catalog: {
      title: "Šta server ume",
      intro:
        "Spisak ispod se učitava direktno iz servera — kad se dodaju novi alati, resursi ili promptovi, pojaviće se ovde sami.",
      toolsTitle: "Alati",
      toolsBody: "Radnje koje model poziva (npr. napravi sliku, sačekaj rezultat).",
      resourcesTitle: "Resursi",
      resourcesBody: "Sadržaj koji se prikači kao kontekst, bez poziva alata (npr. ceo katalog modela).",
      promptsTitle: "Promptovi",
      promptsBody: "Gotovi šabloni iz menija klijenta (npr. „Napravi sliku”).",
      scopeRead: "čitanje",
      scopeWrite: "pisanje",
      argumentsLabel: "Argumenti",
      requiredLabel: "obavezan",
      optionalLabel: "opcion",
      loading: "Učitavanje kataloga…",
      empty: "Katalog trenutno nije dostupan.",
    },
    crossSell: "Probaj generisanje direktno u Studiju →",
  },
  en: {
    metaTitle: "MCP server — connect Nauči AI to Claude",
    metaDescription:
      "Connect Nauči AI to Claude Desktop, Claude Code, or claude.ai through the MCP server and generate images and video, check your jobs and credits, right from the conversation.",
    hero: {
      kicker: "MCP server",
      titleLead: "Connect Nauči AI to ",
      titleHighlight: "Claude",
      body:
        "Connect Nauči AI to Claude and then generate images and video straight from the conversation, and check your jobs and how many credits you have left. All you need is a Nauči AI account and a Claude client.",
    },
    connect: {
      title: "How to add it",
      serverLabel: "Server address",
      recommendedBadge: "Recommended",
      copyLabel: "Copy",
      copiedLabel: "Copied",
      oauth: {
        title: "By URL (OAuth)",
        body: "Paste the server address, click “Connect”, sign in, and approve access. No key to type.",
        steps: [
          "In your Claude client, open connector/MCP server settings and choose “Add custom connector” (or the equivalent option for adding an MCP server by URL).",
          "Paste the server address below and save.",
          "Click “Connect” — this opens sign-in to Nauči AI (if you aren't already signed in) and a consent screen with the requested scopes.",
          "Approve access. The tools appear in the conversation right away.",
        ],
      },
      apiKey: {
        title: "By API key (Bearer)",
        body: "For scripts, agents, and tools that don't go through a browser — the key goes in the Authorization header.",
        steps: [
          "Create a key on the API keys page (link below). Choose “Read only” or “Read and write” — write spends credits.",
          "Copy the key — it's shown exactly once.",
          "In your client's settings, add the MCP server with the same address and an Authorization: Bearer <key> header.",
        ],
        keysLinkLabel: "Open the API keys page",
      },
    },
    scopes: {
      title: "Access scopes",
      read: {
        title: "mcp:read — read",
        body: "Model catalog, Studio state, jobs, and credits. Doesn't spend credits. The default scope on every new key.",
      },
      write: {
        title: "mcp:write — write and generate",
        body: "Starts a generation and spends credits from the key owner's account, just like clicking “Generate” in the Studio. Chosen deliberately when creating a key, or on the OAuth consent screen.",
      },
    },
    catalog: {
      title: "What the server can do",
      intro:
        "The list below loads straight from the server — when new tools, resources, or prompts are added, they'll show up here on their own.",
      toolsTitle: "Tools",
      toolsBody: "Actions the model calls (e.g. make an image, wait for the result).",
      resourcesTitle: "Resources",
      resourcesBody: "Content attached as context without calling a tool (e.g. the whole model catalog).",
      promptsTitle: "Prompts",
      promptsBody: "Ready-made templates from the client's menu (e.g. “Make an image”).",
      scopeRead: "read",
      scopeWrite: "write",
      argumentsLabel: "Arguments",
      requiredLabel: "required",
      optionalLabel: "optional",
      loading: "Loading the catalog…",
      empty: "The catalog isn't available right now.",
    },
    crossSell: "Try generating straight in the Studio →",
  },
} as const;
