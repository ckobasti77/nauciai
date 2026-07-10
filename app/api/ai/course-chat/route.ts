import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexMutations, convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { readEnv } from "@/lib/env";

type LocalizedRow = {
  titleSr?: string;
  titleEn?: string;
  bodySr?: string;
  bodyEn?: string;
  promptSr?: string;
  promptEn?: string;
};

type LabTask = LocalizedRow & {
  _id: string;
  required?: boolean;
};

type LabStep = LocalizedRow & {
  _id: string;
  outputKind?: string;
  tasks?: LabTask[];
  systemInstruction?: string;
};

type LabPayload = {
  lesson?: LocalizedRow & { _id: string };
  steps?: LabStep[];
};

type ResponseContent = {
  text?: unknown;
};

function enabledModels() {
  const configured = readEnv("AI_ENABLED_MODELS");
  const fallback = readEnv("AI_DEFAULT_MODEL") ?? "gpt-4.1";
  return (configured ?? fallback)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function selectedModel(requestedModel: unknown) {
  const models = enabledModels();
  const fallback = readEnv("AI_DEFAULT_MODEL") ?? models[0] ?? "gpt-4.1";
  const requested = typeof requestedModel === "string" && requestedModel.trim() ? requestedModel.trim() : fallback;

  if (!models.includes(requested)) {
    throw new Error(`Model ${requested} is not enabled for this app.`);
  }

  return requested;
}

function localized(row: LocalizedRow | undefined, locale: string, key: "title" | "body" | "prompt") {
  if (!row) return "";
  if (key === "title") {
    return locale === "en" ? row.titleEn || row.titleSr || "" : row.titleSr || row.titleEn || "";
  }
  if (key === "body") {
    return locale === "en" ? row.bodyEn || row.bodySr || "" : row.bodySr || row.bodyEn || "";
  }
  return locale === "en" ? row.promptEn || row.promptSr || "" : row.promptSr || row.promptEn || "";
}

function extractResponseText(payload: unknown) {
  if (payload && typeof payload === "object" && "output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = payload && typeof payload === "object" && "output" in payload ? payload.output : null;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }
      const contentItems = (item as { content: ResponseContent[] }).content;
      return contentItems.map((content) => {
        if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
          return content.text;
        }
        return "";
      });
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function systemPrompt(lab: LabPayload, step: LabStep | undefined, task: LabTask | undefined, locale: string) {
  const title = localized(lab.lesson, locale, "title");
  const stepTitle = localized(step, locale, "title");
  const stepBody = localized(step, locale, "body");
  const taskPrompt = localized(task, locale, "prompt");
  const taskList = (step?.tasks ?? [])
    .map((item, index) => `${index + 1}. ${localized(item, locale, "prompt")}${item.required ? " (required)" : ""}`)
    .join("\n");
  const customInstruction = step?.systemInstruction || "";

  return [
    "You are the Nauci.ai course assistant inside a practical AI course lab.",
    "Help the student understand and complete the current task. Be direct, practical, and do not fabricate saved outputs.",
    locale === "en" ? "Respond in English unless the student asks otherwise." : "Odgovaraj na srpskom jeziku osim ako korisnik trazi drugacije.",
    customInstruction,
    `Lesson: ${title}`,
    `Current step: ${stepTitle}`,
    stepBody ? `Step context:\n${stepBody}` : "",
    taskPrompt ? `Current task:\n${taskPrompt}` : "",
    taskList ? `All tasks for this step:\n${taskList}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function GET() {
  const models = enabledModels();
  return Response.json({
    models,
    defaultModel: readEnv("AI_DEFAULT_MODEL") ?? models[0] ?? "gpt-4.1",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const courseSlug = typeof body.courseSlug === "string" ? body.courseSlug : "";
  const lessonSlug = typeof body.lessonSlug === "string" ? body.lessonSlug : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const locale = body.locale === "en" ? "en" : "sr";

  if (!courseSlug || !lessonSlug || !message) {
    return Response.json({ error: "Missing course, lesson, or message." }, { status: 400 });
  }

  const token = await convexAuthNextjsToken();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexHttpClient(token);
  if (!convex) {
    return Response.json({ error: "Convex is not configured." }, { status: 503 });
  }

  let model: string;
  try {
    model = selectedModel(body.model);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Model is not enabled." }, { status: 400 });
  }

  const apiKey = readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const lab = (await convex.query(convexQueries.getLessonLab, { courseSlug, lessonSlug })) as LabPayload | null;
  if (!lab?.lesson) {
    return Response.json({ error: "Lesson lab not found." }, { status: 404 });
  }

  const stepId = typeof body.stepId === "string" ? body.stepId : undefined;
  const taskId = typeof body.taskId === "string" ? body.taskId : undefined;
  const step = lab.steps?.find((item) => item._id === stepId) ?? lab.steps?.[0];
  const task = step?.tasks?.find((item) => item._id === taskId);

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt(lab, step, task, locale),
      input: message,
    }),
  });

  const payload = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : "AI provider request failed.";
    return Response.json({ error }, { status: aiResponse.status });
  }

  const assistantMessage = extractResponseText(payload) || (locale === "en" ? "I could not produce a response." : "Nisam uspeo da napravim odgovor.");
  const recorded = await convex.mutation(convexMutations.recordAiExchange, {
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
    lessonId: lab.lesson._id,
    stepId,
    taskId,
    model,
    userMessage: message,
    assistantMessage,
  });

  return Response.json({
    message: assistantMessage,
    model,
    conversationId: recorded.conversationId,
    assistantMessageId: recorded.assistantMessageId,
  });
}
