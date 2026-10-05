/**
 * Stablo verzija u radionici (K05): „Koristi kao ulaz" i „Animiraj" moraju da vode u
 * režim i model koji STVARNO primaju taj fajl, inače bi composer dobio ulaz koji
 * server odbije (`NEISPRAVNI_ULAZI`).
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { modelsForMode, usableInputModes, type CreaKind } from "@/lib/crea-shell";
import { isLocalTier } from "@/lib/crea-tools";
import { inputModeWithSlot, toolsForWork, versionInputTarget, type VersionIntent } from "@/lib/crea-versions";
import { slotsForMode } from "@/lib/studio-slots";

const KINDS: CreaKind[] = ["image", "video", "audio"];
const INTENTS: VersionIntent[] = ["input", "animate", "sound"];

describe("versionInputTarget", () => {
  test("slika kao ulaz ide u Slika · Izmeni, a „Animiraj“ u Video · Napravi", () => {
    expect(versionInputTarget(STUDIO_MODELS, "image", "input")).toMatchObject({ area: "slika", mode: "izmeni" });
    expect(versionInputTarget(STUDIO_MODELS, "image", "animate")).toMatchObject({ area: "video", mode: "napravi" });
  });

  test("svaki cilj je model tog režima sa ulaznim režimom koji ima slot te vrste (i nije režim-nastavak)", () => {
    for (const kind of KINDS) {
      for (const intent of INTENTS) {
        const target = versionInputTarget(STUDIO_MODELS, kind, intent);
        if (!target) continue;
        const model = modelsForMode(STUDIO_MODELS, target.area, target.mode).find((entry) => entry.slug === target.modelSlug);
        expect(model, `${kind}/${intent}`).toBeDefined();
        expect(usableInputModes(model!)).toContain(target.inputMode);
        expect(slotsForMode(model!.inputSpec, target.inputMode).map((slot) => slot.slot)).toContain(kind);
      }
    }
  });

  test("bez modela koji prima taj fajl nema cilja (dugme se ne nudi)", () => {
    expect(versionInputTarget([], "image", "input")).toBeNull();
    const textOnly = STUDIO_MODELS.filter((model) => model.inputModes.every((mode) => mode === "text"));
    expect(versionInputTarget(textOnly, "image", "input")).toBeNull();
  });

  test("preporučen model ima prednost", () => {
    const fitting = modelsForMode(STUDIO_MODELS, "slika", "izmeni").filter(
      (model) => inputModeWithSlot(model, "slika", "izmeni", "image") !== undefined,
    );
    expect(fitting.length).toBeGreaterThan(1);
    const last = fitting[fitting.length - 1];
    const catalog = STUDIO_MODELS.map((model) =>
      model.slug === last.slug ? { ...model, badge: "preporuceno" as const } : { ...model, badge: undefined },
    );
    expect(versionInputTarget(catalog, "image", "input")?.modelSlug).toBe(last.slug);
  });
});

describe("inputModeWithSlot", () => {
  test("model druge vrste ili van pravila režima nema ulazni režim", () => {
    const video = STUDIO_MODELS.find((model) => model.kind === "video")!;
    expect(inputModeWithSlot(video, "slika", "izmeni", "image")).toBeUndefined();
    const imageModel = modelsForMode(STUDIO_MODELS, "slika", "izmeni")[0];
    expect(inputModeWithSlot(imageModel, "slika", "napravi", "image")).toBeUndefined();
  });
});

describe("toolsForWork", () => {
  test("slika ide u gotove besplatne alate koji čuvaju u galeriju (K04: format i provera)", () => {
    const tools = toolsForWork("image");
    expect(tools.map((tool) => tool.id)).toEqual(expect.arrayContaining(["slika.format", "slika.provera"]));
    for (const tool of tools) {
      expect(tool.status).toBe("ready");
      expect(isLocalTier(tool.tier)).toBe(true);
      expect(tool.savesToGallery).toBe(true);
      expect(tool.inputs).toContain("image");
    }
  });
});
