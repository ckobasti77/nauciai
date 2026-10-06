"use client";

import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Coins,
  FileText,
  Film,
  FlaskConical,
  Gift,
  Grid3x3,
  Image as ImageIcon,
  Palette,
  Pencil,
  ImagePlus,
  Moon,
  Music,
  Plus,
  Sparkles,
  Video,
  Wand2,
  WandSparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Easing } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { EMPTY_LOOK, lookIsEmpty, type LookState } from "@/components/crea/create/look-state";
import {
  MentionButton,
  MentionChips,
  MentionSuggestions,
  useElementMentions,
  type MentionElement,
} from "@/components/crea/elements/mentions";
import { MicButton, useSpeechSupported } from "@/components/crea/create/mic-button";
import { PromptHelper } from "@/components/crea/create/prompt-helper";
import { NightToggle } from "@/components/crea/night-toggle";
import { deskCount, directorIsEmpty, EMPTY_DIRECTOR, type DirectorState } from "@/components/crea/video/director-state";
import type { DirectorTab } from "@/components/crea/video/director-panel";
import type { PickedFrame } from "@/components/crea/video/last-frame-picker";
import { CreditIcon } from "@/components/studio/credit-icon";
import { FullScreenDropOverlay, Preview } from "@/components/studio/drop-slot";
import { ModelPickerPanel } from "@/components/studio/model-picker";
import { ModeSwitcher } from "@/components/studio/mode-switcher";
import { ParamControl } from "@/components/studio/param-control";
import { useParamValues, type ParamFormState } from "@/components/studio/param-form";
import { ModelMark } from "@/components/studio/provider-mark";
import { SourceJobPicker } from "@/components/studio/source-job-picker";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { ComposerFreeTry } from "@/components/crea/game/crea-game-context";
import type { Id } from "@/convex/_generated/dataModel";
import { elementInputs, promptWithElements, referenceModeOf } from "@/convex/creaElementsCore";
import { nightOptionFor, nightParams, nightQuote, nightSavingsPercent } from "@/convex/creaNightCore";
import type { CreaDerivation } from "@/convex/creaVersionsCore";
import { parseContinuationSource, parseQuantitySource, promptControlOf } from "@/convex/studioJobCore";
import type { ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import { autoSentence, pickAuto } from "@/lib/crea-auto";
import { CREA_CREATE_COPY } from "@/lib/crea-create-copy";
import { appendSpoken } from "@/lib/crea-dictation";
import { CREA_NIGHT_COPY, CREA_PICK_COPY, fillCopy } from "@/lib/crea-copy";
import { CREA_FREE_TRY_COPY } from "@/lib/crea-game-copy";
import { composeVideoPrompt, effectInputMode, effectParamsFor, modelMakesSound } from "@/lib/crea-director";
import { buildDraftOrder, draftPairFor, orderCredits } from "@/lib/crea-draft";
import { CREA_MENTION_COPY } from "@/lib/crea-elements-copy";
import { COMPOSED_PROMPT_MAX, composeCreatePrompt } from "@/lib/crea-prompt-compose";
import { styleById } from "@/lib/crea-styles";
import { VARIATION_COUNTS, variationPlan, variationsCredits } from "@/lib/crea-variations";
import { CREA_VIDEO_COPY } from "@/lib/crea-video-copy";
import { VEO_INLINE_MAX_BYTES } from "@/lib/crea-video-extend";
import type { VideoEffect } from "@/lib/crea-video-effects";
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

/** Panel „Izgled" (K13, S8) se učitava tek kad ga korisnik otvori - 40 stilova ne ulazi u početni JS. */
const LookPanel = dynamic(() => import("@/components/crea/create/look-panel"), { ssr: false });
/** Panel „Režija" (K18, V6-V9) i izbor poslednjeg kadra (V4) - isto lenjo, samo za Video · Napravi. */
const DirectorPanel = dynamic(() => import("@/components/crea/video/director-panel"), { ssr: false });
const LastFramePicker = dynamic(() => import("@/components/crea/video/last-frame-picker"), { ssr: false });

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
  /** Stablo verzija (K05): rad iz kojeg ovaj nastaje; dodaje ga detalj rada, ne forma. */
  parentJobId?: Id<"generationJobs">;
  derivation?: CreaDerivation;
  /** Noćna tura (Crea K08): rad ide u batch po noćnoj ceni i stiže do jutra. */
  deliveryMode?: "night";
  /**
   * Varijacije (K13, S5) za model koji ne vraća više slika u jednom pozivu: ukupno
   * toliko zasebnih poslova (prvi + ostali kao „varijacija" prvog).
   */
  variations?: number;
  /** Album (K26, G4): tehnike koje rad stvarno proba (pokret kamere, efekat, stil). */
  creaTechniques?: string[];
  /** Besplatna proba iz mini-lekcije (K26, G6): posao ide za 0 kredita. */
  freeTryLessonId?: string;
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
  opensDown = false,
}: {
  model: StudioModel;
  onSelectType: (type: "image" | "video" | "audio" | "file") => void;
  locale: Locale;
  disabled?: boolean;
  /** Usidren composer (Crea, levi panel): ispod njega ima mesta, iznad nema. */
  opensDown?: boolean;
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
      className={cn(
        "surface-card absolute left-0 z-50 w-44 border-2 border-ink bg-paper-strong p-1.5 shadow-[6px_6px_0_0_var(--shadow-hard-16)]",
        opensDown ? "top-[calc(100%+12px)]" : "bottom-[calc(100%+12px)]",
      )}
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
  opensDown = false,
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
  opensDown?: boolean;
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
      className={cn(
        "surface-card absolute left-0 z-50 w-[280px] max-w-[calc(100vw-24px)] border-2 border-ink bg-paper-strong p-3.5 shadow-[6px_6px_0_0_var(--shadow-hard-16)]",
        opensDown ? "top-[calc(100%+12px)]" : "bottom-[calc(100%+12px)]",
      )}
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
  opensDown,
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
  opensDown: boolean;
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
    <div ref={onRegisterContainer} className="relative inline-flex shrink-0">
      <button
        ref={setButtonRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={chip.label}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1.5 text-xs font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-3",
          isOpen
            ? "bg-ink text-paper-strong shadow-[2px_2px_0_0_var(--shadow-hard)]"
            : "bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)]",
        )}
      >
        <span className="max-w-[84px] truncate sm:max-w-none">{chip.valueText}</span>
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
            opensDown={opensDown}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Izabran deo izgleda (stil, kamera, paleta) kao pilula sa „x" (K13, S8). */
