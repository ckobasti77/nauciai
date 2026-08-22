# Nauči AI — IA redizajn: plan implementacije i audit

Prateći dokument uz `docs/IA-REDESIGN-PROMPTS.md`. Ovde je **plan + auditi (A–E)**; tamo su
copy-paste promptovi. Ako se dva dokumenta razilaze u činjenici, ovaj je merodavniji jer je izveden
iz čitanja koda, a ne iz pretpostavke.

## Kontekst — zašto se ovo radi

Danas cela autentifikovana aplikacija visi na jednom sidebar-u koji **hardkodovano** zna samo dve
stvari: „classic" i „studio" (`components/app/app-sidebar.tsx` + `SidebarNavSwap`). Posledice:

- **Drift labela.** Iste sekcije zajednice pišu se na dva mesta; komentar u
  `lib/community-sections.ts` to izričito kaže („duplicating six labels across two files is how the
  two navs drift apart"). Sa 5 konteksta × 2 potrošača (pun sidebar + rail) bilo bi 10 mesta za drift.
- **Kursevi/smerovi/lekcije nemaju svoj prostor.** Žive direktno pod `/app/courses` i `/app/tracks`,
  a u sidebar-u kao uslovni redovi „Smer · X / Kurs · Y" nakačeni na trenutni kurs.
- **Dashboard (`/app`) je „kursevi + progres".** Jedini Convex poziv koji radi je
  `courses.getAppNavigation`. Ne pokazuje poruke, zajednicu, kredite, leaderboard.
- **Admin i zajednica imaju in-page navigaciju** (admin tab bar, community sticky grid) koja
  duplira ono što bi sidebar trebalo da radi.

Cilj: **registry konteksta** kao jedini izvor istine za sidebar, **Učionica** kao mesto za sve što
se uči, i **Dashboard kao komandna tabla** koju hrani jedan agregatni Convex query. Krajnji ishod:
`app-sidebar.tsx` prestaje da zna imena sekcija; svaka sekcija aplikacije ima dosledan kontekst;
početni ekran odgovara na „šta se dešava", a ne samo „koji su mi kursevi".

## Odnos prema 6-prompt dekompoziciji

Brief traži **3 faze**. `IA-REDESIGN-PROMPTS.md` ih deli na 6 promptova radi izvršenja. Mapiranje:

| Faza (ovaj plan) | Promptovi | Priroda |
| --- | --- | --- |
| **Faza 1** — Registry + zajednica + admin | PROMPT 2 (registry), 4 (zajednica), 5 (admin) | 1a je čist refaktor (0 vizuelnih promena); 1b/1c menjaju ponašanje |
| **Faza 2** — Učionica | PROMPT 3 | Seljenje ruta + nova hub stranica + classroom kontekst |
| **Faza 3** — Dashboard | PROMPT 6 (Convex agregat), 7 (redizajn UI) | Backend pre UI-a; jedina faza sa očekivanom vizuelnom promenom |

Redosled unutar Faze 1 je obavezan: **1a registry (home+studio) → 1b zajednica → 1c admin.**
1b i 1c su međusobno nezavisni (mogu paralelno na dve grane), ali oba zavise od 1a.

## Napomena o polaznom stanju (radno stablo)

Radno stablo je usred Studio rada: ~25 izmenjenih fajlova (M) + ~10 novih neregistrovanih (`??`),
uključujući `components/app/app-sidebar-studio.tsx` (koji Faza 1 preimenuje). **Pre početka Faze 1
napraviti commit tog Studio rada** da bi `git mv` i dijagnostika bili čisti i da bi rollback po fazi
imao jasnu tačku vraćanja. Ovaj plan pretpostavlja čist baseline na `main`.

---

# FAZA 1 — Registry sidebar konteksta (+ zajednica + admin na njega)

**Centralna ideja.** `SidebarNavSwap` je već pravi mehanizam (usmeren prelaz, `AnimatePresence
mode="popLayout"`, `compact` rail varijanta, `reducedMotion` fast-path). Problem je samo što ga
`app-sidebar.tsx` vozi jednim boolean-om `studioActive`. Rešenje **nije** novi sidebar po stranici,
nego **registry** koji vraća kontekst iz pathname-a, pa swap dobija N konteksta umesto 2.

### 1a — Registry (home + studio); čist refaktor, 0 vizuelnih promena

**NOVI**
| Fajl | Zašto |
| --- | --- |
| `lib/sidebar-contexts.ts` | Jedini izvor istine za kontekste. Za sada SAMO `home` i `studio`. `studio` se popunjava iz `lib/studio-sections.ts` (import, ne prepis). |
| `lib/sidebar-contexts.test.ts` | vitest, po uzoru na `lib/studio-sections`/`community-sections` testove: resolve po pathname-u, aktivna sekcija po `?kind=`, `staffOnly` filter, fallback `home`. |

**IZMENJEN**
| Fajl | Zašto |
| --- | --- |
| `components/app/app-sidebar-studio.tsx` → **git mv** → `components/app/app-sidebar-context.tsx` | `SidebarNavSwap` ostaje **bajt-za-bajt** (motion kontrakt netaknut); `StudioSidebarNav`→`ContextSidebarNav`, `StudioSidebarRail`→`ContextSidebarRail`, koje renderuju `context.sections` umesto hardkodovanih Studio sekcija; naslov grupe („Biblioteka") postaje polje konteksta; „Nazad" red (`BACK_ROW` + `ChevronLeft`) identičan. `FiltersDivider`/`RailFilters` ostaju vezani za studio kontekst (studio-specifičan dodatak, vidi Audit B). |
| `components/app/app-sidebar.tsx` | `const studioActive = …` → `const context = resolveSidebarContext(pathname)`; `SidebarNavSwap active={context.id !== "home"}`; `studio={…}` slot → `context={<ContextSidebarNav context={context} …/>}`; isto u rail grani; `studioActive` za highlight NavLink-a izvesti iz `context.id === "studio"`; `goBackFromStudio`→`goBackFromContext` (logika ista). |

**OBRISAN**
| Fajl | Zašto |
| --- | --- |
| — | Ništa se ne briše u 1a (samo preimenovanje git mv-om). |

### 1b — Zajednica na registry (uklanjanje in-page navigacije)

**IZMENJEN**
| Fajl | Zašto |
| --- | --- |
| `lib/sidebar-contexts.ts` | Dodati kontekst `community`, popunjen iz `lib/community-sections.ts` (`communitySectionsFor`, `communitySectionLabel`, `activeCommunitySection`). Href builder **mora da očuva** `scope/track/course/q/sort` (danas ih sidebar-ova community grana ISPUŠTA — `app-sidebar.tsx:828` — a community-jeva sopstvena nav ih čuva; ovo je namerno poravnanje na bolje ponašanje). `badgeKey` se prenosi kako jeste. |
| `components/app/community-v2/community-shell.tsx` | Ukloniti in-page sekcijsku nav: `<nav aria-label="Sekcije zajednice">` (desktop grid + animirani indikator), mobilni „Sve sekcije" bottom sheet i sav njegov state/efekte (`mobileMenuOpen`, refove, overflow lock, keydown), `CommunityNavLink`, `NavBadge`, `navItems`, `activeNavWidth`, `activeNavTransform`, `navHref`, i TIME osirotele importe (samo njih — `AGENTS.md` pravilo 3). **Zadržati**: hero (`COMMUNITY_HERO_COPY`, section-aware — i dalje mu treba `activeCommunitySection`), `data-community-toolbar-target` region, profile-incomplete banner, `{children}`. |
| `components/app/app-sidebar.tsx` | Iz `home` grane ukloniti `CommunitySections` disclosure; ostaje jedan NavLink „Zajednica" → `/app/community/discussions` (uz postojeći scope-po-kursu). Sekcije se prikazuju tek ulaskom u `community` kontekst. Sidebar badge-evi: `useQuery(api.notifications.getUserNotificationSummary)` već postoji u `LiveAppSidebar` — vezati ga za `badgeKey`-eve sekcija; ne uvoditi nov query. |
| `AppBottomNav` (unutar `components/app/app-sidebar.tsx`, `:1025–1147`) | Kad je `resolveSidebarContext(pathname).id !== "home"`, treći slot postaje dugme „Sekcije" koje otvara drawer (`setMobileOpen(true)`) umesto linka. **Tačno četiri slota** — komentar u kodu zabranjuje peti; taj razlog i dalje važi (badge na Porukama). |

**OBRISAN**: ništa kao fajl; briše se blok in-page nav-a **unutar** `community-shell.tsx`.

> **Ovo NIJE čist no-op.** Sidebar-ove community sekcije dobijaju očuvanje param-a i per-sekciju
> badge koje danas nemaju. To je namerno; uslov uspeha 1b nije „izgleda identično" nego „sekcije rade
> iz sidebar-a i param-i preživljavaju".

### 1c — Admin na registry (tabovi → rute)

**NOVI**
| Fajl | Zašto |
| --- | --- |
| `app/[locale]/app/admin/content/page.tsx` | Bivši `content` tab kao ruta; admin gate na SVAKOJ ruti. |
| `app/[locale]/app/admin/users/page.tsx` | Bivši `users` tab (ostaje `FutureModule` placeholder, bez izmišljanja podataka). |
| `app/[locale]/app/admin/growth/page.tsx` | Bivši `growth` tab (placeholder). |
| `app/[locale]/app/admin/analytics/page.tsx` | Bivši `analytics` tab (placeholder). |

**IZMENJEN**
| Fajl | Zašto |
| --- | --- |
| `app/[locale]/app/admin/page.tsx` | Postaje 307 redirect na `/app/admin/content`. |
| `components/app/admin-content-manager.tsx` | Sadržaj svakog taba izdvojiti u zasebnu komponentu (`AdminContentPanel`/`AdminUsersPanel`/`AdminGrowthPanel`/`AdminAnalyticsPanel`) — **kopirati doslovno**, bez „poboljšanja"; `content` panel zadržava live preview + `contentReadiness` netaknut. Obrisati `useState<"content"\|"users"\|"growth"\|"analytics">`, `tabs` niz, tab bar i `motion.span layoutId="admin-tab-indicator"` (indikator sad nosi sidebar). |
| `lib/sidebar-contexts.ts` | Dodati kontekst `admin` (`matches:["/app/admin"]`, `adminOnly` na nivou konteksta): Sadržaj, Korisnici, Rast, Analitika, Chat sigurnost (`/app/admin/chat`, `staffOnly`), Studio admin (`/app/admin/studio`). |
| `components/app/app-sidebar.tsx` | „Admin panel" u `home` grani sada vodi na `/app/admin/content` (uslovi `isAdmin`/`isStaff` ostaju). |

**OBRISAN**: ništa kao fajl; briše se tab bar + indikator unutar `admin-content-manager.tsx`.

### Šta se u Fazi 1 NE dira (i zašto)

| Entitet | Zašto ostaje netaknut |
| --- | --- |
| `SidebarNavSwap` | Implementacija bajt-za-bajt; menja se samo KO ga poziva i ČIME (registry umesto boolean-a). Fajl se samo preimenuje (`git mv`). |
| `studioMotionTokens` (`lib/studio-motion.ts`) | Timing/easing kontrakt prelaza. Registry koristi iste tokene; ništa se ne dodaje ni menja. |
| `LearningSwitcher` (`app-sidebar.tsx:313–659`) | Ne seli se u Fazi 1 (seli se u Fazi 2, i tada se NE prepisuje). |
| Cookie/resize logika | `persistSidebarPreferences`/`toggleSidebar`/`startSidebarResize`/`handleResizeKeyDown` + `lib/app-sidebar-preferences.ts`. Ortogonalno kontekstu. |
| Profil kartica (`1639–1756`, `1759–1814`, `1899–1942`) + `SidebarRoleBadge` | Deo ljuske, ne konteksta. |
| `community-sticky-toolbar.tsx` | Portal filtera u `data-community-toolbar-target`; nije navigacija. |
| `ActivityPanel` (`dashboard-content.tsx:680`) | Dashboard leaf; dira se tek u Fazi 3 i to samo pozicijom, ne kodom. |

### Uslovi uspeha (komanda, ne mišljenje)

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
grep -rn "app-sidebar-studio" --include=*.ts --include=*.tsx . | grep -v _generated   # 0 pogodaka
grep -rn "admin-tab-indicator" --include=*.ts --include=*.tsx .                        # 0 pogodaka
grep -rn "CommunityNavLink\|Sekcije zajednice" components/                             # samo kontekst kod
```
Ručno (dev server :3000, ulogovani Chrome — vidi „Verifikacija"):
- `/sr/app/studio` — studijski sadržaj sidebara sa istim prelazom; „Nazad" → `/sr/app`; rail radi isto; `prefers-reduced-motion` gasi klizanje. (1a: identično kao pre.)
- `/sr/app/community/discussions` — sidebar prikazuje 6 sekcija (7 za staff), aktivna označena, badge-evi rade, `scope/track/course/q/sort` preživljavaju klik na drugu sekciju. Post detalj (`/app/community/<id>`) i dalje pali „Diskusije".
- Ne-admin na `/sr/app/admin/users` → redirect na `/sr/app` (proveriti SVAKU novu rutu). `/sr/app/admin` → 307 → `/sr/app/admin/content`. Upload kurseva/modula/lekcija + live preview u „Sadržaj" rade kao pre.

### Rizici i rollback

| Rizik | Mitigacija / rollback |
| --- | --- |
| `git mv` + motion regresija u swap-u | `SidebarNavSwap` se ne edituje; diff mora da pokaže samo relokaciju. Rollback: `git revert` commita 1a. |
| Community param-preservation uvede beskonačan redirect ili izgubi `q`/`sort` | Test href builder-a u `sidebar-contexts.test.ts` sa punim setom param-a; ručna provera klika kroz sekcije. |
| Admin gate propušten na nekoj novoj ruti | Gate je u svakoj novoj `page.tsx`; verifikaciona lista traži proveru SVAKE rute. |
| Osirotela in-page nav ostavi mrtav CSS/state u `community-shell.tsx` | `grep` gate + lint (`no-unused-vars`). |

---

# FAZA 2 — Učionica (`/app/classroom/**`)

Sve oko smerova, kurseva i lekcija dobija svoj prostor i svoj sidebar kontekst i **nestaje iz
globalne navigacije**. Najveća i najrizičnija faza — dira 20+ literalnih call-site-ova (Audit A).

### Korak 1 — Seljenje ruta (mehanički; izolovati u jedan commit)

**NOVI (rezultat `git mv`)**
- `app/[locale]/app/classroom/tracks/[trackSlug]/` ← `…/app/tracks/[trackSlug]/`
- `app/[locale]/app/classroom/courses/[courseSlug]/` ← `…/app/courses/[courseSlug]/` (uklj. ugnježdene `lessons/[lessonSlug]` i `.../edit`)

**NOVI (redirect stubovi na starim putanjama)**
- `app/[locale]/app/tracks/[trackSlug]/page.tsx` — 307 → nova putanja
- `app/[locale]/app/courses/[courseSlug]/page.tsx` — 307, prenosi SVE param-e
- `app/[locale]/app/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx` — 307
- `app/[locale]/app/courses/[courseSlug]/lessons/[lessonSlug]/edit/page.tsx` — 307

> 307 (ne 308): `/app/**` je robots-disallowed pa nema SEO argumenta, a 308 browser kešira trajno.
> Zabeležiti razlog kao komentar (stil komentara u `app/[locale]/app/page.tsx:28–32`).

**IZMENJEN — builderi i njihovi testovi**
| Fajl | Izmena |
| --- | --- |
| `lib/app-routes.ts` | `trackPath`→`/app/classroom/tracks/${s}`; `coursePath`→`/app/classroom/courses/${s}`; `lessonPath`→`/app/classroom/courses/${c}/lessons/${l}`. Dodati `classroomPath(locale)` i `lessonEditPath(locale,c,l)`. Izdvojiti očuvanje param-a iz `legacyCourseRedirect` u deljivi helper (npr. `preserveSearchParams(base, sp)`) da ga koriste i novi stubovi — **ne pisati drugu implementaciju**. |
| `lib/app-routes.test.ts` | Očekivani novi stringovi. |

**IZMENJEN — zamena preostalih hardkodovanih literala** (kompletna lista u Auditu A):
`lib/stripe.ts` (2), `lib/stripe.test.ts`, `lib/motion-contract.ts` (regexi), `lib/motion-contract.test.ts`,
`components/app/admin-inline-actions.tsx` (7 mesta), `components/app/course-lab.tsx` (2),
`components/app/course-player.tsx`, `components/app/lesson-steps-editor.tsx` (2),
`app/[locale]/(marketing)/courses/[courseSlug]/page.tsx`, i interni `redirect(...)`/`?next=` unutar
preseljenih lesson stranica.

> **`/app/tracks` je već potpuno centralizovan** — 0 hardkodovanih literala; sav track-linking već
> ide kroz `trackPath`. `/app/courses` ima **21 hardkodovan literal** (Audit A).

### Korak 2 — Hub `/app/classroom`

**NOVI**: `app/[locale]/app/classroom/page.tsx` + `components/app/classroom-hub.tsx`.
Koristiti POSTOJEĆE komponente: `DashboardCourseCard`, `CourseCover`, `CourseProgress`,
`getProgressSummary` iz `dashboard-content.tsx` (izdvojiti u deljivi modul ako import u oba smera
smeta). Zone: Hero „Nastavi gde si stao" · „Smerovi" (grupisati po smeru iz `getAppNavigation`,
bez novog query-ja) · „Kursevi" (`DashboardCourseCard` grid + filter Svi/U toku/Završeni/Zaključani)
· „Nastavlja se" (sledećih 5 lekcija). Metadata `appPageMetadata(locale,{sr:"Učionica",en:"Classroom"})`.
Prazno stanje: postojeći `DashboardFirstRun`.

### Korak 3 — Sidebar kontekst `classroom`

**IZMENJEN**
| Fajl | Izmena |
| --- | --- |
| `lib/sidebar-contexts.ts` | Dodati kontekst `classroom` (`matches:["/app/classroom"]`): Pregled (`/app/classroom`), Smerovi, Kursevi, + **uslovno** „Smer · X" i „Kurs · Y" kad ih pathname params daju (vidi Audit B — `visible`/`dynamicLabel`). |
| `components/app/app-sidebar.tsx` | Iz `home` grane UKLONITI: NavLink „Smer · X", NavLink „Kurs · Y", `LearningSwitcher`. U `home` DODATI jedan NavLink „Učionica" (`GraduationCap`, `/app/classroom`) odmah ispod Dashboard-a. `LearningSwitcher` **premestiti** u `classroom` granu (renderovati iznad sekcija; komponentu NE prepisivati). Rail grana: isto (jedan „Učionica" `RailAction` umesto smer/kurs para). `AppBottomNav`: slot „Kurs(evi)" → „Učionica" → `/app/classroom` (i dalje 4 slota). |

### Šta se u Fazi 2 NE dira

Stranice kurseva/smerova/lekcija (sele se, ne redizajniraju) · marketinške `(marketing)/courses/**` ·
Dashboard `/app` (Faza 3) · `LearningSwitcher` (samo se premešta) · radius skala (16/12/8/pill).

### Uslovi uspeha

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
# posle Koraka 1 sme da vrati SAMO redirect stubove + komentare:
grep -rn "/app/courses\|/app/tracks" --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v "\.next" | grep -v _to_delete | grep -v _generated
```
Ručno: `/sr/app/tracks/<slug>` → 307 → `/sr/app/classroom/tracks/<slug>`;
`/sr/app/courses/<slug>?checkout=success` → 307 → nova putanja **sa očuvanim** `?checkout=success`;
`lib/stripe.test.ts` potvrđuje nov `success_url`; na `/sr/app/classroom/**` sidebar pokazuje
classroom kontekst sa `LearningSwitcher`-om, „Nazad" → `/sr/app`; `motion-contract.test.ts` — detalj
kursa i dalje `showcase`, lekcija `focus`.

### Rizici i rollback

| Rizik | Mitigacija / rollback |
| --- | --- |
| Zaostao literal `/app/courses` ruši navigaciju | grep gate je acceptance kriterijum; Korak 1 izolovan u zaseban commit → lak `git revert`. |
| Stripe `success_url`/`cancel_url` pokažu na staru putanju → posle plaćanja 307 (radi, ali ružno) | Zameniti u `lib/stripe.ts` + test; `legacyCourseRedirect` ostaje mreža za sigurnost. |
| `motion-contract` regexi ne uhvate nove putanje → izgubljena varijanta prelaza | Ažurirati regexe + `motion-contract.test.ts` u istom koraku. |
| Cirkularni import hub ↔ dashboard-content | Izdvojiti deljive komponente u neutralan modul. |

---

# FAZA 3 — Dashboard: `getDashboardOverview` + komandna tabla

Backend pre UI-a. Prompt 6 definiše oblik podataka; Prompt 7 ga renderuje.

### Korak 1 — Convex agregat (`convex/dashboard.ts`)

**NOVI**
| Fajl | Zašto |
| --- | --- |
| `convex/dashboard.ts` | `export const getDashboardOverview = query({ args:{}, … })`; `null` za neautentifikovanog. Oblik povratne vrednosti tačno kao u `IA-REDESIGN-PROMPTS.md §6` (resume/progress/nextLessons/messages/community/notifications/studio/study/leaderboard/admin). |
| `convex/dashboard.test.ts` | convex-test (stil `convex/chat.test.ts`): neautentifikovan→`null`; prazan korisnik→sve liste prazne, `percent===0`, `admin===null`; 5 nepročitanih→`unreadTotal===5`, `items.length===3`; ne-admin nikad ne dobija `admin`; admin dobija `pendingApprovals`. |
| `convex/leaderboardReadCore.ts` *(NOVI — vidi Audit D)* | Read-core za leaderboard (rang/xp/level viewer-a). **`leaderboardCore.ts` je write-core i NE pomaže** — read logika (`enrichLeaderboardRow`/`xpLevelsAhead`/`levelForXp`) je danas lokalna u `leaderboard.ts`. |

**IZMENJEN (ekstrakcije core-ova gde nedostaju)**
| Fajl | Zašto |
| --- | --- |
| `convex/leaderboard.ts` | Izvesti `getViewerLeaderboardRowCore(ctx,userId,…)` u novi `leaderboardReadCore.ts`, pa i `getViewerLeaderboardRow` i dashboard koriste isti helper. |
| `convex/credits.ts` | (Opc.) izdvojiti `readCreditBalance(ctx,userId)` — danas je inline u `getBalance`; ili inline-ovati jednu liniju u agregatu. |
| `convex/courses.ts` | (Opc.) izdvojiti „resume + progress + nextLessons" iz `getStudentDashboard`/`getAppNavigation` ako agregat neće ceo teški navigation payload. |

Reuse bez izmene: `chatInboxSummaryCore` (`getChatInboxAggregateSummary`/`computeChatInboxSummary`),
`studyHubSummaryCore` (`getStudyHubAggregateSummary`), `notifications`
(`getCommunityNotificationCountsHelper` je export; billing-expiry deo je inline u
`getUserNotificationSummary`).

Tvrda pravila: svaka lista `.take(3)` **na serveru**; `admin` grana samo za `role==="admin"`; bez
`collect()` nad neograničenim tabelama (poštovati indekse iz `convex/schema.ts`); snippet skratiti na
serveru (~120 znakova); query preživljava prazno stanje svakog polja.

### Korak 2 — Redizajn UI-a (komandna tabla)

**NOVI**: `components/app/dashboard-windows.tsx` — jedna komponenta `DashboardWindow`
(`{ eyebrow, title, badge?, items, emptyMessage, ctaLabel, ctaHref, icon }`).

**IZMENJEN**
| Fajl | Izmena |
| --- | --- |
| `components/app/dashboard-live.tsx` | Zameniti (potencijalnih) 7 `useQuery` jednim `useQuery(api.dashboard.getDashboardOverview, isAuthenticated ? {} : "skip")`. |
| `components/app/dashboard-content.tsx` / `dashboard.tsx` | Nov raspored: A NASTAVI (hero, + link „Otvori učionicu") · B PULS (4 tile-a: Krediti/Poruke/Obaveštenja/Rang) · C PROZORI (grid 1/2/3, fiksan redosled 1–7, Admin samo `role==="admin"`) · D RITAM (`ActivityPanel`, netaknut, puna širina). Proširiti `DashboardHomeSkeleton`. `hasConvex===false` fallback: zone A + prozor „Učionica" iz `lib/content.ts`, ostali prozori prazna stanja. |

Acceptance pravila (iz PROMPTS §6/§7): max 3 stavke/prozor; tačno 1 CTA/prozor; prazno stanje se
renderuje (ne nestaje); fiksan redosled; nikad izmišljeni podaci (skeleton/prazno); Admin prozor se
ne renderuje za ne-admine; radius 16/12/8/pill bez `!`/inline `borderRadius`; svi stringovi dvojezično.

### Šta se u Fazi 3 NE dira

`ActivityPanel`, `DashboardCourseCard`, `CourseCover`, `CourseProgress`, `getProgressSummary`
(koriste se, ne prepisuju) · sidebar/Učionica/Zajednica/Admin (završeni ranije) · animaciona
biblioteka i trajanja (postojeći `data-motion`/`pageMotionContract`).

### Uslovi uspeha

```bash
npm run convex:codegen && npx tsc --noEmit
npm run test          # uklj. convex/dashboard.test.ts
npm run lint && npm run build
```
U odgovoru prijaviti koliko upita nad bazom query izvršava po pozivu i koje indekse koristi.
Ručno (4 naloga: nov/aktivan/staff/admin): nijedan prozor ne nestaje, svaki ima CTA; 1/2/3 kolone bez
horizontalnog skrola na 360px; tab prolazi kroz prozore redom sa vidljivim focus ring-om;
`prefers-reduced-motion` bez ulaznih animacija; dark mode čitljiv (`bg-paper-strong`/`text-muted`).

### Rizici i rollback

| Rizik | Mitigacija / rollback |
| --- | --- |
| Agregat radi previše čitanja (N kurseva × lekcije) | `.take(3)` na serveru; prijaviti broj upita; osloniti se na aggregate komponente (chatInbox/studyHub) gde postoje. |
| Ekstrakcija leaderboard read-core-a promeni ponašanje `getViewerLeaderboardRow` | Isti helper vozi i staru i novu putanju; postojeći test leaderboard-a mora ostati zelen. |
| `hasConvex===false` build padne | Fallback grana renderuje prazna stanja bez Convex poziva; pokriti build-om bez `NEXT_PUBLIC_CONVEX_URL`. |

---

# Audit A — literali `/app/courses` i `/app/tracks`

Repo bez `node_modules`, `.next`, `_to_delete`, `convex/_generated`.
**Klasifikacija:** HELPER = ide kroz `lib/app-routes.ts` (auto-pokriveno promenom builder-a);
HARDKODOVAN = string literal (traži ručnu zamenu); DEF = definicija builder-a; COUPLER = path-substring
zavisnost (regex/`includes`) koja puca na seljenje iako ne emituje link; TEST/DOC = neizvršni.

### `/app/courses`

**HARDKODOVAN (21) — zameniti builder-om:**
| # | Fajl:linija | Kontekst | Predložena zamena |
| --- | --- | --- | --- |
| 1 | `lib/stripe.ts:65` | subscription `success_url` | `` `${siteUrl}${coursePath(locale, slug)}?checkout=success` `` |
| 2 | `lib/stripe.ts:156` | course `success_url` | isto kao #1 |
| 3 | `lib/stripe.ts:157` | course `cancel_url` | `` …${coursePath(...)}?checkout=cancelled `` |
| 4 | `…/app/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx:197` | sign-in `?next=` | `lessonPath(locale,c,l)` unutar `next` |
| 5 | `…/lessons/[lessonSlug]/page.tsx:205` | `returnTo` (verifyEmail) | `lessonPath(...)` |
| 6 | `…/lessons/[lessonSlug]/page.tsx:215` | `redirect` na kurs | `coursePath(locale, course.slug)` |
| 7 | `…/lessons/[lessonSlug]/edit/page.tsx:96` | sign-in `?next=` | `lessonEditPath(locale,c,l)` (nov builder) |
| 8 | `…/lessons/[lessonSlug]/edit/page.tsx:109` | `redirect` na lekciju | `lessonPath(...)` |
| 9 | `app/[locale]/(marketing)/courses/[courseSlug]/page.tsx:189` | `dashboardHref` | `lessonPath(locale,c,l)` |
| 10 | `components/app/lesson-steps-editor.tsx:1011` | povratni link | `lessonPath(...)` |
| 11 | `components/app/lesson-steps-editor.tsx:1058` | povratni link | `lessonPath(...)` |
| 12 | `components/app/course-player.tsx:294` | edit link | `lessonEditPath(...)` |
| 13 | `components/app/course-lab.tsx:433` | edit link | `lessonEditPath(...)` |
| 14 | `components/app/course-lab.tsx:470` | edit link | `lessonEditPath(...)` |
| 15 | `components/app/admin-inline-actions.tsx:1048` | `router.push …?editModule=` | `` `${coursePath(...)}?editModule=${id}` `` |
| 16 | `components/app/admin-inline-actions.tsx:1051` | `router.push` edit | `lessonEditPath(...)` |
| 17 | `components/app/admin-inline-actions.tsx:1063` | `router.push` kurs | `coursePath(...)` |
| 18 | `components/app/admin-inline-actions.tsx:1757` | `router.replace` kurs | `coursePath(...)` |
| 19 | `components/app/admin-inline-actions.tsx:1887` | `router.push …?newLessonModule=` | `` `${coursePath(...)}?newLessonModule=${id}` `` |
| 20 | `components/app/admin-inline-actions.tsx:2106` | `lessonHref` | `lessonEditPath(...)` |
| 21 | `components/app/admin-inline-actions.tsx:2366` | `router.push` edit | `lessonEditPath(...)` |

**HELPER (auto-pokriveno) — bez ručne izmene:**
`components/app/dashboard-content.tsx:258` (`coursePath`), `:267` (`lessonPath`);
`components/app/app-sidebar.tsx:533,1068,1587` (`coursePath`), `:622` (`lessonPath`).

**DEF:** `lib/app-routes.ts:13` (`coursePath`), `:17` (`lessonPath`).

**COUPLER — ažurirati zajedno sa seljenjem:** `lib/motion-contract.ts:36` (`courseDetailPattern`),
`:50` (lesson regex). Bez ovih, prelaz gubi `showcase`/`focus` varijantu.

**TEST/DOC:** `lib/app-routes.test.ts`, `lib/stripe.test.ts:105`, `lib/motion-contract.test.ts:9–22`,
`README.md:10`, `docs/IA-REDESIGN-PROMPTS.md`, `docs/STUDIO-PROGRESS.md:6659`, `.studio-run/prompts/P9.md:14`,
`run-studio-day.ps1:581`, `app/[locale]/app/page.tsx:28` (komentar).

### `/app/tracks`
| Klasa | Lokacija | Napomena |
| --- | --- | --- |
| DEF | `lib/app-routes.ts:9` (`trackPath`) | jedini producent |
| HELPER | `components/app/app-sidebar.tsx:1579, :1849` (`trackPath`) | auto-pokriveno |
| HARDKODOVAN | — | **0 hardkodovanih literala u izvršnom kodu** |
| TEST/DOC | `lib/app-routes.test.ts:7`, `docs/*` | neizvršno |

> **Zaključak A:** `/app/tracks` je čist (samo builder + test). Sav napor je na `/app/courses`:
> 21 hardkodovana mesta + 2 motion-regex couplera. Sidebar/dashboard track & course linkovi već idu
> kroz `app-routes` i menjaju se automatski.

---

# Audit B — minimalni zajednički tip sekcije (NAJVAŽNIJI)

### Sirovina: dva postojeća tipa (verbatim)

`CommunitySection` (`lib/community-sections.ts:14–23`) — `id, path, labelSr, labelEn, icon,
badgeKey?, staffOnly?`. `path` je **bar segment**; `scope/track/course/q/sort` **nisu na tipu** —
dodaje ih href builder potrošača (i sidebar ih danas ispušta, a community-jeva nav ih čuva).

`StudioSection` (`lib/studio-sections.ts:20–28`) — `id, kind: StudioSectionKind|null, labelSr,
labelEn, icon, staffOnly?`. Nije route segment nego **`?kind=` filter** nad jednom rutom;
`kind:null`="all".

**Zajednička polja oba tipa:** `id`, `labelSr`, `labelEn`, `icon`, `staffOnly?`.
**Razilaze se samo u tome kako sekcija imenuje odredište:** `path` (segment) vs `kind` (query).
`badgeKey?` je community-only ekstra.

### Tri strategije kodiranja odredišta koje tip mora da pokrije
1. **segment** dodat na bazu konteksta (community) — uz opciono očuvanje `?scope/track/course/q/sort`.
2. **query filter** nad fiksnom rutom (studio: `?kind=…`, `null`=all).
3. **puna ruta** (admin, classroom).
+ classroom dodaje **uslovnu prisutnost** (sekcija postoji samo ako `params.trackSlug/courseSlug`
postoje) sa **računatom labelom** (`Smer · <title>`).

### Preporučeni potpis — JEDAN tip sa funkcijskim `href`/`isActive`

Funkcije apsorbuju sve tri strategije kodiranja; `visible`/`dynamicLabel` pokrivaju classroom
uslovne sekcije; `staffOnly`/`adminOnly`/`badgeKey` su ortogonalni flegovi koje oba postojeća tipa
već dele.

```ts
import type { LucideIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n";

export type SidebarContextId = "home" | "classroom" | "studio" | "community" | "admin";
export type SidebarBadgeKey = "myThreads" | "community" | "pendingApprovals" | "messages";

/** Params iz pathname-a (useParams) + query-state koji community mora da očuva. */
export type SidebarHrefParams = {
  courseSlug?: string;
  trackSlug?: string;
  lessonSlug?: string;
  courseTitle?: string;   // za dynamicLabel „Kurs · X"
  trackTitle?: string;    // za dynamicLabel „Smer · Y"
  preserved?: URLSearchParams; // scope/track/course/q/sort — community
};

export type SidebarSection = {
  id: string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  /** Odredište. Funkcija apsorbuje segment | query | punu rutu. */
  href: (locale: Locale, params: SidebarHrefParams) => string;
  /** Aktivnost. Apsorbuje pathname vs. ?kind= razliku. */
  isActive: (pathname: string, searchParams: URLSearchParams, params: SidebarHrefParams) => boolean;
  /** Uslovne sekcije (classroom); default: uvek vidljivo. */
  visible?: (params: SidebarHrefParams) => boolean;
  /** Računata labela (classroom „Smer · X"); default: labelSr/labelEn. */
  dynamicLabel?: (params: SidebarHrefParams, locale: Locale) => string;
  badgeKey?: SidebarBadgeKey;
  staffOnly?: boolean;
  adminOnly?: boolean;
};

export type SidebarContext = {
  id: SidebarContextId;
  matches: readonly string[];         // path prefiksi bez locale-a; prvi poklopljen pobeđuje
  rootHref: (locale: Locale) => string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  groupLabelSr?: string;              // naslov grupe („Biblioteka" za studio)
  groupLabelEn?: string;
  adminOnly?: boolean;               // ceo kontekst gated (admin)
  sections: SidebarSection[];
};

export function resolveSidebarContext(pathname: string): SidebarContext;       // fallback home
export function sectionsFor(
  context: SidebarContext,
  opts: { isStaff: boolean; isAdmin: boolean; params: SidebarHrefParams },
): SidebarSection[];                                                           // primeni staff/admin/visible
export function activeSectionId(
  context: SidebarContext,
  pathname: string,
  searchParams: URLSearchParams,
  params: SidebarHrefParams,
): string | null;
```

### Gde svaki od 5 konteksta pravi izuzetak

| Kontekst | Kodiranje | Izuzetak / gde savija tip |
| --- | --- | --- |
| **home** | pune rute | Sekcije su top-level odredišta koja pokazuju na DRUGE kontekste (launcher). Jedini kontekst koji je fallback `resolveSidebarContext`-a. Bez `visible`, badge samo na Poruke/Zajednica. |
| **classroom** | pune rute + uslovne | Jedini koristi `visible` (Smer·X/Kurs·Y postoje samo uz params) i `dynamicLabel` (interpolacija naslova). Takođe jedini koji pored sekcija renderuje NE-sekcijski widget (`LearningSwitcher`, iznad liste). |
| **studio** | `?kind=` query | `isActive` čita `searchParams.get("kind")`, ne pathname. Sekcije se **mapiraju iz** `STUDIO_SECTIONS` (import); `kind` postaje closure u `href`/`isActive`. Ne-sekcijski dodatak: `FiltersDivider`/`RailFilters`. |
| **community** | route segment | `href` **mora da re-doda** `params.preserved` (scope/track/course/q/sort) — jedini kontekst sa očuvanjem query-ja. Sekcije se mapiraju iz `COMMUNITY_SECTIONS` (import). `isActive` koristi `activeCommunitySection` (new/edit/broj→discussions, mentions→notifications). Nosi `badgeKey`. |
| **admin** | pune rute | `adminOnly` na nivou KONTEKSTA (cela grupa gated), + meša admin-only i staff-only sekcije (Chat sigurnost je `staffOnly`). |

### Da li jedan tip pošteno pokriva svih pet? **Da.**

Funkcijski `href`/`isActive` apsorbuju tri strategije; `visible`/`dynamicLabel` pokrivaju uslovne;
`preserved` u params pokriva community očuvanje; `badgeKey`/`staffOnly`/`adminOnly` su već zajednički.
**Jedina poštena cena:** `kind` (studio) i `path`/`badgeKey` (community) postaju *zatvoreni u closure*
unutar `href`/`isActive`, umesto da su deklarativno čitljivi na registry zapisu. Ali to **ne gubi
informaciju** — `lib/studio-sections.ts` i `lib/community-sections.ts` **ostaju deklarativni izvor**
(registry ih samo adaptira). Zato model-picker i dalje čita `StudioSectionKind` iz svog fajla.

### Alternativa (ako se pokaže da closure krije previše): diskriminisana unija

```ts
type Base = Pick<SidebarSection,"id"|"labelSr"|"labelEn"|"icon"|"badgeKey"|"staffOnly"|"adminOnly"|"visible"|"dynamicLabel">;
type SegmentSection = Base & { encoding:"segment"; segment:string; preserveParams: readonly string[] };
type QuerySection   = Base & { encoding:"query";   param:string; value:string|null };
type RouteSection   = Base & { encoding:"route";   path:(l:Locale,p:SidebarHrefParams)=>string };
type SidebarSection = SegmentSection | QuerySection | RouteSection;
```
**Za:** deklarativno/inspektabilno, jedan generički href builder. **Protiv:** front-loaduje uniju od
3 varijante za 5 konteksta; uslovne/`dynamicLabel` i dalje traže iste dodatke; generički builder ipak
mora posebno da tretira community očuvanje param-a. → **Preporuka: funkcijski tip** (vidi Otvorena
pitanja #1).

---

# Audit C — `app-sidebar.tsx`: kontekst-nezavisno vs. `classic` grana

Ceo swap je zasnovan na tome da je **kontrola za skupljanje sidro iznad regiona zamene i ne pomera se**
— menja se samo sadržaj ispod. Sve u tabeli „ostaje" je izvan oba `SidebarNavSwap` instance.

### OSTAJE (ljuska — kontekst-nezavisno)

| Deo | Prošireno | Rail / ostalo |
| --- | --- | --- |
| Brand/logo | `BrandMark` `:1518` (+ mobilni header `:1461`) | rail emblem `:1827–1830` |
| Collapse/expand dugme | `:1524–1531` | rail expand `:1819–1826`; resize handle `:1945–1958` |
| Kredit pill | `CreditsBalancePill` `:1521` (desktop), `:1463` (mobilni) | — |
| Profil kartica (+ `SidebarRoleBadge`) | `:1639–1756`, mobilni `:1759–1814` | rail flyout `:1899–1942` |
| Rail wrapper | — | `:1818–1943` |
| Outer `<aside>` (fixed/drawer, data-attrs, width var) | `:1486–1959` | isto |
| `AppBottomNav` | `:1960–1971` | isto (Faza 1b menja SADRŽAJ 3. slota, ne poziciju) |
| Cookie/resize | `persistSidebarPreferences`/`toggleSidebar`/`startSidebarResize`/`handleResizeKeyDown` + `lib/app-sidebar-preferences.ts` | netaknuto |

### SELI SE (danas u `classic` grani `:1547–1625`, rail `:1840–1871`)

| Element | Linija | Ide u |
| --- | --- | --- |
| `LearningSwitcher` | `:1550` | **classroom** (premešta se, ne prepisuje) |
| NavLink Dashboard | `:1559` | **home** (ostaje) |
| NavLink Studio | `:1565` | **home** (ostaje) |
| NavLink Krediti | `:1571` | **home** (ostaje) |
| NavLink „Smer · X" (uslovno) | `:1577–1584` | **classroom** (uslovna sekcija) |
| NavLink „Kurs · Y" (uslovno) | `:1585–1592` | **classroom** (uslovna sekcija) |
| `CommunitySections` disclosure | `:1593–1599` | **community** (home dobija jedan NavLink „Zajednica") |
| NavLink Poruke | `:1600–1606` | **home** (ostaje) |
| NavLink „Admin panel" (`isAdmin`) | `:1607–1614` | **home** ostaje (href → `/app/admin/content`) + **admin** sekcije |
| NavLink „Chat sigurnost" (`isStaff`) | `:1615–1622` | **home** ostaje + **admin** sekcija |
| *(NOVO)* NavLink „Učionica" | — | **home** (dodaje se ispod Dashboard-a) |

### Šta ostaje u `home` kontekstu (posle svih faza)
Dashboard · **Učionica** (novo) · Studio · Krediti · **Zajednica** (jedan link) · Poruke ·
Admin panel* · Chat sigurnost*. Uklonjeno iz home: `LearningSwitcher`, „Smer · X", „Kurs · Y",
`CommunitySections` disclosure.

---

# Audit D — izvori za `getDashboardOverview`

Ključna ispravka `IA-REDESIGN-PROMPTS.md`: on navodi `leaderboardCore` kao gotov reuse. **Nije** —
`leaderboardCore.ts` je **write/sync** core (XP award); read logika je lokalna u `leaderboard.ts`.

| Izvor (export) | Fajl | Tip | Postoji read-core? | Plan |
| --- | --- | --- | --- | --- |
| `getInboxSummary` | `convex/chat.ts:220` | query | **Da** — `getChatInboxAggregateSummary`/`computeChatInboxSummary` (`chatInboxSummaryCore.ts:253,272`) | Reuse; (opc.) izdvojiti `readChatInboxSummary` wrapper za 3-tier logiku (sad inline u query-ju) |
| `getStudyHubSummary` | `convex/study.ts:286` | query | **Delimično** — `getStudyHubAggregateSummary` (`studyHubSummaryCore.ts:135`) export; `getLegacyStudyHubSummary` (`study.ts:235`) lokalno | Reuse aggregate putanju |
| `getViewerLeaderboardRow` | `convex/leaderboard.ts:118` | query | **Ne** — read logika lokalna; `leaderboardCore.ts` je write-only | **NOV `leaderboardReadCore.ts`** (`getViewerLeaderboardRowCore`) |
| `getUserNotificationSummary` | `convex/notifications.ts:104` | query | **Delimično** — `getCommunityNotificationCountsHelper` (`:40`) export/reuse | Reuse helper; billing-expiry deo (`:116–133`) je inline |
| `getBalance` (krediti) | `convex/credits.ts:97` | query | **Ne** — inline read; `creditsCore.ts` je ledger math | Inline 1 liniju ili izdvojiti `readCreditBalance` |
| `getAppNavigation` / `getStudentDashboard` | `convex/courses.ts:149 / :312` | query | **Ne** — sve inline | (Opc.) izdvojiti resume/progress/nextLessons helper |
| profil-statistika (viewer) | `convex/publicProfiles.ts:231` (`getPublicProfile`) | query | **Ne** — inline, keyed po username-u; nema viewer-self summary | Ako treba za prozor — nov helper |
| streak | — | — | **Ne postoji** | Net-new ako se traži (preporuka: NE u v1) |
| `contentReadiness` (admin prozor) | `convex/contentReadiness.ts` | query | proveriti | Reuse za admin `readiness` |

**Bottom line:** chat inbox i study hub imaju reuse-abilne `SummaryCtx` core-ove; notifications ima
reuse-abilan helper. **Leaderboard traži novu ekstrakciju (obavezno); krediti/progres/profil-stat
nemaju core (inline ili laka ekstrakcija). Streak ne postoji.**

---

# Audit E — redirect mapa (stara → nova)

| Stara putanja | Nova putanja | Kod | Param-i koji MORAJU preživeti |
| --- | --- | --- | --- |
| `/app/tracks/[trackSlug]` | `/app/classroom/tracks/[trackSlug]` | 307 stub | (nema poznatih) |
| `/app/courses/[courseSlug]` | `/app/classroom/courses/[courseSlug]` | 307 stub | **`checkout`** (Stripe), **`editModule`**, **`newLessonModule`**, + svi ostali |
| `/app/courses/[c]/lessons/[l]` | `/app/classroom/courses/[c]/lessons/[l]` | 307 stub | `view` (lesson player) |
| `/app/courses/[c]/lessons/[l]/edit` | `/app/classroom/courses/[c]/lessons/[l]/edit` | 307 stub | `next` (sign-in) |
| `/app/admin` | `/app/admin/content` | 307 (Faza 1c) | — |
| *(postoji već)* `/app?course=<slug>` | `/app/courses/<slug>` → (Faza 2) `/app/classroom/courses/<slug>` | `legacyCourseRedirect` | svi (već implementirano) |

**Mehanizam:** tanki server `page.tsx` stubovi rade `redirect()` 307 i prenose **sve** search-param-e.
Očuvanje param-a **izdvojiti iz `legacyCourseRedirect`** u deljivi helper (`preserveSearchParams`) i
reupotrebiti — ne pisati drugu implementaciju.

> **Pre-postojeći bug za flag:** `editModule` i `newLessonModule` se **pišu** (`admin-inline-actions.tsx`)
> ali audit nije našao čitača (`searchParams.get("editModule")` nigde). Round-trip je trenutno
> nezakačen. Redirect ih ipak mora očuvati (korektno po dizajnu), ali zakačivanje čitača je zaseban
> zadatak van ovog IA posla — zabeleženo, ne rešava se ovde.

---

# Otvorena pitanja

**1. Oblik tipa sekcije — funkcijski vs. diskriminisana unija.**
Opcije: (a) jedan tip sa funkcijskim `href`/`isActive` + `visible`/`dynamicLabel` (Audit B);
(b) diskriminisana unija po `encoding`.
**Preporuka: (a).** Pošteno pokriva svih 5, čuva `studio-sections.ts`/`community-sections.ts` kao
deklarativni izvor, minimalan kod. DU tek ako se pokaže da closure krije previše za buduće alate.

**2. Classroom sekcije Smerovi/Kursevi — zasebne rute ili `?view=` nad hub-om?**
`IA-REDESIGN-PROMPTS.md` koleba između `/app/classroom#tracks` i `/app/classroom?view=courses`.
**Preporuka:** jedan hub `/app/classroom` sa `?view=tracks|courses` filterom (manje ruta, hub je već
jedna stranica sa zonama); zasebne pod-rute samo ako SEO/duboko linkovanje to zatraže (ne traži —
`/app/**` je robots-disallowed).

**3. Da li Faza 3 uvodi `streak`?**
Ne postoji u backendu. **Preporuka: NE u v1** — komandna tabla radi bez njega; streak je zaseban
feature (tabela + write core + cron), ne deo IA posla.

**4. Granularnost commit-ova Faze 1.**
**Preporuka:** 3 commita (1a registry, 1b zajednica, 1c admin) da bi rollback bio po pod-koraku;
1b i 1c mogu na zasebnim granama paralelno.

**5. `getDashboardOverview` — obim v1.**
Ako je vreme kratko, prvo prozori koji imaju gotov core (Poruke, Uči zajedno, Obaveštenja, Krediti,
Učionica), a Leaderboard/Studio prozor u drugom prolazu (Leaderboard traži novu ekstrakciju).
**Preporuka:** ceo oblik odjednom (Prompt 7 renderuje tačno taj payload), ali leaderboard read-core
je preduslov — uraditi ga prvi u Fazi 3 Korak 1.

---

# Verifikacija (globalno)

Posle svake faze, pre sledeće:
```bash
npx tsc --noEmit
npm run lint
npm run test          # Faza 3 uklj. convex/dashboard.test.ts (i npm run convex:codegen pre tsc)
npm run build
# posle Faze 2:
grep -rn "/app/courses\|/app/tracks" --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v "\.next" | grep -v _to_delete | grep -v _generated
```
Ručna verifikacija u pregledaču: dev server na `:3000`, ulogovani Chrome (paziti na GSAP/
background-tab throttling). Scenariji po fazi navedeni u „Uslovi uspeha" svake faze; za Fazu 3
proći 4 naloga (nov/aktivan/staff/admin), proveriti prazna stanja, 1/2/3 kolone bez horizontalnog
skrola na 360px, tastaturu, `prefers-reduced-motion`, dark mode.
