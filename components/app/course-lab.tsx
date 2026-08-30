"use client";

import { useMutation } from "convex/react";
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  GripVertical,
  ImageIcon,
  MessageSquareText,
  Mic2,
  Save,
  Send,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineContentText } from "@/components/app/inline-content";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Course, Lesson } from "@/lib/content";
import { lessonEditPath } from "@/lib/app-routes";
import { localized, t, type Locale, withLocale } from "@/lib/i18n";

type OutputKind = "text" | "image" | "audio" | "video" | "file";
type CompletionMode = "manual" | "automatic" | "hybrid";
type ColumnType = "explanation" | "chatbot" | "output";
type LayoutColumn = { type: ColumnType; width: number } | null;
type StepLayout = LayoutColumn[];

type LabTask = {
  _id: Id<"lessonTasks">;
  promptSr: string;
  promptEn: string;
  hintSr?: string;
  hintEn?: string;
  required: boolean;
  completionMode: CompletionMode;
  isPublished: boolean;
  sortOrder: number;
  progress?: {
    completed?: boolean;
    evidenceOutputId?: Id<"labOutputs">;
  } | null;
};

type QuickPrompt = {
  labelSr: string;
  labelEn: string;
  content: string;
};

type LabStep = {
  _id: Id<"lessonSteps">;
  slug: string;
  titleSr: string;
  titleEn: string;
  bodySr: string;
  bodyEn: string;
  outputKind: OutputKind;
  isPublished: boolean;
  sortOrder: number;
  layout?: StepLayout | null;
  prompts?: QuickPrompt[] | null;
  systemInstruction?: string | null;
  progress?: {
    completed?: boolean;
  } | null;
  tasks: LabTask[];
};

type LabOutput = {
  _id: Id<"labOutputs">;
  stepId?: Id<"lessonSteps">;
  taskId?: Id<"lessonTasks">;
  conversationId?: Id<"aiConversations">;
  messageId?: Id<"aiMessages">;
  kind: OutputKind;
  status: "draft" | "ready" | "failed";
  title: string;
  text?: string;
  storageUrl?: string | null;
  url?: string;
  fileName?: string;
  mimeType?: string;
  updatedAt: number;
};

type AiMessage = {
  _id: Id<"aiMessages">;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  createdAt: number;
};

export type LessonLabData = {
  isAdmin?: boolean;
  canUsePro?: boolean;
  activeConversation?: {
    _id: Id<"aiConversations">;
    model: string;
  } | null;
  steps: LabStep[];
  outputs: LabOutput[];
  messages: AiMessage[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  messageId?: Id<"aiMessages">;
};

function localText(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr || en : en || sr;
}

function OutputKindIcon({ kind, className }: { kind: OutputKind; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "audio") return <Mic2 className={className} />;
  if (kind === "video") return <Video className={className} />;
  if (kind === "file") return <FileText className={className} />;
  return <MessageSquareText className={className} />;
}

function outputLabel(kind: OutputKind, locale: Locale) {
  const labels: Record<OutputKind, [string, string]> = {
    text: ["Tekst", "Text"],
    image: ["Slika", "Image"],
    audio: ["Audio", "Audio"],
    video: ["Video", "Video"],
    file: ["Fajl", "File"],
  };
  const [sr, en] = labels[kind];
  return t(locale, sr, en);
}

function QuickPromptButton({
  prompt,
  locale,
  setComposer,
}: {
  prompt: QuickPrompt;
  locale: Locale;
  setComposer: (val: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopied(true);
      setComposer(prompt.content);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "rounded-[8px] border-2 px-3 py-2 text-xs font-black transition flex items-center gap-1.5 shadow-[2px_2px_0_0_var(--shadow-hard-10)] hover:-translate-y-0.5",
        copied ? "border-green-600 bg-green-50 text-green-700" : "border-ink bg-paper-strong text-ink hover:bg-yellow"
      )}
    >
      <Sparkles className={cn("size-3.5", copied && "text-green-600")} />
      {t(locale, prompt.labelSr, prompt.labelEn)}
      {copied && <span className="text-[10px] font-bold text-green-650 ml-0.5">({t(locale, "Kopirano", "Copied")})</span>}
    </button>
  );
}

