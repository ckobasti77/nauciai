import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

import { normalizeEmail } from "../lib/admin-emails";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireSyncSecret } from "./helpers";
import { courseSeeds, trackSeeds } from "./seed-data";

export const seedInitialContent = mutationGeneric({
  args: {
    syncSecret: v.string(),
    videoAudioStripePriceId: v.optional(v.string()),
    vibeCodingStripePriceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);
    const now = Date.now();
    const courseIds: Record<string, string> = {};
    const trackIds: Record<string, string> = {};

    for (const trackSeed of trackSeeds) {
      const existingTrack = await ctx.db
        .query("courseTracks")
        .withIndex("by_slug", (q) => q.eq("slug", trackSeed.slug))
        .unique();
      const trackPatch = {
        slug: trackSeed.slug,
        titleSr: trackSeed.titleSr,
        titleEn: trackSeed.titleEn,
        descriptionSr: trackSeed.descriptionSr,
        descriptionEn: trackSeed.descriptionEn,
        status: "published" as const,
        sortOrder: trackSeed.sortOrder,
        updatedAt: now,
      };
      const trackId = existingTrack
        ? (await ctx.db.patch(existingTrack._id, trackPatch), existingTrack._id)
        : await ctx.db.insert("courseTracks", { ...trackPatch, createdAt: now });
      trackIds[trackSeed.slug] = trackId;
    }

    for (const seed of courseSeeds) {
      const stripePriceId = args[seed.stripePriceArg];
      const existingCourse = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const coursePatch = {
        trackId: trackIds[seed.trackSlug],
        slug: seed.slug,
        titleSr: seed.titleSr,
        titleEn: seed.titleEn,
        subtitleSr: seed.subtitleSr,
        subtitleEn: seed.subtitleEn,
        descriptionSr: seed.descriptionSr,
        descriptionEn: seed.descriptionEn,
        status: seed.status,
        sortOrder: seed.sortOrder,
        updatedAt: now,
        ...(stripePriceId ? { stripePriceId } : {}),
      };

      const courseId = existingCourse
        ? (await ctx.db.patch(existingCourse._id, coursePatch), existingCourse._id)
        : await ctx.db.insert("courses", coursePatch);
      courseIds[seed.slug] = courseId;

      for (const moduleSeed of seed.modules) {
        const modules = await ctx.db
          .query("modules")
          .withIndex("by_course", (q) => q.eq("courseId", courseId))
          .collect();
        const existingModule = modules.find((item) => item.sortOrder === moduleSeed.sortOrder);
        const modulePatch = {
          courseId,
          titleSr: moduleSeed.titleSr,
          titleEn: moduleSeed.titleEn,
          sortOrder: moduleSeed.sortOrder,
          updatedAt: now,
        };

        const moduleId = existingModule
          ? (await ctx.db.patch(existingModule._id, modulePatch), existingModule._id)
          : await ctx.db.insert("modules", modulePatch);

        for (const lessonSeed of moduleSeed.lessons) {
          const courseLessons = await ctx.db
            .query("lessons")
            .withIndex("by_course_slug", (q) => q.eq("courseId", courseId))
            .collect();
          const existingLesson = courseLessons.find((item) => item.slug === lessonSeed.slug);
          const lessonPatch = {
            courseId,
            moduleId,
            slug: lessonSeed.slug,
            titleSr: lessonSeed.titleSr,
            titleEn: lessonSeed.titleEn,
            summarySr: lessonSeed.summarySr,
            summaryEn: lessonSeed.summaryEn,
            durationSeconds: lessonSeed.durationSeconds,
            isPublished: true,
            sortOrder: lessonSeed.sortOrder,
            updatedAt: now,
          };

          const lessonId = existingLesson
            ? (await ctx.db.patch(existingLesson._id, lessonPatch), existingLesson._id)
            : await ctx.db.insert("lessons", {
              ...lessonPatch,
              muxStatus: "draft",
            });

          for (const partSeed of lessonSeed.parts ?? []) {
            const parts = await ctx.db
              .query("lessonParts")
              .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
              .collect();
            const existingPart = parts.find((item) => item.slug === partSeed.slug);
            const partPatch = {
              courseId,
              lessonId,
              slug: partSeed.slug,
              titleSr: partSeed.titleSr,
              titleEn: partSeed.titleEn,
              kind: partSeed.kind,
              bodySr: partSeed.bodySr,
              bodyEn: partSeed.bodyEn,
              isPublished: true,
              sortOrder: partSeed.sortOrder,
              updatedAt: now,
            };

            if (existingPart) {
              await ctx.db.patch(existingPart._id, partPatch);
            } else {
              await ctx.db.insert("lessonParts", partPatch);
            }
          }

          for (const stepSeed of lessonSeed.labSteps ?? []) {
            const steps = await ctx.db
              .query("lessonSteps")
              .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
              .collect();
            const existingStep = steps.find((item) => item.slug === stepSeed.slug);
            const stepPatch = {
              courseId,
              lessonId,
              slug: stepSeed.slug,
              titleSr: stepSeed.titleSr,
              titleEn: stepSeed.titleEn,
              bodySr: stepSeed.bodySr,
              bodyEn: stepSeed.bodyEn,
              outputKind: stepSeed.outputKind,
              isPublished: true,
              sortOrder: stepSeed.sortOrder,
              updatedAt: now,
            };

            const stepId = existingStep
              ? (await ctx.db.patch(existingStep._id, stepPatch), existingStep._id)
              : await ctx.db.insert("lessonSteps", stepPatch);

            for (const taskSeed of stepSeed.tasks ?? []) {
              const tasks = await ctx.db
                .query("lessonTasks")
                .withIndex("by_step", (q) => q.eq("stepId", stepId))
                .collect();
              const existingTask = tasks.find((item) => item.sortOrder === taskSeed.sortOrder);
              const taskPatch = {
                courseId,
                lessonId,
                stepId,
                promptSr: taskSeed.promptSr,
                promptEn: taskSeed.promptEn,
                hintSr: taskSeed.hintSr,
                hintEn: taskSeed.hintEn,
                required: true,
                completionMode: "hybrid" as const,
                isPublished: true,
                sortOrder: taskSeed.sortOrder,
                updatedAt: now,
              };

              if (existingTask) {
                await ctx.db.patch(existingTask._id, taskPatch);
              } else {
                await ctx.db.insert("lessonTasks", taskPatch);
              }
            }
          }
        }
      }
    }

    return { trackIds, courseIds };
  },
});

