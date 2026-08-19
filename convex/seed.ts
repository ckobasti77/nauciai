import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireSyncSecret } from "./helpers";

const trackSeeds = [
  {
    slug: "video-audio",
    titleSr: "Smer za video i audio",
    titleEn: "Video and audio track",
    descriptionSr: "Smer koji objedinjuje kurseve za video i audio produkciju.",
    descriptionEn: "A track grouping video and audio production courses.",
    sortOrder: 10,
  },
  {
    slug: "websites",
    titleSr: "Smer za web sajtove",
    titleEn: "Websites track",
    descriptionSr: "Smer koji objedinjuje kurseve za izradu web sajtova.",
    descriptionEn: "A track grouping website-building courses.",
    sortOrder: 20,
  },
] as const;

const courseSeeds = [
  {
    slug: "video-audio-ai",
    trackSlug: "video-audio",
    titleSr: "Kurs za video i audio",
    titleEn: "Video and Audio Course",
    subtitleSr: "Scenario, glas, kadar i montaza uz AI",
    subtitleEn: "Scripts, voice, shots, and editing with AI",
    descriptionSr:
      "Praktican kurs za pisanje scenarija, generisanje glasa, video produkciju, montazu i finalni AI workflow.",
    descriptionEn:
      "A practical course for scripts, voice generation, video production, editing, and complete AI workflows.",
    status: "published" as const,
    sortOrder: 10,
    stripePriceArg: "videoAudioStripePriceId" as const,
    modules: [
      {
        titleSr: "Temelji produkcije",
        titleEn: "Production foundations",
        sortOrder: 10,
        lessons: [
          {
            slug: "uvod-u-ai-video",
            titleSr: "Uvod u AI video produkciju",
            titleEn: "Intro to AI video production",
            summarySr: "Mapa alata, tipovi projekata i kako se bira format pre prvog prompta.",
            summaryEn: "Tool map, project types, and format decisions before the first prompt.",
            durationSeconds: 18 * 60,
            sortOrder: 10,
            parts: [
              {
                slug: "glavni-video",
                titleSr: "Glavni video",
                titleEn: "Main video",
                kind: "video" as const,
                sortOrder: 10,
              },
              {
                slug: "beleske-i-koraci",
                titleSr: "Beleske i koraci",
                titleEn: "Notes and steps",
                kind: "text" as const,
                bodySr: "Pregled alata, tipova projekata i prvih odluka pre promptovanja.",
                bodyEn: "Overview of tools, project types, and first decisions before prompting.",
                sortOrder: 20,
              },
            ],
            labSteps: [
              {
                slug: "brief-za-video",
                titleSr: "Brief za prvi AI video",
                titleEn: "Brief for the first AI video",
                bodySr:
                  "Napravi kratak produkcijski brief za video od 30 sekundi: cilj, publika, ton, glavna poruka i format. Koristi AI Workspace da razradis ideju, zatim sacuvaj najbolji rezultat u Output.",
                bodyEn:
                  "Create a short production brief for a 30-second video: goal, audience, tone, main message, and format. Use the AI Workspace to shape the idea, then save the best result to Output.",
                outputKind: "video" as const,
                sortOrder: 10,
                tasks: [
                  {
                    promptSr: "Definisi cilj videa i kome je namenjen.",
                    promptEn: "Define the goal of the video and who it is for.",
                    hintSr: "Dobar brief pocinje jednom jasnom recenicom: kome se obraca i sta treba da uradi posle gledanja.",
                    hintEn: "A good brief starts with one clear sentence: who it speaks to and what they should do after watching.",
                    sortOrder: 10,
                  },
                  {
                    promptSr: "Sacuvaj finalni brief kao output za ovaj korak.",
                    promptEn: "Save the final brief as the output for this step.",
                    hintSr: "Klikni Save to output na najboljem AI odgovoru.",
                    hintEn: "Click Save to output on the best AI answer.",
                    sortOrder: 20,
                  },
                ],
              },
              {
                slug: "voiceover-plan",
                titleSr: "Plan za voiceover",
                titleEn: "Voiceover plan",
                bodySr:
                  "Na osnovu briefa napravi voiceover plan: stil glasa, tempo, trajanje recenica i gde se menja emocija. Ovo je priprema za audio generisanje u narednim lekcijama.",
                bodyEn:
                  "Based on the brief, create a voiceover plan: voice style, pacing, sentence length, and where the emotion changes. This prepares audio generation in later lessons.",
                outputKind: "audio" as const,
                sortOrder: 20,
                tasks: [
                  {
                    promptSr: "Izaberi stil glasa i ritam naracije.",
                    promptEn: "Choose the voice style and narration pacing.",
                    hintSr: "Razmisli da li video treba da zvuci edukativno, prodajno, filmski ili dokumentarno.",
                    hintEn: "Decide whether the video should sound educational, sales-driven, cinematic, or documentary-like.",
                    sortOrder: 10,
                  },
                ],
              },
            ],
          },
          {
            slug: "scenario-voice-workflow",
            titleSr: "Scenario, naracija i glas",
            titleEn: "Script, narration, and voice",
            summarySr: "Od ideje do sinhronizovanog voiceovera sa kontrolom tona i ritma.",
            summaryEn: "From idea to synchronized voiceover with tone and pacing control.",
            durationSeconds: 26 * 60,
            sortOrder: 20,
            parts: [
              {
                slug: "workflow-scenarija",
                titleSr: "Workflow scenarija",
                titleEn: "Script workflow",
                kind: "text" as const,
                bodySr: "Struktura ideje, naracije i provera ritma pre generisanja glasa.",
                bodyEn: "Idea structure, narration, and pacing checks before voice generation.",
                sortOrder: 10,
              },
            ],
          },
        ],
      },
      {
        titleSr: "Studio workflow",
        titleEn: "Studio workflow",
        sortOrder: 20,
        lessons: [
          {
            slug: "ai-video-editor",
            titleSr: "AI video editor i montaža",
            titleEn: "AI video editor and cutting",
            summarySr: "Izbor kadrova, generisanje B-rolla, timeline ritam i finalni eksport.",
            summaryEn: "Shot selection, generated B-roll, timeline pacing, and final export.",
            durationSeconds: 31 * 60,
            sortOrder: 10,
            parts: [
              {
                slug: "montazni-ritam",
                titleSr: "Montazni ritam",
                titleEn: "Editing rhythm",
                kind: "text" as const,
                bodySr: "Kadar, B-roll i ritam timeline-a za finalni AI video.",
                bodyEn: "Shot choice, B-roll, and timeline rhythm for the final AI video.",
                sortOrder: 10,
              },
            ],
          },
          {
            slug: "client-ready-project",
            titleSr: "Finalni projekat za klijenta",
            titleEn: "Client-ready final project",
            summarySr: "Sastavljanje kratke reklame, dokumentacija procesa i paket za isporuku.",
            summaryEn: "Building a short ad, documenting the process, and packaging delivery.",
            durationSeconds: 42 * 60,
            sortOrder: 20,
            parts: [
              {
                slug: "paket-za-isporuku",
                titleSr: "Paket za isporuku",
                titleEn: "Delivery package",
                kind: "text" as const,
                bodySr: "Kako se projekat pakuje, dokumentuje i predaje klijentu.",
                bodyEn: "How the project is packaged, documented, and delivered to a client.",
                sortOrder: 10,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "vibe-coding",
    trackSlug: "websites",
    titleSr: "Kurs za web sajtove",
    titleEn: "Websites Course",
    subtitleSr: "Od ideje do objavljenog sajta uz AI",
    subtitleEn: "From idea to a published website with AI",
    descriptionSr: "Od ideje do web sajta uz AI alate, strukturu projekta i jasne granice kvaliteta.",
    descriptionEn: "From idea to website with AI tools, project structure, and clear quality gates.",
    status: "published" as const,
    sortOrder: 20,
    stripePriceArg: "vibeCodingStripePriceId" as const,
    modules: [],
  },
];

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
const IMAGE_DEFAULT_PARAMS = JSON.stringify({ aspect_ratio: "1:1", num_images: 1 });

// Video i zvuk se uključuju u Fazi B i C - forma za njih se piše tad, pa je
// param šema ovde namerno svedena na jedino polje koje je zajedničko svima.
const MINIMAL_PARAM_SCHEMA = JSON.stringify([
  { key: "prompt", type: "textarea", label: "Prompt", required: true, maxLength: 2000 },
] as const);
const EMPTY_DEFAULT_PARAMS = JSON.stringify({});

const modelCatalogSeeds = [
  // ── SLIKE (isEnabled: true) ──────────────────────────────────────────
  {
    slug: "flux-2-flash",
    kind: "image" as const,
    labelSr: "FLUX.2 Flash",
    labelEn: "FLUX.2 Flash",
    descriptionSr: "Najjeftiniji model za brzo eksperimentisanje sa slikama.",
    descriptionEn: "Cheapest model for fast image experimentation.",
    falEndpoint: "fal-ai/flux-2/flash",
    creditCost: 3,
    estimatedCostUsd: 0.005,
    badge: undefined,
    isEnabled: true,
    sortOrder: 10,
  },
  {
    slug: "flux-2-pro",
    kind: "image" as const,
    labelSr: "FLUX.2 Pro",
    labelEn: "FLUX.2 Pro",
    descriptionSr: "Kvalitetnija verzija FLUX.2 za finalne slike.",
    descriptionEn: "Higher-quality FLUX.2 for final images.",
    falEndpoint: "fal-ai/flux-2-pro",
    creditCost: 7,
    estimatedCostUsd: 0.03,
    badge: undefined,
    isEnabled: true,
    sortOrder: 20,
  },
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
    isEnabled: true,
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
    isEnabled: true,
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
    isEnabled: true,
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
    isEnabled: true,
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
    isEnabled: true,
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
    isEnabled: true,
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
      const patch = {
        slug: seed.slug,
        kind: seed.kind,
        labelSr: seed.labelSr,
        labelEn: seed.labelEn,
        descriptionSr: seed.descriptionSr,
        descriptionEn: seed.descriptionEn,
        provider: "fal",
        falEndpoint: seed.falEndpoint,
        defaultParams: isImage ? IMAGE_DEFAULT_PARAMS : EMPTY_DEFAULT_PARAMS,
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
