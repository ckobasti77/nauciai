import type { Locale } from "./i18n";
import { slotLabel } from "./studio-slots";

/**
 * Gornja granica dužine prompta. Ista vrednost stoji u
 * `convex/creditsCore.ts` (`MAX_PROMPT_LENGTH`), koju `createJob` stvarno
 * proverava - ovde se ne uvozi da moderacijski rečnik iz tog modula ne bi
 * ušao u klijentski bundle. Da vrednosti ne bi razišle, `studio-messages.test.ts`
 * uvozi obe i tvrdi da su jednake.
 */
export const PROMPT_MAX_LENGTH = 2000;

/**
 * Svaka greška `createJob`-a ima svoju ljudsku rečenicu i predlog šta dalje;
 * sirov kod se nikad ne prikazuje. Convex poruku umota u "[CONVEX
 * M(studio:createJob)] ... Uncaught Error: DNEVNI_LIMIT at handler ...", pa se
 * kod TRAŽI u tekstu, ne poredi sa njim. Redosled je bitan: specifičnije pre
 * opštijeg (`DNEVNI_LIMIT_TROSKA` pre `DNEVNI_LIMIT`).
 */
const CREATE_JOB_ERROR_MESSAGES: Array<[string, { sr: string; en: string }]> = [
  [
    "NEISPRAVAN_PROMPT:PRAZAN_PROMPT",
    { sr: "Napiši prompt pre nego što pokreneš generaciju.", en: "Write a prompt before generating." },
  ],
  [
    "NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT",
    {
      sr: `Prompt je duži od ${PROMPT_MAX_LENGTH} znakova. Skrati ga i pokušaj ponovo.`,
      en: `The prompt is longer than ${PROMPT_MAX_LENGTH} characters. Shorten it and try again.`,
    },
  ],
  [
    "NEISPRAVAN_PROMPT:ZABRANJEN_POJAM",
    {
      sr: "Prompt sadrži pojam koji Studio ne generiše. Izmeni ga i pokušaj ponovo.",
      en: "The prompt contains a term the Studio does not generate. Edit it and try again.",
    },
  ],
  [
    "NEISPRAVAN_PROMPT",
    { sr: "Prompt nije prihvaćen. Izmeni ga i pokušaj ponovo.", en: "The prompt was not accepted. Edit it and try again." },
  ],
  [
    "DNEVNI_LIMIT_TROSKA",
    {
      sr: "Dostigao si dnevni limit potrošnje u Studiju. Krediti su ti ostali; nastavi sutra.",
      en: "You have reached the Studio's daily spending limit. Your credits are untouched; continue tomorrow.",
    },
  ],
  [
    "DNEVNI_LIMIT",
    {
      sr: "Dostigao si dnevni limit generacija. Nastavi sutra - krediti ostaju na nalogu.",
      en: "You have reached the daily generation limit. Continue tomorrow - your credits stay on the account.",
    },
  ],
  [
    "MODEL_NEDOSTUPAN",
    {
      sr: "Ovaj model trenutno nije dostupan. Izaberi drugi iz liste.",
      en: "This model is currently unavailable. Pick another one from the list.",
    },
  ],
  [
    "NEDOVOLJNO_KREDITA",
    {
      sr: "Nemaš dovoljno kredita za ovu generaciju. Dopuni ih pa pokušaj ponovo.",
      en: "You do not have enough credits for this generation. Top up and try again.",
    },
  ],
  [
    "PREVISE_POSLOVA",
    {
      sr: "Sačekaj da se završi trenutna generacija - najviše tri posla mogu da rade istovremeno.",
      en: "Wait for the current generation to finish - at most three jobs can run at once.",
    },
  ],
  [
    // Poravnanje (X2) nije uspelo da skine razliku do stvarne cene, pa je
    // ostala kao dug na poslu. Dopuna kredita ga ne briše sama od sebe - dug
    // skida podrška, pa poruka vodi tamo, a ne na dugme "Dopuni".
    "NEPORAVNAT_DUG",
    {
      sr: "Poslednja generacija je koštala više nego što je rezervisano, a razliku nismo mogli da naplatimo. Javi se podršci da to razrešimo.",
      en: "Your last generation cost more than was reserved and we could not charge the difference. Contact support so we can clear it.",
    },
  ],
  [
    // Zbir procena poslova koji su još u letu je premašio granicu paralelne
    // izloženosti. Nije dnevni limit: čim se prethodni završe, nov posao prolazi.
    "PREVISE_NEPORAVNATOG",
    {
      sr: "Sačekaj da se završe generacije koje su u toku - vredne su previše da bi uz njih krenula i nova.",
      en: "Wait for the generations already running to finish - they are too costly to start another alongside them.",
    },
  ],
  [
    // Pečat o prihvatanju uslova ne postoji (X7). Kroz normalnu upotrebu je
    // nedostižno - forma se do potvrde ni ne prikazuje - ali server odbija i
    // poziv koji je zaobišao ekran.
    "USLOVI_NEPRIHVACENI",
    {
      sr: "Pre prve generacije moraš da potvrdiš da imaš 18 godina i da prihvataš uslove Studija. Osveži stranicu, potvrda će te sačekati.",
      en: "Before your first generation you must confirm that you are 18 and accept the Studio terms. Refresh the page and the confirmation will be waiting.",
    },
  ],
  [
    // Chargeback nad uplatom kojom su krediti kupljeni. Brava se ne skida
    // dopunom, nego rešenim sporom - zato poruka vodi na podršku.
    "SPOR_U_TOKU",
    {
      sr: "Uplata kojom su ovi krediti kupljeni je osporena, pa je generisanje zaustavljeno dok se spor ne reši. Javi se podršci.",
      en: "The payment these credits were bought with is disputed, so generating is on hold until the dispute is resolved. Contact support.",
    },
  ],
  [
    // Refundirana uplata je oduzela kredite koji su već bili potrošeni. Ovo se
    // rešava dopunom, pa poruka vodi na dugme "Dopuni".
    "SALDO_U_MINUSU",
    {
      sr: "Uplata je vraćena, a krediti iz nje su već bili potrošeni - saldo ti je u minusu. Dopuni kredite da bi Studio ponovo radio.",
      en: "A payment was refunded and its credits had already been spent, so your balance is negative. Top up your credits to reopen the Studio.",
    },
  ],
  [
    "STUDIO_PAUZIRAN",
    {
      sr: "Studio je privremeno pauziran. Krediti ti ostaju na nalogu, probaj kasnije.",
      en: "The Studio is paused for now. Your credits stay on the account; try again later.",
    },
  ],
  [
    // Privremeno, dok naplata ne proradi (`STUDIO_STAFF_ONLY` u
    // `studioCore.ts`) - Studio je zatvoreno testiranje za osoblje, ne za
    // polaznike. Kod je preimenovan iz `NIJE_UPISAN`: taj razlog više nije
    // tačan za većinu korisnika koji ovo dobiju - i sami su upisani.
    "NEMA_PRISTUPA",
    {
      sr: "Studio je trenutno u zatvorenom testiranju, dostupan samo osoblju platforme. Otvoriće se polaznicima kasnije.",
      en: "The Studio is currently in closed testing, available only to platform staff. It will open to students later.",
    },
  ],
  [
    // Dugme "Otvori u Studiju" (P9) uvek šalje oboje zajedno, pa je ovo
    // nedostižno kroz normalnu upotrebu - ali link se može ručno izmeniti.
    "ZADATAK_BEZ_LEKCIJE",
    {
      sr: "Zadatak zahteva i lekciju. Otvori Studio direktno iz zadatka u lekciji i pokušaj ponovo.",
      en: "The task needs its lesson context. Open the Studio from the task in the lesson and try again.",
    },
  ],
  [
    "ZADATAK_NIJE_U_LEKCIJI",
    {
      sr: "Ovaj zadatak ne pripada toj lekciji. Otvori Studio ponovo iz zadatka i pokušaj opet.",
      en: "This task does not belong to that lesson. Open the Studio again from the task and try again.",
    },
  ],
  [
    "NEISPRAVNO_TRAJANJE",
    {
      sr: "Trajanje koje si zadao nije dozvoljeno za ovaj model. Vrati ga na podrazumevanu vrednost i pokušaj ponovo.",
      en: "The duration you set is not allowed for this model. Reset it to the default and try again.",
    },
  ],
  [
    // `createJob` odbija režim koji izabrani model ne nudi (studio.ts). Kroz
    // formu nedostižno - prebacivač nudi samo režime modela - ali stara forma
    // je znala da ostane na režimu prethodnog modela dok se novi učitava.
    "NEISPRAVAN_REZIM",
    {
      sr: "Ovaj ulazni režim nije dostupan za izabrani model. Osveži stranicu i izaberi režim ponovo.",
      en: "This input mode isn't available for the selected model. Refresh the page and pick the mode again.",
    },
  ],
  [
    // Bare kod i `NEISPRAVNI_ULAZI:${razlog}` (npr. NEPOZNAT_SLOT) dele poruku -
    // sledeći korak je isti: okačeni fajlovi ne odgovaraju modelu.
    "NEISPRAVNI_ULAZI",
    {
      sr: "Okačeni fajlovi ne odgovaraju izabranom modelu. Osveži stranicu i okači ih ponovo.",
      en: "The uploaded files don't match the selected model. Refresh the page and upload them again.",
    },
  ],
  [
    // Režim koji se naručuje izborom ranije generacije (Gemini Omni „video"), a
    // nijedna nije izabrana. Isti savet kao `GenerateBlock` „source", odavde jer
    // je posao ipak stigao do servera (zaobiđena forma, ili istekao izbor).
    "IZVOR_NIJE_IZABRAN",
    {
      sr: "Izaberi raniju generaciju koju menjaš - ovaj režim ne prima okačen fajl.",
      en: "Pick an earlier generation to edit - this mode doesn't accept an uploaded file.",
    },
  ],
  [
    "IZVOR_NIJE_DOSTUPAN",
    {
      sr: "Ranija generacija koju si izabrao više nije dostupna. Izaberi drugu iz liste.",
      en: "The earlier generation you picked is no longer available. Choose another from the list.",
    },
  ],
  [
    "IZVOR_NIJE_PODRZAN",
    {
      sr: "Ova generacija ne može da se koristi kao ulaz za izabrani model. Izaberi drugu ili promeni model.",
      en: "This generation can't be used as input for the selected model. Pick another or change the model.",
    },
  ],
  [
    // Okačen fajl koji nije prijavljen na ovog korisnika: ili je tudji, ili mu
    // je istekao rok od 24 h dok je forma stajala otvorena.
    "TUDJI_FAJL",
    {
      sr: "Neki od okačenih fajlova više nije dostupan. Okači ga ponovo pa pokreni generaciju.",
      en: "One of the uploaded files is no longer available. Upload it again and start the generation.",
    },
  ],
  [
    // Server nije uspeo da pročita trajanje ni iz jednog okačenog snimka, pa
    // nema po čemu da naplati (W5). Naplata po broju koji je poslao klijent je
    // upravo rupa koju ovaj korak zatvara, pa se posao odbija.
    "MERENJE_NIJE_DOSTUPNO",
    {
      sr: "Ne možemo da pročitamo koliko snimak traje, a po tome se naplaćuje. Okači MP4, MOV, WebM, WAV ili MP3.",
      en: "We cannot read how long the recording is, and that is what it is charged by. Upload MP4, MOV, WebM, WAV or MP3.",
    },
  ],
  [
    // Zaglavlje tvrdi duže nego što fajl te veličine fizički može da traje
    // (X1): megabajt zvuka ne nosi deset sati. Ili je fajl pokvaren pri
    // izvozu, ili je zaglavlje dirano - poruka govori o prvom, jer se drugom
    // ionako ne obraćamo.
    "ZAGLAVLJE_NEMOGUCE",
    {
      sr: "Zaglavlje snimka tvrdi dužinu koja ne odgovara veličini fajla. Izvezi snimak ponovo, kao MP4 ili WAV, pa ga okači.",
      en: "The recording's header claims a length that does not match the file size. Export the recording again, as MP4 or WAV, and upload it.",
    },
  ],
  [
    "NEISPRAVNI_PARAMETRI",
    {
      sr: "Podešavanja nisu ispravna. Osveži stranicu i pokušaj ponovo.",
      en: "The settings are not valid. Refresh the page and try again.",
    },
  ],
  // Provajder nije podešen na serveru. Bez ove stavke je poruka bila
  // "pokušaj ponovo za koji trenutak" - a ponavljanje tu ne pomaže NIKAD,
  // pa je to bila poruka koja korisnika šalje u krug.
  [
    "GOOGLE_AI_API_KEY",
    {
      sr: "Ovaj model još nije podešen na serveru. Javi administratoru - ponovni pokušaj neće pomoći. Krediti su ti vraćeni.",
      en: "This model is not configured on the server yet. Tell an administrator - retrying will not help. Your credits have been returned.",
    },
  ],
  [
    "KVOTA_PREKORACENA",
    {
      sr: "Model je trenutno preopterećen kod provajdera. Probaj za koji minut ili izaberi drugi model. Krediti su ti vraćeni.",
      en: "The provider is rate-limiting this model right now. Try again in a few minutes or pick another model. Your credits have been returned.",
    },
  ],
  [
    "NEPOTPUN_ULAZ",
    {
      sr: "Fali ulazna slika za ovaj režim. Dodaj je pa pokušaj ponovo.",
      en: "An input image is missing for this mode. Add one and try again.",
    },
  ],
  [
    "FAJL_JE_PREVELIK",
    {
      sr: "Fajl je prevelik za ovaj model. Smanji ga ispod 15 MB pa pokušaj ponovo.",
      en: "The file is too large for this model. Get it under 15 MB and try again.",
    },
  ],
  [
    "PROJEKAT_BEZ_IMENA",
    {
      sr: "Unesi ime projekta.",
      en: "Enter a project name.",
    },
  ],
  [
    "PROJEKAT_PREDUGO_IME",
    {
      sr: "Ime projekta može imati najviše 60 znakova.",
      en: "Project name can have at most 60 characters.",
    },
  ],
  [
    "PROJEKAT_VEC_POSTOJI",
    {
      sr: "Već imaš projekat sa ovim imenom.",
      en: "You already have a project with this name.",
    },
  ],
  [
    "PREVISE_PROJEKATA",
    {
      sr: "Dostigao si limit od 50 projekata. Arhiviraj neki projekat pre pravljenja novog.",
      en: "You have reached the limit of 50 projects. Archive a project before creating a new one.",
    },
  ],
];