// Cene su zaključane 18.08.2026 (.studio-run/prompts/A4.md). `stripePriceId`
// je namerno prazan - popunjava se ručno iz Stripe dashboarda.
const creditPackSeeds = [
  {
    slug: "basic",
    titleSr: "Basic",
    titleEn: "Basic",
    priceEurCents: 999,
    credits: 0,
    bonusPercent: 0,
    kind: "plan" as const,
    planTier: "basic" as const,
    sortOrder: 10,
  },
  {
    slug: "premium",
    titleSr: "Premium",
    titleEn: "Premium",
    priceEurCents: 2499,
    credits: 2000,
    bonusPercent: 0,
    kind: "plan" as const,
    planTier: "premium" as const,
    sortOrder: 20,
  },
  {
    slug: "starter",
    titleSr: "Starter",
    titleEn: "Starter",
    priceEurCents: 500,
    credits: 500,
    bonusPercent: 0,
    kind: "pack" as const,
    planTier: undefined,
    sortOrder: 30,
  },
  {
    slug: "creator",
    titleSr: "Creator",
    titleEn: "Creator",
    priceEurCents: 1500,
    credits: 1650,
    bonusPercent: 10,
    kind: "pack" as const,
    planTier: undefined,
    sortOrder: 40,
  },
  {
    slug: "pro",
    titleSr: "Pro",
    titleEn: "Pro",
    priceEurCents: 4000,
    credits: 4800,
    bonusPercent: 20,
    kind: "pack" as const,
    planTier: undefined,
    sortOrder: 50,
  },
] as const;

