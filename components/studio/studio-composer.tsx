"use client";

import {
  ChevronDown,
  ChevronUp,
  Coins,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Music,
  Plus,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Easing } from "motion/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { CreditIcon } from "@/components/studio/credit-icon";
import { FullScreenDropOverlay, Preview } from "@/components/studio/drop-slot";
import { ModelPickerPanel } from "@/components/studio/model-picker";
import { ParamControl } from "@/components/studio/param-control";
import { useParamValues, type ParamFormState } from "@/components/studio/param-form";
import { ModelMark } from "@/components/studio/provider-mark";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { parseContinuationSource, parseQuantitySource, promptControlOf } from "@/convex/studioJobCore";
import type { ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import { firstFileMode, modelInputCapabilities, modelRestrictions } from "@/lib/studio-capabilities";
import { readLastModelByKind, writeLastModel } from "@/lib/studio-last-model";
import {
  generateBlockMessage,
  measuredDurationNotice,
  measureFailureMessage,
  missingRegenerateInputsNotice,
  studioErrorMessage,
  uploadErrorMessage,
} from "@/lib/studio-messages";
import {
  defaultCredits,
  modelLabel,
  type StudioModel,
} from "@/lib/studio-models";
import { getStudioMotion, studioMotionTokens } from "@/lib/studio-motion";
import {
  controlLabel,
  creditsFor,
  formatCreditsLong,
  optionLabel,
  paramValuesForMode,
  visibleControls,
  type ParamValue,
  type ParamValues,
} from "@/lib/studio-params";
import {
  generateBlock,
  inputsPayload,
  measuredFile,
  measuredParams,
  measureMismatch,
  optionalSlots,
  promptRequired,
  type PlaygroundState,
} from "@/lib/studio-playground";
import {
  framePairFiles,
  FRAME_LABELS,
  measuredExtraCounts,
  missingInput,
  missingInputMessage,
  pruneFilesForMode,
  slotKind,
  slotLabel,
  slotsForMode,
  validateSlotFile,
  type FramePair,
  type SlotFile,
  type SlotFiles,
  type SlotSpec,
} from "@/lib/studio-slots";

export type RegenerateSeed = {
  id: string;
  inputMode?: string;
  params?: ParamValues;
  files?: SlotFiles;
  prompt?: string;
  missingSlots?: string[];
};

export type JobPayload = {
  params: Record<string, unknown>;
  inputMode: string;
  inputs: Record<string, string[]>;
  sourceJobId?: Id<"generationJobs">;
};

/**
 * Pomoćna kuka za merenje trajanja okačenog medija u pregledaču radi poređenja sa serverom.
 */
function useMediaSeconds(file: SlotFile | null): number | null {
  const [measured, setMeasured] = useState<{ url: string; seconds: number } | null>(null);
  const url = file?.url ?? null;
  const isVideo = file?.mime.startsWith("video/") ?? false;

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const element = document.createElement(isVideo ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      if (!cancelled && Number.isFinite(element.duration)) {
        setMeasured({ url, seconds: element.duration });
      }
    };
    element.src = url;

    return () => {
      cancelled = true;
      element.removeAttribute("src");
    };
  }, [url, isVideo]);

  return measured !== null && measured.url === url ? measured.seconds : null;
}

/**
 * Mali lebdeći popup za uvoz fajlova sa 4 opcije (Slika, Video, Zvuk, Fajl).
 * U zavisnosti od aktivnog modela, nepodržane opcije su onemogućene.
 */
