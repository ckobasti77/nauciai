import type { LocalizedText } from "./i18n";

/**
 * Pokreti kamere za video (Crea K18, V7; plan K17 §3.1): ~40 pokreta, svaki sa
 * imenom, mini-lekcijom (šta radi i kad se koristi), animiranom SKICOM (podaci, ne
 * video) i rečenicom koja ide modelu.
 *
 * Rečenica je prirodan engleski za SVE porodice modela (K17-17): posebna sintaksa
 * (npr. MiniMax komande u uglastim zagradama) nije potvrđena ni na jednoj fal strani
 * modela iz kataloga, pa se ne izmišlja.
 *
 * Skica: dva sloja - pozadina (`scene`) i lik (`subject`) - pomeraju se po ključnim
 * tačkama. `t` je 0..1 trajanja petlje, `x`/`y` pomeraj u delovima širine/visine
 * kadra, `s` razmera, `r` okret u stepenima. Kamera koja ide desno pomera SLIKU
 * ulevo, pa su znaci u podacima ono što oko vidi u kadru, ne put kamere.
 */

export type CameraMoveGroup = "osnovni" | "kretanje" | "okretanje" | "visina" | "dron" | "spektakl" | "fokus-vreme";

export type SketchKey = { t: number; x: number; y: number; s: number; r: number };

export type CameraMoveIcon = "dron" | "ruka" | "sat" | "fokus";

export type CameraMove = {
  id: string;
  group: CameraMoveGroup;
  label: LocalizedText;
  /** Mini-lekcija: šta pokret radi i kad se koristi (≤ 220 znakova). */
  lesson: LocalizedText;
  sketch: { scene: readonly SketchKey[]; subject?: readonly SketchKey[]; icon?: CameraMoveIcon };
  /** Engleski, bez tačke na kraju. */
  phrase: string;
  /** Pokret ima smisla „blago" i „jako" (brzina i veličina pomeraja). */
  intensity?: true;
};

export type CameraMoveIntensity = "blago" | "jako";

export const CAMERA_MOVE_GROUPS: ReadonlyArray<{ id: CameraMoveGroup; label: LocalizedText }> = [
  { id: "osnovni", label: { sr: "Osnovni", en: "Basics" } },
  { id: "kretanje", label: { sr: "Kretanje", en: "Moving" } },
  { id: "okretanje", label: { sr: "Okretanje", en: "Turning" } },
  { id: "visina", label: { sr: "Visina i ugao", en: "Height and angle" } },
  { id: "dron", label: { sr: "Dron", en: "Drone" } },
  { id: "spektakl", label: { sr: "Spektakl", en: "Spectacle" } },
  { id: "fokus-vreme", label: { sr: "Fokus i vreme", en: "Focus and time" } },
];

const k = (t: number, x = 0, y = 0, s = 1, r = 0): SketchKey => ({ t, x, y, s, r });
const still = [k(0), k(1)];