/** Dugme dodatka ispod opisa (Režija, Pokret, Zvuk, Poslednji kadar - K18), isti oblik kao „Izgled". */
function ExtraButton({
  icon: Icon,
  label,
  title,
  open,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  title?: string;
  open: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        open ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

function LookChip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-ink/30 bg-yellow/30 py-0.5 pl-3 pr-0.5 text-xs font-black text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        // Meta na dodir 44 px (K18): nevidljivo proširenje oko krstića, izgled čipa ostaje isti.
        className="relative inline-flex size-8 items-center justify-center rounded-full text-ink after:absolute after:-inset-1.5 after:content-[''] hover:bg-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </span>
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
  placement = "floating",
  initialInputMode,
  lockModelKind = false,
  dropDisabled = false,
  shellMode,
  createExtras = false,
  canSaveStyles = false,
  onOpenSheet,
  queueNotice = null,
  elements,
  elementsHref = null,
  videoExtras = false,
  allowedInputModes,
  freeTries,
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
  /** Model ide uz payload: detalj gradi formu za model POSLA, ne za model strane (K01 0.2-7). */
  onGenerate: (payload: JobPayload, model: StudioModel) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * `floating` (podrazumevano): lebdi na dnu ekrana, pop-upovi idu nagore.
   * `docked`: stoji u levom panelu radionice Cree (K03), statičan; čipovi se otvaraju nadole,
   * a izbor modela desno od polja (preko scene), da ceo stane u ekran.
   */
  placement?: "floating" | "docked";
  /** Ulazni režim kojim se forma otvara (režim ljuske Cree); važi samo ako ga model ima. */
  initialInputMode?: string;
  /** Izbor modela ne nudi promenu vrste - radionica je već izabrala sliku, video ili zvuk. */
  lockModelKind?: boolean;
  /** Gasi prijem fajla preko celog ekrana (npr. dok je otvoren detalj sa svojim composerom). */
  dropDisabled?: boolean;
  /** Režim ljuske Cree (npr. `muzika`) - Auto iz njega zna koji je posao (K07). */
  shellMode?: string;
  /**
   * Slika · Napravi (K13): pomoćnik za opis i mikrofon (S6), izgled - stil, kamera,
   * paleta (S8), varijacije 1-4 (S5), limit cene za Auto (S3) i probni list (S4).
   */
  createExtras?: boolean;
  /** „Moji stilovi" se čuvaju samo uz pristup Crei. */
  canSaveStyles?: boolean;
  /** Probni list (S4): otvara alat sa ovim opisom i modelom. */
  onOpenSheet?: (prompt: string, modelSlug: string) => void;
  /** Varijacije koje čekaju slobodno mesto (red radionice). */
  queueNotice?: string | null;
  /**
   * Likovi i elementi (K14, S34/V6): `@pominjanje` u opisu šalje slike elementa
   * kao reference. Bez ovog propa (`undefined`) polje nema @pominjanje.
   */
  elements?: readonly MentionElement[];
  /** Ekran „Likovi" - za „Napravi prvi" kad korisnik još nema elemenata. */
  elementsHref?: string | null;
  /**
   * Video · Napravi (K18): režija (pokret kamere, efekti, pult; V6-V9) i „Poslednji
   * kadar iz videa" (V4) - kadar se izvuče na uređaju i postane prvi kadar posla.
   */
  videoExtras?: boolean;
  /**
   * Ulazni režimi koje režim ljuske nudi (npr. Video · Napravi: opis, slika, prvi i
   * poslednji kadar, reference). Uz dva ili više, iznad polja stoji vidljiv izbor (K18).
   */
  allowedInputModes?: readonly string[];
  /** Besplatne probe korisnika (K26, G6): uz model sa spiska dugme generiše za 0 kredita. */
  freeTries?: readonly ComposerFreeTry[];
}) {
  const isDocked = placement === "docked";
  const createMode = variant === "create" && createExtras;
  const speechSupported = useSpeechSupported();
  const [extraPanel, setExtraPanel] = useState<"helper" | "look" | null>(null);
  const [look, setLook] = useState<LookState>(EMPTY_LOOK);
  const [variationCount, setVariationCount] = useState(1);
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
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
  const [inputMode, setInputMode] = useState<string>(
    () =>
      seed?.inputMode ??
      (initialInputMode && activeModel.inputModes.includes(initialInputMode) ? initialInputMode : undefined) ??
      activeModel.inputModes[0] ??
      "text",
  );
  const [files, setFiles] = useState<SlotFiles>(() => seed?.files ?? {});
  const [frames, setFrames] = useState<FramePair>(() => ({
    first: seed?.files?.image?.[0] ?? null,
    last: seed?.files?.image?.[1] ?? null,
  }));
  // Nastavak (Gemini Omni `video`): izbor ranije generacije istog modela (K18, SourceJobPicker).
  const [sourceJobId, setSourceJobId] = useState<Id<"generationJobs"> | null>(null);
  // Video (K18): režija, otvoren panel, izbor poslednjeg kadra i video iz kojeg je kadar.
  const [director, setDirector] = useState<DirectorState>(EMPTY_DIRECTOR);
  const [directorTab, setDirectorTab] = useState<DirectorTab | null>(null);
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  const [continuedFrom, setContinuedFrom] = useState<{ jobId: Id<"generationJobs">; storageId: string } | null>(null);
  // Prazan kadar u „prvi i poslednji" koji je korisnik kliknuo - sledeći fajl ide baš u njega.
  const [frameTarget, setFrameTarget] = useState<"first" | "last" | null>(null);

  // @pominjanje (K14): pomenuti elementi i njihove slike kao reference. Iz „samo opis" se
  // prelazi u režim sa referencama (`image_multi` / `reference`), a nazad kad nestanu.
  const mentions = useElementMentions({ elements, prompt, onChange: handlePromptChange, textareaRef });
  const mentioned = mentions.mentioned;
  const referenceMode = useMemo(() => referenceModeOf(activeModel), [activeModel]);
  const [autoReferenceMode, setAutoReferenceMode] = useState<string | null>(null);
  if (mentioned.length > 0 && inputMode === "text" && referenceMode) {
    setInputMode(referenceMode.inputMode);
    setAutoReferenceMode(referenceMode.inputMode);
  } else if (
    mentioned.length === 0 &&
    autoReferenceMode !== null &&
    inputMode === autoReferenceMode &&
    Object.values(files).every((list) => (list?.length ?? 0) === 0) &&
    activeModel.inputModes.includes("text")
  ) {
    setInputMode("text");
    setAutoReferenceMode(null);
  }
  const elementMapping = useMemo(
    () =>
      mentioned.length > 0
        ? elementInputs(mentioned, activeModel, { currentMode: inputMode, existingImages: files.image?.length ?? 0 })
        : null,
    [mentioned, activeModel, inputMode, files.image],
  );
  const elementProblem =
    elementMapping && !elementMapping.ok
      ? fillCopy(CREA_MENTION_COPY.problems[elementMapping.reason][locale], { n: elementMapping.max })
      : null;
  const sentCounts = useMemo(
    () => new Map(elementMapping?.ok ? elementMapping.refs.map((ref) => [ref.element.handle, ref.images.length]) : []),
    [elementMapping],
  );

  // Spajanje first_last okvira u slot `image`; slike pomenutih elemenata idu iza vlastitih.
  const effectiveFiles: SlotFiles = useMemo(() => {
    const own = inputMode === "first_last" ? { ...files, image: framePairFiles(frames) } : files;
    if (!elementMapping?.ok) return own;
    const refs: SlotFile[] = elementMapping.images.map((image) => ({
      storageId: image.storageId,
      name: image.storageId,
      mime: image.mime,
      size: image.size,
      url: image.url ?? null,
    }));
    return { ...own, image: [...(own.image ?? []), ...refs] };
  }, [inputMode, files, frames, elementMapping]);

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

  // Režimi koje režim ljuske nudi, redom modela; izbor se vidi tek kad ih ima bar dva (K18).
  const switchableModes = useMemo(
    () => (allowedInputModes ? activeModel.inputModes.filter((mode) => allowedInputModes.includes(mode)) : []),
    [allowedInputModes, activeModel.inputModes],
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

  // Noćna tura (Crea K08, C2): ista odluka i ista cena kao `createJob` (`creaNightCore`).
  const [nightOn, setNightOn] = useState(false);

  // Varijacije (K13, S5): model sa `num_images` dobija jedan posao sa N slika, ostali N
  // poslova. Noćna tura je uvek jedna slika (K08), pa tada varijacija nema.
  const variationTarget = createMode && !nightOn ? variationCount : 1;
  const plan = useMemo(
    () => variationPlan(activeModel, inputMode, variationTarget),
    [activeModel, inputMode, variationTarget],
  );
  const baseParams = useMemo(
    () => (plan.kind === "num_images" ? { ...form.params, num_images: plan.count } : form.params),
    [plan, form.params],
  );
  const dayCredits = useMemo(
    () => creditsFor(activeModel.priceRule, baseParams, inputMode, activeModel.creditFactor),
    [activeModel.priceRule, activeModel.creditFactor, baseParams, inputMode],
  );
  const nightSpec = useMemo(
    () =>
      variant === "create"
        ? nightOptionFor({
            pricingV2: studioState?.pricingV2 === true,
            capabilities: activeModel.capabilities,
            inputMode,
            providers: studioState?.nightProviders,
          })
        : null,
    [variant, studioState?.pricingV2, studioState?.nightProviders, activeModel.capabilities, inputMode],
  );
  const nightOffer = useMemo(() => {
    if (!nightSpec) return null;
    const params = nightParams(form.params);
    try {
      const nightCredits = nightQuote(activeModel.priceRule, params, inputMode, nightSpec.discount).credits;
      const sameDay = creditsFor(activeModel.priceRule, params, inputMode, activeModel.creditFactor);

      return { credits: nightCredits, savings: sameDay === null ? 0 : nightSavingsPercent(sameDay, nightCredits) };
    } catch {
      return null;
    }
  }, [nightSpec, form.params, activeModel.priceRule, activeModel.creditFactor, inputMode]);
  const night = nightOn && nightOffer !== null;
  // Cena koju dugme pokazuje i naplaćuje: noćna kad je prekidač upaljen; paralelne varijacije × N.
  const credits = useMemo(
    () => variationsCredits(plan, night && nightOffer ? nightOffer.credits : dayCredits),
    [plan, night, nightOffer, dayCredits],
  );
  // Besplatna proba (K26, G6): isti uslov kao na serveru (`freeTryFits`) - model sa spiska,
  // cena do granice, bez noćne ture i bez paralelnih varijacija. Korisnik je može isključiti.
  const [freeTryOff, setFreeTryOff] = useState(false);
  const freeTry = freeTries?.find((offer) => offer.models.includes(activeModel.slug)) ?? null;
  const freeTryFitsNow =
    freeTry !== null && !night && plan.kind !== "parallel" && credits !== null && credits > 0 && credits <= freeTry.maxCredits;
  const freeTryOn = freeTryFitsNow && !freeTryOff;

  // Izgled (S8): dodaje se opisu tek pri slanju; „Modelu ide:" pokazuje tačan tekst.
  const composed = createMode && promptControl && !lookIsEmpty(look) ? composeCreatePrompt(prompt, look) : null;
  // Režija videa (K18, V6-V9): pokret, efekat i pult se dodaju opisu tek pri slanju, po modelu.
  const videoComposed =
    videoExtras && promptControl && !directorIsEmpty(director)
      ? composeVideoPrompt({
          prompt,
          move: director.move,
          moveIntensity: director.moveIntensity,
          effect: director.effect,
          desk: director.desk,
          model: activeModel,
        })
      : null;
  const directedText = composed?.text ?? videoComposed?.text ?? null;
  const effectNeedsPhoto = director.effect?.needs === "foto" && (files.image?.length ?? 0) === 0 && inputMode === "image";
  // @pominjanje: `@maja` postaje ime, a na kraj ide rečenica koja slika je ko (K14).
  const withElements = (text: string) =>
    elementMapping?.ok ? promptWithElements(text, elements ?? [], elementMapping.refs) : text;
  const elementText = elementMapping?.ok ? withElements(directedText ?? prompt) : null;
  const elementsOverBy = elementText !== null ? Math.max(0, elementText.length - COMPOSED_PROMPT_MAX) : 0;
  const lookTooLong =
    (composed !== null && composed.overBy > 0) || (videoComposed !== null && videoComposed.overBy > 0) || elementsOverBy > 0;
  const generateLabel = night ? CREA_NIGHT_COPY.generate[locale] : locale === "sr" ? "Generiši" : "Generate";

  // ── Auto izbor (Crea S3) i „Probaj jeftino" (S4/V3) ──
  // Javni korisnik ne sme da dobije model bez ključa (server bi ga odbio) - ista
  // odluka kao `createJob`; osoblje vidi DEMO.
  const isModelAvailable = useCallback(
    (model: StudioModel) =>
      !(studioState?.publicEnabled && !studioState?.isStaff && studioState?.providerStatus?.[model.provider] === false),
    [studioState?.publicEnabled, studioState?.isStaff, studioState?.providerStatus],
  );
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [pendingAuto, setPendingAuto] = useState<{ slug: string; mode: string; overrides: ParamValues } | null>(null);
  // Auto je promenio model: kad stigne novi model, postavi režim i ono što pravilo menja.
  if (pendingAuto && pendingAuto.slug === activeModel.slug) {
    setPendingAuto(null);
    if (pendingAuto.mode !== inputMode && activeModel.inputModes.includes(pendingAuto.mode)) setInputMode(pendingAuto.mode);
    for (const [key, value] of Object.entries(pendingAuto.overrides)) form.setValue(key, value);
  }

  function handleAuto() {
    setOpenChipKey(null);
    setModelPickerOpen(false);
    setAttachPopupOpen(false);
    const area = activeModel.kind === "image" ? "slika" : activeModel.kind === "video" ? "video" : "zvuk";
    const pick = pickAuto(
      {
        area,
        prompt,
        inputs: {
          images: effectiveFiles.image?.length ?? 0,
          videos: effectiveFiles.video?.length ?? 0,
          audio: effectiveFiles.audio?.length ?? 0,
          mask: false,
        },
        ...(shellMode ? { shellMode } : {}),
        ...(createMode && budget !== null ? { budgetCredits: budget } : {}),
      },
      models,
      { available: isModelAvailable },
    );
    if (!pick) {
      setAutoNote(CREA_PICK_COPY.autoNone[locale]);
      return;
    }
    const demo = studioState?.providerStatus?.[pick.model.provider] === false ? ` ${CREA_PICK_COPY.autoDemo[locale]}` : "";
    setAutoNote(
      `${fillCopy(CREA_PICK_COPY.autoPicked[locale], { model: modelLabel(pick.model, locale) })} ${autoSentence(pick, locale, createMode && budget !== null ? budget : undefined)}${demo}`,
    );
    if (pick.model.slug !== activeModel.slug) {
      handleSelectNewModel(pick.model, { keepAutoNote: true });
      setPendingAuto({ slug: pick.model.slug, mode: pick.inputMode, overrides: pick.overrides });
      return;
    }
    if (pick.inputMode !== inputMode) setInputMode(pick.inputMode);
    for (const [key, value] of Object.entries(pick.overrides)) form.setValue(key, value);
  }

  // Efekat (K18, V8) traži svoj model i režim: ako ih trenutni model nema, prelazi se na
  // najjeftiniji model efekta (isti put kao Auto), a trajanje efekta ide u parametre posla.
  function handleEffectPicked(effect: VideoEffect) {
    const mode = effectInputMode(effect);
    if (effect.models.includes(activeModel.slug) && activeModel.inputModes.includes(mode)) {
      if (mode !== inputMode) switchMode(mode);
      for (const [key, value] of Object.entries(effectParamsFor(effect, activeModel, mode))) form.setValue(key, value);
      return;
    }
    const next = effect.models
      .map((slug) => models.find((model) => model.slug === slug))
      .find((model): model is StudioModel => model !== undefined && model.inputModes.includes(mode) && isModelAvailable(model));
    if (!next) {
      setAutoNote(CREA_VIDEO_COPY.effectNoModel[locale]);
      return;
    }
    setAutoNote(fillCopy(CREA_VIDEO_COPY.effectModel[locale], { model: modelLabel(next, locale) }));
    handleSelectNewModel(next, { keepAutoNote: true });
    setPendingAuto({ slug: next.slug, mode, overrides: effectParamsFor(effect, next, mode) });
  }

  // Poslednji kadar (K18, V4): izvučen na uređaju, šalje se kao običan ulaz i postaje prvi kadar.
  const imageMode = activeModel.inputModes.includes("first_last") && inputMode === "first_last"
    ? "first_last"
    : activeModel.inputModes.includes("image")
      ? "image"
      : activeModel.inputModes.includes("first_last")
        ? "first_last"
        : null;
  async function handleFramePicked(picked: PickedFrame) {
    if (!imageMode) {
      setStatusMessage(CREA_VIDEO_COPY.frameNoImageMode[locale]);
      return;
    }
    handleUploadingChange("kadar", true);
    try {
      const uploaded = await uploadFile(picked.file, "image", () => {});
      if (imageMode !== inputMode) switchMode(imageMode);
      if (imageMode === "first_last") setFrames((prev) => ({ ...prev, first: uploaded }));
      else setFiles((prev) => ({ ...prev, image: [uploaded] }));
      setContinuedFrom(picked.sourceJobId && uploaded.storageId ? { jobId: picked.sourceJobId, storageId: uploaded.storageId } : null);
      setFramePickerOpen(false);
      setStatusMessage(CREA_VIDEO_COPY.frameReady[locale]);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (thrown) {
      setStatusMessage(uploadErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
    } finally {
      handleUploadingChange("kadar", false);
    }
  }

  const draftPair = useMemo(() => draftPairFor(activeModel.slug, inputMode), [activeModel.slug, inputMode]);
  const draftModel = draftPair ? models.find((model) => model.slug === draftPair.draft.modelSlug) : undefined;
  const sameModelDraft = draftPair !== null && draftPair.draft.modelSlug === draftPair.refine.modelSlug;
  const draftOrder = useMemo(
    () =>
      draftPair && draftModel && isModelAvailable(draftModel)
        ? buildDraftOrder(draftPair, { params: form.params, inputMode, model: activeModel }, draftModel)
        : null,
    [draftPair, draftModel, isModelAvailable, form.params, inputMode, activeModel],
  );
  const draftCredits =
    draftOrder && draftModel
      ? orderCredits(draftModel, draftOrder, sameModelDraft ? (effectiveFiles.image?.length ?? 0) : 0)
      : null;
  const showDraft =
    variant === "create" && draftCredits !== null && credits !== null && draftCredits < credits && mentioned.length === 0;

  const continuation = useMemo(() => parseContinuationSource(JSON.stringify(activeModel.capabilities)), [activeModel]);
  const sourceRequired = continuation !== null && continuation.mode === inputMode;

  const isPromptNeeded = promptRequired(activeModel.inputSpec, inputMode);
  const promptMissing = isPromptNeeded && prompt.trim().length === 0;

  // Google prima video ugrađen u zahtev do 15 MB (Veo produženje) - kaže se pre slanja, ne posle rezervacije.
  const inlineProblem =
    activeModel.provider === "google" && (effectiveFiles.video ?? []).some((file) => file.size > VEO_INLINE_MAX_BYTES)
      ? CREA_VIDEO_COPY.extendProblems.prevelik[locale]
      : null;

  const block = useMemo(
    () =>
      generateBlock({
        state: studioState,
        balance,
        credits: freeTryOn ? 0 : credits,
        missingInputMessage: elementProblem ?? inlineProblem ?? missingInputMessage(missing, locale),
        promptMissing,
        quantityMissing: quantitySource !== null && measured[quantitySource.param] === undefined,
        sourceMissing: sourceRequired && sourceJobId === null,
        uploading: isUploading,
      }),
    [studioState, balance, credits, freeTryOn, missing, locale, promptMissing, quantitySource, measured, sourceRequired, sourceJobId, isUploading, elementProblem, inlineProblem],
  );

  // Automatsko prilagođavanje visine textarea polja
  function autoResizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  // Opis koji stigne spolja (cilj sa početnog ekrana, „Upotrebi ponovo") mora da se vidi
  // ceo, ne samo prvi red - visina se ne menja samo kad korisnik kuca (K03).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [prompt]);

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
  function handleSelectNewModel(newModel: StudioModel, opts: { keepAutoNote?: boolean } = {}) {
    if (!opts.keepAutoNote) setAutoNote(null);
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

    // Auto sam objašnjava izbor (`autoNote`), pa se poruka o prilagođavanju ne ponavlja.
    if (opts.keepAutoNote) return;
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

  // Obična funkcija za JSX onChange (effect event sme da se zove samo iz efekata);
  // window drop efekat ispod je zove kroz useEffectEvent omotač da zadrži stabilan identitet.
  const routeDroppedFilesNow = async (dropped: File[]) => {
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
        const which: "first" | "last" = frameTarget ?? (frames.first ? "last" : "first");
        setFrameTarget(null);
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
  };
  const routeDroppedFiles = useEffectEvent(routeDroppedFilesNow);

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

  const dropEnabled = variant === "create" && !isCollapsed && !dropDisabled;

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

  // Proba jeftinijim modelom (K07): isti opis; kod istog modela i isti ulazi.
  function submitDraft() {
    if (block !== null || isPending || isUploading || !draftOrder || !draftModel) return;

    onGenerate(
      {
        params: draftOrder.params,
        inputMode: draftOrder.inputMode,
        inputs: sameModelDraft ? inputsPayload(payloadFiles) : {},
      },
      draftModel,
    );
  }

  function submit() {
    if (block !== null || isPending || isUploading || lookTooLong) return;

    const finalText = elementText ?? directedText;
    // V4: prvi kadar je izvučen iz ranijeg videa - nov klip je njegov nastavak u stablu verzija.
    const continuedImage = inputMode === "first_last" ? frames.first : inputMode === "image" ? (files.image?.[0] ?? null) : null;
    const continues = continuedFrom !== null && continuedImage?.storageId === continuedFrom.storageId;
    // Album (K26): samo tehnike koje su stvarno ušle u opis koji ide modelu.
    const techniques = [
      ...(elementText === null && videoComposed && director.move ? [`kamera:${director.move.id}`] : []),
      ...(elementText === null && videoComposed && director.effect ? [`efekat:${director.effect.id}`] : []),
      ...(elementText === null && composed && look.styleId ? [`stil:${look.styleId}`] : []),
    ];
    onGenerate(
      {
        params: finalText !== null && promptControl ? { ...baseParams, [promptControl.key]: finalText } : baseParams,
        inputMode,
        inputs: inputsPayload(payloadFiles),
        ...(sourceRequired && sourceJobId ? { sourceJobId } : {}),
        ...(continues && continuedFrom ? { parentJobId: continuedFrom.jobId, derivation: "produzenje" as const } : {}),
        ...(night ? { deliveryMode: "night" as const } : {}),
        ...(plan.kind === "parallel" ? { variations: plan.count } : {}),
        ...(techniques.length > 0 ? { creaTechniques: techniques } : {}),
        ...(freeTryOn && freeTry ? { freeTryLessonId: freeTry.lessonId } : {}),
      },
      activeModel,
    );
  }

  // Određivanje promovisanih inline čipova na traci:
  // 1. Rezolucija (ako postoji)
  // 2. Odnos stranica (odmah pored rezolucije)
  // 3. Ostali parametri (trajanje, broj slika...)
  const promotedChips = useMemo(() => {
    const visible = visibleControls(activeModel.paramSpec, inputMode);
    // `text` kontrole (npr. scene za Kling, K18) puni alat, ne forma - nemaju čip.
    const nonPrompt = visible.filter((c) => c.type !== "textarea" && c.type !== "text" && c.key !== "prompt");

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

    // 4. Broj slika / izlaza (ako postoji). U Slika · Napravi ga zamenjuju „Varijacije" (K13).
    if (createMode && countControl) selected.push({ key: countControl.key, label: "", valueText: "", control: countControl });
    else if (countControl && form.values[countControl.key] !== undefined && !selected.some((s) => s.key === countControl.key)) {
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

    // Mesto „broja slika" je zauzeto samo da ga korak 5 ne doda; čip se ne crta.
    return selected.filter((chip) => !(createMode && chip.key === countControl?.key));
  }, [activeModel.paramSpec, inputMode, form.values, locale, createMode]);

  const isEstimated =
    quantitySource !== null && quantitySource.from !== "text_length" && serverSeconds === null;
  const priceDisplay = useMemo(() => {
    if (freeTryOn) return "0";
    if (credits === null) {
      const def = defaultCredits(activeModel);
      return def !== null ? `~${def}` : "—";
    }
    return isEstimated ? `~${credits}` : `${credits}`;
  }, [credits, activeModel, isEstimated, freeTryOn]);

  const notice = seed?.missingSlots
    ? missingRegenerateInputsNotice(seed.missingSlots, locale)
    : serverSeconds !== null && measureMismatch(browserSeconds, serverSeconds)
      ? measuredDurationNotice(serverSeconds, locale)
      : null;

  const errorMessage = error ? studioErrorMessage(error, locale) : null;
  const blockMessage = block ? generateBlockMessage(block, locale) : null;

  const collapseLabel = locale === "sr"
    ? isCollapsed
      ? "Prikaži polje za unos"
      : "Sakrij polje za unos"
    : isCollapsed
      ? "Show input"
      : "Hide input";

  // Kad je otvoren "+" ili čip pop-up, red komandi ne sme da seče sadržaj po Y osi
  // (mobilni `overflow-x-auto` inače kliperuje pop-up koji "izlazi" iznad reda).
  const rowOverflowOpen = attachPopupOpen || openChipKey !== null;

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
            void routeDroppedFilesNow(dropped);
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
              "surface-card overflow-hidden border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-16)] flex flex-col z-40",
              isDocked
                ? "sm:absolute sm:bottom-auto sm:left-[calc(100%+16px)] sm:top-0 sm:w-[min(36rem,calc(100vw-26rem))] sm:max-h-[min(calc(100vh-6rem),600px)]"
                : "sm:absolute sm:bottom-[calc(100%+12px)] sm:left-0 sm:right-0 sm:max-h-[min(78vh,600px)]",
              "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-[16px] border-b-0 sm:rounded-[16px] sm:border-b-2",
            )}
          >
            {/* Header: IZABERI MODEL + X */}
            <div className="flex items-center justify-between border-b-2 border-ink bg-paper px-4 py-3 sm:px-5">
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
                {...(lockModelKind ? { lockedKind: activeModel.kind } : {})}
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
      {/* COMPOSER BAR + SAKRIVANJE POLJA                                          */}
      {/* ========================================================================= */}
      <div className="group/composer relative">
        {onToggleCollapse ? (
          <div className="mb-2 flex justify-center">
            {/* Desktop: tekstualno dugme, vidljivo samo na hover/focus polja (ili bilo čega u njemu) */}
            <button
              type="button"
              onClick={handleToggleCollapse}
              aria-expanded={!isCollapsed}
              aria-label={collapseLabel}
              className="hidden min-h-8 items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 text-xs font-black text-ink opacity-0 shadow-[2px_2px_0_0_var(--shadow-hard)] transition-opacity duration-[140ms] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none group-hover/composer:opacity-100 group-focus-within/composer:opacity-100 sm:inline-flex"
            >
              {isCollapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              <span>{collapseLabel}</span>
            </button>

            {/* Mobilni: suptilan caret, uvek vidljiv, rotira se 180° pri kolapsu */}
            <button
              type="button"
              onClick={handleToggleCollapse}
              aria-expanded={!isCollapsed}
              aria-label={collapseLabel}
              className="inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:hidden"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform duration-200 motion-reduce:transition-none",
                  isCollapsed ? "rotate-180" : "rotate-0",
                )}
              />
            </button>
          </div>
        ) : null}

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
        {/* Vidljiv izbor ulaznog režima (K18): opis, slika, prvi i poslednji kadar, reference… */}
        {switchableModes.length > 1 ? (
          <div className="mb-3">
            <ModeSwitcher modes={switchableModes} value={inputMode} onChange={switchMode} locale={locale} disabled={isPending} framed={false} />
          </div>
        ) : null}

        {/* Nastavak (Gemini Omni `video`, K18): izbor ranije generacije istog modela */}
        {sourceRequired ? (
          <div className="mb-3">
            <SourceJobPicker
              modelSlug={activeModel.slug}
              kind={activeModel.kind}
              value={sourceJobId}
              onChange={setSourceJobId}
              locale={locale}
              disabled={isPending}
            />
          </div>
        ) : null}

        {/* Priloženi fajlovi na glavnom inputu (Slika 3); u „prvi i poslednji" i prazni kadrovi */}
        {attachedInputs.length > 0 || inputMode === "first_last" ? (
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

            {/* Prazan početni/završni kadar (K18): klik bira fajl baš za taj kadar */}
            {inputMode === "first_last"
              ? (["first", "last"] as const)
                  .filter((which) => frames[which] === null)
                  .map((which) => (
                    <button
                      key={which}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setFrameTarget(which);
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = "image/png,image/jpeg,image/webp";
                          fileInputRef.current.click();
                        }
                      }}
                      className="surface-media inline-flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 border-2 border-dashed border-ink/40 bg-paper/50 px-1 text-center type-eyebrow-sm leading-tight text-ink/80 transition hover:border-ink hover:bg-paper hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
                    >
                      <ImagePlus aria-hidden="true" className="size-4" />
                      {FRAME_LABELS[which][locale]}
                    </button>
                  ))
              : null}

            {/* Dugme za dodavanje novih fajlova (Slika 3) */}
            {modelAcceptsFiles && inputMode !== "first_last" ? (
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

        {/* @pominjanje (K14): pomenuti likovi kao čipovi */}
        <MentionChips
          locale={locale}
          elements={mentioned}
          sentCounts={sentCounts}
          onRemove={mentions.remove}
          disabled={isPending}
        />

        {/* Prompt Textarea */}
        <textarea
          ref={textareaRef}
          rows={isDocked ? 3 : 1}
          value={prompt}
          onChange={(event) => handlePromptChange(event.target.value)}
          {...mentions.comboboxProps}
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

        {mentions.open ? (
          <MentionSuggestions
            locale={locale}
            listboxId={mentions.listboxId}
            suggestions={mentions.suggestions}
            activeIndex={mentions.activeIndex}
            onHover={mentions.setActive}
            onPick={mentions.pick}
            hasElements={(elements?.length ?? 0) > 0}
            createHref={elementsHref}
          />
        ) : null}

        {/* Van „Slika · Napravi" @pominjanje ima svoje dugme i pregled teksta za model;
            u Video · Napravi (K18) uz njega i režija i poslednji kadar. */}
        {(elements !== undefined || videoExtras || speechSupported) && !createMode ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Glasom do opisa (K25, U8): mikrofon u svakom režimu, ne samo u Slika · Napravi. */}
            <MicButton locale={locale} disabled={isPending} onText={(spoken) => handlePromptChange(appendSpoken(prompt, spoken))} />
            {elements !== undefined ? <MentionButton locale={locale} onClick={mentions.openPicker} disabled={isPending} /> : null}
            {videoExtras ? (
              <>
                <ExtraButton
                  icon={Clapperboard}
                  label={CREA_VIDEO_COPY.direction[locale]}
                  title={CREA_VIDEO_COPY.directionTitle[locale]}
                  open={directorTab !== null}
                  disabled={isPending}
                  onClick={() => setDirectorTab((open) => (open === null ? "pokret" : null))}
                />
                <ExtraButton
                  icon={Plus}
                  label={CREA_VIDEO_COPY.addMove[locale]}
                  open={directorTab === "pokret"}
                  disabled={isPending}
                  onClick={() => setDirectorTab("pokret")}
                />
                <ExtraButton
                  icon={Music}
                  label={CREA_VIDEO_COPY.addSound[locale]}
                  open={false}
                  disabled={isPending}
                  onClick={() => setDirectorTab("pult")}
                />
                {imageMode ? (
                  <ExtraButton
                    icon={Film}
                    label={CREA_VIDEO_COPY.lastFrame[locale]}
                    title={CREA_VIDEO_COPY.lastFrameTitle[locale]}
                    open={framePickerOpen}
                    disabled={isPending}
                    onClick={() => setFramePickerOpen((open) => !open)}
                  />
                ) : null}
                {director.move ? (
                  <LookChip
                    label={`${director.move.label[locale]}${director.move.intensity ? ` · ${CREA_VIDEO_COPY.intensities[director.moveIntensity][locale]}` : ""}`}
                    removeLabel={fillCopy(CREA_VIDEO_COPY.removeChip[locale], { what: director.move.label[locale] })}
                    onRemove={() => setDirector({ ...director, move: null })}
                  />
                ) : null}
                {director.effect ? (
                  <LookChip
                    label={director.effect.label[locale]}
                    removeLabel={fillCopy(CREA_VIDEO_COPY.removeChip[locale], { what: director.effect.label[locale] })}
                    onRemove={() => setDirector({ ...director, picked: [], effect: null })}
                  />
                ) : null}
                {deskCount(director.desk) > 0 ? (
                  <LookChip
                    label={fillCopy(CREA_VIDEO_COPY.deskSummary[locale], { n: deskCount(director.desk) })}
                    removeLabel={fillCopy(CREA_VIDEO_COPY.removeChip[locale], { what: CREA_VIDEO_COPY.tabs.pult[locale] })}
                    onRemove={() => setDirector({ ...director, desk: {} })}
                  />
                ) : null}
                {continuedFrom ? (
                  <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-ink/30 bg-paper px-3 text-xs font-black text-ink">
                    <Film aria-hidden="true" className="size-3.5" />
                    {CREA_VIDEO_COPY.continueFrom[locale]}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {videoExtras && directorTab !== null ? (
          <DirectorPanel
            key={directorTab}
            locale={locale}
            state={director}
            onChange={setDirector}
            onEffectPicked={handleEffectPicked}
            onClose={() => setDirectorTab(null)}
            initialTab={directorTab}
            modelMakesSound={modelMakesSound(activeModel)}
          />
        ) : null}
        {videoExtras && framePickerOpen ? (
          <LastFramePicker locale={locale} onPicked={handleFramePicked} onClose={() => setFramePickerOpen(false)} />
        ) : null}
        {videoExtras && effectNeedsPhoto ? (
          <p role="note" className="pt-1 text-xs font-black text-ink">
            {CREA_VIDEO_COPY.effectNeedsPhoto[locale]}
          </p>
        ) : null}
        {(elementText ?? videoComposed?.text ?? null) !== null && !createMode ? (
          <details className="mt-2 text-xs font-bold text-muted">
            <summary className="cursor-pointer select-none py-1 text-ink">{CREA_CREATE_COPY.preview[locale]}</summary>
            <p className="mt-1 whitespace-pre-line break-words font-semibold">{elementText ?? videoComposed?.text}</p>
          </details>
        ) : null}
        {(elementsOverBy > 0 || (videoComposed?.overBy ?? 0) > 0) && !createMode ? (
          <p role="alert" className="pt-1 text-xs font-black text-red-700 dark:text-red-300">
            {fillCopy(CREA_CREATE_COPY.tooLong[locale], { n: elementsOverBy || videoComposed?.overBy || 0 })}
          </p>
        ) : null}

        {/* Slika · Napravi (K13): pomoćnik za opis i mikrofon (S6), izgled (S8) */}
        {createMode ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExtraPanel((open) => (open === "helper" ? null : "helper"))}
                aria-expanded={extraPanel === "helper"}
                title={CREA_CREATE_COPY.helperTitle[locale]}
                disabled={isPending}
                className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0", extraPanel === "helper" ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}
              >
                <WandSparkles aria-hidden="true" className="size-3.5" />
                <span>{CREA_CREATE_COPY.helper[locale]}</span>
              </button>
              <MicButton
                locale={locale}
                disabled={isPending}
                onText={(spoken) => handlePromptChange(appendSpoken(prompt, spoken))}
              />
              {elements !== undefined ? (
                <MentionButton locale={locale} onClick={mentions.openPicker} disabled={isPending} />
              ) : null}
              <button
                type="button"
                onClick={() => setExtraPanel((open) => (open === "look" ? null : "look"))}
                aria-expanded={extraPanel === "look"}
                disabled={isPending}
                className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0", extraPanel === "look" ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}
              >
                <Palette aria-hidden="true" className="size-3.5" />
                <span>{CREA_CREATE_COPY.look[locale]}</span>
              </button>
              {look.styleId ? (
                <LookChip
                  label={styleById(look.styleId)?.label[locale] ?? ""}
                  removeLabel={fillCopy(CREA_CREATE_COPY.removeLook[locale], { what: styleById(look.styleId)?.label[locale] ?? "" })}
                  onRemove={() => setLook({ ...look, styleId: null })}
                />
              ) : null}
              {look.camera ? (
                <LookChip
                  label={fillCopy(CREA_CREATE_COPY.summaryCamera[locale], { focal: look.camera.focal, aperture: look.camera.aperture })}
                  removeLabel={fillCopy(CREA_CREATE_COPY.removeLook[locale], { what: CREA_CREATE_COPY.tabs.kamera[locale] })}
                  onRemove={() => setLook({ ...look, camera: null })}
                />
              ) : null}
              {look.palette.length > 0 ? (
                <LookChip
                  label={fillCopy(CREA_CREATE_COPY.summaryPalette[locale], { n: look.palette.length })}
                  removeLabel={fillCopy(CREA_CREATE_COPY.removeLook[locale], { what: CREA_CREATE_COPY.tabs.paleta[locale] })}
                  onRemove={() => setLook({ ...look, palette: [] })}
                />
              ) : null}
            </div>
            {extraPanel === "helper" ? (
              <PromptHelper
                locale={locale}
                text={prompt}
                onUse={(next) => {
                  handlePromptChange(next);
                  setExtraPanel(null);
                }}
                onClose={() => setExtraPanel(null)}
              />
            ) : null}
            {extraPanel === "look" ? (
              <LookPanel locale={locale} look={look} onChange={setLook} onClose={() => setExtraPanel(null)} canSaveStyles={canSaveStyles} />
            ) : null}
            {composed || elementText !== null ? (
              <details className="mt-2 text-xs font-bold text-muted">
                <summary className="cursor-pointer select-none py-1 text-ink">{CREA_CREATE_COPY.preview[locale]}</summary>
                <p className="mt-1 whitespace-pre-line break-words font-semibold">{elementText ?? composed?.text}</p>
              </details>
            ) : null}
            {lookTooLong ? (
              <p role="alert" className="pt-1 text-xs font-black text-red-700 dark:text-red-300">
                {fillCopy(CREA_CREATE_COPY.tooLong[locale], { n: elementsOverBy || composed?.overBy || 0 })}
              </p>
            ) : null}
          </>
        ) : null}

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
        ) : queueNotice ? (
          <div role="status" className="pt-1 text-xs font-bold text-muted">
            {queueNotice}
          </div>
        ) : autoNote ? (
          <div role="status" className="pt-1 text-xs font-bold text-muted">
            <Sparkles aria-hidden="true" className="mr-1 inline size-3 text-ink" />
            {autoNote}
          </div>
        ) : null}

        {/* Auto i proba (K07): svoj red, da „Generiši" na telefonu ostane u vidnom polju */}
        {variant === "create" ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* Auto izbor: najjeftiniji model koji ume posao, sa rečenicom „zašto" */}
            <button
              type="button"
              onClick={handleAuto}
              disabled={isPending}
              title={CREA_PICK_COPY.autoTitle[locale]}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Sparkles aria-hidden="true" className="size-3.5" />
              <span>{CREA_PICK_COPY.auto[locale]}</span>
            </button>
            {/* Limit cene za Auto (S3): Auto bira najbolji model koji staje u limit. */}
            {createMode ? (
              <div className="relative inline-flex shrink-0">
                <button
                  type="button"
                  onClick={() => setBudgetOpen((open) => !open)}
                  aria-expanded={budgetOpen}
                  className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0", "bg-paper-strong text-ink")}
                >
                  <Coins aria-hidden="true" className="size-3.5" />
                  <span>
                    {CREA_CREATE_COPY.budget[locale]}: {budget === null ? CREA_CREATE_COPY.budgetNone[locale] : budget}
                  </span>
                </button>
                {budgetOpen ? (
                  <div
                    role="dialog"
                    aria-label={CREA_CREATE_COPY.budgetLabel[locale]}
                    className={cn(
                      "surface-card absolute left-0 z-50 w-64 border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_0_var(--shadow-hard-16)]",
                      isDocked ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
                    )}
                  >
                    <label className="block type-body-sm font-black text-ink">
                      {CREA_CREATE_COPY.budgetLabel[locale]}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={9999}
                        value={budget ?? ""}
                        onChange={(event) => {
                          const value = Math.round(Number(event.target.value));
                          setBudget(event.target.value === "" || !Number.isFinite(value) || value < 1 ? null : Math.min(9999, value));
                        }}
                        className="surface-inset mt-1.5 block min-h-11 w-full border-2 border-ink bg-paper px-3 font-mono text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      />
                    </label>
                    <p className="mt-2 text-xs font-bold text-muted">{CREA_CREATE_COPY.budgetHelp[locale]}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* Varijacije 1-4 (S5) */}
            {createMode && !night ? (
              <fieldset className="inline-flex shrink-0 items-center gap-1">
                <legend className="sr-only">{CREA_CREATE_COPY.variations[locale]}</legend>
                <span aria-hidden="true" className="pr-1 text-xs font-black text-ink">
                  {CREA_CREATE_COPY.variations[locale]}
                </span>
                {VARIATION_COUNTS.map((count) => (
                  <label
                    key={count}
                    className={cn(
                      "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-black transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      variationCount === count ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper-strong text-ink hover:border-ink",
                    )}
                  >
                    <input
                      type="radio"
                      name="crea-variations"
                      value={count}
                      checked={variationCount === count}
                      onChange={() => setVariationCount(count)}
                      className="sr-only"
                    />
                    ×{count}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {/* Proba jeftinijim modelom (K07); pun probni list (4-16 skica) je K13 */}
            {showDraft && draftModel && block?.kind !== "credits" ? (
              <button
                type="button"
                disabled={isPending || block !== null}
                onClick={submitDraft}
                title={fillCopy(CREA_PICK_COPY.tryCheapTitle[locale], { model: modelLabel(draftModel, locale) })}
                aria-label={`${CREA_PICK_COPY.tryCheap[locale]}: ${formatCreditsLong(draftCredits ?? 0, locale)}`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-2 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <FlaskConical aria-hidden="true" className="size-4" />
                <span>{CREA_PICK_COPY.tryCheap[locale]}</span>
                <span className="inline-flex items-center gap-1 font-mono text-sm font-black tabular-nums">
                  <span>{draftCredits}</span>
                  <CreditIcon className="size-3.5" />
                </span>
              </button>
            ) : null}
            {/* Probni list (S4): 4-16 skica jeftinim modelom, pa „Usavrši" */}
            {createMode && onOpenSheet && draftPair && block?.kind !== "credits" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onOpenSheet(composed?.text ?? prompt, activeModel.slug)}
                title={CREA_CREATE_COPY.sheetTitle[locale]}
                className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0", "bg-paper-strong text-ink")}
              >
                <Grid3x3 aria-hidden="true" className="size-3.5" />
                <span>{CREA_CREATE_COPY.sheet[locale]}</span>
              </button>
            ) : null}
            {nightOffer ? (
              <NightToggle
                locale={locale}
                on={night}
                onChange={setNightOn}
                savingsPercent={nightOffer.savings}
                disabled={isPending}
              />
            ) : null}
          </div>
        ) : null}

        {/* Donji red čipova: na mobilnom JEDAN red, bez prelamanja - skrol samo ako baš ne staje */}
        <div
          className={cn(
            "mt-2.5 flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2 sm:overflow-visible",
            rowOverflowOpen ? "overflow-visible" : "studio-command-row overflow-x-auto",
          )}
        >
          {/* Upload dugme (+) sa AttachFilePopup */}
          <div ref={attachContainerRef} className="relative inline-flex shrink-0">
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
                  opensDown={isDocked}
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
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-2.5 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-3.5"
          >
            <ModelMark model={activeModel} size={16} className="shrink-0 text-ink" />
            <span className="max-w-[92px] truncate sm:max-w-none">{modelLabel(activeModel, locale)}</span>
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
              opensDown={isDocked}
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
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-4"
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
            <>
            {freeTryFitsNow ? (
              <button
                type="button"
                aria-pressed={freeTryOn}
                onClick={() => setFreeTryOff((off) => !off)}
                title={CREA_FREE_TRY_COPY.hint[locale]}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                  freeTryOn ? "bg-yellow text-ink" : "bg-paper-strong text-muted",
                )}
              >
                <Gift aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{CREA_FREE_TRY_COPY.label[locale]}</span>
              </button>
            ) : null}
            <button
              type="button"
              disabled={isPending || block !== null || credits === null || lookTooLong}
              onClick={submit}
              aria-label={
                freeTryOn
                  ? `${generateLabel} - ${CREA_FREE_TRY_COPY.label[locale]}`
                  : credits !== null
                    ? locale === "sr"
                      ? `${generateLabel} za ${formatCreditsLong(credits, locale)}`
                      : `${generateLabel} for ${formatCreditsLong(credits, locale)}`
                    : generateLabel
              }
              title={
                block
                  ? blockMessage ?? undefined
                  : freeTryOn
                    ? `${generateLabel} - ${CREA_FREE_TRY_COPY.label[locale]}`
                    : credits !== null
                      ? locale === "sr"
                        ? `${generateLabel} za ${formatCreditsLong(credits, locale)}`
                        : `${generateLabel} for ${formatCreditsLong(credits, locale)}`
                      : generateLabel
              }
              aria-busy={isPending}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full border-2 border-ink px-3 py-2 text-xs font-black transition duration-200 hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-4",
                // Dok se šalje, dugme je „puno" - ne bledi kao zaključano (olovka mu povlači liniju).
                isPending && "disabled:opacity-100",
                isPriceFlashing
                  ? "bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)]"
                  : "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] active:shadow-[1px_1px_0_0_var(--yellow)]",
              )}
            >
              {/* „Generiši" se puni kao olovka (K25, U16): žuta linija se povlači ispod natpisa. */}
              {isPending && !shouldReduceMotion ? (
                <span aria-hidden="true" className="crea-pencil-fill pointer-events-none absolute inset-x-3 bottom-1.5 h-[3px] origin-left rounded-full bg-yellow" />
              ) : null}
              {isPending ? (
                shouldReduceMotion ? <Spinner /> : <Pencil className="size-4 text-yellow" />
              ) : night ? (
                <Moon className={cn("size-4", isPriceFlashing ? "text-ink" : "fill-yellow text-yellow")} />
              ) : (
                <Wand2 className={cn("size-4", isPriceFlashing ? "text-ink" : "text-yellow")} />
              )}
              <span className="hidden sm:inline">{generateLabel}</span>
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
            </>
          )}
        </div>
        </motion.div>
      </div>

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