export function studioErrorMessage(raw: string, locale: Locale): string {
  for (const [code, message] of CREATE_JOB_ERROR_MESSAGES) {
    if (raw.includes(code)) return message[locale];
  }

  return locale === "sr"
    ? "Generacija nije pokrenuta. Pokušaj ponovo za koji trenutak."
    : "The generation did not start. Try again in a moment.";
}

export function projectErrorMessage(raw: string, locale: Locale): string {
  for (const [code, message] of CREATE_JOB_ERROR_MESSAGES) {
    if (raw.includes(code)) return message[locale];
  }

  return locale === "sr"
    ? "Operacija nad projektom nije uspela. Pokušaj ponovo."
    : "Project action failed. Try again.";
}

/**
 * Zašto merenje okačenog fajla nije uspelo.
 *
 * `studioActions.measureInputUpload` vraća ishod umesto da baca - fajl JESTE
 * gore i vidi se - ali razlog do sada nije stizao do ekrana, pa je korisnik
 * ostajao sa zaključanim dugmetom i opštom rečenicom. Svaki razlog ima svoj
 * sledeći korak, jer se razlikuju: nepodržan format se menja izvozom, VBR MP3
 * se menja tarifom, odsečeno zaglavlje ponovnim izvozom.
 */
export function measureFailureMessage(reason: string, locale: Locale): string {
  if (reason === "VBR_NEPOUZDAN") {
    return locale === "sr"
      ? "Ovaj MP3 nema upisano trajanje, a bitrate mu se menja, pa dužinu ne možemo da izmerimo tačno. Izvezi ga kao MP3 sa stalnim bitrate-om ili kao WAV."
      : "This MP3 has no recorded length and its bitrate varies, so we cannot measure it accurately. Export it as a constant-bitrate MP3 or as a WAV.";
  }
  if (reason === "ZAGLAVLJE_NIJE_PROCITANO") {
    return locale === "sr"
      ? "Ne mogu da pročitam trajanje snimka. Probaj da ga izvezeš kao MP4 ili WAV."
      : "I cannot read the length of this recording. Try exporting it as MP4 or WAV.";
  }
  if (reason === "NEPOZNAT_FORMAT") {
    return locale === "sr"
      ? "Ovaj format ne umemo da izmerimo, a po dužini se naplaćuje. Okači MP4, MOV, WebM, WAV ili MP3."
      : "We cannot measure this format, and the length is what it is charged by. Upload MP4, MOV, WebM, WAV or MP3.";
  }
  if (reason === "MERENJE_ODBIJENO") {
    // X5, nalaz N4. Pokriva oba razloga odbijanja - tri neuspeha nad istim
    // fajlom i previše uploada u poslednjem satu - jer je sledeći korak isti.
    return locale === "sr"
      ? "Previše puta smo pokušali da izmerimo dužinu i nije uspelo. Sačekaj koji minut pa okači snimak kao MP4 ili WAV."
      : "We tried to measure the length too many times without success. Wait a few minutes, then upload the recording as MP4 or WAV.";
  }

  return locale === "sr"
    ? "Merenje dužine snimka nije uspelo. Okači fajl ponovo pa pokušaj opet."
    : "Measuring the length of the recording failed. Upload the file again and try once more.";
}