function AttachFilePopup({
  model,
  onSelectType,
  locale,
  disabled,
}: {
  model: StudioModel;
  onSelectType: (type: "image" | "video" | "audio" | "file") => void;
  locale: Locale;
  disabled?: boolean;
}) {
  const caps = modelInputCapabilities(model);
  const acceptsImage = caps.image !== null || caps.firstLast || (caps.reference?.images ?? 0) > 0;
  const acceptsVideo = caps.video === "upload" || (caps.reference?.videos ?? 0) > 0;
  const acceptsAudio = caps.audio || (caps.reference?.audio ?? 0) > 0;
  const acceptsFile = firstFileMode(model) !== null;

  const options: Array<{
    type: "image" | "video" | "audio" | "file";
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
  }> = [
    {
      type: "image",
      label: locale === "sr" ? "Slika" : "Image",
      icon: ImageIcon,
      enabled: acceptsImage,
    },
    {
      type: "video",
      label: locale === "sr" ? "Video" : "Video",
      icon: Video,
      enabled: acceptsVideo,
    },
    {
      type: "audio",
      label: locale === "sr" ? "Zvuk" : "Audio",
      icon: Music,
      enabled: acceptsAudio,
    },
    {
      type: "file",
      label: locale === "sr" ? "Fajl" : "File",
      icon: FileText,
      enabled: acceptsFile,
    },
  ];

  return (
    <motion.div
      role="dialog"
      aria-label={locale === "sr" ? "Priloži fajl" : "Attach file"}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      className="surface-card absolute bottom-[calc(100%+12px)] left-0 z-50 w-44 border-2 border-ink bg-paper-strong p-1.5 shadow-[6px_6px_0_0_var(--shadow-hard-16)]"
    >
      <div className="flex flex-col gap-1">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              type="button"
              disabled={disabled || !opt.enabled}
              onClick={() => onSelectType(opt.type)}
              className={cn(
                "flex w-full items-center gap-3 surface-inset px-3 py-2 text-xs font-black text-left transition",
                opt.enabled
                  ? "text-ink hover:bg-yellow/25 hover:translate-x-0.5 active:translate-x-0 cursor-pointer"
                  : "text-muted/40 cursor-not-allowed opacity-40",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/**
 * Mali lebdeći popup sa tačno jednom kontrolom za promovisani čip na baru composera.
 */
function ChipControlPopup({
  control,
  value,
  onChange,
  locale,
  rule,
  params,
  inputMode,
  disabled,
  triggerRef,
}: {
  control: ParamControlSpec;
  value: ParamValue;
  onChange: (next: ParamValue) => void;
  locale: Locale;
  rule: PriceRule;
  params: Record<string, unknown>;
  inputMode?: string;
  disabled?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const motionParams = getStudioMotion(Boolean(shouldReduceMotion));
  const popupRef = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState(0);

  useEffect(() => {
    function updatePosition() {
      const popup = popupRef.current;
      if (!popup) return;

      const popupRect = popup.getBoundingClientRect();
      const padding = 12;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;

      const originalLeft = popupRect.left - shiftX;
      const originalRight = originalLeft + popupRect.width;

      let shift = 0;
      if (originalRight > viewportWidth - padding) {
        shift = Math.round(viewportWidth - padding - originalRight);
      } else if (originalLeft < padding) {
        shift = Math.round(padding - originalLeft);
      }

      setShiftX(shift);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [triggerRef, shiftX]);

  return (
    <motion.div
      ref={popupRef}
      role="dialog"
      aria-modal="false"
      aria-label={controlLabel(control, locale)}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: shiftX }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
      transition={{
        duration: motionParams.element.enter.duration,
        ease: motionParams.element.enter.ease as Easing,
      }}
      className="surface-card absolute bottom-[calc(100%+12px)] left-0 z-50 w-[280px] max-w-[calc(100vw-24px)] border-2 border-ink bg-paper-strong p-3.5 shadow-[6px_6px_0_0_var(--shadow-hard-16)]"
    >
      <ParamControl
        control={control}
        value={value}
        onChange={onChange}
        locale={locale}
        rule={rule}
        params={params}
        inputMode={inputMode}
        disabled={disabled}
      />
    </motion.div>
  );
}

/**
 * Jedan promovisani čip na baru composera koji nosi sopstveno dugme i popup.
 */
function PromotedChipItem({
  chip,
  isOpen,
  onToggle,
  onRegisterButton,
  onRegisterContainer,
  form,
  activeModel,
  inputMode,
  locale,
  disabled,
}: {
  chip: {
    key: string;
    label: string;
    valueText: string;
    control: ParamControlSpec;
  };
  isOpen: boolean;
  onToggle: () => void;
  onRegisterButton: (el: HTMLButtonElement | null) => void;
  onRegisterContainer: (el: HTMLDivElement | null) => void;
  form: ParamFormState;
  activeModel: StudioModel;
  inputMode: string;
  locale: Locale;
  disabled: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const setButtonRef = useCallback(
    (el: HTMLButtonElement | null) => {
      buttonRef.current = el;
      onRegisterButton(el);
    },
    [onRegisterButton],
  );

  return (
    <div ref={onRegisterContainer} className="relative inline-flex">
      <button
        ref={setButtonRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={chip.label}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          isOpen
            ? "bg-ink text-paper-strong shadow-[2px_2px_0_0_var(--shadow-hard)]"
            : "bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)]",
        )}
      >
        <span>{chip.valueText}</span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <ChipControlPopup
            control={chip.control}
            value={form.values[chip.control.key] ?? chip.control.default}
            onChange={(next) => form.setValue(chip.control.key, next)}
            locale={locale}
            rule={activeModel.priceRule}
            params={form.params}
            inputMode={inputMode}
            disabled={disabled}
            triggerRef={buttonRef}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Glavni dvoslojni composer sa zasebnim pop-upovima za upload, biranje modela i parametre.
 */
export function StudioComposer({
  models,
  activeModel,
  onSelectModel,
  locale,
  studioState,
  balance,
  topUpHref,
  seed,
  starterPrompt,
  isPending,
  error,
  variant = "create",
  onGenerate,
  isCollapsed = false,
  onToggleCollapse,
}: {
  models: StudioModel[];
  activeModel: StudioModel;
  onSelectModel: (model: StudioModel) => void;
  locale: Locale;
  studioState: PlaygroundState | undefined;
  balance: number | undefined;
  topUpHref: string;
  seed: RegenerateSeed | null;
  starterPrompt?: string | null;
  isPending: boolean;
  error: string | null;
  variant?: "create" | "edit";
  onGenerate: (payload: JobPayload) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [attachPopupOpen, setAttachPopupOpen] = useState(false);
  const [openChipKey, setOpenChipKey] = useState<string | null>(null);
  const [, setLastByKind] = useState(() => readLastModelByKind());
  const [prompt, setPrompt] = useState(() => starterPrompt ?? seed?.prompt ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPriceFlashing, setIsPriceFlashing] = useState(false);
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(() => new Set());
  const isUploading = uploadingKeys.size > 0;
  const handleUploadingChange = useCallback((key: string, uploading: boolean) => {
    setUploadingKeys((prev) => {
      if (uploading === prev.has(key)) return prev;
      const next = new Set(prev);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const [, setRecentSlugs] = useState<string[]>(() => [activeModel.slug]);

  // Sinhronizacija starterPrompt / seed tokom rendera
  const [prevStarterPrompt, setPrevStarterPrompt] = useState(starterPrompt);
  const [prevSeedId, setPrevSeedId] = useState(seed?.id);

  if (starterPrompt !== prevStarterPrompt) {
    setPrevStarterPrompt(starterPrompt);
    if (starterPrompt !== null && starterPrompt !== undefined) {
      setPrompt(starterPrompt);
    }
  }

  if (seed?.id !== prevSeedId) {
    setPrevSeedId(seed?.id);
    if (seed?.prompt !== undefined) {
      setPrompt(seed.prompt);
    }
  }

  // Sinhronizacija sklopljenog stanja
  const [prevIsCollapsed, setPrevIsCollapsed] = useState(isCollapsed);
  if (isCollapsed !== prevIsCollapsed) {
    setPrevIsCollapsed(isCollapsed);
    if (isCollapsed) {
      if (modelPickerOpen) setModelPickerOpen(false);
      if (attachPopupOpen) setAttachPopupOpen(false);
      if (openChipKey !== null) setOpenChipKey(null);
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const modelChipRef = useRef<HTMLButtonElement>(null);
  const attachContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chipButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chipContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Stanje ulaznog režima i fajlova
  const [inputMode, setInputMode] = useState<string>(() => seed?.inputMode ?? activeModel.inputModes[0] ?? "text");
  const [files, setFiles] = useState<SlotFiles>(() => seed?.files ?? {});
  const [frames, setFrames] = useState<FramePair>(() => ({
    first: seed?.files?.image?.[0] ?? null,
    last: seed?.files?.image?.[1] ?? null,
  }));
  const [sourceJobId] = useState<Id<"generationJobs"> | null>(null);

  // Spajanje first_last okvira u slot `image`
  const effectiveFiles: SlotFiles = useMemo(
    () => (inputMode === "first_last" ? { ...files, image: framePairFiles(frames) } : files),
    [inputMode, files, frames],
  );

  // Praćenje merene količine i parametara
  const quantitySource = useMemo(() => parseQuantitySource(JSON.stringify(activeModel.capabilities)), [activeModel]);
  const measureTarget = useMemo(
    () => (quantitySource ? measuredFile(quantitySource, activeModel.inputSpec, inputMode, effectiveFiles) : null),
    [quantitySource, activeModel.inputSpec, inputMode, effectiveFiles],
  );
  const browserSeconds = useMediaSeconds(measureTarget);
  const serverSeconds = measureTarget?.measuredSeconds ?? null;

  const promptControl = useMemo(() => promptControlOf(activeModel.paramSpec, inputMode), [activeModel, inputMode]);
  const textValueKey = quantitySource?.measuredFrom ?? promptControl?.key;
  const [textLength, setTextLength] = useState(0);

  const initialValues = useMemo(() => {
    const values: ParamValues = { ...(seed?.params ?? {}) };
    if (seed?.prompt !== undefined && promptControl) values[promptControl.key] = seed.prompt;
    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const measured = useMemo(
    () => measuredParams(quantitySource, serverSeconds, textLength),
    [quantitySource, serverSeconds, textLength],
  );
  const extras = useMemo(
    () => measuredExtraCounts(activeModel.priceRule, effectiveFiles),
    [activeModel.priceRule, effectiveFiles],
  );

  const form = useParamValues(activeModel.paramSpec, inputMode, { ...measured, ...extras }, initialValues);

  // Sinhronizacija prompt teksta sa form parametrima
  useEffect(() => {
    if (promptControl && prompt && form.values[promptControl.key] !== prompt) {
      form.setValue(promptControl.key, prompt);
    }
  }, [prompt, promptControl, form]);

  const formPromptValue = promptControl ? form.values[promptControl.key] : undefined;
  const [prevFormPromptValue, setPrevFormPromptValue] = useState(formPromptValue);
  if (formPromptValue !== prevFormPromptValue) {
    setPrevFormPromptValue(formPromptValue);
    if (typeof formPromptValue === "string" && formPromptValue !== prompt) {
      setPrompt(formPromptValue);
    }
  }

  const currentText = textValueKey ? form.values[textValueKey] ?? prompt : prompt;
  const currentTextLength = typeof currentText === "string" ? currentText.length : 0;
  if (currentTextLength !== textLength) setTextLength(currentTextLength);

  const optional = useMemo(
    () => optionalSlots(activeModel.paramSpec, form.values, activeModel.inputSpec, inputMode),
    [activeModel.paramSpec, form.values, activeModel.inputSpec, inputMode],
  );

  const payloadFiles = useMemo(() => {
    if (optional.length === 0) return effectiveFiles;
    const next: SlotFiles = {};
    for (const [slot, list] of Object.entries(effectiveFiles)) {
      if (!optional.includes(slot)) next[slot] = list;
    }
    return next;
  }, [effectiveFiles, optional]);

  const modelAcceptsFiles = useMemo(
    () => activeModel.inputModes.some((mode) => slotsForMode(activeModel.inputSpec, mode).length > 0),
    [activeModel.inputModes, activeModel.inputSpec],
  );

  function switchMode(mode: string) {
    setOpenChipKey(null);
    if (mode === inputMode || !activeModel.inputModes.includes(mode)) return;
    const pruned = pruneFilesForMode(files, activeModel.inputSpec, mode);
    if (pruned.removed.length > 0) {
      setFiles(pruned.files);
      const names = pruned.removed.map((slot) => slotLabel(slot, locale).toLowerCase()).join(", ");
      setStatusMessage(
        locale === "sr"
          ? `Ovaj režim ne koristi: ${names}. Sklonjeno je iz forme.`
          : `This mode does not use: ${names}. It was removed from the form.`,
      );
      setTimeout(() => setStatusMessage(null), 4500);
    }
    setInputMode(mode);
  }

  // Priloženi fajlovi se vide u gornjem delu polja za unos (Slika 3)
  const attachedInputs = useMemo(() => {
    type Attachment = { key: string; label: string; file: SlotFile; remove: () => void };
    const list: Attachment[] = [];
    if (inputMode === "first_last") {
      if (frames.first) {
        const file = frames.first;
        list.push({
          key: "first",
          label: FRAME_LABELS.first[locale],
          file,
          remove: () => {
            if (file.url) URL.revokeObjectURL(file.url);
            setFrames((prev) => ({ ...prev, first: null }));
          },
        });
      }
      if (frames.last) {
        const file = frames.last;
        list.push({
          key: "last",
          label: FRAME_LABELS.last[locale],
          file,
          remove: () => {
            if (file.url) URL.revokeObjectURL(file.url);
            setFrames((prev) => ({ ...prev, last: null }));
          },
        });
      }
      return list;
    }
    for (const [slotKey, slotFileList] of Object.entries(files)) {
      if (!slotFileList || slotFileList.length === 0) continue;
      slotFileList.forEach((file, index) => {
        list.push({
          key: `${slotKey}:${index}`,
          label: slotFileList.length > 1 ? `${index + 1}` : "",
          file,
          remove: () => {
            if (file.url) URL.revokeObjectURL(file.url);
            setFiles((prev) => {
              const currentList = prev[slotKey] ?? [];
              const updated = currentList.filter((_, position) => position !== index);
              const nextFiles = { ...prev, [slotKey]: updated };
              if (updated.length === 0) {
                delete nextFiles[slotKey];
                const totalRemaining = Object.values(nextFiles).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
                if (totalRemaining === 0 && activeModel.inputModes[0]) {
                  setInputMode(activeModel.inputModes[0]);
                }
              }
              return nextFiles;
            });
          },
        });
      });
    }
    return list;
  }, [inputMode, frames, files, locale, activeModel.inputModes]);

  const missing = useMemo(
    () =>
      missingInput(
        activeModel.inputSpec,
        inputMode,
        effectiveFiles,
        optional,
        inputMode === "first_last" ? frames : undefined,
      ),
    [activeModel.inputSpec, inputMode, effectiveFiles, optional, frames],
  );

  const credits = useMemo(
    () => creditsFor(activeModel.priceRule, form.params, inputMode),
    [activeModel.priceRule, form.params, inputMode],
  );

  const continuation = useMemo(() => parseContinuationSource(JSON.stringify(activeModel.capabilities)), [activeModel]);
  const sourceRequired = continuation !== null && continuation.mode === inputMode;

  const isPromptNeeded = promptRequired(activeModel.inputSpec, inputMode);
  const promptMissing = isPromptNeeded && prompt.trim().length === 0;

  const block = useMemo(
    () =>
      generateBlock({
        state: studioState,
        balance,
        credits,
        missingInputMessage: missingInputMessage(missing, locale),
        promptMissing,
        quantityMissing: quantitySource !== null && measured[quantitySource.param] === undefined,
        sourceMissing: sourceRequired && sourceJobId === null,
        uploading: isUploading,
      }),
    [studioState, balance, credits, missing, locale, promptMissing, quantitySource, measured, sourceRequired, sourceJobId, isUploading],
  );

  // Automatsko prilagođavanje visine textarea polja
  function autoResizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    if (promptControl) {
      form.setValue(promptControl.key, value);
    }
    autoResizeTextarea();
  }

  // Flash animacija pri promeni cene
  const prevCreditsRef = useRef(credits);
  useEffect(() => {
    if (prevCreditsRef.current !== credits && credits !== null) {
      prevCreditsRef.current = credits;
      setIsPriceFlashing(true);
      const timer = setTimeout(
        () => setIsPriceFlashing(false),
        Math.round((studioMotionTokens.mikro.enterDuration + studioMotionTokens.mikro.exitDuration) * 1000),
      );
      return () => clearTimeout(timer);
    }
  }, [credits]);

  // Carry-Forward: promena modela
  function handleSelectNewModel(newModel: StudioModel) {
    writeLastModel(newModel.kind, newModel.slug);
    setLastByKind((prev) => ({ ...prev, [newModel.kind]: newModel.slug }));
    setModelPickerOpen(false);
    setOpenChipKey(null);
    setAttachPopupOpen(false);

    if (newModel.slug === activeModel.slug) return;

    setUploadingKeys(new Set());
    setRecentSlugs((prev) => [newModel.slug, ...prev.filter((s) => s !== newModel.slug)].slice(0, 5));
    onSelectModel(newModel);

    // Prilagodi ulazni režim
    const nextMode = newModel.inputModes.includes(inputMode) ? inputMode : (newModel.inputModes[0] ?? "text");
    setInputMode(nextMode);

    // Proveri da li su parametri prilagođeni
    const newValues = paramValuesForMode(newModel.paramSpec, nextMode, form.values);
    let hadAdjustment = false;
    for (const key of Object.keys(form.values)) {
      if (form.values[key] !== undefined && newValues[key] !== form.values[key]) {
        hadAdjustment = true;
        break;
      }
    }

    if (hadAdjustment) {
      setStatusMessage(
        locale === "sr"
          ? "Prilagođeno na granice novog modela. Prompt i podešavanja sačuvani."
          : "Adjusted to the new model's limits. Prompt and settings kept.",
      );
      setTimeout(() => setStatusMessage(null), 4500);
    } else if (studioState?.providerStatus?.[newModel.provider] === false) {
      setStatusMessage(
        locale === "sr"
          ? "Ovaj model radi u DEMO režimu - izlaz je probni, ne pravi."
          : "This model runs in DEMO mode - the output is a sample, not real.",
      );
      setTimeout(() => setStatusMessage(null), 4500);
    }
  }

  // Tastaturni prečaci za zatvaranje (Esc)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openChipKey !== null) {
        const keyToFocus = openChipKey;
        setOpenChipKey(null);
        chipButtonRefs.current[keyToFocus]?.focus();
      } else if (attachPopupOpen) {
        setAttachPopupOpen(false);
      } else if (modelPickerOpen) {
        setModelPickerOpen(false);
        modelChipRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openChipKey, attachPopupOpen, modelPickerOpen]);

  function handleToggleCollapse() {
    if (!isCollapsed) {
      setModelPickerOpen(false);
      setAttachPopupOpen(false);
      setOpenChipKey(null);
    }
    onToggleCollapse?.();
  }

  const shouldReduceMotion = useReducedMotion();
  const motionParams = useMemo(() => getStudioMotion(Boolean(shouldReduceMotion)), [shouldReduceMotion]);
  const collapseTransition = useMemo(() => {
    return isCollapsed
      ? {
          duration: motionParams.prelaz.exit.duration,
          ease: motionParams.prelaz.exit.ease as Easing,
        }
      : {
          duration: motionParams.prelaz.enter.duration,
          ease: motionParams.prelaz.enter.ease as Easing,
        };
  }, [isCollapsed, motionParams]);

  // Klik van composera zatvara sve pop-upove
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (!composerRef.current?.contains(target)) {
        setModelPickerOpen(false);
        setAttachPopupOpen(false);
        setOpenChipKey(null);
        return;
      }
      if (openChipKey !== null) {
        const chipContainer = chipContainerRefs.current[openChipKey];
        if (chipContainer && !chipContainer.contains(target)) {
          setOpenChipKey(null);
        }
      }
      if (attachPopupOpen) {
        if (attachContainerRef.current && !attachContainerRef.current.contains(target)) {
          setAttachPopupOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openChipKey, attachPopupOpen]);

  // ── Prijem fajla ──
  const uploadFile = useSlotUpload();
  const [dropActive, setDropActive] = useState(false);
  const dropBusyRef = useRef(false);

  const routeDroppedFiles = useEffectEvent(async (dropped: File[]) => {
    if (dropped.length === 0 || dropBusyRef.current) return;

    const first = dropped[0];
    const kind = first.type.startsWith("image/")
      ? "image"
      : first.type.startsWith("video/")
        ? "video"
        : "audio";

    const modeAccepts = (mode: string) =>
      slotsForMode(activeModel.inputSpec, mode).some((entry) => slotKind(entry.accept) === kind);
    const targetMode = modeAccepts(inputMode) ? inputMode : activeModel.inputModes.find(modeAccepts);

    let flashed = false;
    const flash = (message: string | null) => {
      flashed = true;
      setStatusMessage(message);
      if (message) setTimeout(() => setStatusMessage(null), 4000);
    };

    if (!targetMode) {
      flash(locale === "sr" ? "Ovaj model ne prima taj tip fajla." : "This model does not accept that file type.");
      return;
    }

    async function uploadInto(slotName: string, spec: SlotSpec, file: File, apply: (uploaded: SlotFile) => void) {
      const problem = validateSlotFile(file, spec, locale);
      if (problem) {
        flash(problem);
        return false;
      }
      const key = `drop:${slotName}`;
      handleUploadingChange(key, true);
      try {
        const uploaded = await uploadFile(file, slotName, () => {});
        apply(uploaded);
        if (uploaded.measureFailure !== undefined) flash(measureFailureMessage(uploaded.measureFailure, locale));
        return true;
      } catch (thrown) {
        flash(uploadErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
        return false;
      } finally {
        handleUploadingChange(key, false);
      }
    }

    dropBusyRef.current = true;
    if (targetMode !== inputMode) setInputMode(targetMode);
    setStatusMessage(locale === "sr" ? "Šaljem fajl…" : "Uploading…");
    try {
      const slots = slotsForMode(activeModel.inputSpec, targetMode);
      if (targetMode === "first_last") {
        const accept = slots[0]?.accept ?? ["image/*"];
        const which: "first" | "last" = frames.first ? "last" : "first";
        await uploadInto("image", { max: 1, accept }, first, (uploaded) =>
          setFrames((prev) => ({ ...prev, [which]: uploaded })),
        );
      } else {
        const slot = slots.find((entry) => slotKind(entry.accept) === kind) ?? slots[0];
        if (slot) {
          if (slot.max > 1) {
            const room = Math.max(0, slot.max - (files[slot.slot]?.length ?? 0));
            for (const file of dropped.slice(0, room)) {
              const ok = await uploadInto(slot.slot, { max: slot.max, accept: slot.accept }, file, (uploaded) =>
                setFiles((prev) => ({ ...prev, [slot.slot]: [...(prev[slot.slot] ?? []), uploaded] })),
              );
              if (!ok) break;
            }
          } else {
            await uploadInto(slot.slot, { max: 1, accept: slot.accept }, first, (uploaded) =>
              setFiles((prev) => ({ ...prev, [slot.slot]: [uploaded] })),
            );
          }
        }
      }
    } finally {
      dropBusyRef.current = false;
      if (!flashed) setStatusMessage(null);
    }
  });

  function handleSelectFileType(type: "image" | "video" | "audio" | "file") {
    setAttachPopupOpen(false);
    if (!fileInputRef.current) return;
    if (type === "image") {
      fileInputRef.current.accept = "image/png,image/jpeg,image/webp";
    } else if (type === "video") {
      fileInputRef.current.accept = "video/mp4,video/quicktime,video/webm";
    } else if (type === "audio") {
      fileInputRef.current.accept = "audio/mpeg,audio/wav,audio/mp4,audio/webm";
    } else {
      fileInputRef.current.accept = "*/*";
    }
    fileInputRef.current.click();
  }

  const dropEnabled = variant === "create" && !isCollapsed;

  useEffect(() => {
    if (!dropEnabled) return;
    function hasFiles(dt: DataTransfer | null) {
      if (!dt) return false;
      const items = Array.from(dt.items ?? []);
      if (items.length > 0) return items.some((item) => item.kind === "file");
      return Array.from(dt.types ?? []).includes("Files");
    }
    let depth = 0;
    function enter(event: DragEvent) {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      setDropActive(true);
    }
    function over(event: DragEvent) {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
    }
    function leave() {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropActive(false);
    }
    function drop(event: DragEvent) {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth = 0;
      setDropActive(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length > 0) void routeDroppedFiles(dropped);
    }
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [dropEnabled]);

  function submit() {
    if (block !== null || isPending || isUploading) return;

    onGenerate({
      params: form.params,
      inputMode,
      inputs: inputsPayload(payloadFiles),
      ...(sourceRequired && sourceJobId ? { sourceJobId } : {}),
    });
  }

  // Određivanje promovisanih inline čipova na traci:
  // 1. Rezolucija (ako postoji)
  // 2. Odnos stranica (odmah pored rezolucije)
  // 3. Ostali parametri (trajanje, broj slika...)
  const promotedChips = useMemo(() => {
    const visible = visibleControls(activeModel.paramSpec, inputMode);
    const nonPrompt = visible.filter((c) => c.type !== "textarea" && c.key !== "prompt");

    const resolutionControl = nonPrompt.find(
      (c) => c.key === "resolution" || c.key === "quality" || c.key === "resolution_mode",
    );
    const ratioControl = nonPrompt.find(
      (c) => c.key === "aspect_ratio" || (c.type === "select" && c.options?.some((o) => /^\d+:\d+$/.test(o.value))),
    );
    const countControl = nonPrompt.find(
      (c) => c.key === "num_images" || c.key === "num_outputs" || c.key === "count",
    );
    const durControl = nonPrompt.find((c) => c.key === "duration");

    const selected: Array<{
      key: string;
      label: string;
      valueText: string;
      control: ParamControlSpec;
    }> = [];

    // 1. Rezolucija
    if (resolutionControl && form.values[resolutionControl.key] !== undefined) {
      let val = String(form.values[resolutionControl.key]);
      if (resolutionControl.options) {
        const opt = resolutionControl.options.find((o) => o.value === form.values[resolutionControl.key]);
        if (opt) val = optionLabel(opt, locale);
      }
      selected.push({
        key: resolutionControl.key,
        label: controlLabel(resolutionControl, locale),
        valueText: val,
        control: resolutionControl,
      });
    }

    // 2. Odnos stranica - odmah pored rezolucije
    if (ratioControl && form.values[ratioControl.key] !== undefined) {
      selected.push({
        key: ratioControl.key,
        label: controlLabel(ratioControl, locale),
        valueText: String(form.values[ratioControl.key]),
        control: ratioControl,
      });
    }

    // 3. Trajanje (ako postoji)
    if (durControl && form.values[durControl.key] !== undefined && !selected.some((s) => s.key === durControl.key)) {
      selected.push({
        key: durControl.key,
        label: controlLabel(durControl, locale),
        valueText: `${form.values[durControl.key]}s`,
        control: durControl,
      });
    }

    // 4. Broj slika / izlaza (ako postoji)
    if (countControl && form.values[countControl.key] !== undefined && !selected.some((s) => s.key === countControl.key)) {
      selected.push({
        key: countControl.key,
        label: controlLabel(countControl, locale),
        valueText: `×${form.values[countControl.key]}`,
        control: countControl,
      });
    }

    // 5. Ostale kontrole koje utiču na cenu ili formu
    for (const c of nonPrompt) {
      if (!selected.some((s) => s.key === c.key) && form.values[c.key] !== undefined) {
        let valueText = String(form.values[c.key]);
        if (typeof form.values[c.key] === "boolean") {
          valueText = form.values[c.key]
            ? (locale === "sr" ? "zvuk" : "audio")
            : (locale === "sr" ? "bez zvuka" : "no audio");
        } else if (c.options) {
          const opt = c.options.find((o) => o.value === form.values[c.key]);
          if (opt) valueText = optionLabel(opt, locale);
        }
        selected.push({
          key: c.key,
          label: controlLabel(c, locale),
          valueText,
          control: c,
        });
      }
    }

    return selected;
  }, [activeModel.paramSpec, inputMode, form.values, locale]);

  const isEstimated =
    quantitySource !== null && quantitySource.from !== "text_length" && serverSeconds === null;
  const priceDisplay = useMemo(() => {
    if (credits === null) {
      const def = defaultCredits(activeModel);
      return def !== null ? `~${def}` : "—";
    }
    return isEstimated ? `~${credits}` : `${credits}`;
  }, [credits, activeModel, isEstimated]);

  const notice = seed?.missingSlots
    ? missingRegenerateInputsNotice(seed.missingSlots, locale)
    : serverSeconds !== null && measureMismatch(browserSeconds, serverSeconds)
      ? measuredDurationNotice(serverSeconds, locale)
      : null;

  const errorMessage = error ? studioErrorMessage(error, locale) : null;
  const blockMessage = block ? generateBlockMessage(block, locale) : null;

  return (
    <div ref={composerRef} className="relative w-full max-w-[720px]">
      {/* Skriveni input za izbor datoteka */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const dropped = Array.from(e.target.files ?? []);
          if (dropped.length > 0) {
            void routeDroppedFiles(dropped);
          }
          e.target.value = "";
        }}
      />

      {/* ========================================================================= */}
      {/* POP-UP ZA IZBOR MODELA                                                   */}
      {/* ========================================================================= */}
      {modelPickerOpen && !isCollapsed ? (
        <>
          {/* Mobilni scrim */}
          <div
            className="fixed inset-0 z-40 bg-scrim/35 backdrop-blur-[2px] sm:hidden"
            onClick={() => setModelPickerOpen(false)}
          />

          <div
            role="dialog"
            aria-label={locale === "sr" ? "Izaberi model" : "Choose a model"}
            className={cn(
              "surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-16)] flex flex-col z-40",
              "sm:absolute sm:bottom-[calc(100%+12px)] sm:left-0 sm:right-0 sm:max-h-[min(78vh,600px)]",
              "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[16px] border-b-0 sm:rounded-[16px] sm:border-b-2",
            )}
          >
            {/* Header: IZABERI MODEL + X */}
            <div className="flex items-center justify-between rounded-t-[inherit] border-b-2 border-ink bg-paper px-4 py-3 sm:px-5">
              <span className="type-eyebrow text-ink">
                {locale === "sr" ? "Izaberi model" : "Choose a model"}
              </span>
              <button
                type="button"
                onClick={() => setModelPickerOpen(false)}
                aria-label={locale === "sr" ? "Zatvori" : "Close"}
                className="inline-flex size-7 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
              <ModelPickerPanel
                className="flex-1"
                models={models}
                selectedSlug={activeModel.slug}
                activeKind={activeModel.kind}
                providerStatus={studioState?.providerStatus}
                onSelect={(m) => {
                  handleSelectNewModel(m);
                  setModelPickerOpen(false);
                }}
                onCollapse={() => setModelPickerOpen(false)}
                locale={locale}
              />
            </div>
          </div>
        </>
      ) : null}

      {/* ========================================================================= */}
      {/* COMPOSER BAR                                                             */}
      {/* ========================================================================= */}
      <motion.div
        inert={isCollapsed ? true : undefined}
        aria-hidden={isCollapsed ? true : undefined}
        animate={{
          y: isCollapsed ? "calc(100% + 80px)" : 0,
        }}
        transition={collapseTransition}
        className={cn(
          "surface-card relative z-30 w-full border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)]",
          isCollapsed && "pointer-events-none",
        )}
      >
        {/* Priloženi fajlovi na glavnom inputu (Slika 3) */}
        {attachedInputs.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {attachedInputs.map((att) => (
              <div
                key={att.key}
                className="surface-media relative size-16 shrink-0 overflow-hidden border-2 border-ink bg-paper-strong"
              >
                <Preview file={att.file} />
                {att.label ? (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink/75 px-1 py-0.5 type-eyebrow-sm text-paper-strong">
                    {att.label}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={att.remove}
                  aria-label={locale === "sr" ? "Ukloni fajl" : "Remove file"}
                  className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[1px_1px_0_0_var(--shadow-hard)] hover:-translate-y-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            {/* Dugme za dodavanje novih fajlova (Slika 3) */}
            {modelAcceptsFiles ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/png,image/jpeg,image/webp,video/mp4,audio/mpeg";
                    fileInputRef.current.click();
                  }
                }}
                title={locale === "sr" ? "Dodaj fajl" : "Add file"}
                aria-label={locale === "sr" ? "Dodaj fajl" : "Add file"}
                className="surface-media inline-flex size-16 shrink-0 items-center justify-center border-2 border-dashed border-ink/40 bg-paper/50 text-ink/70 transition hover:border-ink hover:bg-paper hover:text-ink hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
              >
                <ImagePlus className="size-6" />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Prompt Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={prompt}
          onChange={(event) => handlePromptChange(event.target.value)}
          placeholder={
            variant === "edit"
              ? locale === "sr"
                ? "Opišite izmene…"
                : "Describe changes…"
              : locale === "sr"
                ? "Šta želite da napravite?"
                : "What do you want to create?"
          }
          aria-label={locale === "sr" ? "Opis onoga što praviš" : "Description of what you are making"}
          className="w-full resize-none border-0 bg-transparent text-base font-bold text-ink placeholder:font-bold placeholder:text-muted studio-focus-ink"
        />

        {/* Statusna linija za obaveštenja */}
        {statusMessage ? (
          <div role="status" className="truncate pt-1 text-xs font-bold text-muted">
            <span className="font-mono text-ink">↺</span> {statusMessage}
          </div>
        ) : errorMessage ? (
          <div role="alert" className="truncate pt-1 text-xs font-black text-red-700">
            {errorMessage}
          </div>
        ) : notice ? (
          <div role="note" className="truncate pt-1 text-xs font-bold text-muted">
            {notice}
          </div>
        ) : blockMessage && block?.kind !== "prompt" ? (
          <div role="status" className="truncate pt-1 text-xs font-bold text-amber-900">
            {blockMessage}
          </div>
        ) : null}

        {/* Donji red čipova */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* Upload dugme (+) sa AttachFilePopup */}
          <div ref={attachContainerRef} className="relative inline-flex">
            <button
              type="button"
              disabled={!modelAcceptsFiles || isPending}
              onClick={() => {
                setOpenChipKey(null);
                setModelPickerOpen(false);
                setAttachPopupOpen((prev) => !prev);
              }}
              aria-haspopup="dialog"
              aria-expanded={attachPopupOpen}
              aria-label={
                modelAcceptsFiles
                  ? locale === "sr"
                    ? "Priloži fajlove"
                    : "Attach files"
                  : locale === "sr"
                    ? "Ovaj model ne prima fajlove"
                    : "This model does not accept files"
              }
              title={
                modelAcceptsFiles
                  ? locale === "sr"
                    ? "Priloži fajlove"
                    : "Attach files"
                  : locale === "sr"
                    ? "Ovaj model ne prima fajlove."
                    : "This model does not accept files."
              }
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <Plus className="size-4" />
            </button>

            <AnimatePresence>
              {attachPopupOpen ? (
                <AttachFilePopup
                  model={activeModel}
                  locale={locale}
                  disabled={isPending}
                  onSelectType={handleSelectFileType}
                />
              ) : null}
            </AnimatePresence>
          </div>

          {/* Čip modela: otvara Model Picker */}
          <button
            ref={modelChipRef}
            type="button"
            onClick={() => {
              setOpenChipKey(null);
              setAttachPopupOpen(false);
              setModelPickerOpen((prev) => !prev);
            }}
            aria-haspopup="dialog"
            aria-expanded={modelPickerOpen}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-3.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ModelMark model={activeModel} size={16} className="shrink-0 text-ink" />
            <span>{modelLabel(activeModel, locale)}</span>
          </button>

          {/* Promovisani čipovi (Rezolucija, Odnos stranica, Trajanje, Broj slika...) */}
          {promotedChips.map((chip) => (
            <PromotedChipItem
              key={chip.key}
              chip={chip}
              isOpen={openChipKey === chip.key}
              onToggle={() => {
                setModelPickerOpen(false);
                setAttachPopupOpen(false);
                setOpenChipKey((prev) => (prev === chip.key ? null : chip.key));
              }}
              onRegisterButton={(el) => {
                chipButtonRefs.current[chip.key] = el;
              }}
              onRegisterContainer={(el) => {
                chipContainerRefs.current[chip.key] = el;
              }}
              form={form}
              activeModel={activeModel}
              inputMode={inputMode}
              locale={locale}
              disabled={isPending}
            />
          ))}

          <span className="flex-1" />

          {/* Kombinovano dugme: akcija + cena u jednom */}
          {block?.kind === "credits" ? (
            <Link
              href={topUpHref}
              title={locale === "sr" ? "Nedovoljno kredita. Klikni za dopunu." : "Insufficient credits. Click to top up."}
              aria-label={
                credits !== null
                  ? locale === "sr"
                    ? `Nedovoljno kredita. Dopuni za ${formatCreditsLong(credits, locale)}`
                    : `Insufficient credits. Top up for ${formatCreditsLong(credits, locale)}`
                  : locale === "sr"
                    ? "Nedovoljno kredita. Klikni za dopunu."
                    : "Insufficient credits. Click to top up."
              }
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Coins className="size-4 text-ink" />
              <span className="hidden sm:inline">{locale === "sr" ? "Dopuni" : "Top up"}</span>
              <span className="hidden h-3.5 w-px bg-current opacity-30 sm:inline-block" aria-hidden="true" />
              <span className="inline-flex items-center gap-1 font-mono text-sm font-black tabular-nums">
                <span>{priceDisplay}</span>
                <CreditIcon className="size-3.5 text-ink" />
              </span>
            </Link>
          ) : (
            <button
              type="button"
              disabled={isPending || block !== null || credits === null}
              onClick={submit}
              aria-label={
                credits !== null
                  ? locale === "sr"
                    ? `Generiši za ${formatCreditsLong(credits, locale)}`
                    : `Generate for ${formatCreditsLong(credits, locale)}`
                  : locale === "sr"
                    ? "Generiši"
                    : "Generate"
              }
              title={
                block
                  ? blockMessage ?? undefined
                  : credits !== null
                    ? locale === "sr"
                      ? `Generiši za ${formatCreditsLong(credits, locale)}`
                      : `Generate for ${formatCreditsLong(credits, locale)}`
                    : locale === "sr"
                      ? "Generiši"
                      : "Generate"
              }
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink px-4 py-2 text-xs font-black transition duration-200 hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                isPriceFlashing
                  ? "bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)]"
                  : "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] active:shadow-[1px_1px_0_0_var(--yellow)]",
              )}
            >
              {isPending ? (
                <Spinner />
              ) : (
                <Wand2 className={cn("size-4", isPriceFlashing ? "text-ink" : "text-yellow")} />
              )}
              <span className="hidden sm:inline">
                {locale === "sr" ? "Generiši" : "Generate"}
              </span>
              <span
                className={cn(
                  "hidden h-3.5 w-px bg-current opacity-30 sm:inline-block",
                  isPriceFlashing ? "text-ink" : "text-paper-strong",
                )}
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1 font-mono text-sm font-black tabular-nums">
                {isEstimated ? (
                  <span className="type-eyebrow-sm opacity-75">
                    {locale === "sr" ? "proc." : "est."}
                  </span>
                ) : null}
                <span>{priceDisplay}</span>
                <CreditIcon className={cn("size-3.5", isPriceFlashing ? "text-ink" : "text-yellow")} />
              </span>
            </button>
          )}
        </div>
      </motion.div>

      {/* ========================================================================= */}
      {/* RUČICA ZA SKLAPANJE / RASKLAPANJE INPUTA                                  */}
      {/* ========================================================================= */}
      {onToggleCollapse ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label={
              locale === "sr"
                ? isCollapsed
                  ? "Prikaži polje za unos"
                  : "Sakrij polje za unos"
                : isCollapsed
                  ? "Show input"
                  : "Hide input"
            }
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {isCollapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            <span>
              {locale === "sr"
                ? isCollapsed
                  ? "Prikaži polje za unos"
                  : "Sakrij polje za unos"
                : isCollapsed
                  ? "Show input"
                  : "Hide input"}
            </span>
          </button>
        </div>
      ) : null}

      {/* Prekrivač prijema fajla preko celog ekrana */}
      {dropActive && modelAcceptsFiles ? (
        <FullScreenDropOverlay
          label={
            inputMode === "first_last"
              ? frames.first
                ? locale === "sr"
                  ? "Pusti završni kadar"
                  : "Drop the ending frame"
                : locale === "sr"
                  ? "Pusti početni kadar"
                  : "Drop the starting frame"
              : locale === "sr"
                ? "Pusti fajl bilo gde"
                : "Drop the file anywhere"
          }
          hint={
            inputMode === "first_last"
              ? locale === "sr"
                ? "Prvi kadar ide u početni, sledeći u završni. Ciljaj polje da izabereš."
                : "The first frame goes to start, the next to end. Aim a field to choose."
              : locale === "sr"
                ? "Ceo ekran prima fajl. Čim ga pustiš, kreće slanje."
                : "The whole screen accepts the file. It starts uploading as soon as you release it."
          }
        />
      ) : null}
    </div>
  );
}