export const seedCreditPacks = mutation({
  args: { syncSecret: v.string() },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);

    for (const seed of creditPackSeeds) {
      const existing = await ctx.db
        .query("creditPacks")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const patch = {
        slug: seed.slug,
        titleSr: seed.titleSr,
        titleEn: seed.titleEn,
        priceEurCents: seed.priceEurCents,
        credits: seed.credits,
        bonusPercent: seed.bonusPercent,
        kind: seed.kind,
        planTier: seed.planTier,
        sortOrder: seed.sortOrder,
        isActive: true,
      };

      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert("creditPacks", patch);
    }

    return null;
  },
});

// Cene, fal endpointi i badge-ovi su prepisani TAČNO iz `docs/STUDIO-PLAN.md`
// §2.3 (proverene fal.ai cene od 18.08.2026) - ne zaokruživati, ne preračunavati.
const IMAGE_PARAM_SCHEMA = JSON.stringify([
  { key: "prompt", type: "textarea", label: "Prompt", required: true, maxLength: 2000 },
  {
    key: "aspect_ratio",
    type: "select",
    label: "Format",
    options: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  { key: "num_images", type: "number", label: "Broj slika", min: 1, max: 4 },
] as const);
const IMAGE_DEFAULT_PARAMS = { aspect_ratio: "1:1", num_images: 1 };

/**
 * Rezolucija je deo IDENTITETA sluga, ne polje koje klijent bira: `nano-banana-2`
 * i `nano-banana-2-2k` dele isti `falEndpoint` uz 20 naspram 30 kredita, pa bi
 * inače dovoljno bilo izabrati jeftiniji slug i sam poslati 2K parametar. Zato
 * vrednost ulazi u `defaultParams`, a u `paramSchema` se NE izlaže - `sanitizeParams`
 * (studioCore) tiho izbacuje svaki `resolution` koji stigne od klijenta.
 */
const RESOLUTION_BY_SLUG: Record<string, string> = {
  "nano-banana-2": "1K",
  "nano-banana-2-2k": "2K",
  "nano-banana-pro": "1K",
  "nano-banana-pro-4k": "4K",
};

// Video i zvuk se uključuju u Fazi B i C - forma za njih se piše tad, pa je
// param šema ovde namerno svedena na jedino polje koje je zajedničko svima.
const MINIMAL_PARAM_SCHEMA = JSON.stringify([
  { key: "prompt", type: "textarea", label: "Prompt", required: true, maxLength: 2000 },
] as const);
const EMPTY_DEFAULT_PARAMS = JSON.stringify({});

/**
 * Nalaz R5 (STUDIO-CATALOG-REPORT 5.3, W7 stavka 1): svaka porodica iz ovog
 * starog kataloga sada ima svog naslednika u `models` (v4) - nano-banana,
 * seedream i gpt-image dele čak i isti slug, pa `createJob` u `studio.ts` za
 * njih ionako ide na v4 put. FLUX nema naslednika jer ga katalog §7 izričito
 * isključuje (Jovanova odluka) - zato je izbačen ovde, ne samo ugašen.
 *
 * Za sve OSTALE redove je najčistije rešenje ugasiti ih (`isEnabled: false`)
 * umesto da `createJob` dobije novu granu koja poredi slug legacy reda sa
 * `family` poljem u `models`: `buildLegacyOrder` već odbija ugašen model
 * (`MODEL_NEDOSTUPAN`), pa gašenje ovde zatvara rupu i za proizvoljan
 * `modelSlug` poslat mimo forme, bez ijedne nove grane koda u `studio.ts`.
 */
const modelCatalogSeeds = [
  // ── SLIKE - porodica pokrivena v4 katalogom, ugašeno (R5) ─────────────
  {
    slug: "seedream-45",
    kind: "image" as const,
    labelSr: "Seedream 4.5",
    labelEn: "Seedream 4.5",
    descriptionSr: "Bytedance-ov model za tekst-u-sliku.",
    descriptionEn: "Bytedance's text-to-image model.",
    falEndpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    creditCost: 10,
    estimatedCostUsd: 0.04,
    badge: undefined,
    isEnabled: false,
    sortOrder: 30,
  },
  {
    slug: "nano-banana-2",
    kind: "image" as const,
    labelSr: "Nano Banana 2",
    labelEn: "Nano Banana 2",
    descriptionSr: "Gemini 3.1 Flash Image - odličan kvalitet za pola cene Nano Banana Pro.",
    descriptionEn: "Gemini 3.1 Flash Image - great quality at half the price of Nano Banana Pro.",
    falEndpoint: "fal-ai/nano-banana-2",
    creditCost: 20,
    estimatedCostUsd: 0.08,
    badge: "preporuceno" as const,
    isEnabled: false,
    sortOrder: 40,
  },
  {
    slug: "nano-banana-2-2k",
    kind: "image" as const,
    labelSr: "Nano Banana 2 (2K)",
    labelEn: "Nano Banana 2 (2K)",
    descriptionSr: "Nano Banana 2 u 2K rezoluciji.",
    descriptionEn: "Nano Banana 2 at 2K resolution.",
    falEndpoint: "fal-ai/nano-banana-2",
    creditCost: 30,
    estimatedCostUsd: 0.12,
    badge: undefined,
    isEnabled: false,
    sortOrder: 50,
  },
  {
    slug: "nano-banana-pro",
    kind: "image" as const,
    labelSr: "Nano Banana Pro",
    labelEn: "Nano Banana Pro",
    descriptionSr: "Viši tier Nano Banana modela.",
    descriptionEn: "Higher tier of the Nano Banana model.",
    falEndpoint: "fal-ai/nano-banana-pro",
    creditCost: 35,
    estimatedCostUsd: 0.15,
    badge: undefined,
    isEnabled: false,
    sortOrder: 60,
  },
  {
    slug: "nano-banana-pro-4k",
    kind: "image" as const,
    labelSr: "Nano Banana Pro 4K",
    labelEn: "Nano Banana Pro 4K",
    descriptionSr: "Nano Banana Pro u 4K rezoluciji.",
    descriptionEn: "Nano Banana Pro at 4K resolution.",
    falEndpoint: "fal-ai/nano-banana-pro",
    creditCost: 65,
    estimatedCostUsd: 0.3,
    badge: undefined,
    isEnabled: false,
    sortOrder: 70,
  },
  {
    slug: "gpt-image-15",
    kind: "image" as const,
    labelSr: "GPT Image 1.5 (high)",
    labelEn: "GPT Image 1.5 (high)",
    descriptionSr: "OpenAI-jev model za tekst na slici i fotorealizam.",
    descriptionEn: "OpenAI's model for text-in-image and photorealism.",
    falEndpoint: "fal-ai/gpt-image-1.5",
    creditCost: 30,
    estimatedCostUsd: 0.133,
    badge: undefined,
    isEnabled: false,
    sortOrder: 80,
  },
  // ── VIDEO (isEnabled: false - Faza B) ────────────────────────────────
  {
    slug: "seedance-20-mini-480p",
    kind: "video" as const,
    labelSr: "Seedance 2.0 Mini 480p",
    labelEn: "Seedance 2.0 Mini 480p",
    descriptionSr: "Brza skica u 480p, 5 sekundi.",
    descriptionEn: "Fast 480p sketch, 5 seconds.",
    falEndpoint: "bytedance/seedance-2.0/mini/480p",
    creditCost: 80,
    estimatedCostUsd: 0.36,
    badge: undefined,
    isEnabled: false,
    sortOrder: 110,
  },
  {
    slug: "veo-31-lite-720p",
    kind: "video" as const,
    labelSr: "Veo 3.1 Lite 720p + zvuk",
    labelEn: "Veo 3.1 Lite 720p + audio",
    descriptionSr: "Default video model - jedini jeftin sa nativnim zvukom, 5 sekundi.",
    descriptionEn: "Default video model - the only cheap option with native audio, 5 seconds.",
    falEndpoint: "fal-ai/veo3.1/lite",
    creditCost: 55,
    estimatedCostUsd: 0.25,
    badge: undefined,
    isEnabled: false,
    sortOrder: 120,
  },
  {
    slug: "veo-31-lite-1080p",
    kind: "video" as const,
    labelSr: "Veo 3.1 Lite 1080p + zvuk",
    labelEn: "Veo 3.1 Lite 1080p + audio",
    descriptionSr: "Finalni render u 1080p, 5 sekundi.",
    descriptionEn: "Final render at 1080p, 5 seconds.",
    falEndpoint: "fal-ai/veo3.1/lite",
    creditCost: 90,
    estimatedCostUsd: 0.4,
    badge: undefined,
    isEnabled: false,
    sortOrder: 130,
  },
  {
    slug: "seedance-15-pro-720p",
    kind: "video" as const,
    labelSr: "Seedance 1.5 Pro 720p + zvuk",
    labelEn: "Seedance 1.5 Pro 720p + audio",
    descriptionSr: "Glavni image-to-video workflow, 5 sekundi.",
    descriptionEn: "Main image-to-video workflow, 5 seconds.",
    falEndpoint: "fal-ai/bytedance/seedance/v1.5/pro/720p",
    creditCost: 60,
    estimatedCostUsd: 0.26,
    badge: undefined,
    isEnabled: false,
    sortOrder: 140,
  },
  {
    slug: "kling-v3-standard",
    kind: "video" as const,
    labelSr: "Kling v3 Standard (bez zvuka)",
    labelEn: "Kling v3 Standard (no audio)",
    descriptionSr: "Pokret likova i kamera, bez zvuka, 5 sekundi.",
    descriptionEn: "Character motion and camera work, no audio, 5 seconds.",
    falEndpoint: "fal-ai/kling-video/v3/standard",
    creditCost: 95,
    estimatedCostUsd: 0.42,
    badge: undefined,
    isEnabled: false,
    sortOrder: 150,
  },
  {
    slug: "kling-v3-standard-audio",
    kind: "video" as const,
    labelSr: "Kling v3 Standard + zvuk",
    labelEn: "Kling v3 Standard + audio",
    descriptionSr: "Kling v3 Standard sa zvukom, 5 sekundi.",
    descriptionEn: "Kling v3 Standard with audio, 5 seconds.",
    falEndpoint: "fal-ai/kling-video/v3/standard",
    creditCost: 140,
    estimatedCostUsd: 0.63,
    badge: undefined,
    isEnabled: false,
    sortOrder: 160,
  },
  {
    slug: "kling-v3-pro-audio",
    kind: "video" as const,
    labelSr: "Kling v3 Pro + zvuk",
    labelEn: "Kling v3 Pro + audio",
    descriptionSr: "Skupo - Kling v3 Pro sa zvukom, 5 sekundi.",
    descriptionEn: "Expensive - Kling v3 Pro with audio, 5 seconds.",
    falEndpoint: "fal-ai/kling-video/v3/pro",
    creditCost: 185,
    estimatedCostUsd: 0.84,
    badge: "skupo" as const,
    isEnabled: false,
    sortOrder: 170,
  },
  {
    slug: "seedance-20-mini-720p",
    kind: "video" as const,
    labelSr: "Seedance 2.0 Mini 720p",
    labelEn: "Seedance 2.0 Mini 720p",
    descriptionSr: "Skupo - Seedance 2.0 Mini u 720p, 5 sekundi.",
    descriptionEn: "Expensive - Seedance 2.0 Mini at 720p, 5 seconds.",
    falEndpoint: "bytedance/seedance-2.0/mini/720p",
    creditCost: 170,
    estimatedCostUsd: 0.77,
    badge: "skupo" as const,
    isEnabled: false,
    sortOrder: 180,
  },
  {
    slug: "veo-31-fast-1080p",
    kind: "video" as const,
    labelSr: "Veo 3.1 Fast 1080p + zvuk",
    labelEn: "Veo 3.1 Fast 1080p + audio",
    descriptionSr: "Skupo - Veo 3.1 Fast u 1080p sa zvukom, 5 sekundi.",
    descriptionEn: "Expensive - Veo 3.1 Fast at 1080p with audio, 5 seconds.",
    falEndpoint: "fal-ai/veo3.1/fast",
    creditCost: 165,
    estimatedCostUsd: 0.75,
    badge: "skupo" as const,
    isEnabled: false,
    sortOrder: 190,
  },
  {
    slug: "seedance-20-720p",
    kind: "video" as const,
    labelSr: "Seedance 2.0 720p",
    labelEn: "Seedance 2.0 720p",
    descriptionSr: "Vrlo skupo - Seedance 2.0 u punom kvalitetu, 5 sekundi.",
    descriptionEn: "Very expensive - Seedance 2.0 at full quality, 5 seconds.",
    falEndpoint: "bytedance/seedance-2.0/720p",
    creditCost: 330,
    estimatedCostUsd: 1.52,
    badge: "skupo" as const,
    isEnabled: false,
    sortOrder: 200,
  },
  {
    slug: "veo-31-standard-1080p",
    kind: "video" as const,
    labelSr: "Veo 3.1 Standard 1080p",
    labelEn: "Veo 3.1 Standard 1080p",
    descriptionSr: "Vrlo skupo - ne nudi se u v1, 5 sekundi.",
    descriptionEn: "Very expensive - not offered in v1, 5 seconds.",
    falEndpoint: "fal-ai/veo3.1",
    creditCost: 435,
    estimatedCostUsd: 2.0,
    badge: "skupo" as const,
    isEnabled: false,
    sortOrder: 210,
  },
  // ── ZVUK (isEnabled: false - Faza C) ─────────────────────────────────
  {
    slug: "elevenlabs-v3-tts",
    kind: "audio" as const,
    labelSr: "ElevenLabs v3 (TTS)",
    labelEn: "ElevenLabs v3 (TTS)",
    descriptionSr: "Jedini pouzdan izbor za srpski izgovor. Cena po 1000 znakova.",
    descriptionEn: "The only reliable choice for Serbian pronunciation. Priced per 1000 characters.",
    falEndpoint: "fal-ai/elevenlabs/tts/eleven-v3",
    creditCost: 25,
    estimatedCostUsd: 0.1,
    badge: undefined,
    isEnabled: false,
    sortOrder: 310,
  },
  {
    slug: "elevenlabs-sfx",
    kind: "audio" as const,
    labelSr: "ElevenLabs zvučni efekti",
    labelEn: "ElevenLabs sound effects",
    descriptionSr: "Generisanje zvučnih efekata. Cena za 10 sekundi.",
    descriptionEn: "Sound effect generation. Priced per 10 seconds.",
    falEndpoint: "fal-ai/elevenlabs/sound-effects/v2",
    creditCost: 5,
    estimatedCostUsd: 0.002,
    badge: undefined,
    isEnabled: false,
    sortOrder: 320,
  },
  {
    slug: "elevenlabs-scribe-v2",
    kind: "audio" as const,
    labelSr: "Transkripcija (Scribe v2)",
    labelEn: "Transcription (Scribe v2)",
    descriptionSr: "Transkripcija govora u tekst. Cena po minutu.",
    descriptionEn: "Speech-to-text transcription. Priced per minute.",
    falEndpoint: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    creditCost: 2,
    estimatedCostUsd: 0.008,
    badge: undefined,
    isEnabled: false,
    sortOrder: 330,
  },
] as const;

export const seedModelCatalog = mutation({
  args: { syncSecret: v.string() },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);
    const now = Date.now();

    for (const seed of modelCatalogSeeds) {
      const existing = await ctx.db
        .query("modelCatalog")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const isImage = seed.kind === "image";
      const resolution = RESOLUTION_BY_SLUG[seed.slug];
      const patch = {
        slug: seed.slug,
        kind: seed.kind,
        labelSr: seed.labelSr,
        labelEn: seed.labelEn,
        descriptionSr: seed.descriptionSr,
        descriptionEn: seed.descriptionEn,
        provider: "fal",
        falEndpoint: seed.falEndpoint,
        defaultParams: isImage
          ? JSON.stringify({
              ...IMAGE_DEFAULT_PARAMS,
              ...(resolution ? { resolution } : {}),
            })
          : EMPTY_DEFAULT_PARAMS,
        paramSchema: isImage ? IMAGE_PARAM_SCHEMA : MINIMAL_PARAM_SCHEMA,
        creditCost: seed.creditCost,
        estimatedCostUsd: seed.estimatedCostUsd,
        badge: seed.badge,
        isEnabled: seed.isEnabled,
        sortOrder: seed.sortOrder,
        updatedAt: now,
      };

      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert("modelCatalog", patch);
    }

    return null;
  },
});

