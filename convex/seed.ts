import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

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
