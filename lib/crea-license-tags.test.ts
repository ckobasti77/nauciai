import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";

import { CC0_TAG, isSafeToPublish, licenseForJob, licenseForModel } from "./crea-license-tags";
import { CREA_TOOLS, localModelSlug } from "./crea-tools";

describe("oznaka „Sigurno za objavu” (A21)", () => {
  test("svaki zvučni model kataloga ima oznaku licence sa izvorom (nov model ne ulazi bez odluke)", () => {
    for (const model of STUDIO_MODELS.filter((entry) => entry.kind === "audio")) {
      const tag = licenseForModel(model.slug);
      expect(tag, model.slug).not.toBeNull();
      expect(tag!.source.url, model.slug).toMatch(/^https:\/\//);
      expect(tag!.label.sr.trim() && tag!.label.en.trim() && tag!.detail.sr.trim() && tag!.detail.en.trim(), model.slug).toBeTruthy();
    }
  });

  test("napravljeno od nule je sigurno; obrada TVOG snimka nosi prava originala", () => {
    for (const slug of ["gemini-tts", "tts", "dialogue", "music", "lyria-3-clip", "lyria-35", "sfx", "mmaudio-sfx"]) {
      expect(isSafeToPublish(licenseForModel(slug)), slug).toBe(true);
    }
    for (const slug of ["voice-changer", "dubbing", "audio-isolation", "stems"]) {
      expect(licenseForModel(slug)?.kind, slug).toBe("tvoj-snimak");
      expect(isSafeToPublish(licenseForModel(slug)), slug).toBe(false);
    }
    expect(licenseForModel("nano-banana-2")).toBeNull();
    expect(isSafeToPublish(null)).toBe(false);
  });

  test("Lyria nosi SynthID napomenu; CC0 biblioteka je sigurna", () => {
    expect(licenseForModel("lyria-3-clip")?.synthId).toBe(true);
    expect(licenseForModel("music")?.synthId).toBeUndefined();
    expect(CC0_TAG.kind).toBe("cc0");
    expect(isSafeToPublish(CC0_TAG)).toBe(true);
    expect(CC0_TAG.source.url).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
  });

  test("lokalni zvučni rezultati alata imaju oznaku (spoj glasova siguran, obrada snimka nije)", () => {
    const audioTools = CREA_TOOLS.filter((tool) => tool.area === "zvuk" && tool.status === "ready" && tool.savesToGallery && tool.localSave);
    expect(audioTools.length).toBeGreaterThanOrEqual(8);
    for (const tool of audioTools) expect(licenseForJob({ modelSlug: localModelSlug(tool.id) }), tool.id).not.toBeNull();
    expect(isSafeToPublish(licenseForJob({ modelSlug: localModelSlug("zvuk.dijalog") }))).toBe(true);
    expect(licenseForJob({ modelSlug: localModelSlug("zvuk.prevod") })?.kind).toBe("tvoj-snimak");
    expect(licenseForJob({ modelSlug: "lyria-35" })?.kind).toBe("sigurno");
  });
});
