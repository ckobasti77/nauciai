import { describe, expect, it } from "vitest";

import {
  ALBUM_PAGE_REWARD_CREDITS,
  ALBUM_REWARDS_PER_DAY,
  CREA_ALBUM_PAGES,
  CREA_ALBUM_STICKER_COUNT,
  isPageComplete,
  jobTechniques,
  JOB_TECHNIQUES_MAX,
  pageOfSticker,
  recipesOfWork,
  stickerById,
  stickersForWork,
} from "./crea-album";
import { CAMERA_MOVES } from "./crea-camera-moves";
import { CREA_RECIPES } from "./crea-recipes";
import { CREA_STYLES } from "./crea-styles";
import { CREA_TOOLS, isLocalTier, toolById } from "./crea-tools";
import { VIDEO_EFFECTS } from "./crea-video-effects";
import { CREA_VOICES } from "./crea-voices";

describe("katalog albuma", () => {
  it("svaka sličica je jedinstvena i pripada tačno jednoj strani", () => {
    const ids = CREA_ALBUM_PAGES.flatMap((page) => page.stickers.map((sticker) => sticker.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(CREA_ALBUM_STICKER_COUNT).toBe(ids.length);
    for (const id of ids) expect(pageOfSticker(id)?.stickers.some((s) => s.id === id)).toBe(true);
    expect(new Set(CREA_ALBUM_PAGES.map((page) => page.id)).size).toBe(CREA_ALBUM_PAGES.length);
  });

  it("strane su kao Panini: 4-13 sličica, naslov i uputstvo na oba jezika", () => {
    for (const page of CREA_ALBUM_PAGES) {
      expect(page.stickers.length).toBeGreaterThanOrEqual(4);
      expect(page.stickers.length).toBeLessThanOrEqual(13);
      for (const text of [page.title, page.howTo, ...page.stickers.map((s) => s.label)]) {
        expect(text.sr.length).toBeGreaterThan(0);
        expect(text.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("pokriva SVAKI pokret kamere, efekat, stil, glas i recept", () => {
    for (const move of CAMERA_MOVES) expect(stickerById(`kamera:${move.id}`)).toBeDefined();
    for (const effect of VIDEO_EFFECTS) expect(stickerById(`efekat:${effect.id}`)).toBeDefined();
    for (const style of CREA_STYLES) expect(stickerById(`stil:${style.id}`)).toBeDefined();
    for (const voice of CREA_VOICES) expect(stickerById(`glas:${voice.engine}:${voice.id}`)).toBeDefined();
    for (const recipe of CREA_RECIPES) expect(stickerById(`recept:${recipe.id}`)).toBeDefined();
  });

  it("svaka sličica alata je dostižna: gotov alat koji čuva rad u galeriju ili šalje posao", () => {
    const toolStickers = CREA_ALBUM_PAGES.flatMap((page) => page.stickers).filter((s) => s.family === "alat");
    for (const sticker of toolStickers) {
      const tool = toolById(sticker.id.slice("alat:".length));
      expect(tool, sticker.id).toBeDefined();
      expect(tool!.status, sticker.id).toBe("ready");
      const local = isLocalTier(tool!.tier) && tool!.savesToGallery;
      const sendsJob = tool!.tier === "paid" || tool!.localSave === true;
      expect(local || sendsJob, sticker.id).toBe(true);
    }
  });

  it("alati koji ništa ne čuvaju nisu u albumu (server ne vidi da su probani)", () => {
    for (const tool of CREA_TOOLS.filter((t) => isLocalTier(t.tier) && !t.savesToGallery && !t.localSave)) {
      expect(stickerById(`alat:${tool.id}`), tool.id).toBeUndefined();
    }
  });

  it("nagrada je mala i ograničena", () => {
    expect(ALBUM_PAGE_REWARD_CREDITS).toBeGreaterThan(0);
    expect(ALBUM_PAGE_REWARD_CREDITS).toBeLessThanOrEqual(10);
    expect(ALBUM_REWARDS_PER_DAY).toBeLessThanOrEqual(3);
  });

  it("strana je puna tek kad su sve sličice tu", () => {
    const page = CREA_ALBUM_PAGES[0]!;
    const all = new Set(page.stickers.map((s) => s.id));
    expect(isPageComplete(page, all)).toBe(true);
    const missing = new Set([...all].slice(1));
    expect(isPageComplete(page, missing)).toBe(false);
  });
});

describe("jobTechniques (createJob filter)", () => {
  it("pokret kamere i efekat samo uz video, stil samo uz sliku, recept uz sve", () => {
    expect(jobTechniques({ kind: "video", techniques: ["kamera:fpv", "stil:foto-film", "recept:profilna"] })).toEqual(["kamera:fpv", "recept:profilna"]);
    expect(jobTechniques({ kind: "image", techniques: ["kamera:fpv", "stil:foto-film", "efekat:glina"] })).toEqual(["stil:foto-film"]);
  });

  it("„Spoji dva efekta“ daje obe sličice; nepoznato tiho otpada", () => {
    expect(jobTechniques({ kind: "video", techniques: ["efekat:glina+u-oko", "efekat:ne-postoji", "kamera:x", "zlo:<script>"] })).toEqual([
      "efekat:glina",
      "efekat:u-oko",
    ]);
  });

  it("alat: samo onaj koji stvarno šalje posao (plaćen ili sa besplatnim korakom)", () => {
    expect(jobTechniques({ kind: "image", tool: "slika.cetkica" })).toEqual(["alat:slika.cetkica"]);
    expect(jobTechniques({ kind: "image", tool: "slika.format" })).toEqual([]);
    expect(jobTechniques({ kind: "image", tool: "nema.alata" })).toEqual([]);
  });

  it("najviše šest, bez duplikata", () => {
    const many = CAMERA_MOVES.slice(0, 12).map((move) => `kamera:${move.id}`);
    const out = jobTechniques({ kind: "video", techniques: [...many, ...many] });
    expect(out).toHaveLength(JOB_TECHNIQUES_MAX);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("stickersForWork", () => {
  it("rezultat besplatnog alata: alat, prvi besplatan alat i prvi rad u oblasti", () => {
    expect(stickersForWork({ kind: "image", modelSlug: "local:slika.format", provider: "local" }).sort()).toEqual(
      ["alat:slika.format", "prvi:besplatno", "prvi:slika"].sort(),
    );
  });

  it("plaćen rad: tehnike, nova verzija, besplatna proba i glas iz parametara", () => {
    const ids = stickersForWork({
      kind: "audio",
      modelSlug: "gemini-tts",
      provider: "google",
      params: JSON.stringify({ text: "Zdravo", voice: "Kore" }),
      parentJobId: "j1",
      freeTryLessonId: "zvuk-glas",
    });
    expect(ids.sort()).toEqual(["glas:gemini:Kore", "prvi:proba", "prvi:verzija", "prvi:zvuk"].sort());
  });

  it("recept daje sličicu recepta i „Prvi recept“", () => {
    const work = { kind: "image" as const, modelSlug: "nano-banana-2", creaTechniques: ["recept:profilna"] };
    expect(stickersForWork(work)).toEqual(expect.arrayContaining(["recept:profilna", "prvi:recept", "prvi:slika"]));
    expect(recipesOfWork(work)).toEqual(["profilna"]);
  });

  it("cena se ne gleda: isti rad plaćen i besplatnom probom nosi iste tehnike", () => {
    const paid = stickersForWork({ kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: ["kamera:fpv"] });
    const free = stickersForWork({ kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: ["kamera:fpv"], freeTryLessonId: "video-kamera" });
    expect(free.filter((id) => id !== "prvi:proba").sort()).toEqual(paid.sort());
  });
});
