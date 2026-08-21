"use client";

import {
  Coins,
  Loader2,
  Plus,
  RotateCcw,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DropSlot, DropSlotGrid, FrameSlotPair, ReferenceSlots } from "@/components/studio/drop-slot";
import { ModelPickerOverlay, modelPriceSummary } from "@/components/studio/model-picker";
import { ModeSwitcher } from "@/components/studio/mode-switcher";
import { ParamForm, useParamValues } from "@/components/studio/param-form";
import { SourceJobPicker } from "@/components/studio/source-job-picker";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { parseContinuationSource, parseQuantitySource, promptControlOf } from "@/convex/studioJobCore";
import type { Locale } from "@/lib/i18n";
import {
  generateBlockMessage,
  measuredDurationNotice,
  missingRegenerateInputsNotice,
  studioErrorMessage,
} from "@/lib/studio-messages";
import {
  defaultCredits,
  familyMark,
  modelLabel,
  modelTagline,
  MODEL_BADGE_LABELS,
  type StudioModel,
} from "@/lib/studio-models";
import { studioMotionTokens } from "@/lib/studio-motion";
import {
  creditsFor,
  formatCredits,
  paramValuesForMode,
  visibleControls,
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
  measuredExtraCounts,
  missingInput,
  missingInputMessage,
  singleDropSlot,
  slotsForMode,
  type FramePair,
  type SlotFile,
  type SlotFiles,
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
 * Renderuje ulaze izabranog režima (drop slotove / birač prethodnog posla).
 */
function ModeInputs({
  model,
  inputMode,
  files,
  onFilesChange,
  frames,
  onFramesChange,
  sourceJobId,
  onSourceJobIdChange,
  optional,
  locale,
  disabled,
  onUploadingChange,
}: {
  model: StudioModel;
  inputMode: string;
  files: SlotFiles;
  onFilesChange: (next: SlotFiles) => void;
  frames: FramePair;
  onFramesChange: (next: FramePair) => void;
  sourceJobId: Id<"generationJobs"> | null;
  onSourceJobIdChange: (next: Id<"generationJobs"> | null) => void;
  optional: string[];
  locale: Locale;
  disabled: boolean;
  onUploadingChange?: (key: string, uploading: boolean) => void;
}) {
  const slots = slotsForMode(model.inputSpec, inputMode).filter((entry) => !optional.includes(entry.slot));
  if (slots.length === 0) {
    const continuation = parseContinuationSource(JSON.stringify(model.capabilities));
    if (continuation && continuation.mode === inputMode) {
      return (
        <SourceJobPicker
          modelSlug={model.slug}
          kind={model.kind}
          value={sourceJobId}
          onChange={onSourceJobIdChange}
          locale={locale}
          disabled={disabled}
        />
      );
    }
    return null;
  }

  const single = singleDropSlot(model.inputSpec, inputMode) !== null;

  if (inputMode === "first_last") {
    return (
      <FrameSlotPair
        spec={slots[0]}
        frames={frames}
        onChange={onFramesChange}
        locale={locale}
        disabled={disabled}
        onUploadingChange={onUploadingChange}
      />
    );
  }

  if (inputMode === "reference") {
    return (
      <ReferenceSlots
        modeSpec={model.inputSpec[inputMode]}
        files={files}
        onChange={onFilesChange}
        locale={locale}
        disabled={disabled}
        onUploadingChange={onUploadingChange}
      />
    );
  }

  return (
    <div className="space-y-4">
      {slots.map((entry) =>
        entry.max > 1 ? (
          <DropSlotGrid
            key={entry.slot}
            slot={entry.slot}
            spec={entry}
            files={files[entry.slot] ?? []}
            onChange={(next) => onFilesChange({ ...files, [entry.slot]: next })}
            locale={locale}
            numbered
            fullScreen={single}
            disabled={disabled}
            onUploadingChange={onUploadingChange}
          />
        ) : (
          <DropSlot
            key={entry.slot}
            slot={entry.slot}
            spec={entry}
            file={files[entry.slot]?.[0] ?? null}
            onChange={(next) => onFilesChange({ ...files, [entry.slot]: next ? [next] : [] })}
            locale={locale}
            fullScreen={single}
            disabled={disabled}
            onUploadingChange={onUploadingChange}
          />
        ),
      )}
    </div>
  );
}

/**
 * Glavni dvoslojni composer (Pravac 3 + P2 birač).
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
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState(() => starterPrompt ?? seed?.prompt ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPriceFlashing, setIsPriceFlashing] = useState(false);
  // C5: svaki slot prijavljuje SVOJ ključ; upload traje dok je bar jedan aktivan.
  // Jedan boolean je gubio stanje kad se od više slotova jedan otpremi pre drugih
  // (poslednji emiter je pobeđivao i otključavao dugme dok drugi još traje) - Set
  // po ključu broji sve slotove ispravno.
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
  const [recentSlugs, setRecentSlugs] = useState<string[]>(() => [activeModel.slug]);

  // Sinhronizacija starterPrompt / seed tokom rendera bez cascading renders
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const modelChipRef = useRef<HTMLButtonElement>(null);
  const slotsSectionRef = useRef<HTMLDivElement>(null);

  // Stanje ulaznog režima i fajlova
  const [inputMode, setInputMode] = useState<string>(() => seed?.inputMode ?? activeModel.inputModes[0] ?? "text");
  const [files, setFiles] = useState<SlotFiles>(() => seed?.files ?? {});
  const [frames, setFrames] = useState<FramePair>(() => ({
    first: seed?.files?.image?.[0] ?? null,
    last: seed?.files?.image?.[1] ?? null,
  }));
  const [sourceJobId, setSourceJobId] = useState<Id<"generationJobs"> | null>(null);

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

  // Sinhronizacija prompt teksta sa form parametrima (ako model ima prompt kontrolu)
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
  // C3: fajl u slotu koji je vrednost kontrole SAKRILA (opcion) ne sme da ode
  // provajderu ni da se naplati. `optionalSlots` ga skloni sa ekrana, ali je
  // ostajao u `files`; ovde se izbacuje iz payload-a. Merenje/cena i dalje idu
  // preko `effectiveFiles` - red measured→form→optional ne sme da postane ciklus;
  // eventualan opcion "extra" bi prikazao cenu naviše (bezbedan smer), a server
  // naplaćuje po onome što je stvarno primio.
  const payloadFiles = useMemo(() => {
    if (optional.length === 0) return effectiveFiles;
    const next: SlotFiles = {};
    for (const [slot, list] of Object.entries(effectiveFiles)) {
      if (!optional.includes(slot)) next[slot] = list;
    }
    return next;
  }, [effectiveFiles, optional]);
  const availableSlots = useMemo(
    () => slotsForMode(activeModel.inputSpec, inputMode).filter((entry) => !optional.includes(entry.slot)),
    [activeModel.inputSpec, inputMode, optional],
  );
  const hasFileSlots = availableSlots.length > 0;

  function handleOpenFileSlots() {
    if (!hasFileSlots) return;
    setPanelOpen(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = slotsSectionRef.current;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          const focusable = el.querySelector<HTMLElement>(
            'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (focusable) {
            focusable.focus();
          } else {
            el.focus();
          }
        }
      }, 50);
    });
  }

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

  // Flash animacija pri promeni cene (rečnik pokreta — mikro)
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

  // C4 Carry-Forward: promena modela bez gubljenja prompta i fajlova
  function handleSelectNewModel(newModel: StudioModel) {
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
    }
  }

  // Tastaturni prečaci za zatvaranje (Esc)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (pickerOpen) {
          setPickerOpen(false);
          modelChipRef.current?.focus();
        } else if (panelOpen) {
          setPanelOpen(false);
          modelChipRef.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [panelOpen, pickerOpen]);

  // Klik van composera zatvara panel
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!composerRef.current?.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function submit() {
    if (block !== null || isPending || isUploading) return;

    onGenerate({
      params: form.params,
      inputMode,
      inputs: inputsPayload(payloadFiles),
      ...(sourceRequired && sourceJobId ? { sourceJobId } : {}),
    });
  }

  // Određivanje 2-3 promovisana inline čipa iz paramSpec-a
  const promotedChips = useMemo(() => {
    const visible = visibleControls(activeModel.paramSpec, inputMode);
    // Filtriraj kontrole koje nisu prompt i nisu textarea
    const nonPrompt = visible.filter((c) => c.type !== "textarea" && c.key !== "prompt");
    const priceAffecting = nonPrompt.filter((c) => c.affectsPrice);
    const primary = priceAffecting.length > 0 ? priceAffecting : nonPrompt;

    // Prvo tražimo ratio ili count, pa ostale
    const ratioControl = nonPrompt.find((c) => c.key === "aspect_ratio" || c.type === "segmented");
    const countControl = nonPrompt.find((c) => c.key === "num_images" || c.key === "num_outputs" || c.key === "count");
    const durControl = nonPrompt.find((c) => c.key === "duration");

    const selected: Array<{ key: string; label: string; valueText: string }> = [];

    if (ratioControl && form.values[ratioControl.key]) {
      selected.push({
        key: ratioControl.key,
        label: ratioControl.key,
        valueText: String(form.values[ratioControl.key]),
      });
    }
    if (durControl && form.values[durControl.key]) {
      selected.push({
        key: durControl.key,
        label: durControl.key,
        valueText: `${form.values[durControl.key]}s`,
      });
    }
    if (countControl && form.values[countControl.key]) {
      selected.push({
        key: countControl.key,
        label: countControl.key,
        valueText: `×${form.values[countControl.key]}`,
      });
    }

    // Ako nemamo dovoljno, dodaj prvu preostalu primarnu
    for (const c of primary) {
      if (selected.length >= 2) break;
      if (!selected.some((s) => s.key === c.key) && form.values[c.key] !== undefined) {
        selected.push({
          key: c.key,
          label: c.key,
          valueText: typeof form.values[c.key] === "boolean" ? (form.values[c.key] ? "zvuk" : "bez zvuka") : String(form.values[c.key]),
        });
      }
    }

    return selected.slice(0, 2);
  }, [activeModel.paramSpec, inputMode, form.values]);

  // Prikaz cene na baru: procena `~` ili tačna
  // Procena `~` samo dok se MEDIJSKO trajanje ne izmeri na serveru. Tekstualni
  // modeli (`tts`, `dialogue`) broje znakove tačno i na klijentu i na serveru -
  // za njih cena nije procena, pa ne nose `~` (ranije su ga nosili uvek, jer je
  // `serverSeconds` za njih uvek `null`).
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
      {/* ========================================================================= */}
      {/* SLOJ 2: DROP-UP PANEL (desktop: usidren iznad composera, mobilni: sheet) */}
      {/* ========================================================================= */}
      {panelOpen ? (
        <>
          {/* Mobilni scrim */}
          <div
            className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] sm:hidden"
            onClick={() => setPanelOpen(false)}
          />

          <div
            role="dialog"
            aria-label={locale === "sr" ? "Podešavanja generisanja" : "Generation settings"}
            className={cn(
              "surface-card border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.16)] flex flex-col z-40",
              // Desktop: usidren iznad bara
              "sm:absolute sm:bottom-[calc(100%+12px)] sm:left-0 sm:right-0 sm:max-h-[min(66vh,560px)]",
              // Mobilni: bottom sheet
              "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[16px] border-b-0 sm:rounded-[16px] sm:border-b-2",
            )}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b-2 border-ink bg-paper px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-ink">
                  {locale === "sr" ? "Podešavanja" : "Settings"}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const defs = paramValuesForMode(activeModel.paramSpec, inputMode);
                      form.setAllValues(defs);
                      setStatusMessage(locale === "sr" ? "Vraćeno na podrazumevana podešavanja." : "Reset to default settings.");
                      setTimeout(() => setStatusMessage(null), 3000);
                    }}
                    title={locale === "sr" ? "Podrazumevano" : "Reset to defaults"}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-ink shadow-[1px_1px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5"
                  >
                    <RotateCcw className="size-3" />
                    <span>{locale === "sr" ? "Reset" : "Reset"}</span>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={locale === "sr" ? "Zatvori panel" : "Close panel"}
                className="inline-flex size-7 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Panel Body (interni scroll sa stabilnom visinom) */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {/* Tanak red modela sa strelicom (P2 okidač) */}
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="surface-inset flex w-full items-center gap-3 border-2 border-ink bg-paper p-2.5 text-left transition hover:bg-[#fff7e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink font-mono text-xs font-black text-white">
                  {familyMark(activeModel)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-black text-ink">{modelLabel(activeModel, locale)}</span>
                    {activeModel.badge ? (
                      <span className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink">
                        {MODEL_BADGE_LABELS[activeModel.badge][locale]}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs font-bold text-muted">
                    {modelTagline(activeModel, locale)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-black text-ink">
                  {modelPriceSummary(activeModel, locale)}
                </span>
                <span className="shrink-0 text-muted">▾</span>
              </button>

              {/* Prebacivač ulaznog režima kad ih ima više */}
              <ModeSwitcher
                spec={activeModel.inputSpec}
                modes={activeModel.inputModes}
                value={inputMode}
                onChange={setInputMode}
                files={files}
                onFilesChange={setFiles}
                locale={locale}
                disabled={isPending}
              />

              {/* Slotovi za unos fajlova */}
              <div ref={slotsSectionRef} tabIndex={-1} className="outline-none">
                <ModeInputs
                  model={activeModel}
                  inputMode={inputMode}
                  files={files}
                  onFilesChange={setFiles}
                  frames={frames}
                  onFramesChange={setFrames}
                  sourceJobId={sourceJobId}
                  onSourceJobIdChange={setSourceJobId}
                  optional={optional}
                  locale={locale}
                  disabled={isPending}
                  onUploadingChange={handleUploadingChange}
                />
              </div>

              {/* Generisane kontrole modela */}
              <ParamForm
                spec={activeModel.paramSpec}
                state={form}
                rule={activeModel.priceRule}
                locale={locale}
                inputMode={inputMode}
                disabled={isPending}
                hidePromptOnDesktop
              />
            </div>

            {/* Panel Footer */}
            <div className="flex items-center justify-between border-t-2 border-ink bg-paper px-4 py-3 sm:px-5">
              <div>
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  {locale === "sr" ? "Generisanje će koristiti" : "Generation will use"}
                </span>
                <span className="font-mono text-lg font-black text-ink">
                  {credits !== null ? formatCredits(credits, locale) : `${priceDisplay} ${locale === "sr" ? "kr" : "cr"}`}
                </span>
              </div>
              <button
                type="button"
                disabled={isPending || block !== null || credits === null}
                onClick={submit}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2 text-sm font-black text-white shadow-[3px_3px_0_0_#f4be30] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4 text-yellow" />}
                <span>{locale === "sr" ? "Generiši" : "Generate"}</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ========================================================================= */}
      {/* SLOJ 1: COMPOSER BAR (Uvek vidljiv lebdeći bar)                            */}
      {/* ========================================================================= */}
      <div className="surface-card relative z-30 w-full border-2 border-ink bg-white p-3 shadow-[6px_6px_0_0_rgba(14,49,88,0.16)] sm:p-4">
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
          aria-label={locale === "sr" ? "Prompt za generisanje" : "Generation prompt"}
          className="w-full resize-none border-0 bg-transparent text-base font-bold text-ink placeholder:font-bold placeholder:text-muted focus-visible:outline-none"
        />

        {/* Statusna linija za obaveštenja (C4 prilagođavanja, greške, napomene) */}
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
          {/* Upload dugme (+) */}
          <button
            type="button"
            disabled={!hasFileSlots || isPending}
            onClick={handleOpenFileSlots}
            aria-label={
              hasFileSlots
                ? locale === "sr"
                  ? "Priloži fajlove"
                  : "Attach files"
                : locale === "sr"
                  ? "Prilaganje fajlova nije dostupno"
                  : "File attachment not available"
            }
            title={
              hasFileSlots
                ? locale === "sr"
                  ? "Priloži fajlove"
                  : "Attach files"
                : locale === "sr"
                  ? "Izabrani model u ovom režimu ne prima fajlove."
                  : "The selected model does not accept files in this mode."
            }
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <Plus className="size-4" />
          </button>

          {/* Čip modela (Otvara P2 birač) */}
          <button
            ref={modelChipRef}
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-black text-white">
              {familyMark(activeModel)}
            </span>
            <span>{modelLabel(activeModel, locale)}</span>
          </button>

          {/* 2-3 promovisana čipa izabranog modela */}
          {promotedChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label={chip.label}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span>{chip.valueText}</span>
            </button>
          ))}

          <span className="flex-1" />

          {/* Živa cena na čipu (klik otvara panel) */}
          <button
            type="button"
            onClick={() => setPanelOpen((prev) => !prev)}
            aria-label={locale === "sr" ? "Cena generisanja" : "Generation price"}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              isPriceFlashing ? "bg-yellow scale-105" : "bg-white",
            )}
          >
            {isEstimated ? (
              <span className="text-[10px] font-extrabold uppercase tracking-tight text-muted">
                {locale === "sr" ? "procena" : "est."}
              </span>
            ) : null}
            <span className="font-mono text-sm font-black">{priceDisplay}</span>
            <span>{locale === "sr" ? "kr" : "cr"}</span>
          </button>

          {/* Dugme Generiši / Slanje */}
          {block?.kind === "credits" ? (
            <Link
              href={topUpHref}
              title={locale === "sr" ? "Nedovoljno kredita. Klikni za dopunu." : "Insufficient credits. Click to top up."}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_0_#0e3158] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Coins className="size-5" />
            </Link>
          ) : (
            <button
              type="button"
              disabled={isPending || block !== null || credits === null}
              onClick={submit}
              aria-label={locale === "sr" ? "Generiši" : "Generate"}
              title={
                block
                  ? blockMessage ?? undefined
                  : locale === "sr"
                    ? "Generiši"
                    : "Generate"
              }
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink text-white shadow-[3px_3px_0_0_#f4be30] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#f4be30] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Wand2 className="size-5 text-yellow" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* P2 BIRAČ MODELA (Overlay sloj sa pretragom i familijama)                   */}
      {/* ========================================================================= */}
      <ModelPickerOverlay
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        models={models}
        selectedSlug={activeModel.slug}
        recentSlugs={recentSlugs}
        onSelect={handleSelectNewModel}
        locale={locale}
      />
    </div>
  );
}
