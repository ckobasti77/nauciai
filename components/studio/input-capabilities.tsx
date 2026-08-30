"use client";

import { AudioLines, Clapperboard, GalleryHorizontalEnd, Image as ImageIcon, Layers } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import {
  capabilityChips,
  modeProviding,
  modelInputCapabilities,
  type InputCapabilities,
  type InputCapabilityKey,
} from "@/lib/studio-capabilities";
import type { StudioModel } from "@/lib/studio-models";
import { slotLabel } from "@/lib/studio-slots";

const ICONS: Record<InputCapabilityKey, typeof ImageIcon> = {
  image: ImageIcon,
  firstLast: GalleryHorizontalEnd,
  reference: Layers,
  video: Clapperboard,
  audio: AudioLines,
};

const LABELS: Record<InputCapabilityKey, { sr: string; en: string }> = {
  image: { sr: "Slika", en: "Image" },
  firstLast: { sr: "Početni/završni kadar", en: "First/last frame" },
  reference: { sr: "Referentne", en: "References" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
};

const NOT_POSSIBLE: Record<InputCapabilityKey, { sr: string; en: string }> = {
  image: { sr: "Ovaj model ne prima slike.", en: "This model does not accept images." },
  firstLast: {
    sr: "Ovaj model ne prima početni i završni kadar.",
    en: "This model does not accept a first and last frame.",
  },
  reference: { sr: "Ovaj model ne prima referentne fajlove.", en: "This model does not accept reference files." },
  video: { sr: "Ovaj model ne prima video.", en: "This model does not accept video." },
  audio: { sr: "Ovaj model ne prima zvuk.", en: "This model does not accept audio." },
};

/** Natpis čipa: ime sposobnosti + količina/imena slotova kad to nosi informaciju. */
export function capabilityLabel(caps: InputCapabilities, key: InputCapabilityKey, locale: Locale): string {
  const base = LABELS[key][locale];
  if (key === "image" && caps.image) {
    const named = caps.image.slots.filter((slot) => slot !== "image");
    if (named.length > 0) return named.map((slot) => slotLabel(slot, locale)).join(" · ");
    return caps.image.max > 1 ? `${base} · ${locale === "sr" ? "do" : "up to"} ${caps.image.max}` : base;
  }
  if (key === "reference" && caps.reference) {
    const parts: string[] = [];
    if (caps.reference.images > 0) parts.push(`${caps.reference.images} ${locale === "sr" ? "slika" : "img"}`);
    if (caps.reference.videos > 0) parts.push(`${caps.reference.videos} video`);
    if (caps.reference.audio > 0) parts.push(`${caps.reference.audio} ${locale === "sr" ? "zvuk" : "audio"}`);
    return parts.length > 0 ? `${base} · ${parts.join(", ")}` : base;
  }
  if (key === "video" && caps.video === "continuation") {
    return locale === "sr" ? "Nastavlja tvoj raniji video" : "Continues your earlier video";
  }
  return base;
}

/**
 * Traka „šta model prima" (SP2) u telu podešavanja: podržano = čip koji vodi u
 * režim sa tim poljima; nepodržano = sivo + „nije moguće". Traka NE zamenjuje
 * `ModeSwitcher` - ona je prečica ka režimu, a režim ostaje ugovor iz
 * kataloga v4 (sekcija 5).
 */
export function InputCapabilityStrip({
  model,
  activeMode,
  onPickMode,
  locale,
  disabled = false,
}: {
  model: StudioModel;
  activeMode: string;
  onPickMode: (mode: string) => void;
  locale: Locale;
  disabled?: boolean;
}) {
  const chips = capabilityChips(model);
  if (chips.length === 0) return null;
  const caps = modelInputCapabilities(model);

  return (
    <div
      role="group"
      aria-label={locale === "sr" ? "Šta model prima" : "What the model accepts"}
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map(({ key, supported }) => {
        const Icon = ICONS[key];
        const label = capabilityLabel(caps, key, locale);
        const mode = supported ? modeProviding(model, key) : null;
        const active = mode !== null && mode === activeMode;

        if (!supported) {
          return (
            <span
              key={key}
              aria-disabled="true"
              title={NOT_POSSIBLE[key][locale]}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-dashed border-ink/30 px-2.5 py-1 text-[11px] font-bold text-muted line-through decoration-ink/40"
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
              <span className="no-underline text-[10px] font-black uppercase tracking-wide">
                {locale === "sr" ? "nije moguće" : "not possible"}
              </span>
            </span>
          );
        }

        // Podržano bez režima za fajl (video-nastavak): informacija, ne dugme.
        if (mode === null) {
          return (
            <span
              key={key}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-1 text-[11px] font-black text-ink"
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </span>
          );
        }

        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onPickMode(mode)}
            title={
              locale === "sr" ? `Otvori polja: ${label}` : `Open fields: ${label}`
            }
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-[11px] font-black transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5",
            )}
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Iste sposobnosti kao male ikone u redu modela u biraču - da se PRE izbora
 * vidi šta model prima. Sivo = ne prima. Bez teksta, `title` nosi objašnjenje.
 */
export function InputCapabilityIcons({
  model,
  locale,
  muted = false,
}: {
  model: StudioModel;
  locale: Locale;
  muted?: boolean;
}) {
  const chips = capabilityChips(model);
  if (chips.length === 0) return null;
  const caps = modelInputCapabilities(model);

  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-hidden="false">
      {chips.map(({ key, supported }) => {
        const Icon = ICONS[key];
        const label = capabilityLabel(caps, key, locale);
        return (
          <span
            key={key}
            role="img"
            aria-label={supported ? label : NOT_POSSIBLE[key][locale]}
            title={supported ? label : NOT_POSSIBLE[key][locale]}
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full",
              supported ? (muted ? "opacity-90" : "opacity-100") : "opacity-30",
            )}
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
}