export function CourseLab({
  course,
  lesson,
  locale,
  lab,
  lessonId,
  inlineEdit = false,
  inlineLocale = locale,
}: {
  course: Course;
  lesson: Lesson;
  locale: Locale;
  lab: LessonLabData;
  lessonId: Id<"lessons">;
  inlineEdit?: boolean;
  inlineLocale?: Locale;
}) {
  const markTaskProgress = useMutation(api.lab.markTaskProgress);
  const markStepProgress = useMutation(api.lab.markStepProgress);
  const saveLabOutput = useMutation(api.lab.saveLabOutput);
  const markLessonProgress = useMutation(api.courses.markProgress);

  const sortedSteps = useMemo(() => [...lab.steps].sort((a, b) => a.sortOrder - b.sortOrder), [lab.steps]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = sortedSteps[Math.min(activeStepIndex, Math.max(sortedSteps.length - 1, 0))];
  const sortedTasks = useMemo(
    () => [...(activeStep?.tasks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [activeStep],
  );
  const firstOpenTask = sortedTasks.find((task) => task.required && !task.progress?.completed) ?? sortedTasks[0];
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"lessonTasks"> | undefined>(firstOpenTask?._id);
  const selectedTask = sortedTasks.find((task) => task._id === selectedTaskId) ?? firstOpenTask;
  const [activeMobileTab, setActiveMobileTab] = useState<"lesson" | "ai" | "output">("lesson");
  const modelOptions = [
    "Gemini Omni",
    "Gemini Veo",
    "Kling 3.0",
    "Kling 3.0 Motion Effects",
    "Seedance 1.5",
    "Seedance 2.0",
    "ChatGPT Image",
    "Nano Banana Pro",
    "Nano Banana 2",
    "Nano Banana 2 Lite",
    "Seedream 5.0",
    "gpt-4.1",
  ];
  const unconnectedModels = new Set(modelOptions.filter((model) => model !== "gpt-4.1"));
  const [selectedModel, setSelectedModel] = useState(lab.activeConversation?.model ?? "gpt-4.1");
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    lab.messages
      .filter((message): message is AiMessage & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        id: message._id,
        role: message.role,
        content: message.content,
        model: message.model,
        messageId: message._id,
      })),
  );
  const [conversationId, setConversationId] = useState<Id<"aiConversations"> | undefined>(
    lab.activeConversation?._id,
  );
  const [composer, setComposer] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSavingOutput, setIsSavingOutput] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);


  useEffect(() => {
    if (!activeStep) return;

    const frame = window.requestAnimationFrame(() => {
      const layout = (activeStep.layout ?? [
        { type: "explanation", width: 33.3 },
        { type: "chatbot", width: 33.3 },
        { type: "output", width: 33.4 },
      ]) as StepLayout;
      const activeCols = layout.filter(Boolean) as Array<{ type: ColumnType; width: number }>;
      const types = activeCols.map((c) => c.type);

      setColWidths(activeCols.map((col) => col.width));
      if (activeMobileTab === "lesson" && !types.includes("explanation")) {
        setActiveMobileTab(types.includes("chatbot") ? "ai" : "output");
      } else if (activeMobileTab === "ai" && !types.includes("chatbot")) {
        setActiveMobileTab(types.includes("explanation") ? "lesson" : "output");
      } else if (activeMobileTab === "output" && !types.includes("output")) {
        setActiveMobileTab(types.includes("explanation") ? "lesson" : "ai");
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMobileTab, activeStep]);

  const startResizing = (leftColIndex: number, startEvent: React.MouseEvent) => {
    startEvent.preventDefault();
    const container = startEvent.currentTarget.parentElement;
    if (!container) return;

    const containerWidth = container.getBoundingClientRect().width;
    const initialWidths = [...colWidths];
    const startX = startEvent.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;

      const newLeftWidth = Math.max(15, Math.min(85, initialWidths[leftColIndex] + deltaPercent));
      const newRightWidth = Math.max(15, Math.min(85, initialWidths[leftColIndex + 1] - (newLeftWidth - initialWidths[leftColIndex])));

      const updatedWidths = [...initialWidths];
      updatedWidths[leftColIndex] = Math.round(newLeftWidth * 10) / 10;
      updatedWidths[leftColIndex + 1] = Math.round(newRightWidth * 10) / 10;

      setColWidths(updatedWidths);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const requiredTasks = sortedTasks.filter((task) => task.required);
  const requiredDone = requiredTasks.every((task) => task.progress?.completed);
  const stepOutputs = lab.outputs
    .filter((output) => output.stepId === activeStep?._id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const latestOutput = stepOutputs[0];
  const lastAssistant = [...chatMessages].reverse().find((message) => message.role === "assistant");

  async function toggleTask(task: LabTask) {
    setStatusMessage(null);
    try {
      await markTaskProgress({
        taskId: task._id,
        completed: !task.progress?.completed,
        ...(latestOutput?._id ? { evidenceOutputId: latestOutput._id } : {}),
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t(locale, "Zadatak nije sacuvan.", "Task was not saved."));
    }
  }

  async function handleNext() {
    if (!activeStep || !requiredDone) return;
    setStatusMessage(null);
    try {
      await markStepProgress({ stepId: activeStep._id, completed: true });
      if (activeStepIndex < sortedSteps.length - 1) {
        setActiveStepIndex((value) => value + 1);
        setActiveMobileTab("lesson");
        return;
      }
      await markLessonProgress({ lessonId, completed: true, positionSeconds: 0 });
      setStatusMessage(t(locale, "Lekcija je zavrsena.", "Lesson completed."));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t(locale, "Napredak nije sacuvan.", "Progress was not saved."));
    }
  }

  async function sendMessage() {
    if (!composer.trim() || !activeStep) return;
    const content = composer.trim();
    if (unconnectedModels.has(selectedModel)) {
      setStatusMessage(t(locale, "Integracija ovog modela uskoro.", "This model integration is coming soon."));
      return;
    }
    setComposer("");
    setIsSending(true);
    setStatusMessage(null);
    setChatMessages((messages) => [...messages, { id: `local-user-${Date.now()}`, role: "user", content, model: selectedModel }]);
    try {
      const response = await fetch("/api/ai/course-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug: course.slug,
          lessonSlug: lesson.slug,
          stepId: activeStep._id,
          taskId: selectedTask?._id,
          conversationId,
          model: selectedModel,
          message: content,
          locale,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "AI request failed.");
      }
      setConversationId(payload.conversationId);
      setChatMessages((messages) => [
        ...messages,
        {
          id: payload.assistantMessageId ?? `local-assistant-${Date.now()}`,
          role: "assistant",
          content: String(payload.message ?? ""),
          model: payload.model,
          messageId: payload.assistantMessageId,
        },
      ]);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "AI request failed.");
    } finally {
      setIsSending(false);
    }
  }

  async function saveLatestOutput() {
    if (!activeStep || !lastAssistant?.content.trim()) return;
    setIsSavingOutput(true);
    setStatusMessage(null);
    try {
      await saveLabOutput({
        lessonId,
        stepId: activeStep._id,
        ...(selectedTask?._id ? { taskId: selectedTask._id } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(lastAssistant.messageId ? { messageId: lastAssistant.messageId } : {}),
        kind: activeStep.outputKind,
        status: "ready",
        title: `${localText(locale, activeStep.titleSr, activeStep.titleEn)} output`,
        text: lastAssistant.content,
      });
      setActiveMobileTab("output");
      setStatusMessage(t(locale, "Output je sacuvan.", "Output saved."));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t(locale, "Output nije sacuvan.", "Output was not saved."));
    } finally {
      setIsSavingOutput(false);
    }
  }



  if (!activeStep) {
    return (
      <div className="grid min-h-[560px] place-items-center rounded-[8px] border-2 border-ink bg-paper p-8 text-center">
        <div className="max-w-md">
          <Sparkles className="mx-auto size-10 text-ink" />
          <h2 className="mt-4 text-2xl font-black text-ink">{t(locale, "Pro prikaz je spreman", "Pro view is ready")}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-muted">{t(locale, "Dodaj prvi korak i zadatak u Pro editoru da bi se troslojni harness pojavio.", "Add the first step and task in the Pro editor to populate the three-column harness.")}</p>
          {lab.isAdmin && !inlineEdit ? <Link href={lessonEditPath(locale, course.slug, lesson.slug)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black">{t(locale, "Otvori Pro editor", "Open Pro editor")}</Link> : null}
        </div>
      </div>
    );
  }

  const tabButton = (tab: "lesson" | "ai" | "output", label: string) => (
    <button
      type="button"
      onClick={() => setActiveMobileTab(tab)}
      className={cn(
        "min-h-10 flex-1 rounded-[8px] border-2 px-3 text-sm font-black",
        activeMobileTab === tab ? "border-ink bg-yellow text-ink" : "border-line bg-paper-strong text-muted",
      )}
    >
      {label}
    </button>
  );

  const activeLayout = (activeStep.layout ?? [
    { type: "explanation", width: 33.3 },
    { type: "chatbot", width: 33.3 },
    { type: "output", width: 33.4 },
  ]) as StepLayout;

  const activeColumns = activeLayout.filter(Boolean) as Array<{ type: ColumnType; width: number }>;

  return (
    <div className="min-h-[calc(100vh-120px)] overflow-hidden rounded-[8px] border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--shadow-hard-13)]">
      <div className="flex flex-col gap-3 border-b-2 border-ink bg-paper-strong px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-muted">{localized(course.title, locale)}</p>
          <h1 className="truncate text-xl font-black text-ink">{localized(lesson.title, locale)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lab.isAdmin && !inlineEdit ? (
            <Link
              href={lessonEditPath(locale, course.slug, lesson.slug)}
              className="rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-xs font-black text-ink hover:bg-yellow inline-flex items-center gap-1.5"
            >
              <Sparkles className="size-3.5" />
              {t(locale, "Otvori Editor vežbe", "Open Exercise Editor")}
            </Link>
          ) : null}
          <span className="rounded-[8px] border-2 border-ink bg-yellow px-3 py-2 text-xs font-black text-ink">
            {activeStepIndex + 1}/{sortedSteps.length}
          </span>
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-line bg-paper p-3 lg:hidden">
        {activeColumns.some((c) => c.type === "explanation") && tabButton("lesson", t(locale, "Lekcija", "Lesson"))}
        {activeColumns.some((c) => c.type === "chatbot") && tabButton("ai", "AI")}
        {activeColumns.some((c) => c.type === "output") && tabButton("output", t(locale, "Output", "Output"))}
      </div>

      <div className="flex flex-col lg:flex-row min-h-[560px] max-h-[calc(100vh-260px)] min-w-0 w-full overflow-hidden select-none relative">
        {activeColumns.map((col, idx) => {
          const widthPct = colWidths[idx] ?? col.width;
          const isLast = idx === activeColumns.length - 1;

          return (
            <div
              key={col.type}
              className={cn(
                "relative flex flex-col min-h-0 bg-paper-strong border-r-2 border-line last:border-r-0",
                col.type === "explanation" && activeMobileTab !== "lesson" && "max-lg:hidden",
                col.type === "chatbot" && activeMobileTab !== "ai" && "max-lg:hidden",
                col.type === "output" && activeMobileTab !== "output" && "max-lg:hidden"
              )}
              style={{ flexBasis: `${widthPct}%`, flexGrow: 0, flexShrink: 0 }}
            >
              {col.type === "explanation" && (
                <section className="h-full w-full bg-paper-strong overflow-hidden">
                  <div className="max-h-full overflow-y-auto p-5 select-text">
                    <p className="text-xs font-black uppercase text-muted">{t(locale, "Lekcija", "Lesson")}</p>
                    <h2 className="mt-2 text-3xl font-black leading-tight text-ink">
                      <InlineContentText entityId={activeStep._id} parentId={lessonId} kind="step" field="title" locale={inlineLocale} sr={activeStep.titleSr} en={activeStep.titleEn} admin={inlineEdit}>
                        {localText(locale, activeStep.titleSr, activeStep.titleEn)}
                      </InlineContentText>
                    </h2>
                    <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-muted">
                      <InlineContentText entityId={activeStep._id} parentId={lessonId} kind="step" field="body" locale={inlineLocale} sr={activeStep.bodySr} en={activeStep.bodyEn} admin={inlineEdit} multiline>
                        {localText(locale, activeStep.bodySr, activeStep.bodyEn)}
                      </InlineContentText>
                    </p>

                    {activeStep.prompts && (activeStep.prompts as QuickPrompt[]).length > 0 && (
                      <div className="mt-6 border-t-2 border-line pt-4">
                        <p className="text-xs font-black uppercase text-muted mb-3">
                          {t(locale, "Brzi promptovi (klikni za kopiranje)", "Quick Prompts (click to copy)")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(activeStep.prompts as QuickPrompt[]).map((prompt, pIdx) => (
                            <InlineContentText key={`qp-${pIdx}`} entityId={activeStep._id} parentId={lessonId} kind="step" field="promptLabel" promptIndex={pIdx} locale={inlineLocale} sr={prompt.labelSr} en={prompt.labelEn} admin={inlineEdit}>
                              <QuickPromptButton prompt={prompt} locale={locale} setComposer={setComposer} />
                            </InlineContentText>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-6 border-t-2 border-line pt-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-5 text-ink" />
                        <h3 className="text-lg font-black text-ink">{t(locale, "Zadaci", "Tasks")}</h3>
                      </div>
                      <div className="mt-4 space-y-3">
                        {sortedTasks.map((task, index) => {
                          const done = Boolean(task.progress?.completed);
                          return (
                            <button
                              key={task._id}
                              type="button"
                              onClick={() => {
                                setSelectedTaskId(task._id);
                                void toggleTask(task);
                              }}
                              className={cn(
                                "w-full rounded-[8px] border-2 p-3 text-left transition",
                                selectedTask?._id === task._id ? "border-ink bg-paper" : "border-line bg-paper-strong hover:border-ink",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-yellow" /> : <Circle className="mt-0.5 size-5 shrink-0 text-line" />}
                                <div>
                                  <p className="text-xs font-black uppercase text-muted">
                                    {t(locale, "Checkpoint", "Checkpoint")} {index + 1}
                                    {task.required ? " *" : ""}
                                  </p>
                                  <p className="mt-1 text-sm font-bold leading-6 text-ink">
                                    <InlineContentText entityId={task._id} parentId={activeStep._id} kind="task" field="prompt" locale={inlineLocale} sr={task.promptSr} en={task.promptEn} admin={inlineEdit} multiline>
                                      {localText(locale, task.promptSr, task.promptEn)}
                                    </InlineContentText>
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selectedTask?.hintSr || selectedTask?.hintEn ? (
                        <details className="mt-4 rounded-[8px] border-2 border-ink bg-yellow/40 p-3">
                          <summary className="cursor-pointer text-sm font-black text-ink">{t(locale, "Stuck? Otvori hint", "Stuck? Open hint")}</summary>
                          <p className="mt-3 text-sm font-bold leading-6 text-muted">
                            <InlineContentText entityId={selectedTask._id} parentId={activeStep._id} kind="task" field="hint" locale={inlineLocale} sr={selectedTask.hintSr ?? ""} en={selectedTask.hintEn ?? ""} admin={inlineEdit} multiline>
                              {localText(locale, selectedTask.hintSr ?? "", selectedTask.hintEn ?? "")}
                            </InlineContentText>
                          </p>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </section>
              )}

              {col.type === "chatbot" && (
                <section className="h-full w-full bg-paper overflow-hidden">
                  <div className="flex flex-col h-full select-text">
                    <div className="border-b border-line bg-paper-strong p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
                            <Bot className="size-5" />
                          </span>
                          <div>
                            <p className="text-lg font-black text-ink">AI Workspace</p>
                            <p className="text-xs font-bold text-muted">{outputLabel(activeStep.outputKind, locale)} output</p>
                          </div>
                        </div>
                        <select
                          value={selectedModel}
                          onChange={(event) => setSelectedModel(event.target.value)}
                          className="min-h-10 rounded-[8px] border-2 border-ink bg-paper-strong px-3 text-sm font-black text-ink"
                        >
                          {modelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}{unconnectedModels.has(model) ? " — Uskoro" : " — Povezan"}
                            </option>
                          ))}
                        </select>
                      </div>
                      {unconnectedModels.has(selectedModel) ? <p className="mt-2 text-xs font-black text-muted">{t(locale, "Model je prikazan za pregled. Integracija uskoro.", "Model is shown for preview. Integration coming soon.")}</p> : null}
                      <div className="mt-4 rounded-[8px] border-2 border-line bg-paper p-3">
                        <p className="text-xs font-black uppercase text-muted">{t(locale, "Trenutni zadatak", "Current task")}</p>
                        <p className="mt-1 text-sm font-bold leading-6 text-ink">
                          {selectedTask ? localText(locale, selectedTask.promptSr, selectedTask.promptEn) : t(locale, "Nema taska.", "No task.")}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          t(locale, "Objasni mi ovaj zadatak", "Explain this task"),
                          t(locale, "Daj mi plan rada", "Give me a work plan"),
                          t(locale, "Predlozi bolji output", "Suggest a better output"),
                        ].map((prompt) => (
                          <button key={prompt} type="button" onClick={() => setComposer(prompt)} className="rounded-[8px] border-2 border-line bg-paper-strong px-3 py-2 text-xs font-black text-ink hover:border-ink">
                            <Sparkles className="mr-1 inline size-3" />
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-grow space-y-3 overflow-y-auto p-4">
                      {chatMessages.length ? (
                        chatMessages.map((message) => (
                          <div key={message.id} className={cn("max-w-[88%] rounded-[8px] border-2 p-3", message.role === "assistant" ? "border-ink bg-paper-strong" : "ml-auto border-ink bg-yellow")}>
                            <p className="text-xs font-black uppercase text-muted">{message.role === "assistant" ? "AI" : t(locale, "Ti", "You")}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{message.content}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[8px] border-2 border-dashed border-line bg-paper-strong p-5 text-center">
                          <MessageSquareText className="mx-auto size-8 text-ink" />
                          <p className="mt-3 text-sm font-black text-muted">
                            {t(locale, "Pitaj AI za pomoc oko trenutnog zadatka.", "Ask AI for help with the current task.")}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-line bg-paper-strong p-4 shrink-0">
                      <div className="flex gap-2">
                        <textarea
                          value={composer}
                          onChange={(event) => setComposer(event.target.value)}
                          placeholder={t(locale, "Posalji poruku...", "Send a message...")}
                          className="min-h-12 flex-1 resize-none rounded-[8px] border-2 border-ink px-3 py-2 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        />
                        <button
                          type="button"
                          onClick={sendMessage}
                          disabled={isSending || !composer.trim()}
                          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSending ? <Spinner size="md" /> : <Send className="size-5" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={saveLatestOutput}
                        disabled={isSavingOutput || !lastAssistant}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingOutput ? <Spinner /> : <Save className="size-4" />}
                        {t(locale, "Save to output", "Save to output")}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {col.type === "output" && (
                <section className="h-full w-full bg-paper-strong overflow-hidden">
                  <div className="max-h-full overflow-y-auto p-5 select-text">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-muted">Output</p>
                        <h2 className="text-2xl font-black text-ink">{outputLabel(activeStep.outputKind, locale)}</h2>
                      </div>
                      <span className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
                        <OutputKindIcon kind={activeStep.outputKind} className="size-5" />
                      </span>
                    </div>
                    {activeStep.outputKind !== "text" ? (
                      <Link
                        href={`${withLocale(locale, "/app/studio")}?lessonId=${lessonId}${selectedTask ? `&taskId=${selectedTask._id}` : ""}`}
                        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
                      >
                        <Wand2 className="size-4" />
                        {t(locale, "Otvori u Studiju", "Open in the Studio")}
                      </Link>
                    ) : null}
                    {latestOutput ? (
                      <div className="mt-5 rounded-[8px] border-2 border-ink bg-paper p-4">
                        <p className="text-sm font-black text-ink">{latestOutput.title}</p>
                        <p className="mt-1 text-xs font-bold uppercase text-muted">{latestOutput.status}</p>
                        {latestOutput.kind === "image" && (latestOutput.storageUrl || latestOutput.url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={latestOutput.storageUrl ?? latestOutput.url} alt={latestOutput.title} className="mt-4 aspect-video w-full rounded-[8px] border-2 border-ink object-cover" />
                        ) : null}
                        {latestOutput.kind === "audio" && (latestOutput.storageUrl || latestOutput.url) ? (
                          <audio className="mt-4 w-full" src={latestOutput.storageUrl ?? latestOutput.url} controls />
                        ) : null}
                        {latestOutput.kind === "video" && (latestOutput.storageUrl || latestOutput.url) ? (
                          <video className="mt-4 aspect-video w-full rounded-[8px] border-2 border-ink bg-scrim" src={latestOutput.storageUrl ?? latestOutput.url} controls />
                        ) : null}
                        {latestOutput.text ? (
                          <p className="mt-4 whitespace-pre-wrap rounded-[8px] border-2 border-line bg-paper-strong p-3 text-sm font-bold leading-6 text-ink">
                            {latestOutput.text}
                          </p>
                        ) : null}
                        {latestOutput.fileName ? <p className="mt-3 text-sm font-black text-muted">{latestOutput.fileName}</p> : null}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[8px] border-2 border-dashed border-line bg-paper p-6 text-center">
                        <Save className="mx-auto size-8 text-ink" />
                        <p className="mt-3 text-sm font-black text-muted">
                          {t(locale, "Sacuvaj AI odgovor ili uploadovan fajl da bi se pojavio ovde.", "Save an AI answer or uploaded file to show it here.")}
                        </p>
                      </div>
                    )}
                    <div className="mt-5 space-y-2">
                      {stepOutputs.slice(1).map((output) => (
                        <button key={output._id} type="button" className="w-full rounded-[8px] border-2 border-line bg-paper-strong p-3 text-left text-sm font-black text-ink hover:border-ink">
                          {output.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Resize Handle Drag Divider */}
              {!isLast && (
                <div
                  onMouseDown={(e) => startResizing(idx, e)}
                  className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-yellow/85 bg-transparent transition duration-150 z-20 group hidden lg:block"
                  title={t(locale, "Prevuci da resajzuješ", "Drag to resize")}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-paper-strong border-2 border-ink rounded p-0.5 shadow opacity-0 group-hover:opacity-100 transition duration-150">
                    <GripVertical className="size-3 text-ink" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t-2 border-ink bg-paper-strong p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-sm font-black text-ink">
            {activeStepIndex + 1}/{sortedSteps.length}
          </span>
          <span className="text-sm font-bold text-muted">
            {requiredDone ? t(locale, "Svi obavezni zadaci su gotovi.", "All required tasks are done.") : t(locale, "Next se otkljucava kada zavrsis zadatke.", "Next unlocks after required tasks.")}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveStepIndex((value) => Math.max(0, value - 1))}
            disabled={activeStepIndex === 0}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!requiredDone}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted sm:flex-none"
          >
            Next
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      {statusMessage ? <p className="border-t-2 border-line bg-paper px-4 py-3 text-sm font-black text-muted">{statusMessage}</p> : null}
    </div>
  );
}