/**
 * Zašto upload ulaznog fajla nije prošao. Jedini imenovani kod je
 * `NEDOZVOLJEN_UPLOAD` (X5, nalaz N3): prijava bez važeće dozvole, dakle ili je
 * forma stajala otvorena duže od sata, ili je `storageId` stigao mimo uploada.
 * Prvo se rešava ponovnim kačenjem, drugo nas se ne tiče - poruka govori o
 * prvom. Sve ostalo (mreža, prekinut zahtev) deli opštu rečenicu.
 */
export function uploadErrorMessage(raw: string, locale: Locale): string {
  if (raw.includes("NEDOZVOLJEN_UPLOAD")) {
    return locale === "sr"
      ? "Dozvola za slanje ovog fajla je istekla. Okači ga ponovo."
      : "The permission to send this file has expired. Upload it again.";
  }

  return locale === "sr"
    ? "Fajl nije uspeo da se pošalje. Pokušaj ponovo."
    : "The file could not be uploaded. Try again.";
}

/**
 * `deleteJob` (`convex/studio.ts`) baca dva imenovana koda; sirov kod se
 * nikad ne prikazuje, isti obrazac kao `studioErrorMessage`.
 */
export function deleteJobErrorMessage(raw: string, locale: Locale): string {
  if (raw.includes("POSAO_U_TOKU")) {
    return locale === "sr"
      ? "Posao je još u obradi - sačekaj da se završi pre brisanja."
      : "The job is still in progress - wait for it to finish before deleting.";
  }
  if (raw.includes("POSAO_POVEZAN_SA_LEKCIJOM")) {
    return locale === "sr"
      ? "Ova generacija je dokaz za zadatak u lekciji i ne može da se obriše odavde."
      : "This generation is evidence for a lesson task and cannot be deleted from here.";
  }
  return locale === "sr" ? "Brisanje nije uspelo. Pokušaj ponovo." : "Delete failed. Try again.";
}

