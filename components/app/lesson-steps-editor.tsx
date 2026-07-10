"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clipboard,
  Columns3,
  Eye,
  FileText,
  GripVertical,
  LayoutDashboard,
  ListPlus,
  Loader2,
  MessageSquareText,
  Monitor,
  PanelRight,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Course, Lesson } from "@/lib/content";
import { localized, type Locale, withLocale } from "@/lib/i18n";

type ColumnType = "explanation" | "chatbot" | "output";
type OutputKind = "text" | "image" | "audio" | "video" | "file";
type CompletionMode = "manual" | "automatic" | "hybrid";

type LayoutColumn = {
  type: ColumnType;
  width: number;
} | null;

type StepLayout = LayoutColumn[];

type QuickPrompt = {
  labelSr: string;
  labelEn: string;
  content: string;
};

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
};

type LabStep = {
  _id: Id<"lessonSteps">;
  slug: string;
  titleSr: string;
  titleEn: string;
  bodySr: string;
  bodyEn: string;
  outputKind: OutputKind;
  layout?: StepLayout | null;
  prompts?: QuickPrompt[] | null;
  systemInstruction?: string | null;
  isPublished: boolean;
  sortOrder: number;
  tasks?: LabTask[];
};

type LessonLabPayload = {
  course?: {
    _id: Id<"courses">;
  } | null;
  lesson?: {
    _id: Id<"lessons">;
  } | null;
  steps: LabStep[];
};

type StepForm = {
  stepId?: Id<"lessonSteps">;
  slug: string;
  titleSr: string;
  titleEn: string;
  bodySr: string;
  bodyEn: string;
  outputKind: OutputKind;
  isPublished: boolean;
  sortOrder: number;
  layout: StepLayout;
  prompts: QuickPrompt[];
  systemInstruction: string;
};

type ActiveEntry = {
  slotIndex: number;
  col: NonNullable<LayoutColumn>;
};

type SaveStatus = "saved" | "saving" | "error";
type WidthUnits = 1 | 2 | 3;
type EditorSidebar = "steps" | "inspector";

const DEFAULT_LAYOUT: StepLayout = [
  { type: "explanation", width: 33.3 },
  { type: "chatbot", width: 33.3 },
  { type: "output", width: 33.4 },
];
const PANEL_TYPES: ColumnType[] = ["explanation", "chatbot", "output"];
const WIDTH_UNITS: WidthUnits[] = [1, 2, 3];
const MIN_STEPS_WIDTH = 240;
const MAX_STEPS_WIDTH = 460;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 480;

const PANEL_META: Record<
  ColumnType,
  {
    labelSr: string;
    labelEn: string;
    shortSr: string;
    shortEn: string;
    icon: ReactNode;
    tone: string;
  }
> = {
  explanation: {
    labelSr: "Objasnjenje i zadaci",
    labelEn: "Explanation and tasks",
    shortSr: "Objasnjenje",
    shortEn: "Explanation",
    icon: <FileText className="size-4" />,
    tone: "bg-yellow text-ink",
  },
  chatbot: {
    labelSr: "AI chatbot",
    labelEn: "AI chatbot",
    shortSr: "Chatbot",
    shortEn: "Chatbot",
    icon: <Bot className="size-4" />,
    tone: "bg-ink text-white",
  },
  output: {
    labelSr: "Output",
    labelEn: "Output",
    shortSr: "Output",
    shortEn: "Output",
    icon: <MessageSquareText className="size-4" />,
    tone: "bg-white text-ink",
  },
};

const outputOptions: Array<{ value: OutputKind; sr: string; en: string }> = [
  { value: "text", sr: "Tekst", en: "Text" },
  { value: "image", sr: "Slika", en: "Image" },
  { value: "audio", sr: "Audio", en: "Audio" },
  { value: "video", sr: "Video", en: "Video" },
  { value: "file", sr: "Fajl", en: "File" },
];

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function localText(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr || en : en || sr;
}

function panelLabel(locale: Locale, type: ColumnType, mode: "short" | "long" = "long") {
  const meta = PANEL_META[type];
  if (mode === "short") return labelFor(locale, meta.shortSr, meta.shortEn);
  return labelFor(locale, meta.labelSr, meta.labelEn);
}

function widthToUnits(width?: number): WidthUnits {
  if (!width) return 1;
  if (width >= 83) return 3;
  if (width >= 50) return 2;
  return 1;
}

function unitsToWidth(units: WidthUnits) {
  if (units === 3) return 100;
  if (units === 2) return 66.7;
  return 33.3;
}

