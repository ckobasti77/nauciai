import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";

import {
  dateRangeCutoff,
  expiryBadgeDays,
  expiryBadgeText,
  filterJobOwners,
  GALLERY_SCOPE_LABELS,
  GALLERY_SCOPES,
  inputsLabel,
  isDownloadable,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  jobParamSummary,
  regenerateButtonLabel,
  regenerateHref,
  STUDIO_PROVIDER_LABELS,
  STUDIO_PROVIDERS,
  studioMediaDetailHref,
  downloadMediaFiles,
} from "./studio-gallery";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("dateRangeCutoff", () => {
  test("'all' nema donju granicu", () => {
    expect(dateRangeCutoff("all", NOW)).toBeUndefined();
  });

  test("'7d' i '30d' su tačno N dana unazad od 'now'", () => {
    expect(dateRangeCutoff("7d", NOW)).toBe(NOW - 7 * DAY_MS);
    expect(dateRangeCutoff("30d", NOW)).toBe(NOW - 30 * DAY_MS);
  });
});

describe("expiryBadgeDays", () => {
  test("null kad nema fajla ili nema roka", () => {
    expect(expiryBadgeDays({ outputUrl: null, expiresAt: NOW + DAY_MS }, NOW)).toBeNull();
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: undefined }, NOW)).toBeNull();
  });

  test("null kad je rok već prošao (to je 'isteklo', ne značka)", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW - 1 }, NOW)).toBeNull();
  });

  test("null kad je 7 ili više dana do isteka", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 7 * DAY_MS }, NOW)).toBeNull();
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 30 * DAY_MS }, NOW)).toBeNull();
  });

  test("broj dana, zaokružen naviše, kad je manje od 7 dana do isteka", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 6 * DAY_MS }, NOW)).toBe(6);
    // Malo preko 2 puna dana -> značka kaže "3", da ne obeća više vremena nego što ima.
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 2 * DAY_MS + 60_000 }, NOW)).toBe(3);
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 1000 }, NOW)).toBe(1);
  });
});

describe("expiryBadgeText", () => {
  test("posebna poruka za danas, jednina za jedan dan, inače plural 'dana'", () => {
    expect(expiryBadgeText(0, "sr")).toBe("ističe danas");
    expect(expiryBadgeText(0, "en")).toBe("expires today");
    expect(expiryBadgeText(1, "sr")).toBe("ističe za 1 dan");
    expect(expiryBadgeText(1, "en")).toBe("expires in 1 day");
    expect(expiryBadgeText(6, "sr")).toBe("ističe za 6 dana");
    expect(expiryBadgeText(6, "en")).toBe("expires in 6 days");
  });
});

test("regenerateButtonLabel nosi cenu u oba jezika", () => {
  expect(regenerateButtonLabel(20, "sr")).toBe("Generiši ponovo - 20 kr");
  expect(regenerateButtonLabel(20, "en")).toBe("Generate again - 20 cr");
});

describe("isDownloadable", () => {
  test("samo posao sa outputUrl je preuzimljiv", () => {
    expect(isDownloadable({ outputUrl: "https://x" })).toBe(true);
    expect(isDownloadable({ outputUrl: null })).toBe(false);
    expect(isDownloadable({ outputUrl: undefined })).toBe(false);
    expect(isDownloadable({})).toBe(false);
  });
});

// ── "Generisi ponovo" i opis kartice (S7) ──────────────────────────────────

test("regenerateHref vodi u playground sa ID-jem posla, ne sa promptom u URL-u", () => {
  expect(regenerateHref("/sr/app/studio", "job_123")).toBe("/sr/app/studio?regenerate=job_123");
  // ID se enkoduje - link ne sme da se raspadne na neocekivanom znaku.
  expect(regenerateHref("/sr/app/studio", "a b")).toBe("/sr/app/studio?regenerate=a%20b");
});

test("naslov ulaza broji tek kad ih ima vise nego sto je prikazano", () => {
  expect(inputsLabel(4, 4, "sr")).toBe("Ulazi");
  expect(inputsLabel(4, 9, "sr")).toBe("Ulazi · 4/9");
  expect(inputsLabel(4, 9, "en")).toBe("Inputs · 4/9");
});

