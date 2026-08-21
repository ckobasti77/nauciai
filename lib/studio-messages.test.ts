import { describe, expect, test } from "vitest";

import { MAX_PROMPT_LENGTH } from "@/convex/creditsCore";
import {
  CREDITS_NO_BALANCE,
  CREDITS_NO_HISTORY,
  CREDITS_NO_PACKS,
  deleteJobErrorMessage,
  GALLERY_NO_GENERATIONS,
  GALLERY_NO_MATCHES,
  generateBlockMessage,
  measureFailureMessage,
  measuredDurationNotice,
  PROMPT_MAX_LENGTH,
  STUDIO_NOT_ENROLLED,
  STUDIO_NO_GENERATIONS,
  STUDIO_PAUSED,
  STUDIO_TERMS_GATE,
  studioErrorMessage,
  uploadErrorMessage,
  type EmptyState,
  type EmptyStateNoCta,
  type GenerateBlock,
} from "@/lib/studio-messages";

/** Ovako Convex klijent umota grešku bačenu u mutaciji. */
const wrap = (code: string) =>
  `[CONVEX M(studio:createJob)] [Request ID: abc123] Server Error\nUncaught Error: ${code}\n    at handler (../convex/studio.ts:120:13)`;

describe("granica prompta", () => {
  test("forma i server broje do iste dužine", () => {
    // Vrednost je namerno duplirana (da moderacijski rečnik ne uđe u bundle),
    // pa ovaj test postoji da se ne raziđe.
    expect(PROMPT_MAX_LENGTH).toBe(MAX_PROMPT_LENGTH);
  });
});

describe("studioErrorMessage", () => {
  const codes = [
    "STUDIO_PAUZIRAN",
    "NEMA_PRISTUPA",
    "ZADATAK_BEZ_LEKCIJE",
    "ZADATAK_NIJE_U_LEKCIJI",
    "NEISPRAVNO_TRAJANJE",
    "NEISPRAVNI_PARAMETRI",
    "NEISPRAVAN_REZIM",
    "NEISPRAVNI_ULAZI",
    "IZVOR_NIJE_IZABRAN",
    "IZVOR_NIJE_DOSTUPAN",
    "IZVOR_NIJE_PODRZAN",
    "NEISPRAVAN_PROMPT:PRAZAN_PROMPT",
    "NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT",
    "NEISPRAVAN_PROMPT:ZABRANJEN_POJAM",
    "MODEL_NEDOSTUPAN",
    "PREVISE_POSLOVA",
    "DNEVNI_LIMIT",
    "DNEVNI_LIMIT_TROSKA",
    "NEDOVOLJNO_KREDITA",
    "TUDJI_FAJL",
    "MERENJE_NIJE_DOSTUPNO",
    "ZAGLAVLJE_NEMOGUCE",
    "NEPORAVNAT_DUG",
    "PREVISE_NEPORAVNATOG",
    "USLOVI_NEPRIHVACENI",
    "SPOR_U_TOKU",
    "SALDO_U_MINUSU",
  ];

  test("nijedna poruka ne prikazuje sirov kod greške", () => {
    for (const code of codes) {
      for (const locale of ["sr", "en"] as const) {
        const message = studioErrorMessage(wrap(code), locale);
        expect(message).not.toContain("_");
        expect(message).not.toContain("CONVEX");
        expect(message.length).toBeGreaterThan(10);
      }
    }
  });

  test("svaki kod ima svoju poruku, ne zajedničku", () => {
    const messages = codes.map((code) => studioErrorMessage(wrap(code), "sr"));
    expect(new Set(messages).size).toBe(messages.length);
  });

  test("DNEVNI_LIMIT_TROSKA se ne čita kao DNEVNI_LIMIT", () => {
    expect(studioErrorMessage(wrap("DNEVNI_LIMIT_TROSKA"), "sr")).toContain("potrošnje");
    expect(studioErrorMessage(wrap("DNEVNI_LIMIT"), "sr")).not.toContain("potrošnje");
  });

  test("razlozi prompta se razlikuju međusobno i od opšte poruke", () => {
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:PRAZAN_PROMPT"), "sr")).toContain("Napiši prompt");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT"), "sr")).toContain("2000");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:ZABRANJEN_POJAM"), "sr")).toContain("ne generiše");
    expect(studioErrorMessage(wrap("NEISPRAVAN_PROMPT:NEPOZNATO"), "sr")).toContain("nije prihvaćen");
  });

  test("zadatak bez lekcije i zadatak van lekcije imaju različite poruke", () => {
    expect(studioErrorMessage(wrap("ZADATAK_BEZ_LEKCIJE"), "sr")).not.toBe(
      studioErrorMessage(wrap("ZADATAK_NIJE_U_LEKCIJI"), "sr"),
    );
  });

  test("NEISPRAVNI_ULAZI sa podrazlogom deli poruku sa bare kodom, i nije opšta", () => {
    const bare = studioErrorMessage(wrap("NEISPRAVNI_ULAZI"), "sr");
    const withReason = studioErrorMessage(wrap("NEISPRAVNI_ULAZI:NEPOZNAT_SLOT:audio"), "sr");
    expect(withReason).toBe(bare);
    expect(bare).toContain("ne odgovaraju");
    expect(bare).not.toContain("Pokušaj ponovo za koji trenutak");
  });

  test("tri razloga za izvor (nije izabran / nedostupan / nepodržan) imaju različite poruke", () => {
    const messages = ["IZVOR_NIJE_IZABRAN", "IZVOR_NIJE_DOSTUPAN", "IZVOR_NIJE_PODRZAN"].map((code) =>
      studioErrorMessage(wrap(code), "sr"),
    );
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) expect(message).not.toContain("Pokušaj ponovo za koji trenutak");
  });

  test("nepoznata greška daje ljudsku poruku, ne prazan ekran", () => {
    const message = studioErrorMessage("TypeError: fetch failed", "sr");
    expect(message).toContain("Pokušaj ponovo");
    expect(studioErrorMessage("TypeError: fetch failed", "en")).toContain("Try again");
  });

  test("obe lokalizacije postoje i razlikuju se", () => {
    expect(studioErrorMessage(wrap("NEDOVOLJNO_KREDITA"), "sr")).not.toBe(
      studioErrorMessage(wrap("NEDOVOLJNO_KREDITA"), "en"),
    );
  });
});

