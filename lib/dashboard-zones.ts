/**
 * Vizuelni identitet zona komandne table (U11).
 *
 * Komandna tabla prikazuje sest do osam prozora koji su do sada izgledali potpuno
 * isto — ista bela povrsina, isti okvir, ista sitna ikonica u redu sa etiketom.
 * Pocetnik na prvi pogled nije mogao da razlikuje Ucionicu od Poruka, pa je svaki
 * put morao da CITA zaglavlje da bi znao gde gleda.
 *
 * Resenje NIJE nova boja po zoni: paleta ima samo mastilo, papir i zutu, i to se ne
 * menja (AGENTS.md). Umesto toga zona dobija plocicu sa ikonom, a plocica ima jedan
 * od TRI akcenta, po tome sta se u toj zoni radi:
 *
 * - `yellow` — zona u kojoj student sam nesto radi: Ucionica i Studio. Zuta je u
 *   celom proizvodu boja radnje (primarno dugme), pa je isti signal i ovde.
 * - `ink`    — zona sa drugim ljudima: Poruke, Zajednica, Uci zajedno.
 * - `paper`  — zona koja samo javlja stanje: Obavestenja i dva admin prozora.
 *
 * Tri grupe su namerno male: cim bi svaka zona imala svoj izgled, mreza bi opet bila
 * nerazlucljiva, samo sarenije. Ovako se zone razlikuju, a tabla ostaje jedan sistem.
 *
 * Ovde ne zivi nijedan React poziv — samo mapa i klase, po uzoru na
 * `lib/dashboard-first-run.ts` i `lib/type-scale.ts`.
 */

export type DashboardZoneId =
  | "classroom"
  | "messages"
  | "community"
  | "notifications"
  | "studio"
  | "study"
  | "adminContent"
  | "adminPeople";

export type DashboardZoneAccent = "yellow" | "ink" | "paper";

/** Sta se u zoni radi — jedini razlog zbog kog zona dobija bas svoj akcenat. */
export type DashboardZoneRole = "do" | "people" | "status";

const ZONE_ROLES: Record<DashboardZoneId, DashboardZoneRole> = {
  classroom: "do",
  studio: "do",
  messages: "people",
  community: "people",
  study: "people",
  notifications: "status",
  adminContent: "status",
  adminPeople: "status",
};

const ROLE_ACCENTS: Record<DashboardZoneRole, DashboardZoneAccent> = {
  do: "yellow",
  people: "ink",
  status: "paper",
};

/**
 * Klase plocice sa ikonom. Svaka varijanta nosi `border-ink`, jer je skolski crni
 * okvir ono sto oblik drzi i u svetloj i u tamnoj temi — bez njega bi `paper`
 * plocica na `bg-paper-strong` panelu nestala. Iskljucivo tokeni, nijedan gol heks.
 */
const ACCENT_CHIPS: Record<DashboardZoneAccent, string> = {
  yellow: "border-ink bg-yellow text-ink",
  ink: "border-ink bg-ink text-paper-strong",
  paper: "border-ink bg-paper text-ink",
};

export function dashboardZoneRole(zone: DashboardZoneId): DashboardZoneRole {
  return ZONE_ROLES[zone];
}

export function dashboardZoneAccent(zone: DashboardZoneId): DashboardZoneAccent {
  return ROLE_ACCENTS[ZONE_ROLES[zone]];
}

/** Gotove klase za plocicu zone — pozivalac dodaje samo veličinu i radius. */
export function dashboardZoneChipClass(zone: DashboardZoneId): string {
  return ACCENT_CHIPS[dashboardZoneAccent(zone)];
}

/** Sve zone u redosledu u kom se renderuju — ulaz za test pokrivenosti. */
export const dashboardZoneIds = Object.keys(ZONE_ROLES) as DashboardZoneId[];
