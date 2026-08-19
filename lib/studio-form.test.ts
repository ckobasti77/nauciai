import { describe, expect, test } from "vitest";

import { MAX_PROMPT_LENGTH } from "@/convex/creditsCore";
import { sanitizeParams } from "@/convex/studioCore";
import {
  buildJobParams,
  clampNumber,
  controlFields,
  generateButtonLabel,
  initialParamValues,
  isExpiredOutput,
  jobPrompt,
  jobStatusText,
  jobTileState,
  parseParamSchema,
  promptField,
  PROMPT_MAX_LENGTH,
} from "@/lib/studio-form";

/** Ista šema koju `convex/seed.ts` upisuje svim modelima za slike. */
const IMAGE_SCHEMA = JSON.stringify([
  { key: "prompt", type: "textarea", label: "Prompt", required: true, maxLength: 2000 },
  { key: "aspect_ratio", type: "select", label: "Format", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
  { key: "num_images", type: "number", label: "Broj slika", min: 1, max: 4 },
]);

describe("granica prompta", () => {
  test("forma i server broje do iste dužine", () => {
    // Vrednost je namerno duplirana (da moderacijski rečnik ne uđe u bundle),
    // pa ovaj test postoji da se ne raziđe.
    expect(PROMPT_MAX_LENGTH).toBe(MAX_PROMPT_LENGTH);
  });
});

describe("parseParamSchema", () => {
  test("gradi tri kontrole iz seed šeme za slike", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    expect(fields.map((field) => [field.key, field.kind])).toEqual([
      ["prompt", "textarea"],
      ["aspect_ratio", "select"],
      ["num_images", "number"],
    ]);
  });

  test("granice broja se prepisuju iz šeme, ne izmišljaju", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const numImages = fields.find((field) => field.key === "num_images");
    expect(numImages).toMatchObject({ kind: "number", min: 1, max: 4 });
  });

  test("opcije selecta su tačno one koje server prihvata", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const aspect = fields.find((field) => field.key === "aspect_ratio");
    expect(aspect).toMatchObject({ kind: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] });
  });

  test("polje nepoznatog tipa se ne renderuje jer bi ga server bacio", () => {
    const schema = JSON.stringify([
      { key: "prompt", type: "textarea" },
      { key: "seed", type: "slider", min: 0, max: 100 },
    ]);
    expect(parseParamSchema(schema).map((field) => field.key)).toEqual(["prompt"]);
  });

  test("select bez opcija se ne renderuje - nijedna vrednost ne bi prošla", () => {
    const schema = JSON.stringify([
      { key: "a", type: "select", options: [] },
      { key: "b", type: "select" },
      { key: "c", type: "select", options: ["ok", 7] },
    ]);
    const fields = parseParamSchema(schema);
    expect(fields.map((field) => field.key)).toEqual(["c"]);
    expect(fields[0]).toMatchObject({ options: ["ok"] });
  });

  test("šema koja nije JSON niz daje praznu formu umesto pada", () => {
    expect(parseParamSchema("nije json")).toEqual([]);
    expect(parseParamSchema(JSON.stringify({ key: "prompt" }))).toEqual([]);
    expect(parseParamSchema(JSON.stringify([null, 5, "x", { key: 1, type: "text" }]))).toEqual([]);
  });

  test("maxLength iz šeme ne sme da premaši serverski limit", () => {
    const generous = parseParamSchema(JSON.stringify([{ key: "prompt", type: "textarea", maxLength: 9000 }]));
    expect(promptField(generous).maxLength).toBe(PROMPT_MAX_LENGTH);

    const strict = parseParamSchema(JSON.stringify([{ key: "prompt", type: "textarea", maxLength: 300 }]));
    expect(promptField(strict).maxLength).toBe(300);
  });

  test("prompt postoji i kad ga šema ne pominje", () => {
    const fields = parseParamSchema(JSON.stringify([{ key: "num_images", type: "number" }]));
    expect(promptField(fields)).toMatchObject({ key: "prompt", maxLength: PROMPT_MAX_LENGTH });
    expect(controlFields(fields).map((field) => field.key)).toEqual(["num_images"]);
  });
});