describe("merenje trajanja", () => {
  const BLOCKS: GenerateBlock[] = [
    { kind: "paused" },
    { kind: "not_enrolled" },
    { kind: "credits", needed: 20 },
    { kind: "active", max: 3 },
    { kind: "inputs", message: "Dodaj sliku" },
    { kind: "prompt" },
    { kind: "measure" },
    { kind: "price" },
    { kind: "uploading" },
  ];

  test("svaki razlog zbog kojeg dugme ne radi ima svoju rečenicu na oba jezika", () => {
    for (const block of BLOCKS) {
      for (const locale of ["sr", "en"] as const) {
        const message = generateBlockMessage(block, locale);
        expect(message, `${block.kind}.${locale}`).toBeTruthy();
        expect(message).not.toContain("_");
      }
    }
    // "Merim trajanje" i "kombinacija nema cenu" su različita stanja i ne smeju
    // da dele rečenicu - prvo prolazi samo od sebe, drugo traži izmenu.
    expect(generateBlockMessage({ kind: "measure" }, "sr")).not.toBe(
      generateBlockMessage({ kind: "price" }, "sr"),
    );
  });

  test("svaki razlog neuspelog merenja ima svoj sledeći korak, ne kod greške", () => {
    // `measureInputUpload` vraća ishod umesto da baca, pa razlog do X1 nije
    // stizao do ekrana - korisnik je gledao u zaključano dugme.
    const reasons = [
      "ZAGLAVLJE_NIJE_PROCITANO",
      "VBR_NEPOUZDAN",
      "NEPOZNAT_FORMAT",
      "MERENJE_ODBIJENO",
    ];
    for (const reason of reasons) {
      for (const locale of ["sr", "en"] as const) {
        const message = measureFailureMessage(reason, locale);
        expect(message, `${reason}.${locale}`).not.toContain("_");
        expect(message.length).toBeGreaterThan(20);
      }
    }

    // Svaki razlog - svoj sledeći korak, plus opšta poruka za nepoznat.
    const messages = reasons.map((reason) => measureFailureMessage(reason, "sr"));
    expect(new Set(messages).size).toBe(messages.length);
    expect(measureFailureMessage("VBR_NEPOUZDAN", "sr")).toContain("stalnim bitrate-om");
    expect(measureFailureMessage("FAJL_NE_POSTOJI", "sr")).toContain("Okači fajl ponovo");
    expect(measureFailureMessage("FAJL_NE_POSTOJI", "en")).not.toContain("_");
  });

  test("izmereno trajanje se korisniku kaže u sekundama ili minutima", () => {
    expect(measuredDurationNotice(42.4, "sr")).toContain("42 s");
    expect(measuredDurationNotice(420, "sr")).toContain("7 min");
    expect(measuredDurationNotice(420, "en")).toContain("7 min");
    expect(measuredDurationNotice(420, "sr")).not.toBe(measuredDurationNotice(420, "en"));
  });
});

