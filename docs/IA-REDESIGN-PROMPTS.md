# Nauči AI — IA redizajn: Učionica, kontekstualni sidebar-i, novi Dashboard

Radni dokument + 7 promptova spremnih za copy-paste u Fable.
Redosled je obavezan — svaki prompt gradi na prethodnom.

---

## 0. Šta je odlučeno

| Pitanje | Odluka |
| --- | --- |
| Putanje Učionice | Puno ugnježdenje pod `/app/classroom/**` + 307 redirecti sa starih putanja |
| Admin panel | Interni tabovi (`content` / `users` / `growth` / `analytics`) postaju prave rute; `/app/admin` → redirect na `/app/admin/content` |
| Dashboard podaci | Jedan agregatni Convex query `getDashboardOverview` u novom `convex/dashboard.ts` |
| Tip sidebara | Isti mehanizam kao Studio (`SidebarNavSwap` + `StudioSidebarNav`/`StudioSidebarRail`), ali generalizovan u registry |

---

## 1. Centralna ideja: "sidebar kontekst"

Danas u `components/app/app-sidebar.tsx` postoji **jedan hardkodovan izuzetak**:

```tsx
const studioActive = pathname === withLocale(locale, "/app/studio") || pathname.includes("/app/studio/");
...
<SidebarNavSwap active={studioActive} classic={...} studio={<StudioSidebarNav .../>} />
```

`SidebarNavSwap` je već pravi mehanizam (usmeren prelaz, `popLayout`, stagger, `reducedMotion`, `compact` varijanta za rail). Problem je što zna samo za **dve** stvari: "classic" i "studio".

Rešenje nije novi sidebar po stranici — nego **registry konteksta**, pa `app-sidebar.tsx` prestaje da zna imena sekcija:

```
lib/sidebar-contexts.ts   ← jedini izvor istine
  home       → globalna navigacija (Dashboard, Učionica, Studio, Zajednica, Poruke, Krediti, Admin)
  classroom  → Pregled, Smerovi, Kursevi, Moje lekcije, Nastavi, Favoriti
  studio     → postojeće STUDIO_SECTIONS (kind filteri)
  community  → postojeće COMMUNITY_SECTIONS
  admin      → Sadržaj, Korisnici, Rast, Analitika, Chat sigurnost, Studio admin
```

Kontrakt jednog konteksta:

```ts
export type SidebarContextId = "home" | "classroom" | "studio" | "community" | "admin";

export type SidebarSection = {
  id: string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  /** Puna putanja (bez locale prefiksa) ILI query-param varijanta za Studio. */
  href: (locale: Locale, params: SidebarHrefParams) => string;
  isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
  badgeKey?: "myThreads" | "community" | "pendingApprovals" | "messages";
  staffOnly?: boolean;
  adminOnly?: boolean;
};

export type SidebarContext = {
  id: SidebarContextId;
  /** Prefiksi koji aktiviraju kontekst — prvi koji se poklopi pobeđuje. */
  matches: readonly string[];
  rootHref: (locale: Locale) => string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  sections: SidebarSection[];
};

export function resolveSidebarContext(pathname: string): SidebarContext;
```