/**
 * Rečenica u podnožju forme (X4, nalaz N1, tačka 4). Nalaz je imao tri stavke,
 * i ovo je treća: obim je bio širi od admina, traga nije bilo, i korisnik za to
 * nije znao. Prve dve rešava `convex/studio.ts`; ovu rešava jedna rečenica koja
 * stoji tu gde se sadržaj i predaje.
 *
 * Link vodi na `/uslovi-studio` - stranicu pravi korak X7, ruta je do tada
 * prazna. Namerno: rečenica bez linka ne bi bila obaveštenje nego napomena.
 */
export const STUDIO_TERMS_PATH = "/uslovi-studio";

export const STUDIO_CONTENT_NOTICE: Record<Locale, string> = {
  sr: "Ono što generišeš ostaje sačuvano na tvom nalogu, a osoblje platforme može da ga pregleda zbog moderacije; važi politika privatnosti.",
  en: "What you generate stays saved on your account, platform staff may review it for moderation, and the privacy policy applies.",
};

export const STUDIO_CONTENT_NOTICE_LINK: Record<Locale, string> = {
  sr: "Uslovi Studija i privatnost",
  en: "Studio terms and privacy",
};

/** Politika privatnosti - stranicu pravi korak X7, uz uslove korišćenja. */
export const PRIVACY_POLICY_PATH = "/politika-privatnosti";