function unitLabel(locale: Locale, units: WidthUnits) {
  if (units === 3) return labelFor(locale, "Ceo ekran", "Full width");
  return `${units}/3`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function slotUnits(col: NonNullable<LayoutColumn>, slotIndex = 0): WidthUnits {
  const maxUnits = Math.max(1, 3 - slotIndex) as WidthUnits;
  return Math.min(widthToUnits(col.width), maxUnits) as WidthUnits;
}

function slotSpan(slotIndex: number, col: NonNullable<LayoutColumn>) {
  const units = slotUnits(col, slotIndex);
  return {
    start: slotIndex,
    end: Math.min(3, slotIndex + units),
    units,
  };
}

function occupiedBy(layout: StepLayout, trackIndex: number, exceptSlot?: number) {
  return activeEntries(layout).find(({ slotIndex, col }) => {
    if (slotIndex === exceptSlot) return false;
    const span = slotSpan(slotIndex, col);
    return trackIndex >= span.start && trackIndex < span.end;
  });
}

function normalizeLayout(layout?: StepLayout | null): StepLayout {
  const candidate = layout?.length ? layout.slice(0, 3) : DEFAULT_LAYOUT;
  const next: StepLayout = [null, null, null];
  const occupied = [false, false, false];

  candidate.forEach((col, slotIndex) => {
    if (!col) return;
    const units = Math.min(widthToUnits(col.width), Math.max(1, 3 - slotIndex)) as WidthUnits;
    const spanEnd = slotIndex + units;
    const blocked = occupied.slice(slotIndex, spanEnd).some(Boolean);
    if (blocked) return;
    next[slotIndex] = { ...col, width: unitsToWidth(units) };
    for (let index = slotIndex; index < spanEnd; index += 1) {
      occupied[index] = true;
    }
  });

  return activeEntries(next).length ? next : DEFAULT_LAYOUT;
}

function activeEntries(layout: StepLayout): ActiveEntry[] {
  return layout
    .map((col, slotIndex) => (col ? { slotIndex, col } : null))
    .filter((entry): entry is ActiveEntry => Boolean(entry));
}

function setSlotUnits(layout: StepLayout, slotIndex: number, units: WidthUnits) {
  const source = layout[slotIndex];
  if (!source) return { layout, selectedSlot: slotIndex };

  const nextSlot = units === 3 ? 0 : Math.min(slotIndex, 3 - units);
  const next: StepLayout = [...layout];
  next[slotIndex] = null;

  for (let index = 0; index < next.length; index += 1) {
    const col = next[index];
    if (!col) continue;
    const span = slotSpan(index, col);
    const targetStart = nextSlot;
    const targetEnd = nextSlot + units;
    if (span.start < targetEnd && targetStart < span.end) {
      next[index] = null;
    }
  }

  next[nextSlot] = { ...source, width: unitsToWidth(units) };
  return { layout: normalizeLayout(next), selectedSlot: nextSlot };
}

function stepToForm(step: LabStep): StepForm {
  return {
    stepId: step._id,
    slug: step.slug,
    titleSr: step.titleSr,
    titleEn: step.titleEn,
    bodySr: step.bodySr,
    bodyEn: step.bodyEn,
    outputKind: step.outputKind,
    isPublished: step.isPublished,
    sortOrder: step.sortOrder,
    layout: normalizeLayout(step.layout),
    prompts: step.prompts ?? [],
    systemInstruction: step.systemInstruction ?? "",
  };
}

function PanelIcon({ type }: { type: ColumnType }) {
  return PANEL_META[type].icon;
}

function gridStartClass(slotIndex: number) {
  if (slotIndex === 1) return "xl:col-start-2";
  if (slotIndex === 2) return "xl:col-start-3";
  return "xl:col-start-1";
}

function gridSpanClass(units: WidthUnits) {
  if (units === 3) return "xl:col-span-3";
  if (units === 2) return "xl:col-span-2";
  return "xl:col-span-1";
}

function WidthStepper({
  locale,
  units,
  onChange,
}: {
  locale: Locale;
  units: WidthUnits;
  onChange: (units: WidthUnits) => void;
}) {
  return (
    <div className="inline-flex rounded-[8px] border-2 border-ink bg-white p-1 shadow-[2px_2px_0_0_rgba(14,49,88,0.12)]">
      {WIDTH_UNITS.map((option) => (
        <button
          key={`width-${option}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange(option);
          }}
          className={cn(
            "min-h-8 min-w-12 rounded-[6px] px-2 text-xs font-black transition",
            option === units ? "bg-yellow text-ink" : "text-muted hover:bg-paper hover:text-ink",
          )}
          aria-pressed={option === units}
        >
          {unitLabel(locale, option)}
        </button>
      ))}
    </div>
  );
}

function PanelPalette({
  locale,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  locale: Locale;
  onDragStart: (event: DragEvent<HTMLElement>, type: ColumnType) => void;
  onDragEnd: () => void;
  onClick?: (type: ColumnType) => void;
}) {
  return (
    <div className="grid gap-2">
      {PANEL_TYPES.map((type) => (
        <button
          key={`palette-${type}`}
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, type)}
          onDragEnd={onDragEnd}
          onClick={() => onClick?.(type)}
          className="flex min-h-14 cursor-grab items-center gap-3 rounded-[8px] border-2 border-ink bg-white px-3 text-left text-sm font-black text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.12)] transition hover:-translate-y-0.5 hover:bg-yellow active:cursor-grabbing"
        >
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink", PANEL_META[type].tone)}>
            <PanelIcon type={type} />
          </span>
          <span className="min-w-0">
            <span className="block truncate">{panelLabel(locale, type)}</span>
            <span className="block text-[10px] uppercase text-muted">
              {labelFor(locale, "Deo panela", "Panel block")}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function EditorSidebarRail({
  locale,
  side,
  label,
  icon,
  onExpand,
}: {
  locale: Locale;
  side: EditorSidebar;
  label: string;
  icon: ReactNode;
  onExpand: () => void;
}) {
  const chevron = side === "steps" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />;
  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-3 border-inherit bg-white px-1.5 py-3">
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex size-9 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.14)] transition hover:-translate-y-0.5"
        aria-label={labelFor(locale, `Otvori ${label}`, `Open ${label}`)}
        title={labelFor(locale, `Otvori ${label}`, `Open ${label}`)}
      >
        {chevron}
      </button>
      <span className="inline-flex size-9 items-center justify-center rounded-[8px] border-2 border-line bg-paper text-muted">
        {icon}
      </span>
      <span className="rotate-180 [writing-mode:vertical-rl] text-[10px] font-black uppercase text-muted">
        {label}
      </span>
    </div>
  );
}

function SidebarResizeHandle({
  locale,
  side,
  onMouseDown,
}: {
  locale: Locale;
  side: EditorSidebar;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={labelFor(locale, "Prevuci za sirinu", "Drag to resize")}
      onMouseDown={onMouseDown}
      className={cn(
        "group absolute top-0 z-30 hidden h-full w-3 cursor-col-resize items-center justify-center bg-transparent transition hover:bg-yellow/25 lg:flex",
        side === "steps" ? "-right-1.5" : "-left-1.5",
      )}
    >
      <span className="inline-flex rounded-[6px] border border-ink bg-white p-1 text-ink opacity-0 shadow-[2px_2px_0_0_rgba(14,49,88,0.14)] transition group-hover:opacity-100">
        <GripVertical className="size-3" />
      </span>
    </div>
  );
}

function CanvasDropZone({
  locale,
  slotIndex,
  draggingType,
  onDrop,
  onAdd,
}: {
  locale: Locale;
  slotIndex: number;
  draggingType: ColumnType | null;
  onDrop: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onAdd: (slotIndex: number, type: ColumnType) => void;
}) {
  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => onDrop(event, slotIndex)}
      className={cn(
        "flex min-h-[540px] min-w-0 flex-col items-center justify-center rounded-[8px] border-2 border-dashed bg-white/70 p-5 text-center transition xl:row-start-1",
        gridStartClass(slotIndex),
        draggingType ? "border-ink bg-yellow/15" : "border-line",
      )}
    >
      <div className="inline-flex size-12 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.14)]">
        <Plus className="size-5" />
      </div>
      <p className="mt-4 text-sm font-black uppercase text-ink">
        {labelFor(locale, "Trecina", "Third")} {slotIndex + 1}
      </p>
      <p className="mt-1 text-xs font-bold text-muted">
        {draggingType ? panelLabel(locale, draggingType) : labelFor(locale, "Prazan deo ekrana", "Empty screen area")}
      </p>
      <div className="mt-4 grid w-full max-w-52 gap-2">
        {PANEL_TYPES.map((type) => (
          <button
            key={`drop-add-${slotIndex}-${type}`}
            type="button"
            onClick={() => onAdd(slotIndex, type)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border-2 border-line bg-white px-3 text-xs font-black text-ink transition hover:border-ink hover:bg-yellow"
          >
            <PanelIcon type={type} />
            {panelLabel(locale, type, "short")}
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status, locale }: { status: SaveStatus; locale: Locale }) {
  if (status === "saving") {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border-2 border-line bg-paper px-3 text-xs font-black text-muted">
        <Loader2 className="size-3.5 animate-spin text-yellow" />
        {labelFor(locale, "Cuvanje...", "Saving...")}
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border-2 border-red-300 bg-red-50 px-3 text-xs font-black text-red-700">
        <X className="size-3.5" />
        {labelFor(locale, "Greska", "Error")}
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border-2 border-green-200 bg-green-50 px-3 text-xs font-black text-green-700">
      <Check className="size-3.5" />
      {labelFor(locale, "Sacuvano", "Saved")}
    </span>
  );
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border-2 px-3 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        active ? "border-ink bg-yellow text-ink" : "border-line bg-white text-muted hover:border-ink hover:text-ink",
        disabled && "cursor-not-allowed opacity-40 hover:border-line hover:text-muted",
      )}
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border-2 border-line bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
            {icon}
          </span>
          <h3 className="truncate text-sm font-black text-ink">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const inputClass =
  "h-10 w-full rounded-[8px] border-2 border-ink bg-white px-3 text-sm font-bold text-ink outline-none transition placeholder:text-muted/60 focus:border-yellow focus:ring-4 focus:ring-yellow/25";
const compactInputClass =
  "h-8 w-full rounded-[6px] border border-ink bg-white px-2 text-xs font-bold text-ink outline-none transition placeholder:text-muted/60 focus:border-yellow";
const textareaClass =
  "w-full resize-none rounded-[8px] border-2 border-ink bg-white p-3 text-sm font-bold leading-6 text-ink outline-none transition placeholder:text-muted/60 focus:border-yellow focus:ring-4 focus:ring-yellow/25";

export function LessonStepsEditor({
  course,
  lesson,
  locale,
  courseId,
  lessonId,
}: {
  course: Course;
  lesson: Lesson;
  locale: Locale;
  courseId?: Id<"courses">;
  lessonId?: Id<"lessons">;
  moduleId?: Id<"modules">;
}) {
  const labData = useQuery(
    api.lab.getLessonLab,
    course.slug && lesson.slug ? { courseSlug: course.slug, lessonSlug: lesson.slug } : "skip",
  ) as LessonLabPayload | null | undefined;

  const upsertLessonStep = useMutation(api.lab.upsertLessonStep);
  const deleteLessonStep = useMutation(api.lab.deleteLessonStep);
  const reorderLessonSteps = useMutation(api.lab.reorderLessonSteps);
  const upsertLessonTask = useMutation(api.lab.upsertLessonTask);
  const deleteLessonTask = useMutation(api.lab.deleteLessonTask);
  const reorderLessonTasks = useMutation(api.lab.reorderLessonTasks);

  const labLessonId = labData?.lesson?._id;
  const labMatchesLesson = Boolean(lessonId && labLessonId === lessonId);
  const sortedSteps = useMemo(
    () => (labMatchesLesson ? [...(labData?.steps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [labData?.steps, labMatchesLesson],
  );

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepForm, setStepForm] = useState<StepForm | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [mobileTab, setMobileTab] = useState<"steps" | "canvas" | "inspector">("canvas");
  const [draggingType, setDraggingType] = useState<ColumnType | null>(null);
  const [stepsCollapsed, setStepsCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [stepsWidth, setStepsWidth] = useState(300);
  const [inspectorWidth, setInspectorWidth] = useState(340);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeActiveStepIndex = Math.min(activeStepIndex, Math.max(sortedSteps.length - 1, 0));
  const activeStep = sortedSteps[safeActiveStepIndex];
  const activeTasks = useMemo(
    () => [...(activeStep?.tasks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [activeStep?.tasks],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const nextStepForm = activeStep && courseId && lessonId ? stepToForm(activeStep) : null;
  if (nextStepForm && stepForm?.stepId !== nextStepForm.stepId) {
    setStepForm(nextStepForm);
  } else if (!nextStepForm && stepForm !== null) {
    setStepForm(null);
  }

  function triggerAutoSave(updatedForm: StepForm) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");
    saveTimeoutRef.current = setTimeout(async () => {
      if (!courseId || !lessonId || !labMatchesLesson) {
        setSaveStatus("saved");
        return;
      }
      try {
        setSaving(true);
        await upsertLessonStep({
          stepId: updatedForm.stepId,
          courseId,
          lessonId,
          slug: updatedForm.slug,
          titleSr: updatedForm.titleSr,
          titleEn: updatedForm.titleEn,
          bodySr: updatedForm.bodySr,
          bodyEn: updatedForm.bodyEn,
          outputKind: updatedForm.outputKind,
          isPublished: updatedForm.isPublished,
          sortOrder: updatedForm.sortOrder,
          layout: updatedForm.layout,
          prompts: updatedForm.prompts,
          systemInstruction: updatedForm.systemInstruction || undefined,
        });
        setSaveStatus("saved");
      } catch (error) {
        console.error("Auto-save step failed:", error);
        setSaveStatus("error");
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  function updateStepForm(fields: Partial<StepForm>) {
    setStepForm((current) => {
      if (!current) return current;
      const updated = { ...current, ...fields };
      triggerAutoSave(updated);
      return updated;
    });
  }

  function updateLayout(layout: StepLayout, nextSelectedSlot = selectedSlot) {
    setStepForm((current) => {
      if (!current) return current;
      const normalizedLayout = normalizeLayout(layout);
      const updated = { ...current, layout: normalizedLayout };
      const fallbackSlot = activeEntries(normalizedLayout)[0]?.slotIndex ?? 0;
      setSelectedSlot(normalizedLayout[nextSelectedSlot] ? nextSelectedSlot : fallbackSlot);
      triggerAutoSave(updated);
      return updated;
    });
  }

  async function handleAddStep() {
    if (!courseId || !lessonId || !labMatchesLesson) return;
    setSaving(true);
    setSaveStatus("saving");
    try {
      const nextSort = (sortedSteps.at(-1)?.sortOrder ?? 0) + 10;
      await upsertLessonStep({
        courseId,
        lessonId,
        slug: `step-${nextSort}`,
        titleSr: `Korak ${nextSort / 10}`,
        titleEn: `Step ${nextSort / 10}`,
        bodySr: "Dodaj objasnjenje za ovaj korak.",
        bodyEn: "Add explanation for this step.",
        outputKind: "text",
        isPublished: true,
        sortOrder: nextSort,
        layout: DEFAULT_LAYOUT,
        prompts: [],
      });
      setActiveStepIndex(sortedSteps.length);
      setMobileTab("canvas");
      setSaveStatus("saved");
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStep(stepId: Id<"lessonSteps">, index: number) {
    const confirmed = window.confirm(
      labelFor(locale, "Obrisati ovaj korak i sve njegove zadatke?", "Delete this step and all of its tasks?"),
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteLessonStep({ stepId });
      if (index <= activeStepIndex) setActiveStepIndex(Math.max(0, activeStepIndex - 1));
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveStep(index: number, direction: "up" | "down") {
    if (!lessonId) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= sortedSteps.length) return;
    const nextSteps = [...sortedSteps];
    const current = nextSteps[index];
    nextSteps[index] = nextSteps[nextIndex];
    nextSteps[nextIndex] = current;

    setSaving(true);
    try {
      await reorderLessonSteps({ lessonId, stepIds: nextSteps.map((step) => step._id) });
      setActiveStepIndex(nextIndex);
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function enableSlot(slotIndex: number, type: ColumnType) {
    if (!stepForm) return;
    const layout = [...stepForm.layout];
    const targetSlot = layout[slotIndex] ? slotIndex : (occupiedBy(layout, slotIndex)?.slotIndex ?? slotIndex);
    const current = layout[targetSlot];
    layout[targetSlot] = { type, width: current?.width ?? 33.3 };
    updateLayout(layout, targetSlot);
  }

  function changeSlotType(slotIndex: number, type: ColumnType) {
    if (!stepForm) return;
    const layout = [...stepForm.layout];
    const col = layout[slotIndex];
    layout[slotIndex] = { type, width: col?.width ?? 33.3 };
    updateLayout(layout, slotIndex);
  }

  function disableSlot(slotIndex: number) {
    if (!stepForm) return;
    const layout = [...stepForm.layout];
    layout[slotIndex] = null;
    if (!activeEntries(layout).length) {
      window.alert(labelFor(locale, "Korak mora imati bar jedan panel.", "A step needs at least one panel."));
      return;
    }
    const nextSelected = activeEntries(layout)[0]?.slotIndex ?? 0;
    updateLayout(layout, nextSelected);
  }

  function setPreset(layout: StepLayout) {
    const normalized = normalizeLayout(layout);
    updateLayout(normalized, activeEntries(normalized)[0]?.slotIndex ?? 0);
  }

  function setSelectedUnits(slotIndex: number, units: WidthUnits) {
    if (!stepForm) return;
    const result = setSlotUnits(stepForm.layout, slotIndex, units);
    updateLayout(result.layout, result.selectedSlot);
  }

  function typeFromDrop(event: DragEvent<HTMLElement>) {
    const type = event.dataTransfer.getData("application/x-nauci-panel") as ColumnType;
    return PANEL_TYPES.includes(type) ? type : null;
  }

  function handlePanelDragStart(event: DragEvent<HTMLElement>, type: ColumnType) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-nauci-panel", type);
    setDraggingType(type);
  }

  function handlePanelDrop(event: DragEvent<HTMLElement>, slotIndex: number) {
    event.preventDefault();
    const type = typeFromDrop(event);
    setDraggingType(null);
    if (!type) return;
    enableSlot(slotIndex, type);
  }

  function startSidebarResize(side: EditorSidebar, startEvent: ReactMouseEvent<HTMLDivElement>) {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = side === "steps" ? stepsWidth : inspectorWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "steps") {
        setStepsWidth(clamp(startWidth + delta, MIN_STEPS_WIDTH, MAX_STEPS_WIDTH));
      } else {
        setInspectorWidth(clamp(startWidth - delta, MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH));
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  async function handleAddTask() {
    if (!courseId || !lessonId || !activeStep) return;
    const nextSort = (activeTasks.at(-1)?.sortOrder ?? 0) + 10;
    setSaving(true);
    try {
      await upsertLessonTask({
        courseId,
        lessonId,
        stepId: activeStep._id,
        promptSr: "Novi zadatak",
        promptEn: "New task",
        required: true,
        completionMode: "manual",
        isPublished: true,
        sortOrder: nextSort,
      });
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTask(task: LabTask, fields: Partial<LabTask>) {
    if (!courseId || !lessonId || !activeStep) return;
    try {
      await upsertLessonTask({
        taskId: task._id,
        courseId,
        lessonId,
        stepId: activeStep._id,
        promptSr: fields.promptSr ?? task.promptSr,
        promptEn: fields.promptEn ?? task.promptEn,
        hintSr: fields.hintSr !== undefined ? fields.hintSr : task.hintSr,
        hintEn: fields.hintEn !== undefined ? fields.hintEn : task.hintEn,
        required: fields.required ?? task.required,
        completionMode: fields.completionMode ?? task.completionMode,
        isPublished: fields.isPublished ?? task.isPublished,
        sortOrder: task.sortOrder,
      });
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    }
  }

  async function handleDeleteTask(taskId: Id<"lessonTasks">) {
    const confirmed = window.confirm(labelFor(locale, "Obrisati ovaj zadatak?", "Delete this task?"));
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteLessonTask({ taskId });
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveTask(taskIndex: number, direction: "up" | "down") {
    if (!activeStep) return;
    const nextIndex = direction === "up" ? taskIndex - 1 : taskIndex + 1;
    if (nextIndex < 0 || nextIndex >= activeTasks.length) return;
    const nextTasks = [...activeTasks];
    const current = nextTasks[taskIndex];
    nextTasks[taskIndex] = nextTasks[nextIndex];
    nextTasks[nextIndex] = current;

    setSaving(true);
    try {
      await reorderLessonTasks({ stepId: activeStep._id, taskIds: nextTasks.map((task) => task._id) });
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function addPrompt() {
    if (!stepForm) return;
    updateStepForm({
      prompts: [
        ...stepForm.prompts,
        {
          labelSr: "Kopiraj prompt",
          labelEn: "Copy prompt",
          content: "Tekst prompta koji se kopira na klik...",
        },
      ],
    });
  }

  function updatePrompt(promptIndex: number, fields: Partial<QuickPrompt>) {
    if (!stepForm) return;
    const prompts = [...stepForm.prompts];
    prompts[promptIndex] = { ...prompts[promptIndex], ...fields };
    updateStepForm({ prompts });
  }

  function deletePrompt(promptIndex: number) {
    if (!stepForm) return;
    const prompts = [...stepForm.prompts];
    prompts.splice(promptIndex, 1);
    updateStepForm({ prompts });
  }

  if (!labData) {
    return (
      <div className="flex min-h-[480px] items-center justify-center bg-paper p-12 text-ink">
        <div className="rounded-[8px] border-2 border-ink bg-white p-6 text-center shadow-[6px_6px_0_0_rgba(14,49,88,0.13)]">
          <Loader2 className="mx-auto size-8 animate-spin text-yellow" />
          <p className="mt-3 text-sm font-black text-muted">
            {labelFor(locale, "Ucitavam admin editor...", "Loading admin editor...")}
          </p>
        </div>
      </div>
    );
  }

  const layout = stepForm?.layout ?? DEFAULT_LAYOUT;
  const selectedCol = stepForm?.layout[selectedSlot] ?? null;
  const hasIds = Boolean(courseId && lessonId && labMatchesLesson);
  const editorGridStyle = {
    "--steps-width": stepsCollapsed ? "52px" : `${stepsWidth}px`,
    "--inspector-width": inspectorCollapsed ? "52px" : `${inspectorWidth}px`,
  } as CSSProperties;

  return (
    <div className="flex h-screen min-h-[720px] flex-col overflow-hidden bg-paper text-ink">
      <header className="flex shrink-0 flex-col gap-3 border-b-2 border-ink bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={withLocale(locale, `/app/courses/${course.slug}/lessons/${lesson.slug}`)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper text-ink transition hover:bg-yellow"
            aria-label={labelFor(locale, "Nazad na lekciju", "Back to lesson")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-black uppercase text-muted">
              <span className="truncate">{localized(course.title, locale)}</span>
              <span>/</span>
              <span>{labelFor(locale, "Ciklus", "Cycle")}</span>
              <span>/</span>
              <span className="truncate">{localized(lesson.title, locale)}</span>
            </div>
            <h1 className="truncate text-xl font-black leading-tight text-ink lg:text-2xl">
              {labelFor(locale, "Admin panel lekcije", "Lesson admin panel")}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={saveStatus} locale={locale} />
          <ToolbarButton active onClick={() => setMobileTab("canvas")} title="Desktop canvas">
            <Monitor className="size-4" />
            Desktop
          </ToolbarButton>
          <ToolbarButton
            active={!stepsCollapsed}
            onClick={() => setStepsCollapsed((current) => !current)}
            title={stepsCollapsed ? labelFor(locale, "Otvori korake", "Open steps") : labelFor(locale, "Skupi korake", "Collapse steps")}
          >
            {stepsCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            {labelFor(locale, "Koraci", "Steps")}
          </ToolbarButton>
          <ToolbarButton onClick={() => setMobileTab("inspector")} title="Inspector">
            <PanelRight className="size-4" />
            Inspector
          </ToolbarButton>
          <ToolbarButton
            active={!inspectorCollapsed}
            onClick={() => setInspectorCollapsed((current) => !current)}
            title={inspectorCollapsed ? labelFor(locale, "Otvori inspector", "Open inspector") : labelFor(locale, "Skupi inspector", "Collapse inspector")}
          >
            {inspectorCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            {labelFor(locale, "Desno", "Right")}
          </ToolbarButton>
          <Link
            href={withLocale(locale, `/app/courses/${course.slug}/lessons/${lesson.slug}`)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5"
          >
            <Eye className="size-4" />
            {labelFor(locale, "Preview", "Preview")}
          </Link>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-3 border-b-2 border-line bg-white p-2 lg:hidden">
        {[
          ["steps", labelFor(locale, "Koraci", "Steps"), <ListPlus key="steps" className="size-4" />],
          ["canvas", "Canvas", <LayoutDashboard key="canvas" className="size-4" />],
          ["inspector", "Inspector", <Settings2 key="inspector" className="size-4" />],
        ].map(([tab, label, icon]) => (
          <button
            key={String(tab)}
            type="button"
            onClick={() => setMobileTab(tab as "steps" | "canvas" | "inspector")}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border-2 text-xs font-black",
              mobileTab === tab ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 lg:grid-cols-[var(--steps-width)_minmax(0,1fr)_var(--inspector-width)]"
        style={editorGridStyle}
      >
        <aside
          className={cn(
            "relative min-h-0 border-r-2 border-ink bg-white",
            mobileTab !== "steps" && "hidden lg:block",
          )}
        >
          {stepsCollapsed ? (
            <EditorSidebarRail
              locale={locale}
              side="steps"
              label={labelFor(locale, "Koraci", "Steps")}
              icon={<ListPlus className="size-4" />}
              onExpand={() => setStepsCollapsed(false)}
            />
          ) : (
          <div className="flex h-full flex-col">
            <div className="border-b-2 border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase text-muted">
                    {labelFor(locale, "Roadmap", "Roadmap")}
                  </p>
                  <h2 className="text-lg font-black text-ink">{labelFor(locale, "Koraci", "Steps")}</h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddStep}
                  disabled={!hasIds || saving}
                  className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={labelFor(locale, "Dodaj korak", "Add step")}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setStepsCollapsed(true)}
                  className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-line bg-paper text-muted transition hover:border-ink hover:bg-yellow hover:text-ink"
                  aria-label={labelFor(locale, "Skupi korake", "Collapse steps")}
                  title={labelFor(locale, "Skupi korake", "Collapse steps")}
                >
                  <ChevronLeft className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {sortedSteps.map((step, index) => {
                const active = index === activeStepIndex;
                const stepLayout = normalizeLayout(step.layout);
                const visiblePanels = activeEntries(stepLayout);
                return (
                  <button
                    key={step._id}
                    type="button"
                    onClick={() => {
                      setActiveStepIndex(index);
                      setMobileTab("canvas");
                    }}
                    className={cn(
                      "group w-full rounded-[8px] border-2 p-3 text-left transition",
                      active ? "border-ink bg-yellow/25 shadow-[3px_3px_0_0_rgba(14,49,88,0.14)]" : "border-line bg-paper hover:border-ink hover:bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-muted">
                          {labelFor(locale, "Korak", "Step")} {index + 1}
                          {!step.isPublished ? ` / ${labelFor(locale, "Nacrt", "Draft")}` : ""}
                        </p>
                        <p className="mt-1 truncate text-sm font-black text-ink">
                          {localText(locale, step.titleSr, step.titleEn)}
                        </p>
                      </div>
                      {step.isPublished ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted" />
                      )}
                    </div>
                    <div className="mt-3 flex gap-1">
                      {visiblePanels.map(({ slotIndex, col }) => (
                        <span
                          key={`${step._id}-${slotIndex}`}
                          className={cn(
                            "inline-flex h-6 flex-1 items-center justify-center rounded-[6px] border border-ink text-[9px] font-black uppercase",
                            PANEL_META[col.type].tone,
                          )}
                        >
                          {panelLabel(locale, col.type, "short")}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                      <span className="text-[10px] font-black text-muted">{activeTasks.length} tasks</span>
                      <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => void handleMoveStep(index, "up")}
                          className="inline-flex size-6 items-center justify-center rounded border border-line bg-white text-muted hover:border-ink hover:text-ink disabled:opacity-25"
                          aria-label={labelFor(locale, "Pomeri gore", "Move up")}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === sortedSteps.length - 1}
                          onClick={() => void handleMoveStep(index, "down")}
                          className="inline-flex size-6 items-center justify-center rounded border border-line bg-white text-muted hover:border-ink hover:text-ink disabled:opacity-25"
                          aria-label={labelFor(locale, "Pomeri dole", "Move down")}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteStep(step._id, index)}
                          className="inline-flex size-6 items-center justify-center rounded border border-red-200 bg-red-50 text-red-600 hover:border-red-500"
                          aria-label={labelFor(locale, "Obrisi", "Delete")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
                  </button>
                );
              })}

              {!sortedSteps.length ? (
                <div className="rounded-[8px] border-2 border-dashed border-line bg-paper p-5 text-center">
                  <ListPlus className="mx-auto size-8 text-ink" />
                  <p className="mt-3 text-sm font-black text-muted">
                    {labelFor(locale, "Dodaj prvi korak za ovu lekciju.", "Add the first step for this lesson.")}
                  </p>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    disabled={!hasIds}
                    className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-4 text-sm font-black text-ink"
                  >
                    <Plus className="size-4" />
                    {labelFor(locale, "Dodaj korak", "Add step")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          )}
          {!stepsCollapsed ? (
            <SidebarResizeHandle locale={locale} side="steps" onMouseDown={(event) => startSidebarResize("steps", event)} />
          ) : null}
        </aside>

        <main
          className={cn(
            "min-h-0 overflow-hidden bg-paper",
            mobileTab !== "canvas" && "hidden lg:block",
          )}
        >
          {stepForm ? (
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b-2 border-line bg-white p-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_140px]">
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <label className="block min-w-0">
                      <span className="text-[10px] font-black uppercase text-muted">Title SR</span>
                      <input
                        className={inputClass}
                        value={stepForm.titleSr}
                        onChange={(event) => updateStepForm({ titleSr: event.target.value })}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="text-[10px] font-black uppercase text-muted">Title EN</span>
                      <input
                        className={inputClass}
                        value={stepForm.titleEn}
                        onChange={(event) => updateStepForm({ titleEn: event.target.value })}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[10px] font-black uppercase text-muted">Slug</span>
                    <input
                      className={inputClass}
                      value={stepForm.slug}
                      onChange={(event) => updateStepForm({ slug: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateStepForm({ isPublished: !stepForm.isPublished })}
                    className={cn(
                      "mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border-2 border-ink px-3 text-xs font-black transition xl:mt-4",
                      stepForm.isPublished ? "bg-yellow text-ink" : "bg-paper text-muted",
                    )}
                  >
                    {stepForm.isPublished ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                    {stepForm.isPublished ? labelFor(locale, "Objavljeno", "Published") : labelFor(locale, "Nacrt", "Draft")}
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <div className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-[8px] border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.12)]">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-white px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-muted">
                        {labelFor(locale, "Learner preview canvas", "Learner preview canvas")}
                      </p>
                      <h2 className="truncate text-lg font-black text-ink">
                        {localText(locale, stepForm.titleSr, stepForm.titleEn)}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ToolbarButton onClick={() => setPreset(DEFAULT_LAYOUT)}>
                        <Columns3 className="size-4" />
                        1/3 + 1/3 + 1/3
                      </ToolbarButton>
                      <ToolbarButton
                        onClick={() =>
                          setPreset([
                            { type: "explanation", width: 66.7 },
                            null,
                            { type: "output", width: 33.3 },
                          ])
                        }
                      >
                        2/3 + 1/3
                      </ToolbarButton>
                      <ToolbarButton
                        onClick={() =>
                          setPreset([{ type: "explanation", width: 100 }, null, null])
                        }
                      >
                        3/3
                      </ToolbarButton>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-paper/80 p-3">
                    <div className="grid min-h-full grid-cols-1 gap-3 xl:grid-cols-3 xl:grid-rows-1">
                      {[0, 1, 2].map((slotIndex) => {
                        const col = layout[slotIndex];
                        const covered = occupiedBy(layout, slotIndex);
                        if (!col && covered) return null;
                        if (!col) {
                          return (
                            <CanvasDropZone
                              key={`empty-${slotIndex}`}
                              locale={locale}
                              slotIndex={slotIndex}
                              draggingType={draggingType}
                              onDrop={handlePanelDrop}
                              onAdd={enableSlot}
                            />
                          );
                        }
                        const units = slotUnits(col, slotIndex);
                        return (
                        <EditorPanel
                          key={`${slotIndex}-${col.type}`}
                          locale={locale}
                          col={col}
                          slotIndex={slotIndex}
                          active={selectedSlot === slotIndex}
                          units={units}
                          stepForm={stepForm}
                          tasks={activeTasks}
                          onSelect={() => setSelectedSlot(slotIndex)}
                          onRemove={() => disableSlot(slotIndex)}
                          onSetUnits={(units) => setSelectedUnits(slotIndex, units)}
                          onDrop={(event) => handlePanelDrop(event, slotIndex)}
                          onStepChange={updateStepForm}
                          onAddTask={() => void handleAddTask()}
                          onUpdateTask={(task, fields) => void handleUpdateTask(task, fields)}
                          onDeleteTask={(taskId) => void handleDeleteTask(taskId)}
                          onMoveTask={(taskIndex, direction) => void handleMoveTask(taskIndex, direction)}
                          onAddPrompt={addPrompt}
                          onUpdatePrompt={updatePrompt}
                          onDeletePrompt={deletePrompt}
                        />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-[8px] border-2 border-dashed border-line bg-white p-8 text-center">
                <LayoutDashboard className="mx-auto size-10 text-ink" />
                <h2 className="mt-4 text-xl font-black text-ink">
                  {labelFor(locale, "Nema aktivnog koraka", "No active step")}
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-muted">
                  {labelFor(locale, "Dodaj korak sa leve strane da otvoris canvas.", "Add a step on the left to open the canvas.")}
                </p>
              </div>
            </div>
          )}
        </main>

        <aside
          className={cn(
            "relative min-h-0 border-l-2 border-ink bg-white",
            inspectorCollapsed ? "overflow-hidden" : "overflow-y-auto",
            mobileTab !== "inspector" && "hidden lg:block",
          )}
        >
          {inspectorCollapsed ? (
            <EditorSidebarRail
              locale={locale}
              side="inspector"
              label={labelFor(locale, "Inspector", "Inspector")}
              icon={<Settings2 className="size-4" />}
              onExpand={() => setInspectorCollapsed(false)}
            />
          ) : (
          <>
          <SidebarResizeHandle locale={locale} side="inspector" onMouseDown={(event) => startSidebarResize("inspector", event)} />
          <Inspector
            locale={locale}
            stepForm={stepForm}
            selectedSlot={selectedSlot}
            selectedCol={selectedCol}
            onSelectSlot={setSelectedSlot}
            onEnableSlot={enableSlot}
            onDisableSlot={disableSlot}
            onChangeSlotType={changeSlotType}
            onSetUnits={setSelectedUnits}
            onPreset={setPreset}
            onPanelDragStart={handlePanelDragStart}
            onPanelDragEnd={() => setDraggingType(null)}
            onCollapse={() => setInspectorCollapsed(true)}
            saving={saving}
          />
          </>
          )}
        </aside>
      </div>
    </div>
  );
}

function EditorPanel({
  locale,
  col,
  slotIndex,
  active,
  units,
  stepForm,
  tasks,
  onSelect,
  onRemove,
  onSetUnits,
  onDrop,
  onStepChange,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onAddPrompt,
  onUpdatePrompt,
  onDeletePrompt,
}: {
  locale: Locale;
  col: NonNullable<LayoutColumn>;
  slotIndex: number;
  active: boolean;
  units: WidthUnits;
  stepForm: StepForm;
  tasks: LabTask[];
  onSelect: () => void;
  onRemove: () => void;
  onSetUnits: (units: WidthUnits) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onStepChange: (fields: Partial<StepForm>) => void;
  onAddTask: () => void;
  onUpdateTask: (task: LabTask, fields: Partial<LabTask>) => void;
  onDeleteTask: (taskId: Id<"lessonTasks">) => void;
  onMoveTask: (taskIndex: number, direction: "up" | "down") => void;
  onAddPrompt: () => void;
  onUpdatePrompt: (promptIndex: number, fields: Partial<QuickPrompt>) => void;
  onDeletePrompt: (promptIndex: number) => void;
}) {
  return (
    <section
      onMouseDown={onSelect}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-[8px] border-2 bg-white shadow-[4px_4px_0_0_rgba(14,49,88,0.10)] xl:row-start-1",
        gridStartClass(slotIndex),
        gridSpanClass(units),
        active ? "border-ink outline outline-2 outline-yellow" : "border-line",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink",
              PANEL_META[col.type].tone,
            )}
          >
            <PanelIcon type={col.type} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-black text-ink">{panelLabel(locale, col.type)}</p>
            <p className="text-[11px] font-black uppercase text-muted">
              Slot {slotIndex + 1} / {unitLabel(locale, units)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WidthStepper locale={locale} units={units} onChange={onSetUnits} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-line bg-paper text-muted transition hover:border-red-400 hover:bg-red-50 hover:text-red-600"
            aria-label={labelFor(locale, "Ukloni panel", "Remove panel")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {col.type === "explanation" ? (
          <ExplanationEditor
            locale={locale}
            stepForm={stepForm}
            tasks={tasks}
            onStepChange={onStepChange}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onMoveTask={onMoveTask}
            onAddPrompt={onAddPrompt}
            onUpdatePrompt={onUpdatePrompt}
            onDeletePrompt={onDeletePrompt}
          />
        ) : null}
        {col.type === "chatbot" ? (
          <ChatbotEditor locale={locale} stepForm={stepForm} tasks={tasks} onStepChange={onStepChange} />
        ) : null}
        {col.type === "output" ? (
          <OutputEditor locale={locale} stepForm={stepForm} onStepChange={onStepChange} />
        ) : null}
      </div>
    </section>
  );
}

function ExplanationEditor({
  locale,
  stepForm,
  tasks,
  onStepChange,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onAddPrompt,
  onUpdatePrompt,
  onDeletePrompt,
}: {
  locale: Locale;
  stepForm: StepForm;
  tasks: LabTask[];
  onStepChange: (fields: Partial<StepForm>) => void;
  onAddTask: () => void;
  onUpdateTask: (task: LabTask, fields: Partial<LabTask>) => void;
  onDeleteTask: (taskId: Id<"lessonTasks">) => void;
  onMoveTask: (taskIndex: number, direction: "up" | "down") => void;
  onAddPrompt: () => void;
  onUpdatePrompt: (promptIndex: number, fields: Partial<QuickPrompt>) => void;
  onDeletePrompt: (promptIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionCard title={labelFor(locale, "Tekst objasnjenja", "Explanation copy")} icon={<FileText className="size-4" />}>
        <div className="grid gap-3">
          <label>
            <span className="text-[10px] font-black uppercase text-muted">SR</span>
            <textarea
              className={cn(textareaClass, "mt-1 min-h-36")}
              value={stepForm.bodySr}
              onChange={(event) => onStepChange({ bodySr: event.target.value })}
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase text-muted">EN</span>
            <textarea
              className={cn(textareaClass, "mt-1 min-h-28")}
              value={stepForm.bodyEn}
              onChange={(event) => onStepChange({ bodyEn: event.target.value })}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title={labelFor(locale, "Zadaci / checkpoints", "Tasks / checkpoints")}
        icon={<CheckCircle2 className="size-4" />}
        action={
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[6px] border border-ink bg-white px-2 text-xs font-black text-ink transition hover:bg-yellow"
          >
            <Plus className="size-3.5" />
            {labelFor(locale, "Dodaj", "Add")}
          </button>
        }
      >
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div key={task._id} className="rounded-[8px] border-2 border-line bg-paper p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-xs font-black text-ink">
                  {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMoveTask(index, "up")}
                    className="inline-flex size-7 items-center justify-center rounded border border-line bg-white text-muted hover:border-ink hover:text-ink disabled:opacity-25"
                    aria-label={labelFor(locale, "Pomeri gore", "Move up")}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === tasks.length - 1}
                    onClick={() => onMoveTask(index, "down")}
                    className="inline-flex size-7 items-center justify-center rounded border border-line bg-white text-muted hover:border-ink hover:text-ink disabled:opacity-25"
                    aria-label={labelFor(locale, "Pomeri dole", "Move down")}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task._id)}
                    className="inline-flex size-7 items-center justify-center rounded border border-red-200 bg-red-50 text-red-600 hover:border-red-500"
                    aria-label={labelFor(locale, "Obrisi", "Delete")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label>
                  <span className="text-[10px] font-black uppercase text-muted">Task SR</span>
                  <input
                    className={cn(compactInputClass, "mt-1")}
                    value={task.promptSr}
                    onChange={(event) => onUpdateTask(task, { promptSr: event.target.value })}
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase text-muted">Task EN</span>
                  <input
                    className={cn(compactInputClass, "mt-1")}
                    value={task.promptEn}
                    onChange={(event) => onUpdateTask(task, { promptEn: event.target.value })}
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase text-muted">Hint SR</span>
                  <input
                    className={cn(compactInputClass, "mt-1")}
                    value={task.hintSr ?? ""}
                    onChange={(event) => onUpdateTask(task, { hintSr: event.target.value })}
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase text-muted">Hint EN</span>
                  <input
                    className={cn(compactInputClass, "mt-1")}
                    value={task.hintEn ?? ""}
                    onChange={(event) => onUpdateTask(task, { hintEn: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <label className="inline-flex items-center gap-2 text-xs font-black text-ink">
                  <input
                    type="checkbox"
                    checked={task.required}
                    onChange={(event) => onUpdateTask(task, { required: event.target.checked })}
                  />
                  {labelFor(locale, "Obavezan", "Required")}
                </label>
                <select
                  className="h-8 rounded-[6px] border border-ink bg-white px-2 text-xs font-black text-ink"
                  value={task.completionMode}
                  onChange={(event) => onUpdateTask(task, { completionMode: event.target.value as CompletionMode })}
                >
                  <option value="manual">manual</option>
                  <option value="hybrid">hybrid</option>
                  <option value="automatic">automatic</option>
                </select>
              </div>
            </div>
          ))}

          {!tasks.length ? (
            <div className="rounded-[8px] border-2 border-dashed border-line bg-white p-4 text-center text-sm font-black text-muted">
              {labelFor(locale, "Nema zadataka u ovom koraku.", "No tasks in this step.")}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={labelFor(locale, "Brzi promptovi", "Quick prompts")}
        icon={<Sparkles className="size-4" />}
        action={
          <button
            type="button"
            onClick={onAddPrompt}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[6px] border border-ink bg-white px-2 text-xs font-black text-ink transition hover:bg-yellow"
          >
            <Plus className="size-3.5" />
            {labelFor(locale, "Dodaj", "Add")}
          </button>
        }
      >
        <div className="space-y-3">
          {stepForm.prompts.map((prompt, index) => (
            <div key={`prompt-${index}`} className="rounded-[8px] border-2 border-line bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-muted">
                  <Clipboard className="size-3.5" />
                  Prompt {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onDeletePrompt(index)}
                  className="inline-flex size-7 items-center justify-center rounded border border-red-200 bg-red-50 text-red-600 hover:border-red-500"
                  aria-label={labelFor(locale, "Obrisi prompt", "Delete prompt")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <input
                  className={compactInputClass}
                  value={prompt.labelSr}
                  onChange={(event) => onUpdatePrompt(index, { labelSr: event.target.value })}
                  placeholder="Label SR"
                />
                <input
                  className={compactInputClass}
                  value={prompt.labelEn}
                  onChange={(event) => onUpdatePrompt(index, { labelEn: event.target.value })}
                  placeholder="Label EN"
                />
              </div>
              <textarea
                className={cn(textareaClass, "mt-2 min-h-20 text-xs")}
                value={prompt.content}
                onChange={(event) => onUpdatePrompt(index, { content: event.target.value })}
              />
            </div>
          ))}

          {!stepForm.prompts.length ? (
            <div className="rounded-[8px] border-2 border-dashed border-line bg-white p-4 text-center text-sm font-black text-muted">
              {labelFor(locale, "Nema brzih promptova.", "No quick prompts.")}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function ChatbotEditor({
  locale,
  stepForm,
  tasks,
  onStepChange,
}: {
  locale: Locale;
  stepForm: StepForm;
  tasks: LabTask[];
  onStepChange: (fields: Partial<StepForm>) => void;
}) {
  const firstTask = tasks[0];
  return (
    <div className="space-y-4">
      <SectionCard title={labelFor(locale, "AI instrukcije", "AI instructions")} icon={<Bot className="size-4" />}>
        <p className="mb-3 text-xs font-bold leading-5 text-muted">
          {labelFor(
            locale,
            "Ovo su posebna pravila chatbota za ovaj korak. Korisnicki UI ostaje isti, ali AI cita ove instrukcije.",
            "These are the chatbot rules for this step. The student UI stays the same, but AI reads these instructions.",
          )}
        </p>
        <textarea
          className={cn(textareaClass, "min-h-64 font-mono text-xs")}
          value={stepForm.systemInstruction}
          onChange={(event) => onStepChange({ systemInstruction: event.target.value })}
          placeholder={labelFor(
            locale,
            "Npr. Vodi studenta kroz zadatak, ne daj finalno resenje odmah...",
            "Example: Guide the student through the task, do not give the final answer immediately...",
          )}
        />
      </SectionCard>

      <SectionCard title={labelFor(locale, "Chat preview", "Chat preview")} icon={<MessageSquareText className="size-4" />}>
        <div className="space-y-3">
          <div className="rounded-[8px] border-2 border-line bg-paper p-3">
            <p className="text-[10px] font-black uppercase text-muted">
              {labelFor(locale, "Trenutni zadatak", "Current task")}
            </p>
            <p className="mt-1 text-sm font-bold leading-6 text-ink">
              {firstTask ? localText(locale, firstTask.promptSr, firstTask.promptEn) : labelFor(locale, "Nema zadatka.", "No task.")}
            </p>
          </div>
          <div className="rounded-[8px] border-2 border-ink bg-white p-3">
            <p className="text-[10px] font-black uppercase text-muted">AI</p>
            <p className="mt-1 text-sm font-bold leading-6 text-ink">
              {labelFor(
                locale,
                "Spreman sam. Posalji pitanje za ovaj korak i vodicu te kroz rad.",
                "Ready. Send a question for this step and I will guide you through the work.",
              )}
            </p>
          </div>
          <div className="ml-auto max-w-[88%] rounded-[8px] border-2 border-ink bg-yellow p-3">
            <p className="text-[10px] font-black uppercase text-muted">{labelFor(locale, "Student", "Student")}</p>
            <p className="mt-1 text-sm font-bold leading-6 text-ink">
              {labelFor(locale, "Kako da pocnem?", "How do I start?")}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function OutputEditor({
  locale,
  stepForm,
  onStepChange,
}: {
  locale: Locale;
  stepForm: StepForm;
  onStepChange: (fields: Partial<StepForm>) => void;
}) {
  const selected = outputOptions.find((option) => option.value === stepForm.outputKind) ?? outputOptions[0];
  return (
    <div className="space-y-4">
      <SectionCard title={labelFor(locale, "Output format", "Output format")} icon={<Save className="size-4" />}>
        <div className="grid gap-2">
          {outputOptions.map((option) => {
            const active = stepForm.outputKind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onStepChange({ outputKind: option.value })}
                className={cn(
                  "flex min-h-11 items-center justify-between rounded-[8px] border-2 px-3 text-left text-sm font-black transition",
                  active ? "border-ink bg-yellow text-ink" : "border-line bg-white text-muted hover:border-ink hover:text-ink",
                )}
              >
                {labelFor(locale, option.sr, option.en)}
                {active ? <Check className="size-4" /> : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={labelFor(locale, "Output preview", "Output preview")} icon={<Wand2 className="size-4" />}>
        <div className="rounded-[8px] border-2 border-dashed border-line bg-paper p-5 text-center">
          <Save className="mx-auto size-8 text-ink" />
          <p className="mt-3 text-sm font-black text-ink">
            {labelFor(locale, selected.sr, selected.en)} {labelFor(locale, "output", "output")}
          </p>
          <p className="mt-2 text-xs font-bold leading-5 text-muted">
            {labelFor(
              locale,
              "Korisnik ce ovde videti sacuvane rezultate iz AI chata ili upload.",
              "The student will see saved AI chat results or uploads here.",
            )}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function Inspector({
  locale,
  stepForm,
  selectedSlot,
  selectedCol,
  onSelectSlot,
  onEnableSlot,
  onDisableSlot,
  onChangeSlotType,
  onSetUnits,
  onPreset,
  onPanelDragStart,
  onPanelDragEnd,
  onCollapse,
  saving,
}: {
  locale: Locale;
  stepForm: StepForm | null;
  selectedSlot: number;
  selectedCol: LayoutColumn;
  onSelectSlot: (slotIndex: number) => void;
  onEnableSlot: (slotIndex: number, type: ColumnType) => void;
  onDisableSlot: (slotIndex: number) => void;
  onChangeSlotType: (slotIndex: number, type: ColumnType) => void;
  onSetUnits: (slotIndex: number, units: WidthUnits) => void;
  onPreset: (layout: StepLayout) => void;
  onPanelDragStart: (event: DragEvent<HTMLElement>, type: ColumnType) => void;
  onPanelDragEnd: () => void;
  onCollapse: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase text-muted">{labelFor(locale, "Editor", "Editor")}</p>
          <h2 className="truncate text-2xl font-black text-ink">{labelFor(locale, "Paneli stepa", "Step panels")}</h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-line bg-paper text-muted transition hover:border-ink hover:bg-yellow hover:text-ink"
          aria-label={labelFor(locale, "Skupi inspector", "Collapse inspector")}
          title={labelFor(locale, "Skupi inspector", "Collapse inspector")}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <section className="rounded-[8px] border-2 border-ink bg-ink p-4 text-white shadow-[5px_5px_0_0_#f4be30]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase text-white/60">{labelFor(locale, "Aktivan korak", "Active step")}</p>
            <p className="mt-1 text-lg font-black leading-tight">
              {stepForm ? localText(locale, stepForm.titleSr, stepForm.titleEn) : labelFor(locale, "Nema koraka", "No step")}
            </p>
          </div>
          {saving ? <Loader2 className="size-5 animate-spin text-yellow" /> : <CheckCircle2 className="size-5 text-yellow" />}
        </div>
      </section>

      {stepForm ? (
        <>
          <SectionCard title={labelFor(locale, "Delovi", "Blocks")} icon={<Sparkles className="size-4" />}>
            <PanelPalette
              locale={locale}
              onDragStart={onPanelDragStart}
              onDragEnd={onPanelDragEnd}
              onClick={(type) => {
                if (selectedCol) {
                  onChangeSlotType(selectedSlot, type);
                } else {
                  onEnableSlot(selectedSlot, type);
                }
              }}
            />
          </SectionCard>

          <SectionCard title={labelFor(locale, "Trecine ekrana", "Screen thirds")} icon={<LayoutDashboard className="size-4" />}>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((slotIndex) => {
                const col = stepForm.layout[slotIndex];
                const occupant = col ? null : occupiedBy(stepForm.layout, slotIndex);
                const targetSlot = col ? slotIndex : (occupant?.slotIndex ?? slotIndex);
                const active = selectedSlot === targetSlot;
                return (
                  <button
                    key={`slot-${slotIndex}`}
                    type="button"
                    onClick={() => onSelectSlot(targetSlot)}
                    className={cn(
                      "min-h-20 rounded-[8px] border-2 p-2 text-center text-[10px] font-black uppercase transition",
                      active ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted hover:border-ink",
                    )}
                  >
                    <span className="block">{slotIndex + 1}/3</span>
                    <span className="mt-2 block normal-case leading-tight">
                      {col
                        ? panelLabel(locale, col.type, "short")
                        : occupant
                          ? panelLabel(locale, occupant.col.type, "short")
                          : labelFor(locale, "Prazno", "Empty")}
                    </span>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {selectedCol ? (
            <SectionCard title={panelLabel(locale, selectedCol.type)} icon={<Settings2 className="size-4" />}>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted">{labelFor(locale, "Tip panela", "Panel type")}</span>
                  <select
                    className={cn(inputClass, "mt-1")}
                    value={selectedCol.type}
                    onChange={(event) => onChangeSlotType(selectedSlot, event.target.value as ColumnType)}
                  >
                    <option value="explanation">{panelLabel(locale, "explanation")}</option>
                    <option value="chatbot">{panelLabel(locale, "chatbot")}</option>
                    <option value="output">{panelLabel(locale, "output")}</option>
                  </select>
                </label>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase text-muted">{labelFor(locale, "Sirina", "Width")}</p>
                  <WidthStepper
                    locale={locale}
                    units={slotUnits(selectedCol, selectedSlot)}
                    onChange={(units) => onSetUnits(selectedSlot, units)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onDisableSlot(selectedSlot)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-red-300 bg-red-50 px-3 text-sm font-black text-red-700 hover:border-red-500"
                >
                  <Trash2 className="size-4" />
                  {labelFor(locale, "Ukloni panel", "Remove panel")}
                </button>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title={labelFor(locale, "Prazna trecina", "Empty third")} icon={<Plus className="size-4" />}>
              <PanelPalette
                locale={locale}
                onDragStart={onPanelDragStart}
                onDragEnd={onPanelDragEnd}
                onClick={(type) => onEnableSlot(selectedSlot, type)}
              />
            </SectionCard>
          )}

          <SectionCard title={labelFor(locale, "Brzi rasporedi", "Quick layouts")} icon={<Columns3 className="size-4" />}>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => onPreset(DEFAULT_LAYOUT)}
                className="rounded-[8px] border-2 border-line bg-white p-3 text-left text-xs font-black text-ink hover:border-ink hover:bg-yellow"
              >
                {labelFor(locale, "Tri dela po 1/3", "Three 1/3 blocks")}
              </button>
              <button
                type="button"
                onClick={() =>
                  onPreset([
                    { type: "explanation", width: 66.7 },
                    null,
                    { type: "output", width: 33.3 },
                  ])
                }
                className="rounded-[8px] border-2 border-line bg-white p-3 text-left text-xs font-black text-ink hover:border-ink hover:bg-yellow"
              >
                {labelFor(locale, "Objasnjenje 2/3 + output 1/3", "Explanation 2/3 + output 1/3")}
              </button>
              <button
                type="button"
                onClick={() =>
                  onPreset([
                    { type: "explanation", width: 33.3 },
                    { type: "chatbot", width: 66.7 },
                    null,
                  ])
                }
                className="rounded-[8px] border-2 border-line bg-white p-3 text-left text-xs font-black text-ink hover:border-ink hover:bg-yellow"
              >
                {labelFor(locale, "Objasnjenje 1/3 + chatbot 2/3", "Explanation 1/3 + chatbot 2/3")}
              </button>
              <button
                type="button"
                onClick={() => onPreset([{ type: "explanation", width: 100 }, null, null])}
                className="rounded-[8px] border-2 border-line bg-white p-3 text-left text-xs font-black text-ink hover:border-ink hover:bg-yellow"
              >
                {labelFor(locale, "Jedan deo preko celog ekrana", "One full-width block")}
              </button>
              </div>
          </SectionCard>
        </>
      ) : (
        <div className="rounded-[8px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
          {labelFor(locale, "Izaberi ili dodaj korak.", "Select or add a step.")}
        </div>
      )}
    </div>
  );
}
