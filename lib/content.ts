import type { Locale, LocalizedText } from "./i18n";

export type LessonAsset = {
  label: LocalizedText;
  kind: "pdf" | "prompt" | "worksheet" | "project";
  size: string;
  downloadUrl?: string | null;
};

export type LessonPart = {
  id?: string;
  parentPartId?: string;
  slug: string;
  title: LocalizedText;
  kind: "text" | "video" | "file";
  body?: LocalizedText;
  muxPlaybackId?: string;
  downloadUrl?: string | null;
  fileName?: string;
  size?: string;
  isPublished?: boolean;
  sortOrder?: number;
};

export type Lesson = {
  id?: string;
  slug: string;
  title: LocalizedText;
  duration: string;
  durationSeconds?: number;
  summary: LocalizedText;
  muxPlaybackId?: string;
  isPublished?: boolean;
  sortOrder?: number;
  assets: LessonAsset[];
  parts: LessonPart[];
};

export type CourseModule = {
  title: LocalizedText;
  lessons: Lesson[];
};

export type Course = {
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  status: "published" | "coming-soon";
  priceLabel: LocalizedText;
  stripePriceEnv: string;
  accent: string;
  modules: CourseModule[];
};

export const primaryCourseSlug = "video-audio-ai";
export const primaryLessonSlug = "uvod-u-ai-video";