/**
 * Ekran koji stoji UMESTO forme dok pečat iz `studio.acceptStudioTerms` ne
 * postoji (X7). Nije upozorenje pored dugmeta nego kapija: prvi posao je
 * trenutak u kojem prompt odlazi provajderu i kredit se troši, pa pristanak
 * mora da bude dat pre toga, a ne pored toga.
 *
 * `checkbox` i `cta` su namerno razdvojeni: čekiranje je izjava, klik je
 * radnja, i dugme ne radi dok izjave nema.
 */
export const STUDIO_TERMS_GATE: EmptyState & {
  checkbox: Record<Locale, string>;
  failed: Record<Locale, string>;
} = {
  title: { sr: "Još jedna stvar pre nego što počneš", en: "One more thing before you start" },
  body: {
    sr: "Studio šalje tvoj opis i fajlove koje okačiš firmama koje prave ove alate, pravi sadržaj za koji odgovaraš ti, i naplaćuje se kreditima koji se ne vraćaju. Pročitaj uslove i potvrdi jednom - posle ovoga te više ne pitamo.",
    en: "The Studio sends your description and the files you upload to the companies that make these tools, creates content you are responsible for, and is paid in credits that are not refundable. Read the terms and confirm once - we will not ask again.",
  },
  checkbox: {
    sr: "Imam 18 godina i prihvatam uslove korišćenja Studija i politiku privatnosti.",
    en: "I am 18 or older and I accept the Studio terms of use and the privacy policy.",
  },
  cta: { sr: "Prihvatam i otvaram Studio", en: "Accept and open the Studio" },
  failed: {
    sr: "Potvrda nije sačuvana. Pokušaj ponovo za koji trenutak.",
    en: "The confirmation was not saved. Try again in a moment.",
  },
};

