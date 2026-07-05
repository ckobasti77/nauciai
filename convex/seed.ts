import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

import { requireSyncSecret } from "./helpers";

const courseSeeds = [
  {
    slug: "video-audio-ai",
    titleSr: "Smer za video i audio",
    titleEn: "Video and Audio Track",
    subtitleSr: "Prvi smer Fakulteta za AI",
    subtitleEn: "The first Faculty for AI track",
    descriptionSr:
      "Praktičan smer za pisanje scenarija, generisanje glasa, video produkciju, montažu i finalni AI workflow.",
    descriptionEn:
      "A practical track for scripts, voice generation, video production, editing, and complete AI workflows.",
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
    titleSr: "Smer za web sajtove",
    titleEn: "Websites Track",
    subtitleSr: "Sledeći smer u pripremi",
    subtitleEn: "Next track in preparation",
    descriptionSr: "Od ideje do web sajta uz AI alate, strukturu projekta i jasne granice kvaliteta.",
    descriptionEn: "From idea to website with AI tools, project structure, and clear quality gates.",
    status: "draft" as const,
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

    for (const seed of courseSeeds) {
      const stripePriceId = args[seed.stripePriceArg];
      const existingCourse = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const coursePatch = {
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
        }
      }
    }

    return { courseIds };
  },
});