export const courses: Course[] = [
  {
    slug: primaryCourseSlug,
    title: {
      sr: "Smer za video i audio",
      en: "Video and Audio Track",
    },
    subtitle: {
      sr: "Prvi smer Fakulteta za AI",
      en: "The first Faculty for AI track",
    },
    description: {
      sr: "Praktičan smer za pisanje scenarija, generisanje glasa, video produkciju, montažu i finalni AI workflow.",
      en: "A practical track for scripts, voice generation, video production, editing, and complete AI workflows.",
    },
    status: "published",
    priceLabel: {
      sr: "9.99 / mes",
      en: "9.99 / mo",
    },
    stripePriceEnv: "STRIPE_PRICE_VIDEO_AUDIO_AI",
    accent: "#f4be30",
    modules: [
      {
        title: {
          sr: "Temelji produkcije",
          en: "Production foundations",
        },
        lessons: [
          {
            slug: primaryLessonSlug,
            title: {
              sr: "Uvod u AI video produkciju",
              en: "Intro to AI video production",
            },
            duration: "18 min",
            summary: {
              sr: "Mapa alata, tipovi projekata i kako se bira format pre prvog prompta.",
              en: "Tool map, project types, and format decisions before the first prompt.",
            },
            muxPlaybackId: "demo-signed-playback-id",
            parts: [
              {
                slug: "glavni-video",
                title: {
                  sr: "Glavni video",
                  en: "Main video",
                },
                kind: "video",
                muxPlaybackId: "demo-signed-playback-id",
              },
              {
                slug: "beleske-i-koraci",
                title: {
                  sr: "Beleske i koraci",
                  en: "Notes and steps",
                },
                kind: "text",
                body: {
                  sr: "Pregled alata, tipova projekata i prvih odluka pre promptovanja.",
                  en: "Overview of tools, project types, and first decisions before prompting.",
                },
              },
            ],
            assets: [
              {
                label: {
                  sr: "Mapa alata za produkciju",
                  en: "Production tool map",
                },
                kind: "pdf",
                size: "1.2 MB",
              },
              {
                label: {
                  sr: "Prompt start paket",
                  en: "Prompt starter pack",
                },
                kind: "prompt",
                size: "18 KB",
              },
            ],
          },
          {
            slug: "scenario-voice-workflow",
            title: {
              sr: "Scenario, naracija i glas",
              en: "Script, narration, and voice",
            },
            duration: "26 min",
            summary: {
              sr: "Od ideje do sinhronizovanog voiceovera sa kontrolom tona i ritma.",
              en: "From idea to synchronized voiceover with tone and pacing control.",
            },
            parts: [
              {
                slug: "workflow-scenarija",
                title: {
                  sr: "Workflow scenarija",
                  en: "Script workflow",
                },
                kind: "text",
                body: {
                  sr: "Struktura ideje, naracije i provera ritma pre generisanja glasa.",
                  en: "Idea structure, narration, and pacing checks before voice generation.",
                },
              },
            ],
            assets: [
              {
                label: {
                  sr: "Radni list za scenario",
                  en: "Script worksheet",
                },
                kind: "worksheet",
                size: "420 KB",
              },
            ],
          },
        ],
      },
      {
        title: {
          sr: "Studio workflow",
          en: "Studio workflow",
        },
        lessons: [
          {
            slug: "ai-video-editor",
            title: {
              sr: "AI video editor i montaža",
              en: "AI video editor and cutting",
            },
            duration: "31 min",
            summary: {
              sr: "Izbor kadrova, generisanje B-rolla, timeline ritam i finalni eksport.",
              en: "Shot selection, generated B-roll, timeline pacing, and final export.",
            },
            parts: [
              {
                slug: "montazni-ritam",
                title: {
                  sr: "Montazni ritam",
                  en: "Editing rhythm",
                },
                kind: "text",
                body: {
                  sr: "Kadar, B-roll i ritam timeline-a za finalni AI video.",
                  en: "Shot choice, B-roll, and timeline rhythm for the final AI video.",
                },
              },
            ],
            assets: [
              {
                label: {
                  sr: "Checklist za finalni eksport",
                  en: "Final export checklist",
                },
                kind: "project",
                size: "75 KB",
              },
            ],
          },
          {
            slug: "client-ready-project",
            title: {
              sr: "Finalni projekat za klijenta",
              en: "Client-ready final project",
            },
            duration: "42 min",
            summary: {
              sr: "Sastavljanje kratke reklame, dokumentacija procesa i paket za isporuku.",
              en: "Building a short ad, documenting the process, and packaging delivery.",
            },
            parts: [
              {
                slug: "paket-za-isporuku",
                title: {
                  sr: "Paket za isporuku",
                  en: "Delivery package",
                },
                kind: "text",
                body: {
                  sr: "Kako se projekat pakuje, dokumentuje i predaje klijentu.",
                  en: "How the project is packaged, documented, and delivered to a client.",
                },
              },
            ],
            assets: [
              {
                label: {
                  sr: "Brief za završni projekat",
                  en: "Final project brief",
                },
                kind: "project",
                size: "210 KB",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "vibe-coding",
    title: {
      sr: "Smer za web sajtove",
      en: "Websites Track",
    },
    subtitle: {
      sr: "Sledeći smer u pripremi",
      en: "Next track in preparation",
    },
    description: {
      sr: "Od ideje do web sajta uz AI alate, strukturu projekta i jasne granice kvaliteta.",
      en: "From idea to website with AI tools, project structure, and clear quality gates.",
    },
    status: "coming-soon",
    priceLabel: {
      sr: "uskoro",
      en: "soon",
    },
    stripePriceEnv: "STRIPE_PRICE_VIBE_CODING",
    accent: "#0e3158",
    modules: [],
  },
];

export const communityPosts = [
  {
    id: "post-1",
    author: "Mina Petrović",
    role: "student",
    title: {
      sr: "Moj prvi AI voiceover workflow",
      en: "My first AI voiceover workflow",
    },
    body: {
      sr: "Kombinovala sam kratki scenario, dva tona glasa i tri iteracije montaže. Najviše je pomogao radni list za tempo.",
      en: "I combined a short script, two voice tones, and three edit passes. The pacing worksheet helped most.",
    },
    reactions: 18,
    comments: 6,
  },
  {
    id: "post-2",
    author: "Fakultet za AI",
    role: "admin",
    title: {
      sr: "Novi materijali za editor lekciju",
      en: "New materials for the editor lesson",
    },
    body: {
      sr: "Dodati su checklist za finalni eksport i primer briefa za završni projekat.",
      en: "The final export checklist and final project brief example have been added.",
    },
    reactions: 31,
    comments: 9,
  },
];

export const studentProfile = {
  name: "Nikola Jovanović",
  email: "nikola@example.com",
  language: "sr" as Locale,
  avatar: "NJ",
  role: "student",
};

export function findCourse(courseSlug: string): Course {
  return courses.find((course) => course.slug === courseSlug) ?? courses[0];
}

export function findLesson(course: Course, lessonSlug: string): Lesson {
  return (
    course.modules.flatMap((module) => module.lessons).find((lesson) => lesson.slug === lessonSlug) ??
    course.modules[0]?.lessons[0] ??
    courses[0].modules[0].lessons[0]
  );
}

export function totalLessons(course: Course): number {
  return course.modules.reduce((count, module) => count + module.lessons.length, 0);
}