describe("initialParamValues", () => {
  test("uzima vrednosti iz defaultParams modela", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const values = initialParamValues(fields, JSON.stringify({ aspect_ratio: "16:9", num_images: 2 }));
    expect(values).toEqual({ aspect_ratio: "16:9", num_images: 2 });
  });

  test("prompt nije u vrednostima forme - ima svoje polje", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const values = initialParamValues(fields, JSON.stringify({ prompt: "iz seeda" }));
    expect(values.prompt).toBeUndefined();
  });

  test("nepoznata vrednost selecta pada na prvu opciju, ne na sebe", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const values = initialParamValues(fields, JSON.stringify({ aspect_ratio: "21:9" }));
    expect(values.aspect_ratio).toBe("1:1");
  });

  test("broj iz defaultParams se odseca na granice šeme", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    expect(initialParamValues(fields, JSON.stringify({ num_images: 99 })).num_images).toBe(4);
    expect(initialParamValues(fields, JSON.stringify({ num_images: 0 })).num_images).toBe(1);
  });

  test("ključ koji nije u šemi ne ulazi u formu (npr. `resolution`)", () => {
    // `resolution` je deo identiteta sluga i namerno stoji van `paramSchema`;
    // forma ne sme da ga ponudi, jer bi ga `sanitizeParams` ionako izbacio.
    const fields = parseParamSchema(IMAGE_SCHEMA);
    const values = initialParamValues(fields, JSON.stringify({ resolution: "2K", num_images: 1 }));
    expect(values.resolution).toBeUndefined();
  });

  test("neispravan defaultParams ne obara formu", () => {
    const fields = parseParamSchema(IMAGE_SCHEMA);
    expect(initialParamValues(fields, "{{")).toEqual({ aspect_ratio: "1:1", num_images: 1 });
    expect(initialParamValues(fields, "[]")).toEqual({ aspect_ratio: "1:1", num_images: 1 });
  });
});

describe("buildJobParams", () => {
  const fields = parseParamSchema(IMAGE_SCHEMA);

  test("šalje prompt i vrednosti iz forme", () => {
    expect(buildJobParams(fields, { aspect_ratio: "16:9", num_images: 3 }, "mačka")).toEqual({
      prompt: "mačka",
      aspect_ratio: "16:9",
      num_images: 3,
    });
  });

  test("broj van granica se odseca pre slanja", () => {
    expect(buildJobParams(fields, { num_images: 40 }, "x").num_images).toBe(4);
    expect(buildJobParams(fields, { num_images: -5 }, "x").num_images).toBe(1);
  });

  test("vrednost selecta van skupa ne stiže do servera", () => {
    expect(buildJobParams(fields, { aspect_ratio: "21:9" }, "x").aspect_ratio).toBeUndefined();
  });

  test("prazno polje broja ispada umesto da postane NaN", () => {
    expect(buildJobParams(fields, { num_images: "" }, "x").num_images).toBeUndefined();
    expect(buildJobParams(fields, { num_images: "abc" }, "x").num_images).toBeUndefined();
  });

  test("broj upisan kao tekst iz input polja postaje broj", () => {
    expect(buildJobParams(fields, { num_images: "3" }, "x").num_images).toBe(3);
  });

  test("ključ koji nije u šemi ne može da se prokrijumčari kroz vrednosti", () => {
    expect(buildJobParams(fields, { resolution: "4K" }, "x").resolution).toBeUndefined();
  });

  test("sve što forma pošalje server propušta nepromenjeno", () => {
    // Prava tvrdnja ovog koraka: klijent ne nudi ništa što `sanitizeParams`
    // odbija ili menja, pa se cena obračunata na serveru poklapa sa formom.
    const params = buildJobParams(fields, { aspect_ratio: "9:16", num_images: 4 }, "test prompt");
    const sanitized = sanitizeParams(IMAGE_SCHEMA, params);
    expect(sanitized.ok).toBe(true);
    if (sanitized.ok) expect(sanitized.params).toEqual(params);
  });

  test("i odsečene ivične vrednosti prolaze server nepromenjeno", () => {
    for (const numImages of [1, 4, 99, -3]) {
      const params = buildJobParams(fields, { aspect_ratio: "4:3", num_images: numImages }, "p");
      const sanitized = sanitizeParams(IMAGE_SCHEMA, params);
      expect(sanitized.ok).toBe(true);
      if (sanitized.ok) expect(sanitized.params).toEqual(params);
    }
  });
});

