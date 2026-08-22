"use client";

import {
  ChevronDown,
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
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { DropSlot, DropSlotGrid, FrameSlotPair, FullScreenDropOverlay, Preview, ReferenceSlots } from "@/components/studio/drop-slot";
import { InputCapabilityStrip } from "@/components/studio/input-capabilities";
import { ModelPickerPanel, modelPriceSummary } from "@/components/studio/model-picker";
import { ModeSwitcher } from "@/components/studio/mode-switcher";
import { ParamForm, useParamValues } from "@/components/studio/param-form";
import { ModelMark } from "@/components/studio/provider-mark";
import { SourceJobPicker } from "@/components/studio/source-job-picker";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { parseContinuationSource, parseQuantitySource, promptControlOf } from "@/convex/studioJobCore";
import type { Locale } from "@/lib/i18n";
import { firstFileMode, modelRestrictions } from "@/lib/studio-capabilities";
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
  // SP1: birač modela je GORNJA ZONA panela, ne zaseban prozor. `pickerExpanded`
  // menja telo panela između podešavanja i pretrage+spiska - visina se ne menja.
  const [pickerExpanded, setPickerExpanded] = useState(false);
  // Poslednji model po vrsti (tačka 8) - čita se jednom sa localStorage.
  const [lastByKind, setLastByKind] = useState(() => readLastModelByKind());
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
  // Model uopšte prima fajl u BILO kom režimu (za prijem preko celog ekrana i kad
  // je trenutno „Samo opis"): drop tada sam prebaci na režim sa slikom.
  const modelAcceptsFiles = useMemo(
    () => activeModel.inputModes.some((mode) => slotsForMode(activeModel.inputSpec, mode).length > 0),
    [activeModel.inputModes, activeModel.inputSpec],
  );
  const isDemoModel = studioState?.providerStatus?.[activeModel.provider] === false;
  const restrictions = useMemo(() => modelRestrictions(activeModel, locale), [activeModel, locale]);

  // Jedan put za promenu režima (SP2): ModeSwitcher, traka sposobnosti i `+`
  // ga dele. Čisti slotove kojih u novom režimu nema - uz potvrdu šta je
  // sklonjeno, jer fajl ne sme da nestane bez reči - i time preračunava cenu.
  function switchMode(mode: string) {
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

  function focusSlots() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = slotsSectionRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const focusable = el.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        (focusable ?? el).focus();
      }, 50);
    });
  }

  // Klik na čip sposobnosti: u režim sa tim poljima, pa na polja.
  function handlePickCapabilityMode(mode: string) {
    switchMode(mode);
    focusSlots();
  }

  // Priložene slike se vide NA glavnom inputu (traci), ne samo u panelu - drop
  // spusti sliku „u glavni input" i tu je korisnik odmah vidi kao sličicu.
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
    for (const slot of availableSlots) {
      (files[slot.slot] ?? []).forEach((file, index) => {
        list.push({
          key: `${slot.slot}:${index}`,
          label: "",
          file,
          remove: () => {
            if (file.url) URL.revokeObjectURL(file.url);
            setFiles((prev) => ({ ...prev, [slot.slot]: (prev[slot.slot] ?? []).filter((_, position) => position !== index) }));
          },
        });
      });
    }
    return list;
  }, [inputMode, frames, files, availableSlots, locale]);

  // `+` radi kad model prima fajl u BILO kom režimu: iz „Samo opis" sam
  // prebaci na prvi režim sa poljima (ranije je bio ugašen sa porukom „ne prima
  // fajlove" - netačno za model koji slike prima u drugom režimu).
  function handleOpenFileSlots() {
    if (!modelAcceptsFiles) return;
    if (!hasFileSlots) {
      const target = firstFileMode(activeModel);
      if (!target) return;
      switchMode(target);
    }
    setPickerExpanded(false);
    setPanelOpen(true);
    focusSlots();
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
    // Zapamti izbor po vrsti i sklopi birač nazad na podešavanja (tačka 1 i 8).
    writeLastModel(newModel.kind, newModel.slug);
    setLastByKind((prev) => ({ ...prev, [newModel.kind]: newModel.slug }));
    setPickerExpanded(false);

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

  // Tastaturni prečaci za zatvaranje (Esc). Kad je birač razvijen, Esc ga sklapa
  // nazad na podešavanja; inače zatvara ceo panel.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (pickerExpanded) {
        setPickerExpanded(false);
      } else if (panelOpen) {
        setPanelOpen(false);
        modelChipRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [panelOpen, pickerExpanded]);

  // Klik van composera zatvara panel (i sklapa birač)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!composerRef.current?.contains(event.target as Node)) {
        setPanelOpen(false);
        setPickerExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Prijem fajla preko CELOG ekrana dok smo u Studiju (AGENTS.md konvencija) ──
  // Slika/video pušten bilo gde upada u ulaz aktivnog modela. Kod prvi/poslednji
  // kadar prvi drop ide u početni, sledeći u završni; drop tačno NA polje kadra
  // rešava sam slot (ne diramo ga ovde), pa se završni može ciljati direktno.
  const uploadFile = useSlotUpload();
  const [dropActive, setDropActive] = useState(false);
  const dropBusyRef = useRef(false);

  const routeDroppedFiles = useEffectEvent(async (dropped: File[], target: EventTarget | null) => {
    if (dropped.length === 0 || dropBusyRef.current) return;
    // Drop tačno na neki vidljivi slot rešava sam slot (npr. baš na „završni kadar").
    if (target instanceof Node && slotsSectionRef.current?.contains(target)) return;

    const first = dropped[0];
    const kind = first.type.startsWith("image/")
      ? "image"
      : first.type.startsWith("video/")
        ? "video"
        : "audio";

    // Automatski biramo režim: trenutni ako prima taj tip, inače PRVI režim modela
    // koji ga prima. Tako drop slike na modelu u „Samo opis" sam prebaci na režim
    // sa slikom - korisnik ne mora da otvara panel ni da bira režim unapred.
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
      // Očisti „Šaljem fajl…" po uspehu; poruku greške (flash) ostavi da sama istekne.
      if (!flashed) setStatusMessage(null);
    }
  });

  // Prijem preko celog ekrana je vezan za glavni (create) composer - detalj-editor
  // (variant "edit") ima svoj prozor iznad, pa dva window-slušaoca ne bi smela da
  // gutaju isti drop.
  const dropEnabled = variant === "create";

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
      if (dropped.length > 0) void routeDroppedFiles(dropped, event.target);
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
            className="fixed inset-0 z-40 bg-scrim/35 backdrop-blur-[2px] sm:hidden"
            onClick={() => setPanelOpen(false)}
          />

          <div
            role="dialog"
            aria-label={locale === "sr" ? "Podešavanja generisanja" : "Generation settings"}
            className={cn(
              "surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-16)] flex flex-col z-40",
              // Desktop: usidren iznad bara. Kap dozvoljava da tipičan model
              // (npr. slika: režim + rezolucija + odnos + broj) stane bez skrola
              // na ekranu visine 900px; gušći modeli i dalje skroluju interno.
              "sm:absolute sm:bottom-[calc(100%+12px)] sm:left-0 sm:right-0 sm:max-h-[min(78vh,640px)]",
              // Mobilni: bottom sheet
              "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[16px] border-b-0 sm:rounded-[16px] sm:border-b-2",
            )}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between rounded-t-[inherit] border-b-2 border-ink bg-paper px-4 py-3 sm:px-5">
              <span className="text-xs font-black uppercase tracking-wider text-ink">
                {pickerExpanded
                  ? locale === "sr"
                    ? "Izaberi model"
                    : "Choose a model"
                  : locale === "sr"
                    ? "Podešavanja"
                    : "Settings"}
              </span>
              <div className="flex items-center gap-1.5">
                {!pickerExpanded ? (
                  <button
                    type="button"
                    onClick={() => {
                      const defs = paramValuesForMode(activeModel.paramSpec, inputMode);
                      form.setAllValues(defs);
                      setStatusMessage(locale === "sr" ? "Vraćeno na podrazumevana podešavanja." : "Reset to default settings.");
                      setTimeout(() => setStatusMessage(null), 3000);
                    }}
                    title={locale === "sr" ? "Podrazumevano" : "Reset to defaults"}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper-strong px-2.5 py-0.5 text-[11px] font-extrabold text-ink shadow-[1px_1px_0_0_var(--shadow-hard)] hover:-translate-y-0.5"
                  >
                    <RotateCcw className="size-3" />
                    <span>{locale === "sr" ? "Reset" : "Reset"}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setPanelOpen(false);
                    setPickerExpanded(false);
                  }}
                  aria-label={locale === "sr" ? "Zatvori panel" : "Close panel"}
                  className="inline-flex size-7 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Panel Body: birač (razvijeno) ILI podešavanja (mirovanje). Ista
                fiksna visina panela; menja se samo telo - panel ne trza. */}
            {pickerExpanded ? (
              <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
                <ModelPickerPanel
                  className="flex-1"
                  models={models}
                  selectedSlug={activeModel.slug}
                  activeKind={activeModel.kind}
                  recentSlugs={recentSlugs}
                  lastByKind={lastByKind}
                  providerStatus={studioState?.providerStatus}
                  onSelect={handleSelectNewModel}
                  onCollapse={() => setPickerExpanded(false)}
                  locale={locale}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                {/* Trenutni model — klik razvija birač NA MESTU (tačka 1) */}
                <button
                  type="button"
                  onClick={() => setPickerExpanded(true)}
                  aria-label={locale === "sr" ? "Promeni model" : "Change model"}
                  className="surface-inset flex w-full items-center gap-3 border-2 border-ink bg-paper p-2.5 text-left transition hover:bg-[#fff7e6] dark:hover:bg-yellow/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <ModelMark model={activeModel} size={22} className="shrink-0 text-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-black leading-tight text-ink">{modelLabel(activeModel, locale)}</span>
                      {activeModel.badge ? (
                        <span className="shrink-0 rounded-full border-2 border-ink bg-paper-strong px-1.5 py-0 text-[9px] font-black uppercase tracking-wide text-ink">
                          {MODEL_BADGE_LABELS[activeModel.badge][locale]}
                        </span>
                      ) : null}
                      {isDemoModel ? (
                        <span
                          title={locale === "sr" ? "Provajder nije povezan - izlaz je probni." : "Provider not connected - the output is a sample."}
                          className="shrink-0 rounded-full border-2 border-ink bg-yellow px-1.5 py-0 text-[9px] font-black uppercase tracking-wide text-ink"
                        >
                          DEMO
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight text-muted">
                      {modelTagline(activeModel, locale)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-black tabular-nums text-ink">
                    {modelPriceSummary(activeModel, locale)}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted" />
                </button>

                {/* Ograničenja modela iz kataloga (npr. Gemini Omni) - pre upload-a, ne posle greške */}
                {restrictions.length > 0 ? (
                  <ul role="note" className="surface-inset list-disc space-y-0.5 border-2 border-dashed border-ink/40 bg-paper py-2 pl-7 pr-3 text-[11px] font-bold text-muted">
                    {restrictions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}

                {/* Šta model prima (SP2): podržano vodi u režim sa poljima, nepodržano je sivo */}
                <InputCapabilityStrip
                  model={activeModel}
                  activeMode={inputMode}
                  onPickMode={handlePickCapabilityMode}
                  locale={locale}
                  disabled={isPending}
                />

                {/* Prebacivač ulaznog režima kad ih ima više */}
                <ModeSwitcher
                  modes={activeModel.inputModes}
                  value={inputMode}
                  onChange={switchMode}
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
            )}

            {/* Footer: samo na mobilnom (sheet prekriva bar), dugme nosi i cenu.
                Desktop nema footer - cena je na baru ispod, „Generisanje će
                koristiti" je uklonjeno. */}
            {!pickerExpanded ? (
              <div className="rounded-b-[inherit] border-t-2 border-ink bg-paper px-4 py-3 sm:hidden">
                <button
                  type="button"
                  disabled={isPending || block !== null || credits === null}
                  onClick={submit}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2 text-sm font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4 text-yellow" />}
                  <span>
                    {locale === "sr" ? "Generiši" : "Generate"}
                    {credits !== null ? ` · ${formatCredits(credits, locale)}` : ""}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ========================================================================= */}
      {/* SLOJ 1: COMPOSER BAR (Uvek vidljiv lebdeći bar)                            */}
      {/* ========================================================================= */}
      <div className="surface-card relative z-30 w-full border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-4">
        {/* Priložene slike na glavnom inputu (drop ih spusti ovde) */}
        {attachedInputs.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedInputs.map((att) => (
              <div
                key={att.key}
                className="surface-media relative size-14 shrink-0 overflow-hidden border-2 border-ink bg-paper-strong"
              >
                <Preview file={att.file} />
                {att.label ? (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink/75 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-paper-strong">
                    {att.label}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={att.remove}
                  aria-label={locale === "sr" ? "Ukloni sliku" : "Remove image"}
                  className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[1px_1px_0_0_var(--shadow-hard)] hover:-translate-y-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
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
            disabled={!modelAcceptsFiles || isPending}
            onClick={handleOpenFileSlots}
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

          {/* Čip modela: otvara panel sa razvijenim biračem */}
          <button
            ref={modelChipRef}
            type="button"
            onClick={() => {
              setPanelOpen(true);
              setPickerExpanded(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={panelOpen && pickerExpanded}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-3.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ModelMark model={activeModel} size={16} className="shrink-0 text-ink" />
            <span>{modelLabel(activeModel, locale)}</span>
          </button>

          {/* 2-3 promovisana čipa izabranog modela */}
          {promotedChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setPickerExpanded(false);
                setPanelOpen(true);
              }}
              aria-label={chip.label}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span>{chip.valueText}</span>
            </button>
          ))}

          <span className="flex-1" />

          {/* Živa cena na čipu (klik otvara panel) */}
          <button
            type="button"
            onClick={() => {
              setPickerExpanded(false);
              setPanelOpen((prev) => !prev);
            }}
            aria-label={locale === "sr" ? "Cena generisanja" : "Generation price"}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              isPriceFlashing ? "bg-yellow scale-105" : "bg-paper-strong",
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
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_var(--yellow)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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

      {/* Prekrivač prijema fajla preko celog ekrana (drop bilo gde) */}
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
