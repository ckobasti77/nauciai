"use client";

import { Check, Lock } from "lucide-react";

import { IgraArt } from "@/components/igra/igra-art";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { IgraBannerKey } from "@/lib/igra-banners";
import { IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import { bannerOptions } from "@/lib/igra-profile";
import type { Locale } from "@/lib/i18n";

/**
 * Izbor banera na sopstvenom profilu (K13). Šest banera; otključan se bira jednim klikom,
 * zaključan je bled sa katancem i nivoom od kog se otključava („Od nivoa 7"). Samo izgled:
 * nema kupovine ni nagrade. Prezentaciono - upis (`igra:setBanner`) radi stranica.
 */
export function BannerPicker({
  open,
  onClose,
  level,
  selected,
  pending,
  error,
  onSelect,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  /** Tekući nivo vlasnika. */
  level: number;
  /** Izabrani baner; `null` = podrazumevani. */
  selected: IgraBannerKey | null;
  /** Baner koji se upravo upisuje. */
  pending: IgraBannerKey | null;
  error: string | null;
  onSelect: (banner: IgraBannerKey) => void;
  locale: Locale;
}) {
  const copy = IGRA_PROFILE_COPY;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      align="sheet"
      title={copy.bannerTitle[locale]}
      description={copy.bannerBody[locale]}
      closeLabel={copy.close[locale]}
      contentClassName="space-y-4"
    >
      {error ? (
        <p role="alert" className="surface-inset border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-800">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {bannerOptions(level, selected, locale).map((option) => (
          <li key={option.key}>
            <button
              type="button"
              disabled={!option.unlocked || pending !== null}
              aria-pressed={option.selected}
              aria-label={option.label}
              onClick={() => onSelect(option.key)}
              className={cn(
                "surface-inset block w-full overflow-hidden border-2 bg-paper-strong p-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                option.selected ? "border-ink shadow-[3px_3px_0_0_var(--yellow)]" : "border-line",
                option.unlocked && !option.selected && "hover:border-ink",
                !option.unlocked && "cursor-not-allowed",
              )}
            >
              <span className="relative block">
                <IgraArt id={option.art} size="hero" decorative className={cn("surface-media", !option.unlocked && "opacity-40 grayscale")} />
                {!option.unlocked ? (
                  <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                    <span className="grid size-10 place-items-center rounded-full bg-paper-strong text-ink shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
                      <Lock className="size-5" />
                    </span>
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="flex min-h-11 items-center justify-between gap-2 px-1 pt-2">
                <span className="font-black text-ink">{option.name}</span>
                {pending === option.key ? (
                  <Spinner />
                ) : option.selected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2.5 py-0.5 type-eyebrow-sm text-ink">
                    <Check className="size-3.5" />
                    {option.note}
                  </span>
                ) : option.note ? (
                  <span className="type-caption font-black text-muted">{option.note}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
