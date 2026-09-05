"use client";

import { Check, Copy, Mail, MessageCircle, Phone, Send, Share2 } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { buildShareLinks, type CommunityShareTarget } from "@/lib/community-share";
import { t, type Locale } from "@/lib/i18n";

const TARGET_META: Record<CommunityShareTarget, { label: string; icon: ComponentType<{ className?: string }> }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  viber: { label: "Viber", icon: Phone },
  telegram: { label: "Telegram", icon: Send },
  x: { label: "X", icon: Share2 },
  email: { label: "Email", icon: Mail },
};

async function copyToClipboard(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

/**
 * Deljenje teme. Nativni share list koristi SAMO na dodirnim uredjajima
 * (`pointer: coarse`) kad `navigator.share` postoji i `canShare` prizna podatke;
 * na desktopu (fine pointer) UVEK otvara nas Dialog. Bez provere pokazivaca,
 * `canShare` na Windows Chrome-u vrati `true`, `navigator.share` otvori sistemski
 * share flyout koji se odmah zatvori, pa korisnik nikad ne vidi nas Dialog.
 *
 * Dialog nema outside-click slusaca na `document`: zatvara se preko scrim
 * `onMouseDown` handlera koji se montira tek kad je `open === true` (vidi
 * `components/ui/dialog.tsx`), pa klik koji ga otvara ne moze da ga zatvori.
 * Mreze idu kao obicni `<a target=_blank>` - nikad `window.open` popup.
 */
export function ShareThreadButton({
  locale,
  title,
  body,
  threadHref,
  variant = "icon",
}: {
  locale: Locale;
  title: string;
  body: string;
  threadHref: string;
  variant?: "icon" | "labeled";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.origin + threadHref;
    const payload: ShareData = { title, text: body, url };
    // Nativni share samo na dodirnim uredjajima. Na desktopu (fine pointer) uvek Dialog.
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && typeof navigator.share === "function" && navigator.canShare?.(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Nativni share je pukao - padamo na Dialog ispod.
      }
    }
    setShareUrl(url);
    setCopied(false);
    setOpen(true);
  }

  async function handleCopy() {
    try {
      await copyToClipboard(shareUrl);
      setCopied(true);
      toast.success(t(locale, "Link je kopiran.", "Link copied."));
    } catch {
      toast.error(
        t(
          locale,
          "Link nije kopiran. Označi adresu u polju i kopiraj je ručno.",
          "The link was not copied. Select the address in the field and copy it manually.",
        ),
      );
    }
  }

  const ariaLabel = t(locale, "Podeli diskusiju", "Share discussion");

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleShare}
          aria-label={ariaLabel}
          className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:size-8"
        >
          <Share2 className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink transition hover:-translate-y-0.5 hover:border-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0 sm:min-h-10"
        >
          <Share2 className="size-4" aria-hidden="true" />
          {t(locale, "Podeli", "Share")}
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        eyebrow={t(locale, "Zajednica", "Community")}
        title={ariaLabel}
        description={title}
        closeLabel={t(locale, "Zatvori", "Close")}
        contentClassName="space-y-4"
      >
        <div>
          <label className="type-eyebrow text-muted" htmlFor="community-share-link">
            {t(locale, "Link do diskusije", "Discussion link")}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="community-share-link"
              type="text"
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
            <button
              type="button"
              data-dialog-initial-focus
              onClick={handleCopy}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? t(locale, "Kopirano", "Copied") : t(locale, "Kopiraj link", "Copy link")}
            </button>
          </div>
        </div>

        <div>
          <p className="type-eyebrow text-muted">{t(locale, "Pošalji preko", "Send through")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {buildShareLinks(shareUrl, title).map(({ key, href }) => {
              const { label, icon: Icon } = TARGET_META[key];
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-sm font-black text-ink transition hover:-translate-y-0.5 hover:border-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
