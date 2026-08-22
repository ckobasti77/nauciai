/**
 * Pravni tekstovi Studija kao PODACI, ne kao JSX (X7, sekcija 5 izveštaja,
 * stavka 1). Dva razloga:
 *
 * 1. dve stranice (`/uslovi-studio`, `/politika-privatnosti`) i dva jezika su
 *    četiri verzije istog dokumenta; kad je tekst podatak, test može da tvrdi
 *    da nijedna od te četiri nije prazna i da nijedna klauzula ne postoji samo
 *    na srpskom;
 * 2. brojevi u ugovoru moraju da budu isti brojevi koje kod stvarno primenjuje.
 *    `CREDIT_LIFETIME_MONTHS` i `OUTPUT_RETENTION_DAYS` se ovde UVOZE, pa
 *    izmena roka u kodu obara test umesto da tiho učini ugovor netačnim.
 *
 * Ovde nema nijednog izmišljenog podatka o pravnom licu. Sve što se ne zna
 * stoji kao vidljiv `[POPUNITI: ...]`; prazno polje u ugovoru je rupa koja se
 * vidi, izmišljen PIB je rupa koja se ne vidi.
 *
 * Modul se koristi ISKLJUČIVO iz serverskih komponenti (dve `page.tsx` i
 * `LegalPage`). Zato uvoz iz `creditsCore` ovde sme, a u `studio-messages.ts`
 * ne sme: tamo bi moderacijski rečnik ušao u klijentski bundle, ovde ne ulazi
 * nigde jer se stranice renderuju na serveru.
 */
import { CREDIT_LIFETIME_MONTHS } from "@/convex/creditsCore";
import { OUTPUT_RETENTION_DAYS } from "@/convex/studioCore";

import type { LocalizedText } from "./i18n";

export type LegalSection = {
  /** Ide u `id` naslova, pa se na klauzulu može linkovati iz podrške. */
  id: string;
  title: LocalizedText;
  body: LocalizedText[];
};

export type LegalDocument = {
  path: string;
  title: LocalizedText;
  updated: LocalizedText;
  intro: LocalizedText;
  sections: LegalSection[];
};

/**
 * Svako mesto na kojem tekstu fali podatak koji samo Jovan ima. Izvezeno da bi
 * test mogao da tvrdi da se svaka od ovih rupa STVARNO pojavljuje u nekom od
 * dva dokumenta - spisak koji se raziđe sa tekstom je gori od nepostojećeg.
 */
export const LEGAL_PLACEHOLDERS = [
  "[POPUNITI: pun poslovni naziv i pravna forma]",
  "[POPUNITI: adresa sedišta]",
  "[POPUNITI: matični broj]",
  "[POPUNITI: PIB]",
  "[POPUNITI: PDV broj ako je platforma u sistemu PDV-a]",
  "[POPUNITI: kontakt email za podršku]",
  "[POPUNITI: kontakt email za zaštitu podataka]",
  "[POPUNITI: nadležni sud i merodavno pravo]",
] as const;

const OPERATOR = LEGAL_PLACEHOLDERS[0];
const ADDRESS = LEGAL_PLACEHOLDERS[1];
const COMPANY_NUMBER = LEGAL_PLACEHOLDERS[2];
const TAX_NUMBER = LEGAL_PLACEHOLDERS[3];
const VAT_NUMBER = LEGAL_PLACEHOLDERS[4];
const SUPPORT_EMAIL = LEGAL_PLACEHOLDERS[5];
const PRIVACY_EMAIL = LEGAL_PLACEHOLDERS[6];
const JURISDICTION = LEGAL_PLACEHOLDERS[7];

const UPDATED: LocalizedText = {
  sr: "Poslednja izmena: 21. avgust 2026.",
  en: "Last updated: 21 August 2026.",
};