export type EmptyState = {
  title: Record<Locale, string>;
  body: Record<Locale, string>;
  cta: Record<Locale, string>;
};

/**
 * Prazno stanje bez sledećeg koraka - npr. `STUDIO_NOT_ENROLLED` dok je
 * Studio zatvoreno testiranje: nema datuma da se obeća, pa nema ni dugmeta
 * koje bi obećavalo radnju koja ništa ne menja.
 */
export type EmptyStateNoCta = Pick<EmptyState, "title" | "body">;

/**
 * Prazna stanja Studija na jednom mestu (rules-day.md: "Prazna stanja se
 * pišu, ne zaboravljaju"). Svako ima naslov, rečenicu i sledeći korak - nijedno
 * ne staje na praznom ekranu bez predloga šta dalje.
 */
export const STUDIO_PAUSED: EmptyState = {
  title: { sr: "Studio je pauziran", en: "The Studio is paused" },
  body: {
    sr: "Privremeno smo zaustavili pravljenje novih stvari. Krediti ti ostaju na nalogu i ništa se ne troši dok Studio ne proradi.",
    en: "Generation is paused for now. Your credits stay on the account and nothing is spent until the Studio is back.",
  },
  cta: { sr: "Pogledaj svoje kredite", en: "See your credits" },
};

/**
 * Privremeno stanje dok naplata za Studio ne proradi (`STUDIO_STAFF_ONLY` u
 * `convex/studioCore.ts`) - zatvoreno testiranje, samo osoblje. Bez `cta`:
 * upis ne pomaže, a ovaj ekran ionako ne vidi polaznik.
 */
export const STUDIO_NOT_ENROLLED: EmptyStateNoCta = {
  title: { sr: "Studio je u zatvorenom testiranju", en: "The Studio is in closed testing" },
  body: {
    sr: "Studio je trenutno dostupan samo osoblju platforme, dok se ne reši naplata. Otvoriće se polaznicima kasnije - krediti koje već imaš te čekaju.",
    en: "The Studio is currently available only to platform staff, until billing is in place. It will open to students later - the credits you already have will be waiting.",
  },
};

