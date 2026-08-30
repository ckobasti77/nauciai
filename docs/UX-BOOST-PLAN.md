# UX BOOST — audit inventar (korak U1)

**Mereno:** 2026-08-30 00:30, grana `feat/ux-boost`, commit `59fdad4`
**Baseline:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run test` ✅ (77 fajlova, 1028 testova)

Ovo je izvor istine za korake U2–U10. Svaka tvrdnja ispod je proverena u kodu i
nosi `fajl:linija`. Gde polazna hipoteza **nije** potvrđena, to je eksplicitno
napisano — nemoj je prepisivati iz starih dokumenata.

> **Upozorenje o `docs/design-system-proposal.md`:** taj dokument je merio raniju
> granu (`fix/radius-cascade-layer`). Više njegovih brojeva je danas **zastarelo**
> (fokus trapovi, hexovi, `window.confirm` lokacija). Ispod su ponovo izmerene
> vrednosti. Kod konflikta — važi ovaj dokument.

---

## 1. `DashboardFirstRun` i „ima prednost nad svime"

Hipoteza je **delimično potvrđena, ali sa obrnutim predznakom na `/app`**. Postoje
dva različita uslova ulaska u isti blok i oni se ne slažu.

### Gde je blok definisan
- `components/app/dashboard-content.tsx:963` — `export function DashboardFirstRun(...)`
- Komentar iznad (`:961-962`) tvrdi: *„Reached whenever the viewer has no course they
  can actually open … never a 0% hero over courses they don't own."* — **taj komentar
  ne opisuje stvarno ponašanje live grane** (vidi 1B).

### 1A. `/app/classroom` — POTVRĐENO (za ne-admina)
- `components/app/classroom-hub.tsx:99-102` — `accessible = entries.filter(entry => isAdmin || entry.course.hasAccess)`
- `components/app/classroom-hub.tsx:138-140` — `if (!accessible.length) return <DashboardFirstRun … />`

Znači: student **bez ijednog otključanog kursa** vidi samo first-run blok i ništa
drugo — ni Smerove, ni listu kurseva, ni filter.

**ADMIN NIJE POGOĐEN.** `isAdmin ||` u filteru na `:100` znači da admin uvek prolazi;
`accessible` je za admina jednako `entries`. Admin pada u first-run **samo ako u bazi
nema nijednog kursa uopšte**. Hipoteza „(i ADMIN!)" — **NIJE POTVRĐENA**.

**Sve tri sidebar stavke gađaju istu rutu — POTVRĐENO:**
- `lib/sidebar-contexts.ts:240` — `href: classroomPath(locale) + "?view=" + view`
- `lib/sidebar-contexts.ts:256-258` — Pregled (bez `view`), Smerovi (`?view=tracks`), Kursevi (`?view=courses`)
- `components/app/classroom-hub.tsx:124-133` — `?view` služi **samo** za `scrollIntoView`

Pošto se `return <DashboardFirstRun>` na `:139` izvršava **pre** rendera zona, sve tri
stavke daju identičan ekran. Za korisnika sidebar izgleda kao da su tri linka pokvarena.

### 1B. `/app` (komandna tabla) — HIPOTEZA NIJE POTVRĐENA; problem je suprotan
- `components/app/dashboard-content.tsx:1261-1264` — `// DashboardFirstRun ima prednost nad svime.` → `if (!view.hasCourses) return <DashboardFirstRun … />`
- `components/app/dashboard-content.tsx:1252` — `hasCourses: overview.progress.totalLessons > 0 || overview.resume != null`

Ključ je odakle dolazi `totalLessons`:
- `convex/dashboard.ts:451` — `studentCoursesSlice(ctx, userId)`
- `convex/dashboard.ts:46-49` — čita **sve** kurseve sa `status === "published"`
- `convex/dashboard.ts:108-116` — `totalLessons` je zbir `publishedLessonCount` **preko svih objavljenih kurseva**, bez ikakve provere pristupa/entitlementa

Posledica: čim u bazi postoji makar jedan objavljen kurs sa lekcijama, `hasCourses`
je `true` za **svakog** ulogovanog korisnika. Na `/app` se dakle **ne** prikazuje
first-run blok — prikazuje se **puna komandna tabla sa 0% hero-om nad kursevima koje
korisnik ne poseduje**, tačno ono što komentar na `:961` tvrdi da je sprečeno.

Gore od toga: `resume` (`convex/dashboard.ts:168-181`) se takođe bira iz svih objavljenih
kurseva, pa `ResumeHero` nudi „Nastavi lekciju" koja vodi u **zaključanu** lekciju.

Statička grana je ispravna i nekonzistentna sa live granom:
- `components/app/dashboard-content.tsx:1186-1192` — `staticCommandTableView` **filtrira po `hasAccess`** i vraća `hasCourses: false`

Dakle isti korisnik dobija first-run bez Convexa, a punu tablu sa Convexom.

