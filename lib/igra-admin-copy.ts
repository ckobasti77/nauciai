import type { LocalizedText } from "./i18n";

/**
 * Tekstovi admina „Kontrolna soba" (K21, plan K20). Robi javlja stanje mirno i činjenično:
 * admin treba tačnu rečenicu, ne alarm (O9). Brojevi se umeću u `lib/igra-admin.ts`.
 *
 * Namerno NIJE u `lib/igra-copy.ts`: taj modul ulazi ceo u početni JS table (`/app`, budžet
 * 294 KB), a ove rečenice trebaju samo adminu. Isti oblik `{ sr, en }` (K01, ODLUKA 12).
 */
export const IGRA_ADMIN_COPY = {
  eyebrow: { sr: "Administracija · Kontrolna soba", en: "Administration · Control room" },
  system: { sr: "Sistem", en: "System" },
  platformState: { sr: "Stanje platforme", en: "Platform state" },
  robiAllGood: { sr: "Sve radi.", en: "Everything is running." },
  robiGuardLate: { sr: "Čuvar troška se ne javlja. Pogledaj Crea admin.", en: "The cost guard is not reporting. Check Crea admin." },
  robiGuardFailed: { sr: "Čuvar troška je javio grešku. Pogledaj Crea admin.", en: "The cost guard reported an error. Check Crea admin." },
  robiSpendKill: { sr: "Današnji trošak je preko granice gašenja.", en: "Today's spend is over the shut-off line." },
  robiSpendAlarm: { sr: "Današnji trošak je preko praga upozorenja.", en: "Today's spend is over the warning line." },
  robiCreaOff: { sr: "Crea je ugašena.", en: "Crea is switched off." },
  robiPending: { sr: "na čekanju.", en: "awaiting review." },
  creaOn: { sr: "Crea radi", en: "Crea is on" },
  creaOff: { sr: "Crea je ugašena", en: "Crea is off" },
  guardOk: { sr: "Čuvar troška radi", en: "Cost guard running" },
  guardNever: { sr: "Čuvar troška se nije javio", en: "Cost guard never reported" },
  guardLate: { sr: "Čuvar troška kasni", en: "Cost guard is late" },
  guardFailed: { sr: "Čuvar troška: greška", en: "Cost guard: error" },
  spendToday: { sr: "Danas", en: "Today" },
  spendOf: { sr: "od", en: "of" },
  queueClear: { sr: "Red je čist", en: "Queue is clear" },
  queueWaiting: { sr: "na čekanju", en: "waiting" },
  content: { sr: "Sadržaj", en: "Content" },
  pending: { sr: "Čeka pregled", en: "Awaiting review" },
  pendingHint: { sr: "Objave u zajednici koje čekaju odobrenje.", en: "Community posts waiting for approval." },
  openQueue: { sr: "Otvori red", en: "Open the queue" },
  analyticsIntro: {
    sr: "Ovo baza već zna. Posete i izvori saobraćaja stižu kad se poveže Google Analytics.",
    en: "This is what the database already knows. Visits and traffic sources arrive once Google Analytics is connected.",
  },
  chartContent: { sr: "Stanje sadržaja", en: "Content status" },
  chartContentNote: { sr: "Udeo objavljenog, nacrta i arhive u svakoj vrsti.", en: "Share of published, draft and archived in each kind." },
  chartJobs: { sr: "Crea poslovi danas", en: "Crea jobs today" },
  chartJobsNote: { sr: "Po statusu, za dan", en: "By status, for day" },
  chartJobsCapped: { sr: "Neki statusi imaju više poslova nego što se broji.", en: "Some statuses have more jobs than are counted." },
  chartPrompts: { sr: "Crea upiti po danu", en: "Crea prompts per day" },
  chartPromptsNote: {
    sr: "Otisci upita iz Crea zaštite, bez teksta. Poslednjih 14 dana.",
    en: "Prompt fingerprints from Crea safety, no text. Last 14 days.",
  },
  chartPassed: { sr: "Propušteni", en: "Passed" },
  chartRefused: { sr: "Odbijeni", en: "Refused" },
  chartCapped: { sr: "Iz poslednjih 200 zapisa: stariji dani nisu poznati.", en: "From the latest 200 records: older days are unknown." },
  chartNoData: { sr: "nema podataka", en: "no data" },
  chartAtLeast: { sr: "najmanje", en: "at least" },
  chartTotal: { sr: "ukupno", en: "total" },
  chartMax: { sr: "najviše", en: "max" },
  chartToday: { sr: "danas", en: "today" },
  chartTable: { sr: "Tabela", en: "Table" },
  chartDay: { sr: "Dan", en: "Day" },
  chartCount: { sr: "Broj", en: "Count" },
  chartEmpty: { sr: "Još nema zapisa.", en: "No records yet." },
  // K22: red misija, pečat spremnosti, Crea admin.
  missionQueue: { sr: "Red misija", en: "Mission queue" },
  missionBody: {
    sr: "Svaka objava je jedna misija: pročitaj je, pa je odobri ili zatraži izmenu.",
    en: "Every post is one mission: read it, then approve it or request changes.",
  },
  mission: { sr: "Misija", en: "Mission" },
  ready: { sr: "Spremno", en: "Ready" },
  creaPromptsLink: { sr: "Crea upiti po danu su na Analitici", en: "Crea prompts per day live on Analytics" },
} satisfies Record<string, LocalizedText>;