const platformFlagKeys = ["studio_enabled"] as const;

/**
 * Kill switch iz STUDIO-PLAN 4.4. Za razliku od `seedCreditPacks` i
 * `seedModelCatalog`, ponovljen seed NE prepisuje postojeći red: ako je
 * Studio ručno ugašen (`enabled: false`), ponovno pokretanje seed-a ne sme
 * da ga tiho upali nazad.
 */
export const seedPlatformFlags = mutation({
  args: { syncSecret: v.string() },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);

    for (const key of platformFlagKeys) {
      const existing = await ctx.db
        .query("platformFlags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) continue;
      await ctx.db.insert("platformFlags", { key, enabled: true });
    }

    return null;
  },
});

/**
 * Demo krediti bez Stripe-a. Bez ovoga se `/app/studio` ne može ni probati
 * lokalno: balans je 0, `createJob` baca `NEDOVOLJNO_KREDITA`, i jedini put do
 * kredita vodi kroz pet Stripe price ID-jeva kojih još nema.
 *
 * Ključ idempotencije je redni broj demo lota tog korisnika, pa svako
 * pokretanje otvara NOV lot - namerno, jer je poenta da se demo balans može
 * dopuniti kad se potroši. Redni broj, a ne `Date.now()`: dva poziva u istoj
 * milisekundi bi delila ključ i drugi bi tiho postao no-op.
 *
 * Ovo je jedini grant u kodu koji nije idempotentan; sme da bude jer iza njega
 * ne stoji nikakva naplata, a `requireSyncSecret` ga drži van dohvata klijenta.
 */
export const grantDemoCredits = mutation({
  args: { syncSecret: v.string(), email: v.string(), amount: v.number() },
  // Povratni tip je napisan ručno, kao i u `credits.applyStripeGrant`: bez
  // njega `ctx.runMutation` uvodi kružnu zavisnost kroz `_generated/api`, TS
  // odustane od zaključivanja i `next build` pukne na sasvim drugom fajlu.
  handler: async (ctx, args): Promise<Id<"creditLots">> => {
    requireSyncSecret(args.syncSecret);

    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error("KORISNIK_NIJE_NADJEN");

    const existingGrants = await ctx.db
      .query("creditLots")
      .withIndex("by_user_source", (q) => q.eq("userId", user._id).eq("source", "admin_grant"))
      .collect();

    return await ctx.runMutation(internal.credits.grantCredits, {
      userId: user._id,
      amount: args.amount,
      source: "admin_grant",
      idempotencyKey: {
        field: "stripeSessionId",
        value: `demo:${user._id}:${existingGrants.length + 1}`,
      },
      meta: { note: `demo grant za ${email}` },
    });
  },
});