**Za U2+:** popraviti treba **oba** gejta i uskladiti ih (jedan pojam „kurs koji
korisnik može da otvori"), a ne samo skloniti first-run.

---

## 2. CTA iz aplikacije koji izbacuju u marketing

### 2A. In-app katalog kurseva NE POSTOJI — POTVRĐENO
Postojeće rute (`find app/[locale]/app -name page.tsx`):
- `app/[locale]/app/classroom/page.tsx` — hub (kursevi su **sekcija**, ne ruta)
- `app/[locale]/app/classroom/courses/[courseSlug]/page.tsx` — detalj
- `app/[locale]/app/courses/[courseSlug]/page.tsx` — legacy detalj

**Nema `app/[locale]/app/courses/page.tsx` ni `.../classroom/courses/page.tsx`.**
Nema ni marketing index-a — postoji samo `app/[locale]/(marketing)/courses/[courseSlug]/page.tsx`.
Zato je `/{locale}#pricing` danas jedina „vitrina" kurseva koja postoji.

### 2B. Svi app→marketing linkovi (kompletan popis)

| # | Fajl:linija | Meta | Tekst | Ocena |
|---|---|---|---|---|
| 1 | `components/app/dashboard-content.tsx:1023` | `${withLocale(locale)}#pricing` | „Pogledaj kurseve" / „Browse courses" | **Glavni problem.** CTA first-run bloka izbacuje studenta iz aplikacije na marketing sidro. |
| 2 | `components/app/app-sidebar.tsx:1798` | `${withLocale(locale)}#pricing` | upgrade | izlazak iz app-a |
| 3 | `components/app/app-sidebar.tsx:1900` | `${withLocale(locale)}#pricing` | upgrade | izlazak iz app-a |
| 4 | `components/app/app-sidebar.tsx:1965` | `${withLocale(locale)}#pricing` | „Unapredi" / „Upgrade" (RailAction) | izlazak iz app-a |
| 5 | `components/app/app-sidebar.tsx:2034` | `${withLocale(locale)}#pricing` | upgrade | izlazak iz app-a **+ goli hex** `bg-[#10b981]`, `hover:bg-[#0ea472]`, `text-white` |
| 6 | `components/app/app-sidebar.tsx:1560` | `withLocale(locale)` | BrandMark (logo) | uobičajeno ponašanje logotipa; **nije** bug, ali jeste izlazak |
| 7 | `components/app/app-sidebar.tsx:1618` | `withLocale(locale)` | BrandMark (drawer) | isto kao gore |
| 8 | `components/app/app-sidebar.tsx:1932` | `withLocale(locale)` | logo u rail-u | isto kao gore |

**Legitimni izlasci (ne dirati):**
- `components/app/studio-page.tsx:80` → `STUDIO_TERMS_PATH`, `:83` → `PRIVACY_POLICY_PATH` (pravne stranice)
- `/sign-in` push-evi: `app-sidebar.tsx:1824`, `:1911`, `:2036`, `sign-out-button.tsx:19`, `credits-page.tsx:165`, `studio-page.tsx:539` (auth tok)

**ODLUKA za U-korake:** stavke 1–5 su prava meta. Stavke 6–8 (logo) ostavi —
menjanje ponašanja logotipa je promena IA, ne UX popravka, i nije traženo.

---

## 3. Admin Kontrolni centar — POTVRĐENO u celosti

### 3A. `/app/admin/content` — tri gola native `<select>`-a
`components/app/admin-content-manager.tsx`:
- `:522` — `<select>` „1. Smer" (`<option value="">Izaberi smer</option>`)
- `:524` — `<select>` „2. Kurs" (`disabled={!selectedTrack}`)
- `:526` — `<select>` „3. Lekcija" (`disabled={!selectedCourse}`)
- `:551` — četvrti `<select>` „Status" (Nacrt / Objavljeno / Arhivirano), u „Podešavanja" popoveru

Svi koriste `inputClass` — bez ikakvog brend stila (nema ofset senke, nema `border-2 border-ink`
tretmana kao ostatak app-a). Native `<select>` se u tamnoj temi renderuje sistemskim
bojama OS-a, ne tokenima.

### 3B. „Bez pregleda stanja, ogromna praznina" — POTVRĐENO
`components/app/admin-content-manager.tsx:519-565` renderuje po redu:
1. `AdminPageFrame` header (`:216-227`)
2. sekcija sa 3 selecta + 3 dugmeta „Novi smer/kurs/lekcija" (`:520-538`)
3. `{readiness ? <section …> : null}` (`:540-543`) — **null dok ništa nije izabrano**
4. `{trackSurface || courseSurface || lessonSurface ? <section …> : null}` (`:545-564`) — **null dok ništa nije izabrano**

Znači: **početno stanje stranice = naslov + jedan red selectova, i ništa ispod.**
Nema brojača (koliko smerova / kurseva / lekcija postoji), nema „šta čeka objavu",
nema poslednjih izmena. Admin ne zna šta da uradi prvo.

### 3C. Users / Growth / Analytics su `FutureModule` placeholderi — POTVRĐENO
- `components/app/admin-content-manager.tsx:208-217` — `function FutureModule` (ikona + naslov + telo + čip „Planirano")
- `:231-239` `AdminUsersPanel` → 1× FutureModule („Upravljanje korisnicima") ← `app/[locale]/app/admin/users/page.tsx:20`
- `:241-250` `AdminGrowthPanel` → 2× FutureModule („Affiliate i influenseri", „Meta i Google Ads") ← `app/[locale]/app/admin/growth/page.tsx:20`
- `:252-260` `AdminAnalyticsPanel` → 1× FutureModule („Google Analytics") ← `app/[locale]/app/admin/analytics/page.tsx:20`

### 3D. Dodatni nalazi (nisu bili u hipotezi, ali su u istom fajlu)
- **Sve četiri admin stranice imaju identičan `<h1>` „Kontrolni centar"** (`:222`, kroz `AdminPageFrame`). Četiri različite rute, isti naslov — korisnik ne zna gde je.
- **Nijedan string u ovom fajlu ne ide kroz `lib/i18n`.** Hardkodovan srpski: „Izaberi smer" (`:522`), „Prvo izaberi smer" (`:524`), „Nacrt"/„Objavljeno"/„Arhivirano" (`:551`), „Novi smer"/„Novi kurs"/„Nova lekcija" (`:530-532`), „Kontrolni centar" (`:222`), „Planirano" (`:213`), „Poništi" (`:205`). Komponenta prima `locale` (`:262`) i prosleđuje ga dalje, ali ga za sopstvene stringove ne koristi. Ovo je kršenje konvencije repoa.

---

## 4. Izmereni dug — ponovo prebrojano (proposal je delom zastareo)

### 4A. Fokus trapovi u modalima — **PROPOSAL JE ZASTAREO**

Tvrdnja iz `docs/design-system-proposal.md:38-40` („20 overlaya, **tačno jedan** ispravan
fokus trap, `useModalFocus` u `member-profile.tsx:35-89`") **više nije tačna**. Danas
postoje **četiri** nezavisne implementacije fokus trapa, tri od njih kompletne:

| # | Implementacija | Esc | Tab ciklus | `body` scroll lock | Vraćanje fokusa | Ocena |
|---|---|---|---|---|---|---|
| 1 | `components/app/member-profile.tsx:35-89` `useModalFocus(open, onClose)` | ✅ | ✅ oba smera | ✅ | ✅ `previouslyFocused` | **kompletan** |
| 2 | `components/app/chat/chat-dialogs.tsx:21-77` `useModalDialog(onClose)` | ✅ | ✅ oba smera | ✅ | ✅ `previouslyFocused` | **kompletan** (praktično duplikat #1; dodaje `input`/`select` u selektor) |
| 3 | `components/app/community-thread-dialog.tsx:38-84` (inline u `CommunityThreadDialog`) | ✅ | ✅ oba smera | ✅ | ✅ `restoreFocusRef` | **kompletan** (koristi `[data-dialog-initial-focus]`) |
| 4 | `components/app/member-profile.tsx:169-192` `FollowDialogShell` | ✅ | ✅ oba smera | ✅ | ❌ **nema** | **delimičan** — oslanja se na `autoFocus` na dugmetu Zatvori (`:199`) |

**Tri skoro identične kopije iste logike = pravi dug, ne „nedostaje trap".**
Zadatak za U-korak nije napisati trap — nego objediniti postojeća tri u jedan
`components/ui/dialog.tsx` i preseliti pozivaoce.

**Ko koristi koji trap:**
- #1 → `member-profile.tsx:251` (study invite, panel na `:404`), `:252` (report, panel na `:425`)
- #2 → `chat-dialogs.tsx:93` (`NewConversationDialog`), `:179` (`ReportDialog`), `chat-group-details.tsx:63` (`ConversationDetailsDialog`)
- #3 → `community-thread-moderation.tsx:311`, i preko `CommunityThreadConfirmDialog` (`community-thread-dialog.tsx:134`) → `community-comments.tsx:228`, `community-post-editor.tsx:987`, `community-thread-actions.tsx:98`
- #4 → `member-profile.tsx:220`, `:225` (Pratioci / Pratim)

### 4B. Modali BEZ ikakvog fokus menadžmenta — **najveći prioritet**

**`AppComposerSheet` — `components/app/app-composer-sheet.tsx:10-102`.** Ovo je
najskuplji propust jer je jedna komponenta iza mnogo ekrana:
- `:28-34` — ima **samo** `Escape` listener
- **nema** početni fokus, **nema** Tab trap, **nema** `body` scroll lock, **nema** vraćanje fokusa
- ima ispravan `role="dialog" aria-modal="true"` (`:65-66`) — što znači da čitač ekrana
  *obećava* modal ponašanje koje kod ne isporučuje

Aliasiran je kao `AdminComposerSheet` (`components/app/admin-inline-actions.tsx:182`) i
korišćen na **5 mesta**: `admin-inline-actions.tsx:1190`, `:2019`, `:2389`, `:2696`, `:2890`.

**Ostali modali bez fokus menadžmenta:**

| Fajl:linija | Šta je | `role="dialog"` | Fokus |
|---|---|---|---|
| `components/app/admin-inline-actions.tsx:1514` | „Nesnimljene izmene" potvrda (kurs) | ✅ `aria-modal="true"` | ❌ ništa |
| `components/app/admin-inline-actions.tsx:2218` | „Nesnimljene izmene" potvrda (lekcija) | ✅ `aria-modal="true"` | ❌ ništa; **radius `rounded-[10px]` van skale** (`:2220`) |
| `components/app/studio-media-detail.tsx:456` | potvrda brisanja medija | ❌ nema | ❌ ništa |
| `components/app/studio-media-detail.tsx:343` | pun ekran detalja medija | ❌ nema | samo `Escape` (`:200`) |
| `components/app/chat/chat-inbox.tsx:141` | podešavanja obaveštenja (popover) | ✅ `role="dialog"` bez `aria-modal` | ❌ ništa |
| `components/app/chat/chat-thread.tsx:767` | podešavanja razgovora (popover) | ✅ `role="dialog"` bez `aria-modal` | ❌ ništa; **5× `rounded-[10px]`** (`:768-774`) |
| `components/studio/studio-composer.tsx:1130` | panel u composeru | ✅ | delimično (`:763-772` vraća fokus na čip) |
| `components/studio/studio-filter-bar.tsx:172` | panel filtera | `aria-modal="false"` (namerno popover) | auto-fokus na pretragu (`:97-105`), bez trapa |

**Nisu modali (drag overlay / scrim) — ne dirati:**
`chat-thread.tsx:757`, `drop-slot.tsx:271`, `track-experience.tsx:114`,
`community-post-editor.tsx:571`, `profile-editor.tsx:567`,
`admin-inline-actions.tsx:1480` i `:2783`, `app-sidebar.tsx:1581` (scrim mobilnog drawer-a),
`chat-dock.tsx:162`, `chat-notifications.tsx:96`.

**Ukupno `fixed inset-0`:** 24 pojave u 17 fajlova (proposal je govorio 20).

### 4C. `outline-none` bez `focus-visible` zamene
- **Ukupno `outline-none`:** 63 pojave u 28 fajlova (proposal: 57)
- **Sa `focus-visible:` u istom redu:** 4
- **Bez zamene u istom redu:** **59**

Najgušća mesta: `profile-editor.tsx` (10), `sign-in-panel.tsx` (6), `community-post-editor.tsx` (5),
`chat/chat-dialogs.tsx` (4), `community-v2/community-filters.tsx` (4),
`admin-inline-actions.tsx` (3), `inline-content.tsx` (3), `lesson-steps-editor.tsx` (3).

> Napomena o metodi: mereno „u istom redu", jer su klase u ovom repou pisane u jednom
> stringu. Nekoliko fajlova ima `focus-visible` u zasebnom `cn()` argumentu — pravi broj
> nepokrivenih je **≤59**, ali sigurno >50. Precizan broj po call-site-u treba potvrditi
> u koraku koji ih stvarno menja.

### 4D. Hardkodovani hexovi
- **Ukupno 6-cifrenih hexova u `.tsx`:** **124** (proposal: 154 — dakle **smanjeno**, ali daleko od nule)
- **Različitih vrednosti:** **51**
- **Deklarisanih boja-tokena u `app/globals.css`:** **12** (`--color-background`, `--color-foreground`, `--color-ink`, `--color-line`, `--color-muted`, `--color-paper`, `--color-paper-strong`, `--color-scrim`, `--color-studio-canvas`, `--color-studio-well`, `--color-studio-well-edge`, `--color-yellow`)

**Najčešći, po vrednosti:**

| hex | pojava | token? |
|---|---|---|
| `#2e6f9f` | **23** | **NE — nedeklarisan** (potvrđeno: `rg '2e6f9f' app/globals.css` → nema pogotka) |
| `#eef3f7` | 15 | ne |
| `#d7e9f5` | 15 | ne |
| `#70a7cf` | 5 | ne |
| `#0e3158` | 4 | ne |
| `#eef6fb` / `#b42318` / `#10b981` / `#0a0e14` | 3 svaki | ne |

**`#2e6f9f` ×23 — POTVRĐENO tačno kako proposal kaže.** Raspored po fajlovima
(`rg -c`, dakle broj *redova* — 21 red, 23 pojave):
`member-profile.tsx` (6), `chat/chat-thread.tsx` (3), `chat/study-hub.tsx` (3),
`chat/chat-group-details.tsx` (2), `suspension-gate.tsx` (2),
`help-settings.tsx` (1), `chat/chat-dialogs.tsx` (1), `chat/chat-moderation-console.tsx` (1),
`chat/chat-inbox.tsx` (1), `chat/messages-hub.tsx` (1).

**UX posledica (bitnije od broja):** goli hex ne reaguje na promenu teme. Svih 124
mesta renderuju istu boju u svetloj i u tamnoj temi. Ovo je konkretan defekt tamne teme,
a ne samo stilska nedoslednost.

### 4E. Radiusi van skale
- **`rounded-*!` escape-ova: 0** ✅ (očišćeni, kako `AGENTS.md` i tvrdi)
- **Inline `style={{ borderRadius }}`: 0** ✅
- **Na skali:** `rounded-[16px]` ×213 (+`rounded-t/l/b-[16px]` ×6), `rounded-[12px]` ×55, `rounded-[8px]` ×249
- **Van skale: 43 pojave** (proposal je procenjivao ~38)

| vrednost | broj | lokacije |
|---|---|---|
| `6px` | 20 | `lesson-steps-editor.tsx:343,448,594,1177,1609,1696,1723` · `inline-content.tsx:210,212,214,215,216` · `admin-inline-actions.tsx:175,1417,1960,1994` · `dashboard-content.tsx:626,631` · `marketing-page.tsx:110,256` |
| `10px` | 12 | `chat/chat-thread.tsx:768,769,770,771,774` · `admin-inline-actions.tsx:2220` · `chat/chat-group-details.tsx:201` · `community-comments.tsx:234` · `dashboard-content.tsx:1328` · `marketing/account-menu.tsx:249` |
| `28px` | 3 | `admin-inline-actions.tsx:1486,2788` · `profile-editor.tsx:568` |
| `5px` | 2 | `admin-inline-actions.tsx:1967,1999` |
| `3px` | 2 | `member-profile.tsx:143,154` |
| `4px` | 2 | `inline-content.tsx:163` · `dashboard-content.tsx:747` (`rounded-t-[4px]`) |
| `7px` | 1 | `app-sidebar.tsx:283` |
| `18px` | 1 | `profile-editor.tsx:569` |

**Napomena:** `marketing-page.tsx:110,256` i `marketing/account-menu.tsx:249` su u
marketing delu — pravila run-a zabranjuju redizajn marketinga. **Ne dirati ta 3 mesta.**
Ostaje **40** u app delu.

**Odvojen nalaz:** `surface-card` / `surface-inset` / `surface-media` utility-ji postoje i
`AGENTS.md` ih propisuje, ali su usvojeni u samo **15 fajlova** (28 + 36 + 12 = 76 pojava),
naspram 517 `rounded-[Npx]` arbitrarnih vrednosti koje pogađaju isti tier. Vrednost je
tačna, zapis nije kanonski.

### 4F. `window.confirm` / `window.alert` — **PROPOSAL DAJE POGREŠNU LOKACIJU**

`docs/design-system-proposal.md:49-50` navodi `dashboard-content.tsx:344`.
**To je netačno** — `components/app/dashboard-content.tsx:342` je
`function CourseVideoSection(...)`, i u celom fajlu nema nijednog `window.confirm`.

Stvarne lokacije (kompletan popis, ceo repo):

| Fajl:linija | Poziv | Poruka |
|---|---|---|
| `components/app/course-player.tsx:183` | `window.confirm` | „Obrisati ovaj sadržajni blok?" / „Delete this content block?" |
| `components/app/course-player.tsx:194` | `window.confirm` | „Obrisati ovaj materijal?" / „Delete this material?" |
| `components/app/lesson-steps-editor.tsx:754` | `window.confirm` | (potvrda brisanja koraka) |
| `components/app/lesson-steps-editor.tsx:925` | `window.confirm` | „Obrisati ovaj zadatak?" / „Delete this task?" |
| `components/app/lesson-steps-editor.tsx:813` | **`window.alert`** | „Korak mora imati bar jedan panel." / „A step needs at least one panel." |

Svih 5 su native OS dijalozi — bez brend stila, bez tokena, ne rade u tamnoj temi,
i `window.alert` blokira nit. Sve su u admin/editor tokovima.

---

## 5. Horizontalni overflow na `/app/studio` i „toast" van desne ivice

### 5A. Nigde nema klipovanja horizontalnog preliva — POTVRĐENO
`rg 'overflow' app/globals.css` → **nijedan pogodak**. Ni `app-shell.tsx` ni
`app/[locale]/app/layout.tsx` ne postavljaju `overflow-x`. Znači: bilo koji element
širi od viewporta **odmah** proizvodi horizontalni scrollbar. Nema mreže zaštite.

### 5B. Full-bleed negativne margine — provereno, **NIJE uzrok**
`components/app/studio-page.tsx:628` — `-mx-4 … sm:-mx-6 … md:-mx-8`
`components/app/app-shell.tsx:39` — `<main … px-4 sm:px-6 md:px-8>`

Negativne margine se **tačno poklapaju** sa paddingom `<main>`-a na sva tri brejkpointa,
pa se full-bleed uklapa u border-box `<main>`-a. Ovo je uredno napisano i nije problem.

### 5C. Traka filtera bez prelamanja i bez skrola — **najverovatniji uzrok scrollbar-a**
Lanac (svaki korak proveren):
1. `components/app/studio-page.tsx:446` — `<div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">`
2. `components/app/studio-page.tsx:448` — `<div className="hidden sm:flex items-center">` — **bez `min-w-0`, bez `overflow-x-auto`**
3. `components/studio/studio-filter-bar.tsx:116` — `<div ref={containerRef} className="relative inline-flex items-center gap-2">` — **bez `flex-wrap`, bez `overflow-x-auto`**
4. Sva deca su `shrink-0 whitespace-nowrap`: `:29` (`CHIP` bazna klasa), `:129` (čipovi opsega), `:287`, `:306`

Pošto nijedno dete ne sme da se skupi, ne sme da se prelomi i ne postoji skrol kontejner,
`min-content` širina trake je tvrda donja granica. Na uskom desktopu / užem tabletu
(≈640–900px), a naročito **za osoblje** — jer `:118` dodaje još dva čipa opsega
(„Samo moji" / „Svi korisnici") + separator `:139` — zbir čipova prelazi raspoloživu
širinu i traka gura ceo studio root preko desne ivice.

> Verifikovano: `rg 'overflow-x-auto' components/studio/` → nema pogodaka.

### 5D. „Toast" koji izlazi van desne ivice — uzrok pronađen
Ono što je u hipotezi nazvano toast **nije toast** — to je lebdeći dok:
- `components/app/studio-page.tsx:659-670` — `<div className="pointer-events-none fixed bottom-4 z-30 flex justify-center px-4" style={{ left: contentBounds.left + "px", width: contentBounds.width + "px" }}>`
- `components/app/studio-page.tsx:249-273` — `contentBounds` = `studioRootRef.getBoundingClientRect()` → `{left, width}`, osvežavano preko `ResizeObserver` + `resize` + `scroll`
- `components/app/studio-page.tsx:668` — unutrašnji `<div className="pointer-events-auto w-full max-w-[720px]">`
- Sadržaj daje `floatingContent()`; grana koja renderuje poruku iz hipoteze je
  `components/app/studio-page.tsx:566-572` → `STUDIO_NOT_ENROLLED` iz `lib/studio-messages.ts:487-493`
  („Studio je u zatvorenom testiranju")

Mehanizam: dok je `position: fixed`, ali mu se `left` i `width` **prepisuju iz izmerenog
pravougaonika studio root-a**, a ne iz viewporta. Kad root iz 5C postane širi od viewporta,
`left + width` premaši desnu ivicu, i dok — pošto je `fixed` — prelije **inicijalni
sadržavajući blok**, što u Chrome-u i samo po sebi generiše horizontalni skrol.
Panel „Studio je u zatvorenom testiranju" je tako centriran u odnosu na *prelivenu*
širinu, a ne u odnosu na ekran — zato izlazi desno.

**Kratko:** 5C je koren, 5D je vidljiva posledica. Popravka 5C verovatno rešava oboje;
ali `left/width` iz `getBoundingClientRect` treba dodatno klampovati na širinu viewporta,
jer je trenutno bezuslovno vezan za element koji sme da se prelije.

> **NIJE POTVRĐENO:** tačan brejkpoint na kome se scrollbar pojavljuje. To je merenje u
> pregledaču, a U1 je samo čitanje koda. Korak koji ovo popravlja neka izmeri u
> pregledaču (osoblje-nalog, širine 640 / 768 / 900 / 1024 px).

---

## 6. Inventar praznih stanja i modala

### 6A. Prazna stanja — **četiri paralelna sistema, nijedan zajednički**

Ovo je glavni nalaz stavke 6: ne nedostaju prazna stanja, nego postoje četiri
nekompatibilna načina da se napišu.

| # | Mehanizam | Definicija | Domet | Oblik |
|---|---|---|---|---|
| 1 | `EmptyCommunityState` | `components/app/community-v2/community-shared.tsx:284` | **5** poziva, samo zajednica | ikona + naslov + telo |
| 2 | `EmptyState` (lokalna, **neeksportovana**) | `components/app/chat/study-hub.tsx:217` | **5** poziva, samo taj fajl | ikona + naslov + telo + akcija |
| 3 | `WindowCard` prop `emptyMessage` | `components/app/dashboard-windows.tsx:105`, `:114`, render `:144` | **7** poziva, samo komandna tabla | **samo tekst** (bez ikone, bez CTA) |
| 4 | Katalog poruka (podaci, ne komponenta) | `lib/studio-messages.ts:455-466` (`EmptyState` / `EmptyStateNoCta` tip) | 8 konstanti, studio + krediti | naslov + telo (+ opciono `cta`) |
| 5 | — | bespoke inline `<p>` / `<div>` | sve ostalo | proizvoljno |

**Konkretna prazna stanja (fajl:linija + trenutna poruka):**

*Komandna tabla — `components/app/dashboard-windows.tsx` (mehanizam 3, samo tekst):*
- `:331` „Nema lekcija na čekanju." / „No lessons queued up."
- `:341` „Nemaš nepročitanih poruka." / „No unread messages."
- `:351` „Još nema novih tema." / „No new threads yet."
- `:361` „Nema novih obaveštenja." / „No new notifications."
- `:370` „Još nema generisanja." / „Nothing generated yet."
- `:380` „Nemaš pozivnica ni partnera." / „No invites or partners yet."
- `:391` „Sve je pod kontrolom." / „Everything is under control." (admin)

*Komandna tabla — ritam:*
- `components/app/dashboard-content.tsx:1281-1287` „Završi prvu lekciju i ovde se pojavljuje tvoj dnevni ritam."

*Učionica — `components/app/classroom-hub.tsx`:*
- `:224-230` „Kursevi još nisu grupisani u smerove." / „Courses are not grouped into tracks yet."
- `:189-196` (nije prazno stanje nego „sve gotovo") „Sve lekcije su završene" + „Nema više lekcija na čekanju…"
- `:139` first-run blok kao prazno stanje celog ekrana (vidi §1)

*Zajednica (mehanizam 1):*
- `community-v2/community-discussions.tsx:481-486` „Nema drugih diskusija za ovaj izbor" + „Promeni opseg ili pretragu, ili pokreni prvu diskusiju za ovaj kurs."
- `community-v2/community-members.tsx:287` „Nema članova za ovaj izbor" / „No members match this view"
- `community-v2/community-my-threads.tsx:293` „Nema započetih skica", `:296` „Ovde trenutno nema tredova"
- `community-v2/community-leaderboard.tsx` — 1 poziv `EmptyCommunityState`
- `community-v2/community-mentions.tsx` — 1 poziv `EmptyCommunityState`

*Komentari (bespoke, mehanizam 5):*
- `components/app/community-comments.tsx:178` „Još nema komentara. Pokreni razmenu znanja." / „No comments yet."
- `components/app/public-community-comments.tsx:47` „Još nema komentara." / „No comments yet."

*Study hub (mehanizam 2):*
- `components/app/chat/study-hub.tsx:516` „Još nema poklapanja" / „No matches yet"
- `:615` prazno stanje partnerstava
- `:645` prazno stanje grupa

*Chat:*
- `components/app/chat/chat-group-details.tsx:197` prazna medija galerija (`border-dashed`)
- `components/app/chat/chat-inbox.tsx` — 1 prazna grana

*Studio / krediti (mehanizam 4 — `lib/studio-messages.ts`):*
- `:473` `STUDIO_PAUSED` — sa CTA → renderovano na `studio-page.tsx:552-563`
- `:487` `STUDIO_NOT_ENROLLED` — **bez CTA** → `studio-page.tsx:568-571` (vidi §5D)
- `:495` `STUDIO_NO_GENERATIONS` „Još nemaš nijednu generaciju"
- `:504` `CREDITS_NO_BALANCE` · `:513` `CREDITS_NO_PACKS` · `:522` `CREDITS_NO_HISTORY`
- `:531` `GALLERY_NO_GENERATIONS` · `:540` `PROJECT_NO_GENERATIONS` · `:549` `GALLERY_NO_MATCHES`
- `:435` `STUDIO_TERMS_GATE`

*Studio (bespoke):*
- `components/app/studio-page.tsx:589-593` „Nijedan model trenutno nije uključen. Javi se podršci."
- `components/studio/model-picker.tsx:421` „Nijedan model ne odgovara izabranim filterima."
- `components/app/studio-admin-page.tsx:217` „Nijedna kombinacija nema cenu — proveri cenovno pravilo ovog reda."

*Admin:*
- `/app/admin/content` početno stanje — **nema prazno stanje uopšte** (vidi §3B); samo praznina
- `/app/admin/users`, `/growth`, `/analytics` — `FutureModule` „Planirano" (vidi §3C)

**Kvalitet poruka, u odnosu na publiku (početnici):** mehanizam 3 (7 poruka na
komandnoj tabli) daje **samo konstataciju, bez sledećeg koraka** — „Nema lekcija na
čekanju." ne kaže šta sad. To je direktno u sukobu sa pravilom „svaki ekran mora da
odgovori na *šta sad da uradim*". Mehanizmi 1, 2 i 4 imaju telo (a 2 i 4 i CTA) i tu su
znatno bolji. Ovo je najkonkretnija meta za copy-korak.

### 6B. Modali — kompletan popis sa stanjem fokusa

24 `fixed inset-0` pojave u 17 fajlova. Klasifikacija:

**Pravi modali SA kompletnim fokus trapom (8):**

| Fajl:linija | Modal | Trap |
|---|---|---|
| `chat/chat-dialogs.tsx:129` | `NewConversationDialog` | #2 `useModalDialog` |
| `chat/chat-dialogs.tsx:210` | `ReportDialog` | #2 |
| `chat/chat-group-details.tsx:186` | `ConversationDetailsDialog` | #2 |
| `community-thread-dialog.tsx:90` | `CommunityThreadDialog` (+ `ConfirmDialog` na `:134`) | #3 inline |
| `member-profile.tsx:403` | study invite | #1 `useModalFocus` |
| `member-profile.tsx:424` | report | #1 |
| `member-profile.tsx:196` | `FollowDialogShell` (Pratioci) | #4 delimičan — **bez vraćanja fokusa** |
| `member-profile.tsx:196` | isti shell (Pratim) | #4 delimičan |

**Pravi modali BEZ fokus trapa (8) — meta za U-korake:**

| Fajl:linija | Modal | Ima |
|---|---|---|
| `app-composer-sheet.tsx:57` (`AppComposerSheet`) | **5 admin composera** (`admin-inline-actions.tsx:1190, 2019, 2389, 2696, 2890`) | samo `Escape` (`:28-34`) |
| `admin-inline-actions.tsx:1514` | „Nesnimljene izmene" (kurs) | ništa |
| `admin-inline-actions.tsx:2218` | „Nesnimljene izmene" (lekcija) | ništa |
| `studio-media-detail.tsx:456` | potvrda brisanja | ništa, ni `role="dialog"` |
| `studio-media-detail.tsx:343` | pun ekran detalja | `Escape` (`:200`) |
| `chat/chat-inbox.tsx:141` | podešavanja obaveštenja | ništa |
| `chat/chat-thread.tsx:767` | podešavanja razgovora | ništa |
| `studio/studio-composer.tsx:1130` | panel composera | delimično (`:763-772`) |

**Popover (namerno ne-modal) — ne dirati:** `studio/studio-filter-bar.tsx:172` (`aria-modal="false"`)

**Nisu modali (drag overlay / scrim) — ne dirati (10):**
`chat/chat-thread.tsx:757` · `studio/drop-slot.tsx:271` · `track-experience.tsx:114` ·
`community-post-editor.tsx:571` · `profile-editor.tsx:567` ·
`admin-inline-actions.tsx:1480`, `:2783` · `app-sidebar.tsx:1581` ·
`chat/chat-dock.tsx:162` · `chat/chat-notifications.tsx:96`

---

## Redosled zavisnosti za U2–U10

Poređano tako da kasniji korak nikad ne prepravlja ono što raniji tek uvodi.

```
U2  Dialog primitiv  ─────────────┬──> U3  Migracija modala
     (objedini trapove #1/#2/#3)  │
                                  └──> U4  ConfirmDialog → gasi window.confirm/alert
U5  Ruta in-app kataloga kurseva ──┬──> U6  Popravka first-run gejta (§1A + §1B)
                                   └──> U7  Preusmeravanje #pricing CTA
U8  Tokeni boja (#2e6f9f + ostalo) ──> U9  focus-visible + radiusi
U10 Copy praznih stanja (posle EmptyState primitiva)
```

**Tvrde zavisnosti:**

1. **§4A/§4B → sve ostalo oko modala.** `Dialog` primitiv (iz tri postojeća trapa)
   mora prvi. Bez njega, migracija 8 modala bez trapa znači osam kopija iste logike —
   tačno dug koji već imamo. **Blokira:** migraciju modala i `ConfirmDialog`.

2. **`ConfirmDialog` → §4F.** Pet `window.confirm`/`alert` poziva ne mogu da se zamene
   dok `ConfirmDialog` ne postoji. `ConfirmDialog` zavisi od `Dialog`.
   **Redosled:** `Dialog` → `ConfirmDialog` → zamena 5 native poziva.

3. **§2A → §1 i §2B.** In-app ruta kataloga kurseva mora da postoji **pre** nego što se
   dira „Pogledaj kurseve" CTA (`dashboard-content.tsx:1023`) i pre popravke first-run
   gejta — inače prepravljamo CTA da vodi u rutu koje nema.
   **Redosled:** nova ruta → CTA (§2B, 5 mesta) → gejt (§1).

4. **§1A i §1B se moraju rešiti ZAJEDNO, u jednom koraku.** Dva gejta danas koriste dva
   različita pojma „ima kurs": `classroom-hub.tsx:100` (`hasAccess`) i
   `dashboard-content.tsx:1252` + `convex/dashboard.ts:108-116` (svi objavljeni). Ako se
   popravi samo jedan, `/app` i `/app/classroom` će i dalje protivrečiti jedan drugom.
   Ovo dodiruje `convex/dashboard.ts` → **obavezno `npx convex codegen`** i
   `convex/_generated/ai/guidelines.md` pre pisanja.

5. **§4D (tokeni) → §4C (focus-visible).** Focus ring hoće boju. Ako se `focus-visible`
   doda pre nego što tokeni postoje, dobija se novi goli hex — 59 novih.
   **Redosled:** deklariši token(e) za `#2e6f9f` i plavu familiju → pa `focus-visible`.

6. **§4E (radiusi) je nezavisan i mehanički.** 40 mesta u app delu (3 marketing mesta se
   preskaču). Može bilo kad, ali ga je najjeftinije raditi u istom koraku kao §4C —
   isti fajlovi se ionako otvaraju.

7. **§6A (EmptyState primitiv) → §6 copy.** Objedinjavanje četiri mehanizma mora pre
   prepravke tekstova, inače se isti tekst piše na četiri mesta. Najveći dobitak je
   mehanizam 3 (`dashboard-windows.tsx`, 7 poruka bez sledećeg koraka).

8. **§3 (admin) je izolovan.** Ne deli kod ni sa jednim gornjim čvorom osim
   `AppComposerSheet` (§4B) — pa admin UI korak treba **posle** U2/U3, da nasledi
   ispravan `Dialog`. §3D (i18n za `admin-content-manager.tsx`) može odvojeno.

9. **§5 (studio overflow) je potpuno izolovan.** Nijedan drugi korak ne zavisi od njega
   i on ne zavisi ni od čega. Može se raditi paralelno kad god.
   Zahteva verifikaciju u pregledaču (vidi „NIJE POTVRĐENO" u §5D).

**Bez zavisnosti, mogu odmah:** §5 (studio overflow), §3D (admin i18n), §4E (radiusi).