export const CAMERA_MOVES: readonly CameraMove[] = [
  // ── Osnovni ───────────────────────────────────────────────────────────────
  {
    id: "staticno",
    group: "osnovni",
    label: { sr: "Mirna kamera", en: "Static shot" },
    lesson: {
      sr: "Kamera stoji, pomera se samo ono što je u kadru. Najbolje kad radnja treba da bude glavna, npr. ples ili razgovor.",
      en: "The camera stays put and only what is in the frame moves. Best when the action should be the star, like a dance or a talk.",
    },
    sketch: { scene: still, subject: [k(0), k(0.5, 0, -0.04), k(1)] },
    phrase: "static locked-off camera, no camera movement",
  },
  {
    id: "priblizavanje",
    group: "osnovni",
    label: { sr: "Približavanje", en: "Push in" },
    lesson: {
      sr: "Kamera polako ide ka liku. Pojačava osećaj: gledalac se „unosi” u trenutak. Za važnu rečenicu ili otkriće.",
      en: "The camera slowly moves toward the subject. It builds emotion: the viewer leans into the moment. For a key line or a reveal.",
    },
    sketch: { scene: [k(0), k(1, 0, 0, 1.2)], subject: [k(0), k(1, 0, 0, 1.55)] },
    phrase: "the camera slowly dollies in toward the subject",
    intensity: true,
  },
  {
    id: "udaljavanje",
    group: "osnovni",
    label: { sr: "Udaljavanje", en: "Pull out" },
    lesson: {
      sr: "Kamera se povlači i otkriva gde je lik. Dobar kraj klipa ili otkrivanje iznenađenja u okolini.",
      en: "The camera backs away and reveals where the subject is. A good ending, or a way to reveal a surprise around them.",
    },
    sketch: { scene: [k(0, 0, 0, 1.2), k(1)], subject: [k(0, 0, 0, 1.55), k(1)] },
    phrase: "the camera slowly dollies out, revealing more of the scene",
    intensity: true,
  },
  {
    id: "zum-unutra",
    group: "osnovni",
    label: { sr: "Zum unutra", en: "Zoom in" },
    lesson: {
      sr: "Objektiv uvećava, kamera stoji. Za razliku od približavanja, sve se uvećava jednako - izgleda kao dokumentarac ili TV.",
      en: "The lens magnifies while the camera stays still. Unlike a push in, everything grows equally - it feels like a documentary or TV.",
    },
    sketch: { scene: [k(0), k(1, 0, 0, 1.6)], subject: [k(0), k(1, 0, 0, 1.6)] },
    phrase: "smooth optical zoom in on the subject",
    intensity: true,
  },
  {
    id: "zum-napolje",
    group: "osnovni",
    label: { sr: "Zum napolje", en: "Zoom out" },
    lesson: {
      sr: "Objektiv se širi i u kadar ulazi sve više prostora. Dobro za šalu „otkrivanja” šta se zapravo dešava.",
      en: "The lens widens and more and more space enters the frame. Great for the joke of revealing what is really going on.",
    },
    sketch: { scene: [k(0, 0, 0, 1.6), k(1)], subject: [k(0, 0, 0, 1.6), k(1)] },
    phrase: "smooth optical zoom out from the subject",
    intensity: true,
  },
  // ── Kretanje ──────────────────────────────────────────────────────────────
  {
    id: "panorama-levo",
    group: "kretanje",
    label: { sr: "Panorama levo", en: "Pan left" },
    lesson: {
      sr: "Kamera se okreće ulevo sa mesta, kao kad okreneš glavu. Za razgledanje prostora ili prelaz na drugi lik.",
      en: "The camera turns left on the spot, like turning your head. For looking around a place or moving to another person.",
    },
    sketch: { scene: [k(0, -0.15), k(1, 0.2)], subject: [k(0, -0.15), k(1, 0.25)] },
    phrase: "the camera pans left",
    intensity: true,
  },
  {
    id: "panorama-desno",
    group: "kretanje",
    label: { sr: "Panorama desno", en: "Pan right" },
    lesson: {
      sr: "Kamera se okreće udesno sa mesta. Prati čitanje sleva nadesno, pa deluje prirodno i mirno.",
      en: "The camera turns right on the spot. It follows the left-to-right reading direction, so it feels natural and calm.",
    },
    sketch: { scene: [k(0, 0.15), k(1, -0.2)], subject: [k(0, 0.15), k(1, -0.25)] },
    phrase: "the camera pans right",
    intensity: true,
  },
  {
    id: "bocno-levo",
    group: "kretanje",
    label: { sr: "Bočno levo", en: "Truck left" },
    lesson: {
      sr: "Cela kamera klizi ulevo. Bliže stvari promiču brže od daljih, pa slika dobija dubinu.",
      en: "The whole camera slides left. Near things pass faster than far ones, so the picture gains depth.",
    },
    sketch: { scene: [k(0, -0.08), k(1, 0.1)], subject: [k(0, -0.2), k(1, 0.3)] },
    phrase: "the camera trucks left alongside the scene",
  },
  {
    id: "bocno-desno",
    group: "kretanje",
    label: { sr: "Bočno desno", en: "Truck right" },
    lesson: {
      sr: "Cela kamera klizi udesno. Lepo za proizvod na stolu ili red ljudi.",
      en: "The whole camera slides right. Lovely for a product on a table or a line of people.",
    },
    sketch: { scene: [k(0, 0.08), k(1, -0.1)], subject: [k(0, 0.2), k(1, -0.3)] },
    phrase: "the camera trucks right alongside the scene",
  },
  {
    id: "pracenje-iza",
    group: "kretanje",
    label: { sr: "Praćenje iza lika", en: "Follow from behind" },
    lesson: {
      sr: "Kamera ide za likom dok hoda. Gledalac ide sa njim - kao u igrici iz trećeg lica.",
      en: "The camera follows the subject as they walk. The viewer travels with them, like a third-person game.",
    },
    sketch: { scene: [k(0), k(1, 0, 0.03, 1.3)], subject: [k(0), k(0.25, 0, -0.02), k(0.5), k(0.75, 0, -0.02), k(1)] },
    phrase: "tracking shot following the subject from behind",
  },
  {
    id: "pracenje-sa-strane",
    group: "kretanje",
    label: { sr: "Praćenje sa strane", en: "Side tracking" },
    lesson: {
      sr: "Kamera ide uporedo sa likom, a pozadina promiče. Odlično za trčanje, vožnju bicikla ili šetnju gradom.",
      en: "The camera moves alongside the subject while the background rushes by. Great for running, cycling or a city walk.",
    },
    sketch: { scene: [k(0, 0.2), k(1, -0.3)], subject: [k(0), k(0.5, 0, -0.03), k(1)] },
    phrase: "side tracking shot moving parallel with the subject",
  },
  {
    id: "lik-vodi",
    group: "kretanje",
    label: { sr: "Lik vodi kameru", en: "Leading shot" },
    lesson: {
      sr: "Kamera se povlači unazad ispred lika koji ide ka njoj. Vidiš mu lice i odlučnost - dobro za uvod lika.",
      en: "The camera backs up in front of a subject walking toward it. You see their face and resolve - good for introducing someone.",
    },
    sketch: { scene: [k(0, 0, 0, 1.3), k(1)], subject: [k(0), k(0.5, 0, -0.03), k(1)] },
    phrase: "leading shot, the camera moves backward in front of the subject as they walk toward it",
  },
  {
    id: "preko-ramena",
    group: "kretanje",
    label: { sr: "Preko ramena", en: "Over the shoulder" },
    lesson: {
      sr: "Gledamo preko ramena jednog lika ka drugom. Klasika za razgovor: znaš ko kome priča.",
      en: "We look over one person's shoulder toward another. A conversation classic: you know who is talking to whom.",
    },
    sketch: { scene: [k(0, 0.05), k(1, 0.03, 0, 1.05)], subject: [k(0, -0.32, 0.12, 1.5), k(1, -0.3, 0.12, 1.5)] },
    phrase: "over-the-shoulder shot",
  },
  {
    id: "subjektivni",
    group: "kretanje",
    label: { sr: "Kroz oči lika", en: "Point of view" },
    lesson: {
      sr: "Kamera su oči lika, pa se lagano njiše dok hoda. Gledalac postaje lik - za horor, igrice i „dan iz mog života”.",
      en: "The camera is the character's eyes and sways gently as they walk. The viewer becomes them - for horror, games and day-in-my-life.",
    },
    sketch: { scene: [k(0), k(0.25, 0.02, 0.02, 1.05), k(0.5, 0, 0, 1.1), k(0.75, -0.02, 0.02, 1.12), k(1, 0, 0, 1.15)] },
    phrase: "first-person point-of-view shot, slight natural head movement",
  },
  // ── Okretanje ─────────────────────────────────────────────────────────────
  {
    id: "kruzenje-levo",
    group: "okretanje",
    label: { sr: "Kruženje levo", en: "Orbit left" },
    lesson: {
      sr: "Kamera kruži oko lika ulevo, a on ostaje u sredini. Daje osećaj važnosti - kao heroj u filmu.",
      en: "The camera circles the subject to the left while they stay centred. It feels important - like a hero in a film.",
    },
    sketch: { scene: [k(0, -0.15), k(1, 0.3)], subject: [k(0), k(0.5, 0.02, 0, 0.97), k(1)] },
    phrase: "the camera orbits around the subject to the left",
    intensity: true,
  },
  {
    id: "kruzenje-desno",
    group: "okretanje",
    label: { sr: "Kruženje desno", en: "Orbit right" },
    lesson: {
      sr: "Kamera kruži oko lika udesno. Lepo za proizvod na postolju ili novu frizuru.",
      en: "The camera circles the subject to the right. Lovely for a product on a stand or a new haircut.",
    },
    sketch: { scene: [k(0, 0.15), k(1, -0.3)], subject: [k(0), k(0.5, -0.02, 0, 0.97), k(1)] },
    phrase: "the camera orbits around the subject to the right",
    intensity: true,
  },
  {
    id: "luk-180",
    group: "okretanje",
    label: { sr: "Luk od 180°", en: "180° arc" },
    lesson: {
      sr: "Kamera ide pola kruga oko lika, od lica do leđa ili obrnuto. Dramatičan trenutak odluke.",
      en: "The camera goes half a circle around the subject, from face to back or the other way. A dramatic moment of decision.",
    },
    sketch: { scene: [k(0, -0.3), k(0.5, 0.05), k(1, 0.4)], subject: [k(0), k(0.5, 0, 0, 0.9), k(1)] },
    phrase: "the camera arcs 180 degrees around the subject",
  },
  {
    id: "rotacija",
    group: "okretanje",
    label: { sr: "Okretanje horizonta", en: "Camera roll" },
    lesson: {
      sr: "Kamera se okreće oko svoje ose, pa se horizont naginje. Za san, vrtoglavicu ili ludu zabavu.",
      en: "The camera rotates around its own axis, so the horizon tilts. For a dream, dizziness or a wild party.",
    },
    sketch: { scene: [k(0), k(1, 0, 0, 1.1, 25)], subject: [k(0), k(1, 0, 0, 1.1, 25)] },
    phrase: "the camera slowly rolls, rotating the horizon",
    intensity: true,
  },
  {
    id: "brzi-okret",
    group: "okretanje",
    label: { sr: "Brzi okret", en: "Whip pan" },
    lesson: {
      sr: "Kamera naglo „šibne” u stranu uz zamućenje. Energičan prelaz na sledeću scenu - omiljen na TikToku.",
      en: "The camera whips sideways with motion blur. An energetic jump to the next scene - a TikTok favourite.",
    },
    sketch: { scene: [k(0), k(0.4), k(0.6, -0.6), k(1, -0.6)], subject: [k(0), k(0.4), k(0.6, -0.8), k(1, -0.8)] },
    phrase: "fast whip pan with motion blur",
  },
  {
    id: "iz-ruke",
    group: "okretanje",
    label: { sr: "Iz ruke", en: "Handheld" },
    lesson: {
      sr: "Kamera se blago trese kao da je neko drži. Deluje stvarno i blisko, kao snimak sa telefona.",
      en: "The camera shakes gently as if someone holds it. It feels real and close, like a phone video.",
    },
    sketch: { scene: [k(0), k(0.2, 0.015, -0.01), k(0.45, -0.01, 0.015), k(0.7, 0.012, 0.01), k(1)], icon: "ruka" },
    phrase: "handheld camera with gentle natural shake",
  },
  {
    id: "drhtanje",
    group: "okretanje",
    label: { sr: "Drhtanje kamere", en: "Camera shake" },
    lesson: {
      sr: "Snažno drmanje, kao od udarca ili eksplozije. Koristi kratko, za udarac u ritmu ili šok.",
      en: "A strong shake, as if from an impact or explosion. Use it briefly, for a beat drop or a shock.",
    },
    sketch: { scene: [k(0), k(0.1, 0.04, -0.03), k(0.2, -0.04, 0.03), k(0.3, 0.03, 0.02), k(0.4), k(1)] },
    phrase: "strong camera shake, as if from an impact",
  },
  // ── Visina i ugao ─────────────────────────────────────────────────────────
  {
    id: "nagib-gore",
    group: "visina",
    label: { sr: "Nagib gore", en: "Tilt up" },
    lesson: {
      sr: "Kamera se sa mesta naginje nagore, od stopala do glave ili do vrha zgrade. Pokazuje visinu i veličinu.",
      en: "The camera tilts upward on the spot, from feet to head or to the top of a building. It shows height and scale.",
    },
    sketch: { scene: [k(0, 0, -0.2), k(1, 0, 0.25)], subject: [k(0, 0, -0.2), k(1, 0, 0.25)] },
    phrase: "the camera tilts up",
    intensity: true,
  },
  {
    id: "nagib-dole",
    group: "visina",
    label: { sr: "Nagib dole", en: "Tilt down" },
    lesson: {
      sr: "Kamera se naginje nadole, sa neba na lik ili sa lica na ruke. Vodi pogled na ono što je važno.",
      en: "The camera tilts downward, from the sky to the subject or from a face to the hands. It guides the eye to what matters.",
    },
    sketch: { scene: [k(0, 0, 0.2), k(1, 0, -0.25)], subject: [k(0, 0, 0.2), k(1, 0, -0.25)] },
    phrase: "the camera tilts down",
    intensity: true,
  },
  {
    id: "kran-gore",
    group: "visina",
    label: { sr: "Kran nagore", en: "Crane up" },
    lesson: {
      sr: "Kamera se diže uvis kao na dizalici i otkriva prostor oko lika. Veličanstven kraj ili početak.",
      en: "The camera rises as if on a crane and reveals the space around the subject. A grand ending or opening.",
    },
    sketch: { scene: [k(0), k(1, 0, 0.2, 0.92)], subject: [k(0), k(1, 0, 0.35, 0.8)] },
    phrase: "crane shot rising up over the scene",
  },
  {
    id: "kran-dole",
    group: "visina",
    label: { sr: "Kran nadole", en: "Crane down" },
    lesson: {
      sr: "Kamera se spušta odozgo do lika. Kao da priča počinje: „a ovde živi…”.",
      en: "The camera descends from above to the subject. As if the story begins: 'and here lives…'.",
    },
    sketch: { scene: [k(0, 0, 0.2, 0.92), k(1)], subject: [k(0, 0, 0.35, 0.8), k(1)] },
    phrase: "crane shot descending down toward the subject",
  },
  {
    id: "zablja",
    group: "visina",
    label: { sr: "Žablja perspektiva", en: "Low angle" },
    lesson: {
      sr: "Kamera je nisko i gleda nagore. Lik deluje snažno i veliko - za šefa, heroja ili zgradu.",
      en: "The camera sits low and looks up. The subject looks strong and big - for a boss, a hero or a building.",
    },
    sketch: { scene: [k(0, 0, 0.12), k(1, 0, 0.12, 1.08)], subject: [k(0, 0, 0.05, 1.3), k(1, 0, 0.05, 1.4)] },
    phrase: "low-angle shot looking up at the subject",
  },
  {
    id: "pticja",
    group: "visina",
    label: { sr: "Ptičja perspektiva", en: "Bird's-eye view" },
    lesson: {
      sr: "Kamera gleda pravo odozgo. Lik deluje malo, a raspored stvari postaje šara - za hranu, ples ili mapu.",
      en: "The camera looks straight down. The subject looks small and the layout becomes a pattern - for food, dance or a map.",
    },
    sketch: { scene: [k(0, 0, 0, 0.85), k(1, 0, 0, 0.85, 12)], subject: [k(0, 0, 0, 0.7), k(1, 0, 0, 0.7, 12)] },
    phrase: "top-down bird's-eye view shot looking straight down",
  },
  {
    id: "do-detalja",
    group: "visina",
    label: { sr: "Spuštanje do detalja", en: "Down to the detail" },
    lesson: {
      sr: "Kamera se spušta i prilazi jednom detalju - prstenu, šoljici, natpisu. Kaže: „ovo je bitno”.",
      en: "The camera moves down and closes in on one detail - a ring, a cup, a sign. It says: this matters.",
    },
    sketch: { scene: [k(0), k(1, 0, -0.25, 1.8)], subject: [k(0), k(1, 0, -0.25, 1.8)] },
    phrase: "the camera moves down and pushes in to a close-up detail",
  },
  // ── Dron ──────────────────────────────────────────────────────────────────
  {
    id: "dron-napred",
    group: "dron",
    label: { sr: "Dron napred", en: "Drone forward" },
    lesson: {
      sr: "Snimak iz vazduha, let napred iznad pejzaža. Za grad, more, planine - uvod koji „otvara” priču.",
      en: "An aerial shot flying forward over the landscape. For a city, the sea, mountains - an opening that sets the story.",
    },
    sketch: { scene: [k(0, 0, 0, 0.9), k(1, 0, 0.05, 1.35)], subject: [k(0, 0, 0, 0.6), k(1, 0, 0.05, 0.9)], icon: "dron" },
    phrase: "aerial drone shot flying forward over the landscape",
  },
  {
    id: "dron-uspon",
    group: "dron",
    label: { sr: "Dron uspon", en: "Drone reveal" },
    lesson: {
      sr: "Dron se diže i povlači, pa se otkriva celo mesto. Savršen poslednji kadar.",
      en: "The drone rises and backs away to reveal the whole place. The perfect final shot.",
    },
    sketch: { scene: [k(0, 0, 0.15, 1.35), k(1, 0, 0, 0.85)], subject: [k(0, 0, 0.15, 1.2), k(1, 0, 0, 0.55)], icon: "dron" },
    phrase: "drone shot rising up and back to reveal the whole place",
  },
  {
    id: "dron-kruzenje",
    group: "dron",
    label: { sr: "Dron kruži", en: "Drone orbit" },
    lesson: {
      sr: "Dron kruži oko zgrade, spomenika ili čoveka na vrhu brda. Daje epski utisak.",
      en: "The drone circles a building, a monument or a person on a hilltop. It feels epic.",
    },
    sketch: { scene: [k(0, -0.15, 0, 0.9, -3), k(1, 0.2, 0, 0.9, 5)], subject: [k(0, 0, 0, 0.7), k(1, 0, 0, 0.7)], icon: "dron" },
    phrase: "aerial drone shot circling around the subject",
  },
  {
    id: "fpv",
    group: "dron",
    label: { sr: "FPV let", en: "FPV flight" },
    lesson: {
      sr: "Brz trkački dron koji uleće i provlači se kroz prostor. Adrenalin - za sport, auto ili žurku.",
      en: "A fast racing drone diving and weaving through the space. Pure adrenaline - for sport, a car or a party.",
    },
    sketch: { scene: [k(0, 0, 0, 1, -6), k(0.5, 0.05, 0, 1.5, 6), k(1, 0, 0, 2.1, -4)], icon: "dron" },
    phrase: "fast FPV drone shot weaving through the scene",
  },
  {
    id: "kroz-otvor",
    group: "dron",
    label: { sr: "Kroz prozor ili vrata", en: "Through an opening" },
    lesson: {
      sr: "Kamera proleti kroz prozor, vrata ili luk i uđe u novi prostor. Magičan prelaz iz spolja unutra.",
      en: "The camera flies through a window, door or arch into a new space. A magical move from outside to inside.",
    },
    sketch: { scene: [k(0), k(0.7, 0, 0, 2.2), k(1, 0, 0, 2.6)], subject: [k(0, 0, 0, 0.6), k(1, 0, 0, 1.2)] },
    phrase: "the camera flies through an opening, window or doorway",
  },
  {
    id: "otkrivanje-iza",
    group: "dron",
    label: { sr: "Otkrivanje iza predmeta", en: "Reveal from behind" },
    lesson: {
      sr: "Kamera izlazi iza zida, drveta ili stuba i otkriva lik. Mala napetost, pa „ta-da”.",
      en: "The camera slides out from behind a wall, tree or pillar and reveals the subject. A little suspense, then ta-da.",
    },
    sketch: { scene: [k(0, 0.3), k(1)], subject: [k(0, 0.45), k(1)] },
    phrase: "the camera moves out from behind a foreground object, revealing the subject",
  },
  // ── Spektakl ──────────────────────────────────────────────────────────────
  {
    id: "dolly-zoom",
    group: "spektakl",
    label: { sr: "Vrtoglavica (dolly zoom)", en: "Dolly zoom" },
    lesson: {
      sr: "Lik ostaje iste veličine, a pozadina se razvlači. Čuveni efekat iz „Vrtoglavice” - za šok ili spoznaju.",
      en: "The subject keeps its size while the background stretches. The famous Vertigo effect - for shock or realisation.",
    },
    sketch: { scene: [k(0), k(1, 0, 0, 1.6)], subject: still },
    phrase: "dolly zoom vertigo effect, the background stretches while the subject stays the same size",
  },
  {
    id: "brzi-zum",
    group: "spektakl",
    label: { sr: "Brzi zum", en: "Crash zoom" },
    lesson: {
      sr: "Nagli zum pravo na lice ili predmet. Komičan ili dramatičan naglasak - kao u crtanim i rijalitijima.",
      en: "A sudden zoom straight onto a face or object. A comic or dramatic punch - like in cartoons and reality shows.",
    },
    sketch: { scene: [k(0), k(0.3), k(0.45, 0, 0, 2), k(1, 0, 0, 2)], subject: [k(0), k(0.3), k(0.45, 0, 0, 2), k(1, 0, 0, 2)] },
    phrase: "sudden crash zoom onto the subject",
  },
  {
    id: "spirala",
    group: "spektakl",
    label: { sr: "Spiralni uspon", en: "Spiral rise" },
    lesson: {
      sr: "Kamera se penje u spirali oko lika. Za veliki trenutak - pobedu, venčanje, kraj spota.",
      en: "The camera climbs in a spiral around the subject. For a big moment - a win, a wedding, the end of a music video.",
    },
    sketch: { scene: [k(0), k(1, 0, 0.15, 0.8, 30)], subject: [k(0), k(1, 0, 0.25, 0.7, 30)] },
    phrase: "the camera spirals upward around the subject",
  },
  {
    id: "zamrznut",
    group: "spektakl",
    label: { sr: "Zamrznut trenutak", en: "Bullet time" },
    lesson: {
      sr: "Vreme stane, a kamera kruži oko zamrznutog trenutka. Kao u „Matriksu” - za skok, prskanje vode ili konfete.",
      en: "Time stops while the camera circles the frozen moment. Like The Matrix - for a jump, a water splash or confetti.",
    },
    sketch: { scene: [k(0, -0.2), k(1, 0.25)], subject: still, icon: "sat" },
    phrase: "bullet-time shot, the moment freezes while the camera circles around",
  },
  {
    id: "u-oko",
    group: "spektakl",
    label: { sr: "Ulet u oko", en: "Into the eye" },
    lesson: {
      sr: "Kamera ide sve bliže, pravo u oko lika - pa u drugi svet. Viralan prelaz za san ili sećanje.",
      en: "The camera goes closer and closer, right into the eye - and into another world. A viral way into a dream or memory.",
    },
    sketch: { scene: [k(0), k(1, 0, -0.35, 3)], subject: [k(0), k(1, 0, -0.35, 3)] },
    phrase: "the camera zooms extremely close into the subject's eye",
  },
  // ── Fokus i vreme ─────────────────────────────────────────────────────────
  {
    id: "fokus",
    group: "fokus-vreme",
    label: { sr: "Prebacivanje fokusa", en: "Rack focus" },
    lesson: {
      sr: "Oštrina prelazi sa nečega napred na lik iza. Vodi pogled bez pomeranja kamere.",
      en: "The sharpness shifts from something in front to the subject behind. It guides the eye without moving the camera.",
    },
    sketch: { scene: [k(0, 0, 0, 1.04), k(1)], subject: [k(0, 0, 0, 0.96), k(1, 0, 0, 1.04)], icon: "fokus" },
    phrase: "rack focus shifting from the foreground to the subject",
  },
  {
    id: "plitka-dubina",
    group: "fokus-vreme",
    label: { sr: "Mutna pozadina", en: "Shallow focus" },
    lesson: {
      sr: "Lik je oštar, pozadina meko zamućena. Izgleda skupo i filmski - za portret i proizvod.",
      en: "The subject is sharp and the background softly blurred. It looks expensive and cinematic - for portraits and products.",
    },
    sketch: { scene: still, subject: [k(0), k(0.5, 0, -0.02), k(1)], icon: "fokus" },
    phrase: "shallow depth of field, the background softly blurred",
  },
  {
    id: "timelapse",
    group: "fokus-vreme",
    label: { sr: "Ubrzano vreme", en: "Time-lapse" },
    lesson: {
      sr: "Sati prođu za sekunde: oblaci jure, svetla se pale. Za zalazak sunca, grad ili rast biljke.",
      en: "Hours pass in seconds: clouds race and lights switch on. For a sunset, a city or a growing plant.",
    },
    sketch: { scene: [k(0), k(0.5, 0.01), k(1)], icon: "sat" },
    phrase: "time-lapse, clouds and light change quickly",
  },
  {
    id: "hyperlapse",
    group: "fokus-vreme",
    label: { sr: "Ubrzana šetnja", en: "Hyperlapse" },
    lesson: {
      sr: "Ubrzano vreme dok kamera ide napred kroz grad. Energično i moderno - za putovanja.",
      en: "Sped-up time while the camera moves forward through a city. Energetic and modern - for travel videos.",
    },
    sketch: { scene: [k(0), k(0.33, 0.01, 0, 1.15), k(0.66, -0.01, 0, 1.3), k(1, 0, 0, 1.45)], icon: "sat" },
    phrase: "hyperlapse moving forward through the scene",
  },
  {
    id: "usporeno",
    group: "fokus-vreme",
    label: { sr: "Usporeno", en: "Slow motion" },
    lesson: {
      sr: "Pokret je usporen, pa se vidi svaka kap i svaki pramen kose. Za ples, sport i emocije.",
      en: "Motion is slowed so every drop and strand of hair shows. For dance, sport and emotion.",
    },
    sketch: { scene: still, subject: [k(0), k(0.5, 0, -0.05), k(1)], icon: "sat" },
    phrase: "slow-motion shot",
  },
];

export function cameraMoveById(id: string | null | undefined): CameraMove | undefined {
  if (!id) return undefined;
  return CAMERA_MOVES.find((move) => move.id === id);
}

export function cameraMovesInGroup(group: CameraMoveGroup): CameraMove[] {
  return CAMERA_MOVES.filter((move) => move.group === group);
}