describe("clampNumber", () => {
  test("polje bez granica ne dira vrednost", () => {
    expect(clampNumber(1000, {})).toBe(1000);
    expect(clampNumber(2, { min: 1 })).toBe(2);
    expect(clampNumber(0, { min: 1 })).toBe(1);
    expect(clampNumber(9, { max: 4 })).toBe(4);
  });
});

describe("jobStatusText", () => {
  test("refundiran posao uvek kaže da su krediti vraćeni", () => {
    expect(jobStatusText({ status: "refunded" }, "sr")).toContain("krediti su ti vraćeni");
    expect(jobStatusText({ status: "refunded" }, "en")).toContain("refunded");
  });

  test("posao u letu ima svoj tekst po statusu", () => {
    expect(jobStatusText({ status: "reserved" }, "sr")).not.toBe(jobStatusText({ status: "running" }, "sr"));
  });

  test("`done` bez fajla razlikuje preuzimanje od pada preuzimanja", () => {
    expect(jobStatusText({ status: "done", outputUrl: null }, "sr")).toContain("Preuzimamo");
    expect(
      jobStatusText({ status: "done", outputUrl: null, error: "IZLAZ_NIJE_SACUVAN: 401" }, "sr"),
    ).toContain("nije uspela da se sačuva");
  });
});

describe("istekao fajl", () => {
  test("rok bez fajla znači da je retencija prošla, ne da posao nije uspeo", () => {
    expect(isExpiredOutput({ status: "done", outputUrl: null, expiresAt: 1 })).toBe(true);
    expect(jobStatusText({ status: "done", outputUrl: null, expiresAt: 1 }, "sr")).toContain(
      "generiši ponovo",
    );
  });

  test("posao koji tek preuzima fajl još nema rok, pa nije istekao", () => {
    expect(isExpiredOutput({ status: "done", outputUrl: null })).toBe(false);
    expect(jobStatusText({ status: "done", outputUrl: null }, "sr")).toContain("Preuzimamo");
  });

  test("posao sa fajlom nikad nije istekao", () => {
    expect(isExpiredOutput({ status: "done", outputUrl: "https://x", expiresAt: 1 })).toBe(false);
  });

  test("neuspeo posao se ne prijavljuje kao istekao", () => {
    expect(isExpiredOutput({ status: "refunded", outputUrl: null, expiresAt: 1 })).toBe(false);
  });
});

describe("jobTileState", () => {
  test("svako stanje pločice se razlikuje", () => {
    expect(jobTileState({ status: "done", outputUrl: "https://x" })).toBe("image");
    expect(jobTileState({ status: "refunded", outputUrl: null })).toBe("refunded");
    expect(jobTileState({ status: "failed", outputUrl: null })).toBe("refunded");
    expect(jobTileState({ status: "done", outputUrl: null, expiresAt: 1 })).toBe("expired");
    expect(jobTileState({ status: "running", outputUrl: null })).toBe("pending");
    expect(jobTileState({ status: "reserved", outputUrl: null })).toBe("pending");
  });

  test("slika pobeđuje i kad je rok upisan - fajl je još tu", () => {
    expect(jobTileState({ status: "done", outputUrl: "https://x", expiresAt: 1 })).toBe("image");
  });
});

describe("jobPrompt", () => {
  test("izvlači prompt iz upisanih parametara posla", () => {
    expect(jobPrompt(JSON.stringify({ prompt: "mačka na krovu", num_images: 1 }))).toBe("mačka na krovu");
  });

  test("posao bez prompta ili sa pokvarenim parametrima daje prazan string", () => {
    expect(jobPrompt(JSON.stringify({ num_images: 1 }))).toBe("");
    expect(jobPrompt("[]")).toBe("");
    expect(jobPrompt("{{")).toBe("");
  });
});

describe("generateButtonLabel", () => {
  test("cena je uvek u tekstu dugmeta", () => {
    expect(generateButtonLabel(20, "sr")).toBe("Generiši - 20 kr");
    expect(generateButtonLabel(65, "sr")).toContain("65");
    expect(generateButtonLabel(20, "en")).toContain("20");
  });
});