test("opis podesavanja koristi imena i jedinice iz paramSpec-a tog modela", () => {
  const seed = STUDIO_MODELS.find((model) => model.slug === "kling-3");
  if (!seed) throw new Error("nema kling-3");

  const summary = jobParamSummary(
    JSON.stringify({ prompt: "klip", resolution: "1080p", audio: true, duration: 8 }),
    seed.paramSpec,
    "sr",
  );

  expect(summary).toContain("1080p");
  expect(summary).toContain("8");
  // Prompt je vec iznad kartice - u redu podesavanja se ne ponavlja.
  expect(summary).not.toContain("klip");
});

test("bez reda kataloga nema opisa - sirovi kljucevi se ne ispisuju", () => {
  expect(jobParamSummary(JSON.stringify({ resolution: "1080p" }), undefined, "sr")).toBe("");
  const seed = STUDIO_MODELS.find((model) => model.slug === "kling-3");
  expect(jobParamSummary("nije json", seed?.paramSpec, "sr")).toBe("");
});

// ── W1: prekidac "Samo moji" / "Svi korisnici" ─────────────────────────────

test("filterJobOwners suzava spisak po labeli, bez obzira na velika slova", () => {
  const owners = [
    { userId: "1", label: "ana@example.com" },
    { userId: "2", label: "Bojan@Example.com" },
    { userId: "3", label: "cveta@drugi.rs" },
  ];

  expect(filterJobOwners(owners, "example").map((owner) => owner.userId)).toEqual(["1", "2"]);
  expect(filterJobOwners(owners, "BOJAN").map((owner) => owner.userId)).toEqual(["2"]);
  // Prazna pretraga nije filter - vraca sve, ne nista.
  expect(filterJobOwners(owners, "   ")).toHaveLength(3);
  expect(filterJobOwners(owners, "nikoga")).toHaveLength(0);

  // Moderatoru labela nije mejl nego otisak - pretraga radi i nad njim.
  const handles = [
    { userId: "1", label: "a1b2c3" },
    { userId: "2", label: "d4e5f6" },
  ];
  expect(filterJobOwners(handles, "D4E").map((owner) => owner.userId)).toEqual(["2"]);
});

test("labele prekidaca, statusa i provajdera postoje za svaku vrednost", () => {
  for (const scope of GALLERY_SCOPES) {
    expect(GALLERY_SCOPE_LABELS[scope].sr).not.toBe("");
    expect(GALLERY_SCOPE_LABELS[scope].en).not.toBe("");
  }
  for (const status of JOB_STATUSES) {
    expect(JOB_STATUS_LABELS[status].sr).not.toBe("");
    expect(JOB_STATUS_LABELS[status].en).not.toBe("");
  }
  for (const provider of STUDIO_PROVIDERS) {
    expect(STUDIO_PROVIDER_LABELS[provider]).not.toBe("");
  }
  // Spisak provajdera se ne sme raziti sa katalogom - filter bi tiho izgubio rutu.
  expect([...new Set(STUDIO_MODELS.map((model) => model.provider))].sort()).toEqual(
    [...STUDIO_PROVIDERS].sort(),
  );
});

test("studioMediaDetailHref gradi ispravnu deljivu putanju", () => {
  expect(studioMediaDetailHref("sr", "job123")).toBe("/sr/app/studio/m/job123");
  expect(studioMediaDetailHref("en", "job456")).toBe("/en/app/studio/m/job456");
});

describe("downloadMediaFiles", () => {
  test("prijavljuje grešku za stavke bez outputUrl i nastavlja dalje", async () => {
    const progress: Array<[number, number]> = [];
    const result = await downloadMediaFiles(
      [
        { _id: "job1", outputUrl: null },
        { _id: "job2", outputUrl: "https://example.com/file.webp", kind: "image" },
      ],
      (completed, total) => progress.push([completed, total]),
    );

    expect(result.succeeded).toContain("job2");
    expect(result.failed).toEqual([{ id: "job1", error: "Nema URL za preuzimanje" }]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