**Zašto registry a ne pet komponenata:** danas su iste labele zajednice napisane na dva mesta
(`lib/community-sections.ts` komentar to i kaže: "duplicating six labels across two files is how
the two navs drift apart"). Sa pet konteksta i po dva potrošača (pun sidebar + rail) to bi bilo
deset mesta za drift. Registry to čini nemogućim.

**Šta ostaje netaknuto:** `SidebarNavSwap`, `studioMotionTokens`, `RailAction`, `LearningSwitcher`,
cookie/resize logika, profil kartica na dnu, `AppBottomNav`. Menja se **samo šta se renderuje unutar
regiona zamene** — tačno kako je Studio već urađen.

---

## 2. Nova mapa ruta

```
/app                                     Dashboard (redizajn, faza 6)
/app/classroom                           Učionica — hub (NOVO)
/app/classroom/tracks/[trackSlug]        ← /app/tracks/[trackSlug]
/app/classroom/courses/[courseSlug]      ← /app/courses/[courseSlug]
/app/classroom/courses/[c]/lessons/[l]   ← /app/courses/[c]/lessons/[l]
/app/classroom/courses/[c]/lessons/[l]/edit
/app/studio, /app/studio/gallery, /app/studio/m/[jobId]      (bez promene)
/app/community/**                        (bez promene ruta; nestaje in-page nav)
/app/admin            → 307 → /app/admin/content
/app/admin/content    (NOVO — bivši tab)
/app/admin/users      (NOVO — bivši tab)
/app/admin/growth     (NOVO — bivši tab)
/app/admin/analytics  (NOVO — bivši tab)
/app/admin/chat, /app/admin/studio                            (bez promene)
/app/messages/**, /app/credits, /app/billing, /app/profile, /app/members/** (bez promene)
```

### Call-site-ovi koje seljenje ruta dodiruje (kompletna lista)

| Fajl | Šta |
| --- | --- |
| `lib/app-routes.ts` | `trackPath`, `coursePath`, `lessonPath` — kanonski builderi |
| `lib/app-routes.test.ts` | očekivani stringovi |
| `lib/stripe.ts:65,156` | `success_url` / `cancel_url` za kupovinu kursa |
| `lib/stripe.test.ts:105` | očekivani `success_url` |
| `lib/motion-contract.ts` | `courseDetailPattern`, lesson `focus` regex |
| `lib/motion-contract.test.ts` | putanje u testovima |
| `components/app/admin-inline-actions.tsx` | 6 `router.push/replace` sa literalnim `/app/courses/...` |
| `components/app/course-lab.tsx:433,470` | edit linkovi |
| `components/app/course-player.tsx:294` | edit link |
| `components/app/lesson-steps-editor.tsx:1011,1058` | povratni linkovi |
| `app/[locale]/(marketing)/courses/[courseSlug]/page.tsx:189` | `dashboardHref` iz marketinga |
| `app/[locale]/app/courses/.../page.tsx` (2×) | interni `redirect(...)` i `?next=` |
| `app/sitemap.ts` | proveriti da li emituje `/app/**` (ne bi trebalo — `/app` je robots-disallowed) |

**Pravilo za Fable:** posle seljenja **nijedan literal `/app/courses` ili `/app/tracks` ne sme ostati
van redirect stub-ova**. Sve ide kroz `lib/app-routes.ts`. To je i razlog zašto taj fajl postoji —
njegov komentar kaže da su sidebar i dashboard ranije gradili URL svaki za sebe i razišli se.

### Redirect stubovi

Ostaju kao tanki server fajlovi koji rade `redirect()` (307, ne 308 — `/app/**` je robots-disallowed
pa nema SEO argumenta, a 308 bi browser keširao zauvek):

```
app/[locale]/app/tracks/[trackSlug]/page.tsx
app/[locale]/app/courses/[courseSlug]/page.tsx
app/[locale]/app/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx
app/[locale]/app/courses/[courseSlug]/lessons/[lessonSlug]/edit/page.tsx
```

Svaki prenosi **sve** search-param-e (Stripe šalje `?checkout=success`, admin akcije šalju
`?editModule=`, `?newLessonModule=`). Postojeći `legacyCourseRedirect` u `lib/app-routes.ts` već ima
tačno tu logiku očuvanja param-a — ponovo je iskoristiti, ne pisati novu.

---

## 3. Učionica — šta je na glavnoj stranici

`/app/classroom` je **hub sadržaja**, ne kopija Dashboarda. Dashboard odgovara na "šta se dešava
na platformi"; Učionica na "šta ima da se uči".

```
┌─ Hero: Nastavi gde si stao ──────────────────────────────────┐
│  cover · Kurs · Lekcija 7/24 · [Nastavi]   |  ukupan % kroz  │
│                                            |  sve kurseve     │
└──────────────────────────────────────────────────────────────┘
┌─ Smerovi (tracks) ───────────────────────────────────────────┐
│  horizontalne kartice: naziv smera, br. kurseva, progres     │
└──────────────────────────────────────────────────────────────┘
┌─ Kursevi ────────────────────────────────────────────────────┐
│  postojeći DashboardCourseCard grid (2 kolone), sa filterom: │
│  Svi / U toku / Završeni / Zaključani                        │
└──────────────────────────────────────────────────────────────┘
┌─ Nastavlja se ───────────────────────────────────────────────┐
│  sledećih 5 lekcija kroz sve kurseve, kao lista sa trajanjem │
└──────────────────────────────────────────────────────────────┘
```

Sidebar kontekst `classroom` (sekcije):

| Sekcija | Ikona | Href |
| --- | --- | --- |
| ← Nazad | `ChevronLeft` | `router.back()` fallback `/app` — identično Studiju |
| Pregled | `LayoutDashboard` | `/app/classroom` |
| Smerovi | `Compass` | `/app/classroom#tracks` (ili `?view=tracks`) |
| Kursevi | `GraduationCap` | `/app/classroom?view=courses` |
| *Trenutni smer* | `Compass` | `/app/classroom/tracks/[slug]` — samo kad postoji |
| *Trenutni kurs* | `BookOpen` | `/app/classroom/courses/[slug]` — samo kad postoji |
| *Lekcije* | `PlayCircle` | postojeći `LearningSwitcher` disclosure, netaknut |

Postojeći `LearningSwitcher` (linije ~313-660 u `app-sidebar.tsx`) **se ne prepisuje** — samo se
premešta iz `classic` grane u `classroom` granu swap-a. To je stablo smer → kurs → lekcije koje
već radi, sa admin inline akcijama.

Iz `home` konteksta nestaju: `Smer · X`, `Kurs · Y` i `LearningSwitcher`. Zamenjuje ih **jedan**
red: `Učionica`.

---

## 4. Zajednica — sidebar umesto in-page nav

`components/app/community-v2/community-shell.tsx` danas renderuje sticky sekcijsku navigaciju
(`SmartStickyRegion` + grid sa animiranim indikatorom + mobilni "Sve sekcije" bottom sheet).

Posle promene:

- **Briše se**: `<nav aria-label="Sekcije zajednice">` blok (desktop grid + indikator), mobilni sheet,
  `navItems`/`activeNavWidth`/`activeNavTransform`/`mobileMenuOpen` state i `CommunityNavLink`.
- **Ostaje**: hero (`COMMUNITY_HERO_COPY`, section-aware), `data-community-toolbar-target`
  (`community-sticky-toolbar.tsx` portalira filtere unutra — to nije navigacija), profile-incomplete
  banner, `{children}`.
- **Ostaje** `SmartStickyRegion` samo ako toolbar i dalje treba da bude sticky; ako ostane prazan,
  `empty:hidden` na wrapper-u već rešava.
- `lib/community-sections.ts` **ostaje** kao izvor istine — samo ga sada troši registry, a ne dva
  potrošača.

Mobilni: sidebar je ionako drawer, pa sekcije stižu preko "Više" dugmeta u header-u. Dodatno,
`AppBottomNav` dobija pravilo: kad je aktivan kontekst ≠ `home`, treći slot postaje
**"Sekcije"** dugme koje otvara drawer umesto linka na zajednicu. Bez petog taba — komentar u kodu
izričito zabranjuje peti unos i taj razlog i dalje važi (badge na Porukama).

---

## 5. Admin — tabovi postaju rute

`components/app/admin-content-manager.tsx` ima `useState<"content"|"users"|"growth"|"analytics">`
i tab bar sa `layoutId="admin-tab-indicator"`.

- Sadržaj svakog taba se izdvaja u zasebnu komponentu i montira na svoju rutu.
- Tab bar i `motion.span` indikator se brišu (indikator sada nosi sidebar).
- `users` / `growth` / `analytics` su danas `FutureModule` placeholder-i — sele se kao takvi,
  **bez izmišljanja podataka** (postojeći copy to i kaže: "biće dodati bez izmišljanja privremenih
  podataka").
- Admin gate (`profile?.role !== "admin"` → redirect) mora da stoji na **svakoj** novoj ruti, ne
  samo na `/app/admin`.

---

## 6. Dashboard — redizajn

### Princip

Dashboard prestaje da bude "kursevi + progres" i postaje **komandna tabla**: svaki blok je
*prozor* u jednu drugu stranicu — pokaže 1-3 konkretne stvari odatle i ima tačno jedno primarno
dugme koje vodi tamo. Kursevi se sele u Učionicu; Dashboard ih i dalje pokazuje, ali kao jedan
prozor među ostalima.

### Zone

```
A  NASTAVI            hero: cover + kurs + lekcija N/M + [Nastavi]   |  ukupan %
B  PULS               4 kompaktna tile-a (linkovi):
                      Krediti · Nepročitane poruke · Obaveštenja · Rang na leaderboard-u
C  PROZORI            grid 1 / 2 (lg) / 3 (2xl) kolone:
                      1. Učionica        3 sledeće lekcije        → /app/classroom
                      2. Poruke          3 nepročitane konverz.   → /app/messages
                      3. Zajednica       3 nove/aktivne teme      → /app/community/discussions
                      4. Obaveštenja     3 najnovija događaja     → /app/community/notifications
                      5. Studio          3 poslednja generisanja  → /app/studio
                      6. Uči zajedno     pozivnice / partneri     → study hub
                      7. Admin (samo admin) spremnost + na čekanju → /app/admin/content
D  RITAM              postojeći ActivityPanel (30/90 dana) — netaknut
```

### Anatomija "prozora" (jedna komponenta, `DashboardWindow`)

```
┌────────────────────────────────────────────┐
│ EYEBROW (uppercase, muted)      [badge 3]  │
│ Naslov prozora                             │
├────────────────────────────────────────────┤
│ • stavka 1 — primarni tekst · meta         │
│ • stavka 2                                 │
│ • stavka 3                                 │
├────────────────────────────────────────────┤
│                        [Otvori X  →]       │
└────────────────────────────────────────────┘
```

Pravila (ovo su i acceptance kriterijumi):

1. **Najviše 3 stavke.** Prozor nije lista, nego mamac. Sve preko toga je posao odredišne stranice.
2. **Tačno jedan primarni CTA** po prozoru. Stavke smeju biti linkovi na konkretan objekat
   (konverzacija, tema), ali dugme je samo jedno.
3. **Prazno stanje je stanje, ne skrivanje.** Prozor bez podataka renderuje svoju poruku
   ("Nemaš nepročitanih poruka") + isti CTA. Ne nestaje — pozicija u gridu je mišićna memorija.
4. **Fiksan redosled.** Prozori se ne preslaguju po broju signala; signal se vidi kao badge/žuta
   tačka. Preslagivanje bi značilo da isti prozor svaki dan stoji na drugom mestu.
5. **Nikad izmišljeni podaci.** Ako query nije stigao — skeleton; ako je vratio prazno — prazno
   stanje. Bez mock brojeva.
6. **Admin prozor samo za `role === "admin"`.** Ne "sakriven CSS-om".
7. Radius po konvenciji iz `AGENTS.md`: kartica `rounded-[16px]`, unutrašnji paneli `12px`,
   thumbnail-i `8px`, badge-evi `rounded-full`.

### Izvori podataka (jedan query)

Novi `convex/dashboard.ts` → `getDashboardOverview` vraća:

```ts
{
  resume: { courseSlug, lessonSlug, courseTitle, lessonTitle, position, total, coverUrl } | null,
  progress: { completedLessons, totalLessons, percent },
  nextLessons: Array<{ courseSlug, lessonSlug, title, duration }>,        // max 3
  messages: { unreadTotal, items: Array<{ conversationId, title, snippet, at, avatarUrl }> },  // max 3
  community: { unreadNotifications, items: Array<{ postId, title, author, replies, at }> },    // max 3
  notifications: { total, items: Array<{ kind, title, at, href }> },                            // max 3
  studio: { creditsBalance, items: Array<{ jobId, kind, thumbUrl, at }> },                      // max 3
  study: { pendingInvites, partners },
  leaderboard: { rank, points } | null,
  admin: { pendingApprovals, readiness } | null,   // null za ne-admine
}
```

Kompozicija ide preko **postojećih core helper-a**, ne novih upita nad bazom:
`chatInboxSummaryCore`, `notifications.getUserNotificationSummary`, `community.listPostsPage`
(prva strana, `limit: 3`), `studio.listMyJobs`, `credits.getBalance`, `leaderboardCore`,
`studyHubSummaryCore`, `contentReadiness`, `courses.getStudentDashboard`.

Zašto jedan query: sedam `useQuery` poziva na jednoj strani znači sedam WebSocket subscription-a
i sedam nezavisnih re-render talasa pri svakoj poruci u chatu. Agregat daje jedan snapshot i
jedan predvidiv payload koji se testira u `vitest`-u.

---

## 7. Zašto 7 promptova, a ne jedan

Jedan mega-prompt bi ovde pao iz tri razloga:

1. **Seljenje ruta i redizajn dashboarda dele nula fajlova.** Spojeni u jedan zadatak, dele
   context window i međusobno zamagljuju verifikaciju — kad `npm run test` padne, ne znaš koja
   polovina je kriva.
2. **Faze 2-5 su refaktori sa nula vizuelne promene** (osim nestanka in-page nav-a). To su zadaci
   gde je uspeh "sve prolazi i ništa ne izgleda drugačije". Faza 7 je suprotno — tu se očekuje da
   izgleda drugačije. Mešanje ta dva kriterijuma u jedan prompt garantuje da model "usput popravi"
   nešto što nije tražio.
3. `AGENTS.md` u repou izričito traži hirurške izmene ("Every changed line should trace directly
   to the user's request"). Jedan veliki prompt je najbrži način da se to pravilo prekrši.

Faze 4 i 5 (Zajednica, Admin) su nezavisne jedna od druge — mogu paralelno, ako radiš na dve grane.
Sve ostalo je strogo sekvencijalno.

**Posle svakog prompta, pre sledećeg:**
```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

---

# PROMPT 1 — Plan i audit (bez izmena koda)

> **Model:** Fable · **Effort:** xhigh · **Mode:** Plan
> Ovaj prompt ne sme da napiše ni jednu liniju produkcionog koda. Izlaz je plan koji ti pregledaš
> pre nego što pustiš Prompt 2.
>
> **Zašto Plan a ne Goal:** plan mode je tvrda garancija da neće dirati kod — „ne menjaj kod" u
> tekstu prompta je samo molba, i model ume da odluta u izmene čim naiđe na nešto očigledno.
> Jedini fajl koji sme da nastane je `docs/IA-REDESIGN-PLAN.md`, i on se piše tek kad odobriš plan.
> Ako Fable-ov plan mode uopšte ne dozvoljava upis fajla, tek tada pređi na Goal i dodaj red:
> „Jedina dozvoljena izmena na disku je novi fajl `docs/IA-REDESIGN-PLAN.md`."
>
> **Zašto xhigh a ne max:** max se isplati kad postoji litica tačnosti (suptilna konkurentnost,
> netrivijalan algoritam). Ovde je posao „pročitaj široko, tabeliraj, predloži" — dubina se isplati
> samo na auditu B (izvođenje zajedničkog tipa sekcije za svih 5 konteksta) i na dekompoziciji faza.
> Ostatak je mehaničko otkrivanje gde max troši budžet bez dobitka.

````text
Radiš na Next.js 16 + Convex aplikaciji `nauciai`. Pre bilo čega pročitaj `AGENTS.md`,
`convex/_generated/ai/guidelines.md` i relevantne fajlove u `node_modules/next/dist/docs/` —
ovo NIJE Next.js iz tvojih trening podataka.

ZADATAK: napravi plan implementacije, NE menjaj kod. Izlaz je jedan novi fajl
`docs/IA-REDESIGN-PLAN.md`.

Radimo restrukturiranje informacione arhitekture u 6 faza:
1. Registry sidebar konteksta (generalizacija postojećeg Studio swap-a)
2. Učionica: nova sekcija `/app/classroom/**` + seljenje kurseva/smerova/lekcija tamo
3. Zajednica: uklanjanje in-page sekcijske navigacije u korist sidebar konteksta
4. Admin: interni tabovi postaju rute
5. Convex agregatni query `getDashboardOverview`
6. Redizajn Dashboarda u "komandnu tablu"

Plan mora da sadrži, za svaku fazu:
- tačnu listu fajlova koje dira (put + zašto), razdvojeno na NOVI / IZMENJEN / OBRISAN
- šta se NE dira i zašto (eksplicitno: `SidebarNavSwap`, `studioMotionTokens`, `LearningSwitcher`,
  cookie/resize logika sidebara, profil kartica, `community-sticky-toolbar.tsx`)
- uslove uspeha koji se mogu proveriti komandom, ne mišljenjem
- rizike i rollback

Dodatno, uradi ove audite i upiši rezultate u plan kao tabele:

A) Grep ceo repo (bez `node_modules`, `.next`, `_to_delete`, `convex/_generated`) za literale
   `/app/courses` i `/app/tracks`. Za svaki pogodak napiši: fajl, liniju, da li ide kroz
   `lib/app-routes.ts` ili je hardkodovan, i predloženu zamenu.

B) Uporedi `lib/community-sections.ts` i `lib/studio-sections.ts`. Izvedi minimalni zajednički
   tip koji pokriva oba I nove kontekste (classroom, admin, home), znajući da:
   - community sekcija je route segment
   - studio sekcija je `?kind=` query filter nad istom rutom
   - admin i classroom sekcije su pune rute
   Predloži potpis tipa i objasni gde svaki od 5 konteksta pravi izuzetak.

C) Pročitaj `components/app/app-sidebar.tsx` i napravi tabelu: koji delovi su kontekst-nezavisni
   (brand, collapse dugme, kredit pill, profil kartica, rail wrapper) a koji su danas u `classic`
   grani i sele se u neki kontekst. Označi šta ostaje u `home` kontekstu.

D) Popiši sve Convex query-je koje bi `getDashboardOverview` kompozitirao, sa tačnim imenima
   exporta i fajlovima, i oceni koji imaju već izdvojenu "core" logiku (npr. `chatInboxSummaryCore`,
   `studyHubSummaryCore`, `leaderboardCore`) a koji bi tražili novi helper.

E) Napiši redirect mapu stara → nova putanja, sa napomenom koji search-param-i moraju preživeti
   (Stripe `checkout`, admin `editModule` / `newLessonModule`).

Ako naiđeš na odluku koja ima više razumnih ishoda, NE biraj tiho — upiši je u sekciju
"Otvorena pitanja" sa opcijama i tvojom preporukom.
````

---

# PROMPT 2 — Registry sidebar konteksta

> **Model:** Fable · **Effort:** high · **Mode:** Goal
> Faza sa nula vizuelnih promena. Uspeh = Studio se ponaša identično, ali kroz novi mehanizam.

````text
Pročitaj `AGENTS.md` i `docs/IA-REDESIGN-PLAN.md` pre početka.

CILJ: generalizovati postojeći Studio sidebar swap u registry konteksta, bez ijedne vidljive
promene ponašanja.

1. Napravi `lib/sidebar-contexts.ts` sa jedinim izvorom istine za kontekste sidebara.
   Za sada registruj SAMO dva: `home` i `studio`. (`classroom`, `community`, `admin` dolaze u
   narednim fazama — ne piši ih unapred, `AGENTS.md` pravilo 2.)

   Tip:
   - `SidebarContextId`
   - `SidebarSection` — `id`, `labelSr`, `labelEn`, `icon`, `href(locale, params)`,
     `isActive(pathname, searchParams)`, opciono `badgeKey`, `staffOnly`, `adminOnly`
   - `SidebarContext` — `id`, `matches: readonly string[]` (path prefiksi bez locale-a),
     `rootHref(locale)`, `labelSr`, `labelEn`, `icon`, `sections`
   - `resolveSidebarContext(pathname): SidebarContext` — prvi prefiks koji se poklopi; fallback `home`
   - `sectionsFor(context, { isStaff, isAdmin })`
   - `activeSectionId(context, pathname, searchParams)`

   `studio` kontekst mora da se popuni iz postojećeg `lib/studio-sections.ts` — NE prepisuj te
   labele, importuj ih. Isto pravilo važi u kasnijim fazama za `lib/community-sections.ts`.

2. Napravi `lib/sidebar-contexts.test.ts` (vitest, prati stil `lib/community-sections.test.ts`):
   - `/sr/app` → home, `/sr/app/studio` → studio, `/sr/app/studio/m/abc` → studio
   - `/en/app/studio?kind=video` → aktivna sekcija `videos`
   - nepoznat `?kind=` pada na `all`
   - nepoznata putanja pod `/app` → home
   - `staffOnly` sekcije se filtriraju za ne-staff

3. Preimenuj `components/app/app-sidebar-studio.tsx` → `components/app/app-sidebar-context.tsx` i
   generalizuj:
   - `SidebarNavSwap` ostaje BAJT-ZA-BAJT isti (motion kontrakt, `popLayout`, `compact`,
     `reducedMotion`) — samo se seli u novi fajl
   - `StudioSidebarNav` → `ContextSidebarNav({ locale, context, activeId, onBack, reduce, isStaff, isAdmin })`
   - `StudioSidebarRail` → `ContextSidebarRail({ ... })`
   - obe komponente renderuju `context.sections` umesto hardkodovanih Studio sekcija; naslov grupe
     ("Biblioteka") postaje polje konteksta
   - „Nazad" red/ikona ostaje identičan (ista `BACK_ROW` klasa, isti `ChevronLeft`)

4. U `components/app/app-sidebar.tsx`:
   - zameni `const studioActive = ...` sa `const context = resolveSidebarContext(pathname)`
   - `SidebarNavSwap active={context.id !== "home"}`
   - `studio={...}` slot postaje `context={<ContextSidebarNav context={context} ... />}`
   - `studioActive` se i dalje računa gde je potreban za highlight NavLink-a — izvedi ga iz
     `context.id === "studio"`, ne iz novog pathname poređenja
   - isto uradi u rail grani (`compact`)
   - `goBackFromStudio` preimenuj u `goBackFromContext`, logika ista

OGRANIČENJA:
- Nula promena u izgledu, animacijama, timing-u i ARIA atributima. Ovo je čisti refaktor.
- Ne diraj `LearningSwitcher`, `AppBottomNav`, cookie/resize logiku, profil karticu.
- Ne dodaj nove kontekste, ne dodaj konfiguraciju koja se ne koristi.
- Prati postojeći stil fajla (srpski komentari u sidebar fajlovima, engleski u `lib/`).

VERIFIKACIJA (uradi je sam, pre nego što javiš da si gotov):
1. `npx tsc --noEmit` — čisto
2. `npm run lint` — čisto
3. `npm run test` — svi prolaze, uključujući nove
4. `npm run build` — prolazi
5. `grep -rn "app-sidebar-studio" --include=*.tsx --include=*.ts .` — nula pogodaka van git istorije
6. Ručno: `/sr/app/studio` prikazuje studijski sadržaj sidebara sa istim prelazom; „Nazad" vraća na
   `/sr/app`; skupljen sidebar (rail) radi isto; `prefers-reduced-motion` gasi klizanje

Ako neka od ovih provera padne, ne javljaj da si gotov — popravi pa ponovi ceo niz.
````

---

# PROMPT 3 — Učionica: rute, hub, kontekst

> **Model:** Fable · **Effort:** xhigh · **Mode:** Plan / Goal
> Najveća i najrizičnija faza. Traži plan pre izvršenja jer dira 13+ fajlova sa literalnim putanjama.

````text
Pročitaj `AGENTS.md`, `docs/IA-REDESIGN-PLAN.md` i sekciju A tog plana (audit literala
`/app/courses` i `/app/tracks`) pre početka. Pre pisanja Next.js koda pročitaj relevantne guide-ove
u `node_modules/next/dist/docs/`.

CILJ: uvesti sekciju „Učionica" — sve oko smerova, kurseva i lekcija dobija svoj prostor i svoj
sidebar kontekst, i nestaje iz globalne navigacije.

KORAK 1 — Seljenje ruta (mehanički, uradi ga prvo i izoluj u jedan commit)

Premesti (git mv, ne copy-paste):
  app/[locale]/app/tracks/[trackSlug]/                    → app/[locale]/app/classroom/tracks/[trackSlug]/
  app/[locale]/app/courses/[courseSlug]/                  → app/[locale]/app/classroom/courses/[courseSlug]/
  (uključujući ugnježdene lessons/[lessonSlug] i .../edit)

Ažuriraj `lib/app-routes.ts`:
  trackPath  → /app/classroom/tracks/${trackSlug}
  coursePath → /app/classroom/courses/${courseSlug}
  lessonPath → /app/classroom/courses/${courseSlug}/lessons/${lessonSlug}
Dodaj `classroomPath(locale)` → `/app/classroom` i `lessonEditPath(locale, c, l)`.
Ažuriraj `lib/app-routes.test.ts` da očekuje nove stringove.

Na starim putanjama ostavi tanke redirect stubove koji rade 307 (`redirect()` iz `next/navigation`)
i prenose SVE search-param-e. Za očuvanje param-a iskoristi postojeću logiku iz
`legacyCourseRedirect` — izdvoji je u helper ako treba, nemoj pisati drugu implementaciju.
Razlog za 307 a ne 308: `/app/**` je robots-disallowed pa nema SEO argumenta, a 308 browser kešira
trajno. Zapiši taj razlog kao komentar, u stilu postojećeg komentara u `app/[locale]/app/page.tsx`.

Zameni SVE preostale hardkodovane literale pozivima builder-a iz `lib/app-routes.ts` u:
  lib/stripe.ts (2 mesta: success_url i cancel_url za kurs)
  lib/stripe.test.ts
  lib/motion-contract.ts (courseDetailPattern + lesson focus regex → nove putanje)
  lib/motion-contract.test.ts
  components/app/admin-inline-actions.tsx (6 router.push/replace)
  components/app/course-lab.tsx, course-player.tsx, lesson-steps-editor.tsx
  app/[locale]/(marketing)/courses/[courseSlug]/page.tsx
  interni redirect-i unutar preseljenih lesson stranica (uključujući `?next=` u sign-in redirect-u)

Uslov: posle ovog koraka `grep -rn "/app/courses\|/app/tracks" --include=*.ts --include=*.tsx .`
(bez node_modules/.next/_to_delete/convex/_generated) vraća pogotke SAMO u redirect stubovima i
u komentarima koji objašnjavaju seljenje.

KORAK 2 — Hub stranica `/app/classroom`

Novi `app/[locale]/app/classroom/page.tsx` + `components/app/classroom-hub.tsx`.
Sadržaj (koristi POSTOJEĆE komponente gde god možeš — `DashboardCourseCard`, `CourseCover`,
`CourseProgress`, `getProgressSummary` iz `dashboard-content.tsx`; izdvoji ih u zajednički modul
ako je import u oba smera problem):
  1. Hero „Nastavi gde si stao": cover + naziv kursa + „Lekcija N/M" + primarno dugme
  2. „Smerovi": kartice smerova sa brojem kurseva i progresom (podaci: `getAppNavigation` već nosi
     trackId/trackSlug/trackTitle po kursu — grupiši po smeru, ne pravi novi query)
  3. „Kursevi": postojeći `DashboardCourseCard` grid + filter Svi / U toku / Završeni / Zaključani
  4. „Nastavlja se": sledećih 5 lekcija kroz sve dostupne kurseve, sa trajanjem

Metadata preko `appPageMetadata(locale, { sr: "Učionica", en: "Classroom" })`.
Prazno stanje: iskoristi postojeći `DashboardFirstRun` obrazac, ne izmišljaj nov.

KORAK 3 — Sidebar kontekst `classroom`

U `lib/sidebar-contexts.ts` dodaj kontekst:
  id: "classroom"
  matches: ["/app/classroom"]
  sections: Pregled (/app/classroom), Smerovi, Kursevi, + uslovno „Smer · X" i „Kurs · Y"
  kad ih pathname params daju

U `components/app/app-sidebar.tsx`:
  - iz `home` grane UKLONI: NavLink „Smer · X", NavLink „Kurs · Y" i `LearningSwitcher`
  - u `home` granu DODAJ jedan NavLink: „Učionica" (ikona `GraduationCap`, href `/app/classroom`),
    pozicioniran odmah ispod Dashboard-a
  - `LearningSwitcher` premesti u `classroom` granu konteksta — komponentu NE prepisuj, samo je
    renderuj iznad sekcija tog konteksta
  - rail grana: ista promena (jedan `RailAction` „Učionica" umesto smer/kurs para)
  - `AppBottomNav`: slot „Kurs"/„Kursevi" postaje „Učionica" → `/app/classroom`. I dalje tačno
    četiri slota — komentar u kodu zabranjuje peti i taj razlog i dalje važi.

OGRANIČENJA:
- Ne redizajniraj stranice kurseva, smerova i lekcija. One se sele, ne menjaju.
- Ne diraj marketinške `(marketing)/courses/**` rute.
- Ne diraj Dashboard (`/app`) u ovoj fazi — on ide u fazi 6.
- Ne uvodi nove radius vrednosti; drži se 16 / 12 / 8 / pill iz `AGENTS.md`.

VERIFIKACIJA:
1. `npx tsc --noEmit && npm run lint && npm run test && npm run build`
2. Grep uslov iz Koraka 1
3. Ručno prođi: `/sr/app/tracks/<slug>` → 307 → `/sr/app/classroom/tracks/<slug>`
4. `/sr/app/courses/<slug>?checkout=success` → 307 → nova putanja SA očuvanim `?checkout=success`
5. Stripe: `lib/stripe.test.ts` potvrđuje nov `success_url`
6. Sidebar: na `/sr/app/classroom/**` se prikazuje classroom kontekst sa `LearningSwitcher`-om;
   „Nazad" vraća na `/sr/app`
7. Motion: detalj kursa i dalje dobija `showcase` varijantu, lekcija `focus` (`motion-contract.test.ts`)
````

---

# PROMPT 4 — Zajednica: sidebar kontekst umesto in-page navigacije

> **Model:** Fable · **Effort:** high · **Mode:** Auto
> Dobro ograničeno, nezavisno od Prompta 5 — može paralelno na zasebnoj grani.

````text
Pročitaj `AGENTS.md` i `docs/IA-REDESIGN-PLAN.md`.

CILJ: sekcije zajednice žive u sidebar kontekstu; in-page sekcijska navigacija nestaje.

1. `lib/sidebar-contexts.ts`: dodaj kontekst `community`
   - `matches: ["/app/community"]`
   - sekcije se popunjavaju IZ `lib/community-sections.ts` (`communitySectionsFor`,
     `communitySectionLabel`, `activeCommunitySection`) — ne prepisuj labele
   - href builder mora da očuva iste search-param-e koje danas čuva
     `navHref` u `community-shell.tsx`: `scope`, `track`, `course`, `q`, `sort`
   - `badgeKey` se prenosi kako jeste (`myThreads`, `community`, `pendingApprovals`)

2. `components/app/community-v2/community-shell.tsx` — ukloni:
   - `<nav aria-label="Sekcije zajednice">` (desktop grid + animirani indikator)
   - mobilni „Sve sekcije" bottom sheet i sav njegov state/efekte
     (`mobileMenuOpen`, `menuButtonRef`, `closeButtonRef`, overflow lock, keydown handler)
   - `CommunityNavLink`, `NavBadge`, `navItems`, `activeNavWidth`, `activeNavTransform`, `navHref`
   - importe koji su TIME postali neiskorišćeni (i samo njih — `AGENTS.md` pravilo 3)

   ZADRŽI: hero sa `COMMUNITY_HERO_COPY` (ostaje section-aware, i dalje mu treba
   `activeCommunitySection`), `data-community-toolbar-target` region u koji
   `community-sticky-toolbar.tsx` portalira filtere, profile-incomplete banner, `{children}`.
   Ako posle uklanjanja `SmartStickyRegion` ostaje samo toolbar, zadrži ga — filteri jesu sticky
   po dizajnu; samo proveri da `empty:hidden` i dalje radi kad toolbara nema.

3. Sidebar badge-evi: `useQuery(api.notifications.getUserNotificationSummary)` već postoji u
   `LiveAppSidebar`. Poveži ga sa `badgeKey`-evima sekcija zajednice tako da badge stoji na
   sekciji, ne samo na roditeljskom redu. Ne uvodi nov query.

4. `components/app/app-sidebar.tsx`: iz `home` grane ukloni `CommunitySections` disclosure
   (ugnježdena grupa). Ostaje jedan NavLink „Zajednica" koji vodi na
   `/app/community/discussions` (uz postojeći scope-po-kursu ako kurs postoji) — a sekcije se
   prikažu tek kad se uđe u kontekst.

5. `AppBottomNav`: kad je `resolveSidebarContext(pathname).id !== "home"`, treći slot postaje
   dugme „Sekcije" koje otvara drawer (`setMobileOpen(true)`) umesto linka. Ostaje tačno četiri
   slota; Poruke zadržavaju badge.

VERIFIKACIJA:
1. `npx tsc --noEmit && npm run lint && npm run test && npm run build`
2. `grep -rn "CommunityNavLink\|Sve sekcije\|Sekcije zajednice" components/` → pogodak samo u
   sidebar kontekst kodu
3. Ručno: `/sr/app/community/discussions` — sidebar pokazuje 6 sekcija (7 za staff), aktivna je
   označena, badge-evi rade; filteri (scope/track/course/q/sort) preživljavaju klik na drugu sekciju
4. Mobilni: sekcije su dostupne kroz drawer; nema više dupla navigacija u telu stranice
5. Post detalj (`/app/community/<id>`) i dalje označava „Diskusije" kao aktivnu sekciju
````

---

# PROMPT 5 — Admin: tabovi postaju rute

> **Model:** Fable · **Effort:** high · **Mode:** Goal

````text
Pročitaj `AGENTS.md` i `docs/IA-REDESIGN-PLAN.md`.

CILJ: admin panel dobija isti tip sidebara kao Studio i Učionica; interni tab bar nestaje.

1. Nove rute (svaka sa sopstvenim admin gate-om — `profile?.role !== "admin"` → `redirect`):
     app/[locale]/app/admin/content/page.tsx
     app/[locale]/app/admin/users/page.tsx
     app/[locale]/app/admin/growth/page.tsx
     app/[locale]/app/admin/analytics/page.tsx
   `app/[locale]/app/admin/page.tsx` postaje 307 redirect na `/app/admin/content`.
   Gate se NE sme oslanjati samo na roditeljsku rutu.

2. `components/app/admin-content-manager.tsx`:
   - izdvoji sadržaj svakog taba u zasebnu komponentu (`AdminContentPanel`, `AdminUsersPanel`,
     `AdminGrowthPanel`, `AdminAnalyticsPanel`) — sadržaj kopiraj doslovno, bez „poboljšanja"
   - obriši `useState<"content"|"users"|"growth"|"analytics">`, `tabs` niz, tab bar i
     `motion.span layoutId="admin-tab-indicator"`
   - `users` / `growth` / `analytics` ostaju `FutureModule` placeholder-i sa istim tekstom.
     NE izmišljaj podatke — postojeći copy izričito kaže da će moduli doći tek sa stvarnim izvorom.
   - `content` panel zadržava live preview sekciju i `contentReadiness` blok netaknute

3. `lib/sidebar-contexts.ts`: dodaj kontekst `admin`
   - `matches: ["/app/admin"]`, `adminOnly` na nivou konteksta
   - sekcije: Sadržaj, Korisnici, Rast, Analitika, Chat sigurnost (`/app/admin/chat`, `staffOnly`),
     Studio admin (`/app/admin/studio`)
   - labele dvojezične po istom obrascu kao ostali kontekst fajlovi

4. Sidebar `home` grana: „Admin panel" i „Chat sigurnost" ostaju kao ulazi (isti uslovi
   `isAdmin` / `isStaff`), ali „Admin panel" sada vodi na `/app/admin/content`.

VERIFIKACIJA:
1. `npx tsc --noEmit && npm run lint && npm run test && npm run build`
2. Ne-admin nalog na `/sr/app/admin/users` → redirect na `/sr/app` (proveri SVAKU novu rutu)
3. `/sr/app/admin` → 307 → `/sr/app/admin/content`
4. `grep -rn "admin-tab-indicator" .` → nula pogodaka
5. Ručno: sve četiri sekcije + Chat sigurnost + Studio admin su dostupne iz sidebara; upload
   kurseva/modula/lekcija i live preview u „Sadržaj" rade kao pre
````

---

# PROMPT 6 — Convex `getDashboardOverview`

> **Model:** Fable · **Effort:** high · **Mode:** Goal
> Backend pre UI-a: ovaj prompt definiše oblik podataka koji Prompt 7 samo renderuje.

````text
OBAVEZNO prvo pročitaj `convex/_generated/ai/guidelines.md` — ta pravila nadjačavaju sve što misliš
da znaš o Convex-u. Zatim `AGENTS.md` i `docs/IA-REDESIGN-PLAN.md` (sekcija D).

CILJ: jedan query koji hrani ceo novi Dashboard, umesto sedam nezavisnih subscription-a.

1. Novi `convex/dashboard.ts` sa `export const getDashboardOverview = query({...})`.
   Args: `{}`. Vraća `null` za neautentifikovanog korisnika.

   Oblik povratne vrednosti (drži se ga doslovno — Prompt 7 renderuje tačno ovo):
   {
     resume: { courseSlug, lessonSlug, courseTitle, lessonTitle, position, total, coverUrl } | null,
     progress: { completedLessons, totalLessons, percent },
     nextLessons: [{ courseSlug, lessonSlug, title, durationSeconds }],        // max 3
     messages: { unreadTotal, items: [{ conversationId, title, snippet, at, avatarUrl }] },  // max 3
     community: { unreadNotifications, items: [{ postId, title, author, replies, at }] },    // max 3
     notifications: { total, items: [{ kind, title, at, href }] },                            // max 3
     studio: { creditsBalance, items: [{ jobId, kind, thumbUrl, at }] },                      // max 3
     study: { pendingInvites, partners },
     leaderboard: { rank, points } | null,
     admin: { pendingApprovals, readiness } | null,   // null kad viewer nije admin
   }

2. Kompozicija ide preko POSTOJEĆIH core helper-a, ne novih upita nad tabelama:
   `chatInboxSummaryCore`, `notifications` summary, `community.listPostsPage` (prva strana, limit 3),
   `studio.listMyJobs`, `credits.getBalance`, `leaderboardCore`, `studyHubSummaryCore`,
   `contentReadiness`, `courses.getStudentDashboard`.
   Ako neki od njih nema izdvojenu čistu funkciju, izdvoj je u `*Core.ts` fajl po postojećem
   obrascu repoa (`chatInboxSummaryCore.ts`, `studyHubSummaryCore.ts` su modeli) i pokrij testom.

3. Tvrda pravila:
   - svaka lista je ograničena na 3 stavke NA STRANI SERVERA (`.take(3)`), ne u UI-u
   - `admin` grana se računa samo kad je `role === "admin"` — ne šalji je pa filtriraj u klijentu
   - nema `collect()` nad neograničenim tabelama; poštuj indekse iz `convex/schema.ts`
   - snippet poruke se skraćuje na serveru (npr. 120 karaktera), da payload bude predvidiv
   - query mora da preživi prazno stanje na svakom polju bez bacanja greške

4. Testovi u `convex/dashboard.test.ts` (convex-test, prati stil `convex/chat.test.ts`):
   - neautentifikovan → `null`
   - korisnik bez ičega → sve liste prazne, `progress.percent === 0`, `admin === null`
   - korisnik sa 5 nepročitanih konverzacija → `unreadTotal === 5`, `items.length === 3`
   - ne-admin nikad ne dobija `admin` granu
   - admin dobija `pendingApprovals` broj

VERIFIKACIJA:
1. `npx convex codegen` pa `npx tsc --noEmit`
2. `npm run test` — uključujući nove Convex testove
3. `npm run lint && npm run build`
4. Prijavi u odgovoru koliko upita nad bazom query izvršava po pozivu i koji su indeksi korišćeni
````

---

# PROMPT 7 — Redizajn Dashboarda u komandnu tablu

> **Model:** Fable · **Effort:** xhigh · **Mode:** Plan / Goal
> Jedina faza gde se OČEKUJE vizuelna promena. Pusti je tek kad su faze 2-6 zelene.

````text
Pročitaj `AGENTS.md` (posebno sekciju „UI shape convention" — četiri dozvoljene radius vrednosti) i
`docs/IA-REDESIGN-PLAN.md`. Podaci dolaze iz `api.dashboard.getDashboardOverview` (faza 6).

CILJ: `/app` prestaje da bude „kursevi + progres" i postaje komandna tabla — svaki blok je prozor
u jednu drugu stranicu, sa 1-3 konkretne stavke odatle i tačno jednim dugmetom koje vodi tamo.

STRUKTURA (redom, odozgo):

A) NASTAVI — hero. Zadrži postojeći `DashboardHomeContent` hero obrazac: cover, naziv kursa,
   „Sledeća lekcija", dugme „Nastavi lekciju N/M", i ink panel sa ukupnim procentom.
   Dodaj sekundarni link „Otvori učionicu" → `/app/classroom`.

B) PULS — red od 4 kompaktna tile-a, svaki je link:
   Krediti (`/app/credits`) · Nepročitane poruke (`/app/messages`) ·
   Obaveštenja (`/app/community/notifications`) · Rang (`/app/community/leaderboard`)
   Svaki tile: velika brojka + labela + ikona. Bez grafika.

C) PROZORI — grid 1 kolona / 2 (lg) / 3 (2xl). Fiksan redosled:
   1. Učionica       3 sledeće lekcije (naziv + trajanje)     → „Otvori učionicu"
   2. Poruke         3 nepročitane konverzacije (avatar, ime, snippet, vreme) → „Otvori poruke"
   3. Zajednica      3 nove teme (naslov, autor, br. odgovora) → „Otvori zajednicu"
   4. Obaveštenja    3 najnovija događaja                      → „Sva obaveštenja"
   5. Studio         3 poslednja generisanja (thumbnail)       → „Otvori Studio"
   6. Uči zajedno    pozivnice / aktivni partneri              → „Otvori Study hub"
   7. Admin          spremnost sadržaja + broj na čekanju      → „Otvori admin" (SAMO role === "admin")

D) RITAM — postojeći `ActivityPanel` (30/90 dana), netaknut, puna širina.

JEDNA KOMPONENTA ZA SVE PROZORE — `DashboardWindow` u novom
`components/app/dashboard-windows.tsx`:
  props: `{ eyebrow, title, badge?, items, emptyMessage, ctaLabel, ctaHref, icon }`
  layout: header (eyebrow uppercase muted + badge desno) → naslov → do 3 reda stavki →
  footer sa jednim primarnim linkom.

TVRDA PRAVILA (ovo su acceptance kriterijumi, ne sugestije):
1. Najviše 3 stavke po prozoru. Prozor je mamac, ne lista.
2. Tačno jedan primarni CTA po prozoru. Stavke smeju biti linkovi, ali dugme je jedno.
3. Prazan prozor renderuje svoju poruku + isti CTA. NE nestaje — pozicija u gridu je mišićna
   memorija.
4. Fiksan redosled prozora. Bez preslagivanja po broju signala; signal je badge/žuta tačka.
5. Nikad izmišljeni podaci. Query nije stigao → skeleton; vratio prazno → prazno stanje.
6. Admin prozor se ne renderuje uopšte za ne-admine (ne skrivanje CSS-om).
7. Radius: kartica `rounded-[16px]`, unutrašnji panel `12px`, thumbnail `8px`, badge `rounded-full`.
   Ne uvodi nove vrednosti i ne koristi `!` ni inline `borderRadius` — `AGENTS.md` objašnjava zašto.
8. Sve stringove piši dvojezično po postojećem `tr(locale, sr, en)` / `localized()` obrascu.

TEHNIČKI:
- `components/app/dashboard-live.tsx` zameni sedam potencijalnih `useQuery` poziva jednim
  `useQuery(api.dashboard.getDashboardOverview, isAuthenticated ? {} : "skip")`.
- `hasConvex === false` fallback mora da radi: statički Dashboard prikazuje samo zone A i C-prozor-1
  iz `lib/content.ts`, ostali prozori prikazuju prazna stanja. Ne rušiti build bez Convex-a.
- Skeleton: proširi postojeći `DashboardHomeSkeleton` da pokriva nov raspored.
- `DashboardFirstRun` (korisnik bez ijednog dostupnog kursa) i dalje ima prednost nad svime.
- Motion: koristi postojeći `data-motion` obrazac (`hero`, `copy`) i `pageMotionContract`;
  ne uvodi novu animacionu biblioteku ni nove trajanja.

ŠTA SE NE DIRA:
- `ActivityPanel`, `DashboardCourseCard`, `CourseCover`, `CourseProgress`, `getProgressSummary` —
  koriste se, ne prepisuju.
- Sidebar, Učionica, Zajednica, Admin — završeni u prethodnim fazama.

VERIFIKACIJA:
1. `npx tsc --noEmit && npm run lint && npm run test && npm run build`
2. Ručno, četiri naloga: nov korisnik (sve prazno), korisnik sa aktivnošću, staff, admin
3. Prazna stanja: nijedan prozor ne nestaje, svaki ima CTA
4. Responsivno: 1 / 2 / 3 kolone; nema horizontalnog skrola na 360px širine
5. Tastatura: tab kroz stranicu prolazi kroz prozore redom, svaki CTA je fokusabilan sa vidljivim
   focus ring-om
6. `prefers-reduced-motion`: bez ulaznih animacija
7. Dark mode: svi prozori čitljivi (proveri `bg-paper-strong` / `text-muted` parove)
````

---

## 8. Kontrolna lista pre svakog merge-a

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
grep -rn "/app/courses\|/app/tracks" --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v "\.next" | grep -v _to_delete | grep -v _generated
```

Poslednja komanda posle faze 3 sme da vrati samo redirect stubove i komentare.