export const STUDIO_TERMS: LegalDocument = {
  path: "/uslovi-studio",
  title: { sr: "Uslovi korišćenja Studija", en: "Studio terms of use" },
  updated: UPDATED,
  intro: {
    sr: "Studio je deo platforme na kojem generišeš slike, video i zvuk pomoću modela veštačke inteligencije i plaćaš ih kreditima. Ovi uslovi važe za svaku generaciju koju pokreneš i za svaki kredit koji kupiš. Ako se sa njima ne slažeš, nemoj koristiti Studio.",
    en: "The Studio is the part of the platform where you generate images, video and audio with artificial-intelligence models and pay for them in credits. These terms apply to every generation you start and every credit you buy. If you do not agree with them, do not use the Studio.",
  },
  sections: [
    {
      id: "operator",
      title: { sr: "1. Ko drži Studio", en: "1. Who operates the Studio" },
      body: [
        {
          sr: `Studio drži ${OPERATOR}, sa sedištem na adresi ${ADDRESS}, matični broj ${COMPANY_NUMBER}, PIB ${TAX_NUMBER}, PDV broj ${VAT_NUMBER}. U tekstu ispod „mi“ znači to pravno lice, a „ti“ korisnika naloga.`,
          en: `The Studio is operated by ${OPERATOR}, registered at ${ADDRESS}, company number ${COMPANY_NUMBER}, tax number ${TAX_NUMBER}, VAT number ${VAT_NUMBER}. Below, “we” means that legal entity and “you” means the account holder.`,
        },
        {
          sr: `Za sva pitanja o ovim uslovima piši na ${SUPPORT_EMAIL}.`,
          en: `For any question about these terms, write to ${SUPPORT_EMAIL}.`,
        },
      ],
    },
    {
      id: "uzrast",
      title: { sr: "2. Uzrast: 18 godina", en: "2. Age: 18 and over" },
      body: [
        {
          sr: "Studio smeju da koriste samo osobe od 18 godina i starije. Generativni modeli proizvode sadržaj koji niko unapred ne vidi - ni ti ni mi - i taj sadržaj može da bude netačan, uvredljiv ili neprikladan. Zato Studio nije otvoren maloletnicima, ni uz saglasnost roditelja.",
          en: "The Studio may be used only by people aged 18 and over. Generative models produce content that nobody sees in advance - neither you nor we - and that content can be inaccurate, offensive or inappropriate. The Studio is therefore not open to minors, not even with a parent's consent.",
        },
        {
          sr: "Pre prve generacije potvrđuješ da imaš 18 godina i da prihvataš ove uslove. Ta potvrda se beleži jednom, sa datumom i vremenom, i važi za sve buduće generacije dok se uslovi ne promene.",
          en: "Before your first generation you confirm that you are 18 and that you accept these terms. That confirmation is recorded once, with a date and time, and applies to all future generations until the terms change.",
        },
      ],
    },
    {
      id: "krediti",
      title: { sr: "3. Krediti su nepovratni", en: "3. Credits are non-refundable" },
      body: [
        {
          sr: "Kredit je jedinica kojom se plaća generacija. Kredit nije novac, nije platno sredstvo i ne glasi na donosioca. Kupovinom kredita ne stičeš potraživanje u novcu prema nama.",
          en: "A credit is the unit that pays for a generation. A credit is not money, not a means of payment and not a bearer instrument. Buying credits does not give you a monetary claim against us.",
        },
        {
          sr: "Krediti su nepovratni. Kupljeni krediti se ne mogu zameniti za novac, preneti na drugi nalog, niti isplatiti pri gašenju naloga - ni delimično, ni u protivvrednosti.",
          en: "Credits are non-refundable. Purchased credits cannot be exchanged for money, transferred to another account, or paid out when an account is closed - neither in part nor in equivalent value.",
        },
        {
          sr: `Krediti ističu ${CREDIT_LIFETIME_MONTHS} meseci od dana dodele. Rok se računa za svaku dodelu posebno, a troši se uvek prvo ono što pre ističe. Istekli krediti se ne vraćaju i ne produžavaju.`,
          en: `Credits expire ${CREDIT_LIFETIME_MONTHS} months from the day they are granted. The deadline runs separately for each grant, and whatever expires first is always spent first. Expired credits are not restored and not extended.`,
        },
        {
          sr: "Ako je pravo na odustanak od ugovora na daljinu na tebe primenjivo, ono prestaje u trenutku kada pokreneš prvu generaciju kupljenim kreditima - tada je usluga izvršena, a trošak prema dobavljaču modela nastao i nepovratan. Kupljene a nepotrošene kredite možeš da tražiš nazad pre prve generacije.",
          en: "Where a distance-contract right of withdrawal applies to you, it ends the moment you start the first generation with the purchased credits - at that point the service is performed and the cost towards the model provider is incurred and irreversible. You may ask for purchased but unused credits back before your first generation.",
        },
      ],
    },
    {
      id: "povracaj",
      title: {
        sr: "4. Kada se generacija vraća, a kada ne",
        en: "4. When a generation is refunded and when it is not",
      },
      body: [
        {
          sr: "Generacija koja ne uspe - model vrati grešku, posao istekne ili se prekine na našoj strani - refundira se automatski, u kreditima, bez tvog zahteva. Ne moraš da se javljaš podršci; krediti se vraćaju sami.",
          en: "A generation that fails - the model returns an error, the job times out, or it breaks on our side - is refunded automatically, in credits, without you asking. You do not need to contact support; the credits come back on their own.",
        },
        {
          sr: "Generacija koja uspe se ne refundira zato što ti se rezultat nije dopao. Model je pozvan, dobavljač je naplaćen, i taj trošak se ne vraća nama - pa se ne vraća ni tebi. Estetska ocena rezultata nije greška usluge.",
          en: "A successful generation is not refunded because you did not like the result. The model was called, the provider was charged, and that cost does not come back to us - so it does not come back to you either. An aesthetic judgement of the result is not a service defect.",
        },
        {
          sr: "Cena svake generacije stoji na dugmetu pre nego što je pokreneš. Kod modela koji se naplaćuju po trajanju snimka, dužinu meri server iz samog fajla i po njoj naplaćuje; ako se izmerena dužina razlikuje od one koju je pokazao tvoj pregledač, važi serverska i vidiš je pre klika.",
          en: "The price of every generation is on the button before you start it. For models charged by the length of a recording, the server measures that length from the file itself and charges by it; if the measured length differs from what your browser showed, the server value applies and you see it before you click.",
        },
      ],
    },
    {
      id: "sadrzaj",
      title: {
        sr: "5. Za sadržaj koji generišeš odgovaraš ti",
        en: "5. You are responsible for what you generate",
      },
      body: [
        {
          sr: "Ti biraš prompt, ulazne fajlove i model. Ti odgovaraš za to da imaš pravo da upotrebiš sve što šalješ i da rezultat upotrebiš onako kako nameravaš. Mi ne proveravamo unapred da li to pravo imaš.",
          en: "You choose the prompt, the input files and the model. You are responsible for having the right to use everything you send and to use the result the way you intend. We do not check in advance whether you have that right.",
        },
        {
          sr: "Zabranjeno je da u Studiju generišeš ili u njega šalješ: lik, glas ili telo stvarne osobe bez njenog pristanka, uključujući javne ličnosti; bilo kakav seksualizovan ili zlostavljački sadržaj sa maloletnicima; sadržaj koji podstiče nasilje, mržnju ili krivično delo; tuđe autorsko delo ili zaštićen znak koji nemaš pravo da koristiš; sadržaj koji krši uslove korišćenja dobavljača modela.",
          en: "It is forbidden to generate in the Studio, or to send into it: the likeness, voice or body of a real person without that person's consent, public figures included; any sexualised or abusive content involving minors; content that incites violence, hatred or a criminal offence; someone else's copyrighted work or protected mark that you have no right to use; content that breaches the terms of the model providers.",
        },
        {
          sr: "Dobavljači modela su fal.ai, Google i BytePlus, a preko fal.ai i ElevenLabs. Tvoj prompt i tvoji ulazni fajlovi se prosleđuju njima da bi generacija uopšte nastala, pa njihovi uslovi korišćenja i pravila o prihvatljivoj upotrebi važe za tvoj sadržaj isto koliko i ovi. Kršenje njihovih pravila je kršenje ovih uslova.",
          en: "The model providers are fal.ai, Google and BytePlus, and through fal.ai also ElevenLabs. Your prompt and your input files are forwarded to them so that the generation can exist at all, so their terms of use and acceptable-use policies apply to your content just as these do. Breaking their rules breaks these terms.",
        },
        {
          sr: "Imena i znakovi modela i njihovih proizvođača pripadaju svojim vlasnicima i u Studiju se prikazuju isključivo radi prepoznavanja modela; to ne znači nikakvu podrazumevanu povezanost, sponzorstvo ni partnerstvo sa tim proizvođačima.",
          en: "The names and marks of the models and their makers belong to their respective owners and are shown in the Studio solely to identify the models; this implies no affiliation, sponsorship or partnership with those makers.",
        },
        {
          sr: "Prompt prolazi kroz automatsku proveru pre slanja i može da bude odbijen. Ta provera je gruba prva linija, a ne dozvola: odbijen prompt sigurno nije prošao, ali prihvaćen prompt ne znači da je sadržaj dozvoljen.",
          en: "Every prompt passes an automatic check before it is sent and may be rejected. That check is a coarse first line, not a permission: a rejected prompt certainly did not pass, but an accepted prompt does not mean the content is allowed.",
        },
      ],
    },
    {
      id: "moderacija",
      title: {
        sr: "6. Moderacija: osoblje može da pregleda ono što generišeš",
        en: "6. Moderation: staff may review what you generate",
      },
      body: [
        {
          sr: "Ovlašćeno osoblje platforme može da pregleda promptove, ulazne fajlove i rezultate generacija, uključujući i tuđe, radi moderacije, provere zloupotrebe, rešavanja prijava, tehničke podrške i ispunjenja zakonskih obaveza. Bez toga zabrane iz tačke 5 ne bi mogle da se primene.",
          en: "Authorised platform staff may review prompts, input files and generation results, including those of other users, for moderation, abuse investigation, handling reports, technical support and meeting legal obligations. Without this, the prohibitions in section 5 could not be enforced.",
        },
        {
          sr: "Uvid u tuđi sadržaj je stepenovan i ostavlja trag. Moderator u pregledu vidi da posao postoji, ali ne i tuđ prompt ni tuđ okačen snimak; pun uvid u pojedinačan posao ima samo administrator, i svaki takav uvid se beleži uz razlog i vreme.",
          en: "Access to another user's content is tiered and leaves a trail. In the overview a moderator sees that a job exists but not another user's prompt or uploaded recording; full access to an individual job is available only to an administrator, and every such access is logged with a reason and a timestamp.",
        },
        {
          sr: "Sadržaj koji krši ove uslove možemo da uklonimo, a nalog da ograničimo ili ugasimo. Krediti potrošeni na uklonjen sadržaj se ne vraćaju.",
          en: "We may remove content that breaks these terms and limit or close the account. Credits spent on removed content are not returned.",
        },
      ],
    },
    {
      id: "cuvanje",
      title: { sr: "7. Koliko se fajlovi čuvaju", en: "7. How long files are kept" },
      body: [
        {
          sr: `Generisan video se čuva ${OUTPUT_RETENTION_DAYS.video} dana od nastanka. Generisane slike i zvuk se čuvaju ${OUTPUT_RETENTION_DAYS.image} dana. Posle tog roka se sam fajl briše sa servera i više ne može da se vrati - preuzmi na vreme ono što ti treba.`,
          en: `A generated video is kept for ${OUTPUT_RETENTION_DAYS.video} days from creation. Generated images and audio are kept for ${OUTPUT_RETENTION_DAYS.image} days. After that the file itself is deleted from the servers and cannot be restored - download what you need in time.`,
        },
        {
          sr: "Metapodaci o generaciji - model, parametri, cena u kreditima, vreme, status i otisak prompta - čuvaju se trajno, i posle brisanja fajla. Oni su knjiga o naplati i osnov za „Generiši ponovo“; bez njih nema ni računovodstva ni odgovora na spor.",
          en: "Generation metadata - model, parameters, price in credits, time, status and a fingerprint of the prompt - is kept permanently, also after the file is deleted. It is the billing record and the basis for “Generate again”; without it there is neither accounting nor an answer to a dispute.",
        },
        {
          sr: "Ulazni fajl koji okačiš a ne upotrebiš ni u jednoj generaciji briše se u roku od 24 sata. Ulazni fajl koji je ušao u generaciju živi koliko i ta generacija.",
          en: "An input file you upload but never use in a generation is deleted within 24 hours. An input file that entered a generation lives as long as that generation.",
        },
      ],
    },
    {
      id: "naplata",
      title: { sr: "8. Plaćanje, PDV i sporne uplate", en: "8. Payment, VAT and disputed charges" },
      body: [
        {
          sr: "Kredite i pretplate naplaćuje Stripe. Cene su izražene u evrima. Na cenu se obračunava PDV po stopi zemlje tvog prebivališta, u skladu sa propisima o prometu digitalnih usluga; ako kupuješ kao pravno lice, poreski broj upisuješ u toku plaćanja.",
          en: "Credits and subscriptions are charged through Stripe. Prices are stated in euros. VAT is applied at the rate of your country of residence, in line with the rules on digital services; if you are buying as a business, you enter your tax number during checkout.",
        },
        {
          sr: "Ako uplata bude refundirana, krediti koje je ta uplata dodelila se oduzimaju. Ako su u međuvremenu potrošeni, saldo naloga ide u minus i Studio ostaje zatvoren dok se minus ne poravna.",
          en: "If a payment is refunded, the credits that payment granted are taken back. If they have already been spent, the account balance goes negative and the Studio stays closed until that negative balance is settled.",
        },
        {
          sr: "Ako prijaviš spor po kartici (chargeback), krediti iz te uplate se odmah zamrzavaju i nove generacije se zaustavljaju dok se spor ne završi. Spor traje nedeljama i za to vreme se ne generiše. Ako smatraš da je uplata pogrešna, javi se prvo nama - to se rešava brže.",
          en: "If you open a card dispute (chargeback), the credits from that payment are frozen immediately and new generations stop until the dispute ends. A dispute takes weeks and nothing is generated during that time. If you believe a charge is wrong, contact us first - that is the faster route.",
        },
        {
          sr: "Ako mesečna pretplata ne bude naplaćena, ciklusni krediti za taj ciklus se ne dodeljuju sve dok uplata ne prođe.",
          en: "If a monthly subscription payment fails, the cycle credits for that cycle are not granted until the payment goes through.",
        },
      ],
    },
    {
      id: "dostupnost",
      title: { sr: "9. Dostupnost Studija", en: "9. Availability of the Studio" },
      body: [
        {
          sr: "Studio možemo da ugasimo ili pauziramo u svakom trenutku, bez prethodne najave - zbog kvara, zloupotrebe, prekoračenja troška prema dobavljačima, izmene ponude modela ili obaveze po propisu. Dok je Studio pauziran, krediti ostaju na nalogu i ništa se ne troši.",
          en: "We may switch the Studio off or pause it at any moment, without prior notice - because of a fault, abuse, a spending overrun towards providers, a change in the model line-up, or a legal obligation. While the Studio is paused, credits stay on the account and nothing is spent.",
        },
        {
          sr: "Pojedinačan model može da nestane iz ponude bez najave, jer i sami dobavljači gase i menjaju modele. Ne garantujemo da će bilo koji model biti dostupan u budućnosti, niti da će rezultat biti isti pri ponovljenom pokretanju.",
          en: "An individual model may disappear from the line-up without notice, because the providers themselves retire and change models. We do not guarantee that any model will remain available, nor that a repeated run will produce the same result.",
        },
        {
          sr: "Studio je otvoren polaznicima kurseva. Prestanak upisa zatvara Studio, ali ne gasi kredite - oni ostaju na nalogu do isteka roka iz tačke 3.",
          en: "The Studio is open to enrolled course students. The end of an enrolment closes the Studio but does not cancel credits - they stay on the account until the deadline in section 3.",
        },
      ],
    },
    {
      id: "izmene",
      title: { sr: "10. Izmene uslova i merodavno pravo", en: "10. Changes and governing law" },
      body: [
        {
          sr: "Ove uslove možemo da izmenimo. Bitnu izmenu objavljujemo na ovoj stranici i tražimo novu potvrdu pre sledeće generacije. Nastavak korišćenja Studija posle objave znači prihvatanje izmenjenih uslova.",
          en: "We may change these terms. A material change is published on this page and requires a fresh confirmation before your next generation. Continuing to use the Studio after publication means you accept the changed terms.",
        },
        {
          sr: `Na ove uslove i na svaki spor iz njih primenjuje se ${JURISDICTION}.`,
          en: `These terms, and any dispute arising from them, are governed by ${JURISDICTION}.`,
        },
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  path: "/politika-privatnosti",
  title: { sr: "Politika privatnosti", en: "Privacy policy" },
  updated: UPDATED,
  intro: {
    sr: "Ovde piše koje podatke o tebi obrađujemo, kome ih prosleđujemo, gde se čuvaju, koliko dugo i kako da tražiš brisanje. Politika važi za celu platformu, a poseban naglasak je na Studiju, jer se odatle podaci prosleđuju dobavljačima modela van naše kontrole.",
    en: "This page says which of your data we process, whom we forward it to, where it is stored, for how long, and how to ask for deletion. The policy covers the whole platform, with particular attention to the Studio, because that is where data is forwarded to model providers outside our control.",
  },
  sections: [
    {
      id: "rukovalac",
      title: { sr: "1. Rukovalac podacima", en: "1. Data controller" },
      body: [
        {
          sr: `Rukovalac je ${OPERATOR}, ${ADDRESS}, matični broj ${COMPANY_NUMBER}, PIB ${TAX_NUMBER}. Za sva pitanja o obradi podataka i za zahteve iz tačke 6 piši na ${PRIVACY_EMAIL}.`,
          en: `The controller is ${OPERATOR}, ${ADDRESS}, company number ${COMPANY_NUMBER}, tax number ${TAX_NUMBER}. For any question about data processing and for the requests in section 6, write to ${PRIVACY_EMAIL}.`,
        },
      ],
    },
    {
      id: "koje-podatke",
      title: { sr: "2. Koje podatke obrađujemo", en: "2. What data we process" },
      body: [
        {
          sr: "Nalog: email adresa, ime i prezime, korisničko ime, jezik, avatar, uloga i vreme potvrde email adrese. Ako se prijavljuješ preko Google naloga, od Google-a dobijamo email, ime i sliku profila.",
          en: "Account: email address, first and last name, username, language, avatar, role and the time your email was confirmed. If you sign in with a Google account, Google gives us your email, name and profile picture.",
        },
        {
          sr: "Učenje i zajednica: napredak kroz lekcije, radovi predati uz zadatke, objave, komentari i poruke koje sam napišeš.",
          en: "Learning and community: lesson progress, work submitted with tasks, posts, comments and the messages you write yourself.",
        },
        {
          sr: "Studio: prompt, parametri modela, fajlovi koje okačiš kao ulaz, generisani fajlovi, cena u kreditima, vreme, status posla i otisak prompta.",
          en: "Studio: the prompt, model parameters, the files you upload as input, the generated files, the price in credits, the time, the job status and a fingerprint of the prompt.",
        },
        {
          sr: "Naplata: istorija kredita i transakcija, identifikatori Stripe kupca, pretplate, sesije i fakture. Broj kartice ne vidimo i ne čuvamo - njega obrađuje isključivo Stripe.",
          en: "Billing: credit and transaction history, Stripe customer, subscription, session and invoice identifiers. We never see or store your card number - only Stripe processes it.",
        },
      ],
    },
    {
      id: "kome-saljemo",
      title: { sr: "3. Kome se podaci prosleđuju", en: "3. Who the data is forwarded to" },
      body: [
        {
          sr: "fal.ai (fal, Inc., SAD) - prompt, parametri i ulazni fajlovi za modele koje fal.ai izvršava, uključujući ElevenLabs modele za govor, muziku i obradu zvuka. Bez tog prosleđivanja generacija ne postoji.",
          en: "fal.ai (fal, Inc., USA) - prompt, parameters and input files for the models fal.ai runs, including the ElevenLabs models for speech, music and audio processing. Without that forwarding there is no generation.",
        },
        {
          sr: "Google (Google LLC / Google Ireland Limited) - prompt, parametri i ulazni fajlovi za Gemini i Veo modele; odvojeno od toga, Google je i provajder prijave ako biraš prijavu Google nalogom.",
          en: "Google (Google LLC / Google Ireland Limited) - prompt, parameters and input files for the Gemini and Veo models; separately from that, Google is also the sign-in provider if you choose to sign in with a Google account.",
        },
        {
          sr: "BytePlus (BytePlus Pte. Ltd., Singapur) - prompt, parametri i ulazni fajlovi za Seedream i Seedance modele.",
          en: "BytePlus (BytePlus Pte. Ltd., Singapore) - prompt, parameters and input files for the Seedream and Seedance models.",
        },
        {
          sr: "Stripe (Stripe, Inc. / Stripe Payments Europe) - email, iznos, poreski status i podaci o plaćanju, radi naplate i izdavanja računa.",
          en: "Stripe (Stripe, Inc. / Stripe Payments Europe) - email, amount, tax status and payment data, for charging and invoicing.",
        },
        {
          sr: "Convex (Convex, Inc.) - baza i skladište fajlova platforme. Resend (Resend, Inc.) - slanje email poruka o nalogu i obaveštenja. Vercel (Vercel, Inc.) - hosting same aplikacije.",
          en: "Convex (Convex, Inc.) - the platform database and file storage. Resend (Resend, Inc.) - sending account emails and notifications. Vercel (Vercel, Inc.) - hosting the application itself.",
        },
        {
          sr: "Deo ovih obrađivača je van Evropskog ekonomskog prostora, pre svega u SAD. Prenos se oslanja na standardne ugovorne klauzule iz njihovih ugovora o obradi podataka. Tvoje promptove i fajlove ne prodajemo i ne prosleđujemo nikome radi oglašavanja.",
          en: "Some of these processors are outside the European Economic Area, chiefly in the USA. The transfer relies on the standard contractual clauses in their data processing agreements. We do not sell your prompts or files and do not forward them to anyone for advertising.",
        },
      ],
    },
    {
      id: "osnov",
      title: { sr: "4. Pravni osnov i svrha obrade", en: "4. Legal basis and purpose" },
      body: [
        {
          sr: "Izvršenje ugovora: nalog, pristup kursevima, generacije u Studiju i naplata. Bez ovih podataka usluga ne može da se pruži.",
          en: "Performance of a contract: the account, course access, Studio generations and billing. Without this data the service cannot be provided.",
        },
        {
          sr: "Zakonska obaveza: knjigovodstvena i poreska dokumentacija o naplaćenim uslugama.",
          en: "Legal obligation: accounting and tax records of the services charged.",
        },
        {
          sr: "Legitiman interes: moderacija sadržaja, sprečavanje zloupotrebe i prevare, i bezbednost platforme. Na tom osnovu ovlašćeno osoblje može da pregleda generisan sadržaj, kako piše u uslovima korišćenja Studija; svaki pun uvid u pojedinačan posao se beleži.",
          en: "Legitimate interest: content moderation, prevention of abuse and fraud, and platform security. On that basis authorised staff may review generated content, as stated in the Studio terms of use; every full access to an individual job is logged.",
        },
      ],
    },
    {
      id: "rokovi",
      title: { sr: "5. Koliko dugo se čuva", en: "5. How long it is kept" },
      body: [
        {
          sr: `Generisan video: ${OUTPUT_RETENTION_DAYS.video} dana. Generisane slike i zvuk: ${OUTPUT_RETENTION_DAYS.image} dana. Ulazni fajl koji nije upotrebljen ni u jednoj generaciji: 24 sata.`,
          en: `Generated video: ${OUTPUT_RETENTION_DAYS.video} days. Generated images and audio: ${OUTPUT_RETENTION_DAYS.image} days. An input file not used in any generation: 24 hours.`,
        },
        {
          sr: "Metapodaci o generaciji i knjiga kredita čuvaju se trajno, jer su dokaz o tome šta je naplaćeno. Podaci o nalogu se čuvaju dok nalog postoji. Knjigovodstvena dokumentacija se čuva u rokovima koje propisuje poreski propis.",
          en: "Generation metadata and the credit ledger are kept permanently, because they are the record of what was charged. Account data is kept as long as the account exists. Accounting records are kept for the periods required by tax law.",
        },
      ],
    },
    {
      id: "prava",
      title: {
        sr: "6. Tvoja prava i kako se traži brisanje",
        en: "6. Your rights and how to request deletion",
      },
      body: [
        {
          sr: "Imaš pravo na pristup svojim podacima, na ispravku, na brisanje, na ograničenje obrade, na prenosivost i na prigovor na obradu po osnovu legitimnog interesa.",
          en: "You have the right to access your data, to correct it, to have it deleted, to restrict processing, to data portability, and to object to processing based on legitimate interest.",
        },
        {
          sr: `Zahtev šalješ sa email adrese naloga na ${PRIVACY_EMAIL}, sa naznakom šta tražiš. Odgovaramo najkasnije u roku od 30 dana. Pojedinačnu generaciju možeš i sam da obrišeš iz galerije Studija.`,
          en: `Send the request from the account's email address to ${PRIVACY_EMAIL}, saying what you are asking for. We answer within 30 days at the latest. You can also delete an individual generation yourself from the Studio gallery.`,
        },
        {
          sr: "Brisanje naloga ne briše ono što propis nalaže da se sačuva - knjigovodstvenu dokumentaciju i zapis o naplaćenim uslugama - niti sadržaj koji je predmet prijave dok se prijava ne reši. Brisanjem naloga nepotrošeni krediti propadaju i ne isplaćuju se.",
          en: "Deleting an account does not delete what the law requires us to keep - accounting records and the record of services charged - nor content that is the subject of a report until that report is resolved. When an account is deleted, unused credits lapse and are not paid out.",
        },
        {
          sr: "Ako smatraš da podatke obrađujemo protivno propisu, imaš pravo da se obratiš nadležnom organu za zaštitu podataka o ličnosti.",
          en: "If you believe we process your data unlawfully, you have the right to lodge a complaint with the competent data protection authority.",
        },
      ],
    },
    {
      id: "kolacici",
      title: { sr: "7. Kolačići i izmene ove politike", en: "7. Cookies and changes to this policy" },
      body: [
        {
          sr: "Koristimo samo kolačiće neophodne za rad platforme: prijavu i održavanje sesije. Nemamo oglasne ni marketinške kolačiće i ne pratimo te po drugim sajtovima.",
          en: "We use only the cookies necessary for the platform to work: sign-in and session handling. We have no advertising or marketing cookies and do not track you across other sites.",
        },
        {
          sr: `Ovu politiku možemo da izmenimo; izmena se objavljuje na ovoj stranici sa novim datumom. Za pitanja koja se tiču ugovora, a ne podataka, piši na ${SUPPORT_EMAIL}.`,
          en: `We may change this policy; a change is published on this page with a new date. For questions about the contract rather than the data, write to ${SUPPORT_EMAIL}.`,
        },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [STUDIO_TERMS, PRIVACY_POLICY];