export const STUDIO_NO_GENERATIONS: EmptyState = {
  title: { sr: "Još nisi napravio/la nijednu stvar", en: "You have not made anything yet" },
  body: {
    sr: "Studio pravi slike, video i zvuk: izabereš alat, opišeš mu šta želiš i dodaš ono što treba da vidi ili čuje. Cena u kreditima piše na dugmetu pre nego što klikneš, a gotov fajl ostaje ovde.",
    en: "The Studio makes images, video and sound: pick a tool, describe what you want and add anything it needs to see or hear. The price in credits is on the button before you click, and the finished file stays here.",
  },
  cta: { sr: "Počni od gotovog primera", en: "Start from a ready example" },
};

export const CREDITS_NO_BALANCE: EmptyState = {
  title: { sr: "Nemaš kredite", en: "You have no credits" },
  body: {
    sr: "Krediti su bodovi kojima se plaća svaka slika, video ili zvuk u Studiju. Bez njih Studio ne može ništa da napravi. Paketi su odmah ispod.",
    en: "Credits are the points that pay for every image, video or sound in the Studio. Without them the Studio cannot make anything. The packs are right below.",
  },
  cta: { sr: "Izaberi paket", en: "Pick a pack" },
};

export const CREDITS_NO_PACKS: EmptyState = {
  title: { sr: "Nijedan paket nije u prodaji", en: "No pack is on sale" },
  body: {
    sr: "Nijedan paket kredita trenutno nije u prodaji. Ovo nije do tvog naloga - javi se podršci i reci šta si hteo/la da kupiš.",
    en: "No credit pack is on sale right now. This is not about your account - contact support and tell them what you wanted to buy.",
  },
  cta: { sr: "Javi se podršci", en: "Contact support" },
};

export const CREDITS_NO_HISTORY: EmptyState = {
  title: { sr: "Ovde će pisati svaka kupovina i potrošnja", en: "Every purchase and spend will be listed here" },
  body: {
    sr: "Još nisi kupio/la nijedan paket, pa je spisak prazan. Čim kupiš prvi paket, ovde ćeš videti kada je kupljen, koliko je koštao i na šta je potrošen.",
    en: "You have not bought a pack yet, so the list is empty. As soon as you buy your first one, you will see here when it was bought, what it cost, and what it went on.",
  },
  cta: { sr: "Paketi su na vrhu strane", en: "The packs are at the top of the page" },
};

export const GALLERY_NO_GENERATIONS: EmptyState = {
  title: { sr: "Ovde stoji sve što napraviš", en: "Everything you make is kept here" },
  body: {
    sr: "Svaka slika, video i zvuk iz Studija sleti ovde - zajedno sa opisom koji si napisao/la, alatom i cenom. Još nema nijedne stvari.",
    en: "Every image, video and sound from the Studio lands here - together with the description you wrote, the tool and the price. There is nothing here yet.",
  },
  cta: { sr: "Otvori Studio", en: "Open the Studio" },
};

export const PROJECT_NO_GENERATIONS: EmptyState = {
  title: { sr: "Ovaj projekat je još prazan", en: "This project is still empty" },
  body: {
    sr: "Projekat je fascikla: sve što napraviš dok je izabran skuplja se ovde, na jednom mestu.",
    en: "A project is a folder: everything you make while it is selected is collected here, in one place.",
  },
  cta: { sr: "Počni od gotovog primera", en: "Start from a ready example" },
};

export const GALLERY_NO_MATCHES: EmptyState = {
  title: { sr: "Ništa ne odgovara ovom izboru", en: "Nothing matches this selection" },
  body: {
    sr: "Filteri koje si uključio/la ne propuštaju nijednu tvoju stvar. Isključi ih da vidiš sve ponovo.",
    en: "The filters you turned on do not let anything through. Turn them off to see everything again.",
  },
  cta: { sr: "Isključi filtere", en: "Turn off the filters" },
};

/**
 * Zašto dugme za generisanje ne radi. Svako stanje ima svoju rečenicu i
 * sledeći korak - "Generiši" koje je samo sivo je poruka koju korisnik ne ume
 * da pročita (STUDIO-CATALOG-V4 sekcija 6).
 *
 * `inputs` nosi već sastavljenu poruku iz `lib/studio-slots.ts`
 * (`missingInputMessage`), jer koji ulaz fali zna `inputSpec`, ne ovaj spisak.
 */
