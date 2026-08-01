import type { Locale, LocalizedText } from "./i18n";

export type LessonAsset = {
  id?: string;
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
  kind: "text" | "image" | "video" | "file";
  body?: LocalizedText;
  bodyRich?: LocalizedText;
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
  summaryRich?: LocalizedText;
  isPublished?: boolean;
  sortOrder?: number;
  assets: LessonAsset[];
  parts: LessonPart[];
};

export type CourseModule = {
  title: LocalizedText;
  lessons: Lesson[];
};

export type CourseImage = {
  src: string;
  alt: LocalizedText;
};

export type CourseDetail = {
  kicker: LocalizedText;
  longDescription: LocalizedText;
  freeVideoTitle: LocalizedText;
  freeVideoDescription: LocalizedText;
  outcomes: LocalizedText[];
};

export type Course = {
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  descriptionRich?: LocalizedText;
  status: "published" | "coming-soon";
  priceLabel: LocalizedText;
  image: CourseImage;
  detail: CourseDetail;
  stripePriceEnv: string;
  accent: string;
  modules: CourseModule[];
};

export const primaryCourseSlug = "video-audio-ai";
export const websitesCourseSlug = "vibe-coding";
export const primaryLessonSlug = "uvod-u-ai-video";

export type FutureCourseTrack = {
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  courseSlugs: string[];
  visible: false;
};

// Future taxonomy placeholder: tracks will sit above courses, but are not rendered yet.
export const futureCourseTracks: FutureCourseTrack[] = [
  {
    slug: "video-audio",
    title: {
      sr: "Smer za video i audio",
      en: "Video and audio track",
    },
    description: {
      sr: "Buduci smer koji ce objediniti vise kurseva za video i audio produkciju.",
      en: "Future track that will group multiple video and audio production courses.",
    },
    courseSlugs: [primaryCourseSlug],
    visible: false,
  },
  {
    slug: "websites",
    title: {
      sr: "Smer za web sajtove",
      en: "Websites track",
    },
    description: {
      sr: "Buduci smer koji ce objediniti vise kurseva za izradu web sajtova.",
      en: "Future track that will group multiple website-building courses.",
    },
    courseSlugs: [websitesCourseSlug],
    visible: false,
  },
];

export const courses: Course[] = [
  {
    slug: primaryCourseSlug,
    title: {
      sr: "Kurs za video i audio",
      en: "Video and Audio Course",
    },
    subtitle: {
      sr: "Scenario, glas, kadar i montaza uz AI",
      en: "Scripts, voice, shots, and editing with AI",
    },
    description: {
      sr: "Praktican kurs za pisanje scenarija, generisanje glasa, video produkciju, montazu i finalni AI workflow.",
      en: "A practical course for scripts, voice generation, video production, editing, and complete AI workflows.",
    },
    status: "published",
    priceLabel: {
      sr: "9,99 EUR",
      en: "9,99 EUR",
    },
    image: {
      src: "/images/course-video-audio-ai-cover.png",
      alt: {
        sr: "Ilustracija AI video i audio produkcije",
        en: "AI video and audio production illustration",
      },
    },
    detail: {
      kicker: {
        sr: "Video i audio produkcija",
        en: "Video and audio production",
      },
      longDescription: {
        sr: "Naucices kako se ideja pretvara u kratak produkcijski brief, zatim u scenario, voiceover, vizuelni ritam i finalni video spreman za objavu ili klijenta.",
        en: "Learn how an idea becomes a production brief, then a script, voiceover, visual rhythm, and final video ready for publishing or client delivery.",
      },
      freeVideoTitle: {
        sr: "Besplatan uvodni video",
        en: "Free intro video",
      },
      freeVideoDescription: {
        sr: "Kratak pregled procesa: ideja, scenario, glas, kadar, montaza i provera kvaliteta pre objave.",
        en: "A short walkthrough of the process: idea, script, voice, shot, edit, and quality checks before publishing.",
      },
      outcomes: [
        {
          sr: "Postavljas produkcijski brief pre prvog prompta.",
          en: "Set up a production brief before the first prompt.",
        },
        {
          sr: "Biraces glas, tempo i strukturu voiceovera.",
          en: "Choose voice style, pacing, and voiceover structure.",
        },
        {
          sr: "Sklapas finalni video workflow sa jasnom kontrolom kvaliteta.",
          en: "Build a final video workflow with clear quality control.",
        },
      ],
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
            parts: [
              {
                slug: "glavni-video",
                title: {
                  sr: "Glavni video",
                  en: "Main video",
                },
                kind: "video",
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
    slug: websitesCourseSlug,
    title: {
      sr: "Kurs za web sajtove",
      en: "Websites Course",
    },
    subtitle: {
      sr: "Od ideje do objavljenog sajta uz AI",
      en: "From idea to a published website with AI",
    },
    description: {
      sr: "Od ideje do web sajta uz AI alate, strukturu projekta i jasne granice kvaliteta.",
      en: "From idea to website with AI tools, project structure, and clear quality gates.",
    },
    status: "published",
    priceLabel: {
      sr: "9,99 EUR",
      en: "9,99 EUR",
    },
    image: {
      src: "/images/course-websites-ai-cover.png",
      alt: {
        sr: "Ilustracija AI izrade web sajta",
        en: "AI website building illustration",
      },
    },
    detail: {
      kicker: {
        sr: "Web sajtovi uz AI",
        en: "Websites with AI",
      },
      longDescription: {
        sr: "Kurs vodi kroz planiranje strukture, pisanje jasnog briefa, izradu stranica uz AI, proveru kvaliteta i pripremu sajta za objavu.",
        en: "The course walks through structure planning, a clear brief, AI-assisted page building, quality checks, and preparing a site for publishing.",
      },
      freeVideoTitle: {
        sr: "Besplatan uvodni video",
        en: "Free intro video",
      },
      freeVideoDescription: {
        sr: "Pogledaj kako se od jedne ideje pravi plan sajta, prvi izgled stranice i lista provera pre objave.",
        en: "See how one idea becomes a site plan, first page direction, and a checklist before publishing.",
      },
      outcomes: [
        {
          sr: "Pretvaras ideju u jasan website brief.",
          en: "Turn an idea into a clear website brief.",
        },
        {
          sr: "Gradis stranice koje imaju strukturu, hijerarhiju i CTA.",
          en: "Build pages with structure, hierarchy, and CTA flow.",
        },
        {
          sr: "Proveravas responsive layout, tekst i vizuelni kvalitet pre objave.",
          en: "Check responsive layout, copy, and visual quality before publishing.",
        },
      ],
    },
    stripePriceEnv: "STRIPE_PRICE_VIBE_CODING",
    accent: "#0e3158",
    modules: [],
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
