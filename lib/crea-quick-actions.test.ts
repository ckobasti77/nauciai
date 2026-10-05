/**
 * Brze akcije (K16, S44): svaka vodi u TAČAN alat ili režim, sa već popunjenim
 * ulazom (`?ulaz=<rad>`) ili opisom (`?opis=`) - i samo tamo gde model stvarno
 * prima taj fajl (isti uslov kao „Koristi kao ulaz", K05).
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { referenceModeOf } from "@/convex/creaElementsCore";
import { QUICK_ACTION_IDS, QUICK_ACTION_LABELS, quickActionQuery, quickActionsFor, type QuickJob } from "@/lib/crea-quick-actions";
import { modelsForMode, parseCreaShellState, usableInputModes } from "@/lib/crea-shell";
import { toolById } from "@/lib/crea-tools";
import { CREA_INPUT_PARAM, versionInputTarget } from "@/lib/crea-versions";
import { slotsForMode } from "@/lib/studio-slots";

const URL_PNG = "https://example.convex.cloud/api/storage/abc";

function job(overrides: Partial<QuickJob> = {}): QuickJob {
  return {
    _id: "rad1",
    kind: "image",
    status: "done",
    outputUrl: URL_PNG,
    params: JSON.stringify({ prompt: "crvena mačka na krovu" }),
    modelSlug: "nano-banana-2",
    isMock: false,
    ...overrides,
  };
}

function byId(actions: ReturnType<typeof quickActionsFor>) {
  return Object.fromEntries(actions.map((action) => [action.id, action.target]));
}

describe("brze akcije za sliku", () => {
  const actions = byId(quickActionsFor(job(), STUDIO_MODELS));

  test("slika dobija svih sedam akcija za sliku, redom (K18: „Nastavi” i „Produži” su samo za video)", () => {
    const imageActions = QUICK_ACTION_IDS.filter((id) => id !== "nastavi" && id !== "produzi");
    expect(quickActionsFor(job(), STUDIO_MODELS).map((action) => action.id)).toEqual(imageActions);
    for (const id of QUICK_ACTION_IDS) expect(QUICK_ACTION_LABELS[id].sr.length).toBeGreaterThan(0);
  });

  test("Animiraj → Video · Napravi sa slikom kao ulazom (model koji prima sliku)", () => {
    const animate = versionInputTarget(STUDIO_MODELS, "image", "animate")!;
    expect(actions.animiraj).toEqual({ area: "video", mode: "napravi", model: animate.modelSlug, input: "rad1" });
  });

  test("Izmeni → Slika · Izmeni sa slikom kao ulazom", () => {
    expect(actions.izmeni).toMatchObject({ area: "slika", mode: "izmeni", input: "rad1" });
  });

  test("Uvećaj i Ukloni pozadinu → tačan besplatni alat sa ulazom", () => {
    expect(actions.uvecaj).toEqual({ area: "slika", mode: "izmeni", tool: "slika.uvecaj", input: "rad1" });
    expect(actions.pozadina).toEqual({ area: "slika", mode: "izmeni", tool: "slika.pozadina", input: "rad1" });
    expect(toolById("slika.uvecaj")?.status).toBe("ready");
    expect(toolById("slika.pozadina")?.status).toBe("ready");
  });

  test("Ozvuči sliku → Zvuk · Efekti sa istim opisom (model zvučnih efekata iz teksta)", () => {
    expect(actions.ozvuci).toMatchObject({ area: "zvuk", mode: "efekti", prompt: "crvena mačka na krovu" });
    const model = STUDIO_MODELS.find((entry) => entry.slug === actions.ozvuci.model)!;
    expect(model.inputModes).toContain("text");
  });

  test("Napravi sličnu → isti model u svom režimu, sa istim opisom", () => {
    expect(actions.slicna).toEqual({ area: "slika", mode: "napravi", model: "nano-banana-2", prompt: "crvena mačka na krovu" });
  });

  test("Koristi kao referencu → Slika · Napravi, model sa režimom referenci, slika kao ulaz", () => {
    const target = actions.referenca;
    expect(target).toMatchObject({ area: "slika", mode: "napravi", input: "rad1" });
    const model = modelsForMode(STUDIO_MODELS, "slika", "napravi").find((entry) => entry.slug === target.model);
    expect(model).toBeDefined();
    const reference = referenceModeOf(model!)!;
    expect(usableInputModes(model!)).toContain(reference.inputMode);
    expect(slotsForMode(model!.inputSpec, reference.inputMode).map((slot) => slot.slot)).toContain("image");
  });
});

describe("kada se akcija NE nudi", () => {
  test("DEMO, istekao ili nezavršen rad: nema ulaza, ostaje samo „Napravi sličnu“ (i Ozvuči po opisu)", () => {
    for (const bad of [job({ isMock: true }), job({ outputUrl: null }), job({ status: "running" }), job({ outputUrl: "data:image/svg+xml;base64,AAA" })]) {
      const ids = quickActionsFor(bad, STUDIO_MODELS).map((action) => action.id);
      expect(ids).toEqual(["ozvuci", "slicna"]);
    }
  });

  test("slika besplatnog alata (bez opisa) → „Napravi sličnu“ vodi u „Kako je ovo napravljeno?“", () => {
    const local = byId(quickActionsFor(job({ params: "{}", modelSlug: "local:slika.pozadina" }), STUDIO_MODELS));
    expect(local.slicna).toEqual({ area: "slika", mode: "alati", tool: "slika.opis", input: "rad1" });
    expect(local.ozvuci).toBeUndefined();
  });

  test("video: Ozvuči → Zvuk · Efekti sa videom; Izmeni → Video · Izmeni; bez alata za sliku", () => {
    const video = byId(quickActionsFor(job({ kind: "video", modelSlug: "veo-31-fast", params: JSON.stringify({ prompt: "talasi" }) }), STUDIO_MODELS));
    expect(video.ozvuci).toMatchObject({ area: "zvuk", mode: "efekti", input: "rad1" });
    const model = STUDIO_MODELS.find((entry) => entry.slug === video.ozvuci.model)!;
    expect(Object.values(model.inputSpec).some((spec) => spec && "video" in spec)).toBe(true);
    expect(video.izmeni).toMatchObject({ area: "video", mode: "izmeni", input: "rad1" });
    // K18: poslednji kadar (V4) i produženje (V5) vode u svoj alat sa videom kao ulazom.
    expect(video.nastavi).toEqual({ area: "video", mode: "napravi", tool: "video.poslednji-kadar", input: "rad1" });
    expect(video.produzi).toEqual({ area: "video", mode: "izmeni", tool: "video.produzi", input: "rad1" });
    expect(video.uvecaj).toBeUndefined();
    expect(video.animiraj).toBeUndefined();
    expect(video.referenca).toBeUndefined();
  });

  test("prazan katalog (model isključen): akcije sa alatima i isti opis u Napravi", () => {
    const actions = quickActionsFor(job(), []);
    expect(actions.map((action) => action.id)).toEqual(["uvecaj", "pozadina", "slicna"]);
    expect(byId(actions).slicna).toEqual({ area: "slika", mode: "napravi", prompt: "crvena mačka na krovu" });
  });
});

describe("adresa akcije", () => {
  test("query vodi u ljusku sa alatom/modelom i ulazom; recept, cilj i stari ulaz se brišu", () => {
    const current = new URLSearchParams("oblast=slika&rezim=napravi&recept=jelovnik&cilj=logo&project=p1&ulaz=star&opis=staro&regenerate=x");
    const query = new URLSearchParams(quickActionQuery({ area: "slika", mode: "izmeni", tool: "slika.uvecaj", input: "rad1" }, current));
    expect(parseCreaShellState(query)).toMatchObject({ area: "slika", mode: "izmeni", tool: "slika.uvecaj", goal: null, recipe: null });
    expect(query.get(CREA_INPUT_PARAM)).toBe("rad1");
    expect(query.get("project")).toBe("p1");
    expect(query.get("opis")).toBeNull();
    expect(query.get("regenerate")).toBeNull();

    const similar = new URLSearchParams(quickActionQuery({ area: "slika", mode: "napravi", model: "nano-banana-2", prompt: "mačka" }, current));
    expect(similar.get("model")).toBe("nano-banana-2");
    expect(similar.get("opis")).toBe("mačka");
    expect(similar.get(CREA_INPUT_PARAM)).toBeNull();
  });
});