describe("uploadErrorMessage", () => {
  test("prijava bez važeće dozvole ima ljudsku rečenicu, ne kod greške", () => {
    // Convex kod stigne umotan u "[CONVEX M(studio:registerInputUpload)] ...
    // Uncaught Error: NEDOZVOLJEN_UPLOAD at handler", pa se TRAŽI u tekstu.
    const raw =
      "[CONVEX M(studio:registerInputUpload)] Uncaught Error: NEDOZVOLJEN_UPLOAD at handler";
    for (const locale of ["sr", "en"] as const) {
      const message = uploadErrorMessage(raw, locale);
      expect(message).not.toContain("_");
      expect(message.length).toBeGreaterThan(20);
    }
    expect(uploadErrorMessage(raw, "sr")).toContain("Okači ga ponovo");
    // Mrežni pad nije istekla dozvola i ne sme da deli rečenicu sa njom.
    expect(uploadErrorMessage("UPLOAD_NEUSPEO", "sr")).not.toBe(uploadErrorMessage(raw, "sr"));
    expect(uploadErrorMessage("UPLOAD_NEUSPEO", "sr")).not.toContain("_");
  });
});

describe("deleteJobErrorMessage", () => {
  test("prepoznaje oba imenovana koda i pada na opštu poruku", () => {
    expect(deleteJobErrorMessage("Error: POSAO_U_TOKU", "sr")).toMatch(/još u obradi/);
    expect(deleteJobErrorMessage("Error: POSAO_U_TOKU", "en")).toMatch(/still in progress/);
    expect(deleteJobErrorMessage("Error: POSAO_POVEZAN_SA_LEKCIJOM", "sr")).toMatch(/dokaz za zadatak/);
    expect(deleteJobErrorMessage("Error: POSAO_POVEZAN_SA_LEKCIJOM", "en")).toMatch(/evidence for a lesson/);
    expect(deleteJobErrorMessage("Nešto sasvim drugo", "sr")).toBe("Brisanje nije uspelo. Pokušaj ponovo.");
    expect(deleteJobErrorMessage("Nešto sasvim drugo", "en")).toBe("Delete failed. Try again.");
  });
});

describe("prazna stanja", () => {
  const EMPTY_STATES: Array<[string, EmptyState | EmptyStateNoCta]> = [
    ["STUDIO_PAUSED", STUDIO_PAUSED],
    ["STUDIO_NOT_ENROLLED", STUDIO_NOT_ENROLLED],
    ["STUDIO_NO_GENERATIONS", STUDIO_NO_GENERATIONS],
    ["CREDITS_NO_BALANCE", CREDITS_NO_BALANCE],
    ["CREDITS_NO_PACKS", CREDITS_NO_PACKS],
    ["CREDITS_NO_HISTORY", CREDITS_NO_HISTORY],
    ["GALLERY_NO_GENERATIONS", GALLERY_NO_GENERATIONS],
    ["GALLERY_NO_MATCHES", GALLERY_NO_MATCHES],
    ["STUDIO_TERMS_GATE", STUDIO_TERMS_GATE],
  ];

  test("svako prazno stanje ima naslov i rečenicu na oba jezika; sledeći korak kad postoji", () => {
    for (const [name, state] of EMPTY_STATES) {
      for (const locale of ["sr", "en"] as const) {
        expect(state.title[locale], `${name}.title.${locale}`).toBeTruthy();
        expect(state.body[locale], `${name}.body.${locale}`).toBeTruthy();
        if ("cta" in state) expect(state.cta[locale], `${name}.cta.${locale}`).toBeTruthy();
      }
      expect(state.title.sr).not.toBe(state.title.en);
      expect(state.body.sr).not.toBe(state.body.en);
      if ("cta" in state) expect(state.cta.sr).not.toBe(state.cta.en);
    }
  });

  test("STUDIO_NOT_ENROLLED nema CTA - dok je Studio zatvoreno testiranje, nema radnje koju bi dugme radilo", () => {
    // Upis na kurs ne otvara pristup (STUDIO_STAFF_ONLY), pa staro "Pogledaj
    // kurseve" dugme ne bi radilo ono što piše - uklonjeno je, ne zamenjeno.
    expect("cta" in STUDIO_NOT_ENROLLED).toBe(false);
  });
});