export type GenerateBlock =
  | { kind: "paused" }
  // Ime je iz vremena kad je upis bio jedini uslov. Dok je Studio privremeno
  // suženo na osoblje (`STUDIO_STAFF_ONLY`), ovaj kind znači "nema uloge",
  // ne "nije upisan" - poruka ispod (`STUDIO_NOT_ENROLLED.body`) to i kaže.
  // Zadržano nepromenjeno da se ne dira ceo diskriminovani tip zbog imena.
  | { kind: "not_enrolled" }
  | { kind: "credits"; needed: number }
  | { kind: "active"; max: number }
  | { kind: "inputs"; message: string }
  | { kind: "prompt" }
  | { kind: "measure" }
  | { kind: "price" }
  | { kind: "uploading" }
  | { kind: "source" };

export function generateBlockMessage(block: GenerateBlock, locale: Locale): string {
  switch (block.kind) {
    case "paused":
      return STUDIO_PAUSED.body[locale];
    case "not_enrolled":
      return STUDIO_NOT_ENROLLED.body[locale];
    case "credits":
      return locale === "sr"
        ? `Ova generacija košta ${block.needed} kr, a toliko trenutno nemaš na nalogu.`
        : `This generation costs ${block.needed} credits, which is more than your balance.`;
    case "active":
      return locale === "sr"
        ? `Sačekaj da se završi trenutna generacija - najviše ${block.max} posla mogu da rade istovremeno.`
        : `Wait for the current generation to finish - at most ${block.max} jobs can run at once.`;
    case "uploading":
      return locale === "sr"
        ? "Sačekaj da se otpreme fajlovi."
        : "Please wait for files to finish uploading.";
    case "inputs":
      return block.message;
    case "prompt":
      return locale === "sr"
        ? "Napiši opis da bi dugme proradilo."
        : "Write a prompt to enable the button.";
    case "measure":
      // Pokriva oba stanja: merenje koje traje i format koji se ne čita. Prvo
      // prodje za sekund, drugo ne prodje nikad - pa druga rečenica kaže šta da
      // se radi ako poruka ostane.
      return locale === "sr"
        ? "Merimo koliko snimak traje - po tome se naplaćuje. Ako poruka ostane, format nije podržan: okači MP4, MOV, WebM, WAV ili MP3."
        : "We are measuring how long the recording is - that is what it is charged by. If this stays, the format is unsupported: upload MP4, MOV, WebM, WAV or MP3.";
    case "price":
      return locale === "sr"
        ? "Ova kombinacija podešavanja nema cenu. Promeni rezoluciju ili tarifu."
        : "This combination of settings has no price. Change the resolution or the tier.";
    case "source":
      return locale === "sr"
        ? "Izaberi raniju generaciju koju menjaš - ovaj režim ne prima okačen fajl."
        : "Pick an earlier generation to edit - this mode does not accept an uploaded file.";
  }
}

/**
 * Kad se dužina koju je pročitao browser i ona koju je izmerio server raziđu za
 * više od 5%, naplaćuje se serverska - pa se ona i kaže, PRE nego što korisnik
 * pritisne dugme (W5). Cifra na dugmetu je već serverska; ovo objašnjava zašto
 * se promenila.
 */
export function measuredDurationNotice(seconds: number, locale: Locale): string {
  const rounded = seconds >= 60 ? `${Math.round(seconds / 6) / 10} min` : `${Math.round(seconds)} s`;

  return locale === "sr"
    ? `Izmereno trajanje snimka je ${rounded} - cena na dugmetu je po tome.`
    : `The measured length of the recording is ${rounded} - the price on the button follows it.`;
}

/**
 * "Generiši ponovo" nad poslom čiji je ulaz u međuvremenu istekao ili je
 * obrisan (nalaz N7). `getJobForRegenerate` takav slot vraća prazan, umesto
 * pokvarene sličice - ova rečenica objašnjava ZAŠTO slot koji je nekad imao
 * fajl sad izgleda prazno, pre nego što korisnik i stigne da klikne "Generiši".
 */
export function missingRegenerateInputsNotice(slots: string[], locale: Locale): string | null {
  if (slots.length === 0) return null;
  const labels = slots.map((slot) => slotLabel(slot, locale).toLowerCase()).join(", ");

  return locale === "sr"
    ? `Ulaz iz te generacije (${labels}) više nije dostupan - okači ga ponovo.`
    : `The input from that generation (${labels}) is no longer available - upload it again.`;
}
