"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { tabTrapAction } from "@/lib/focus-trap";

/**
 * Fokus u modalu: Escape, Tab ciklus u oba smera, zakljucan `body` skrol i
 * vracanje fokusa na element sa koga je modal otvoren.
 *
 * Podignuto iz `components/app/member-profile.tsx` (jedna od tri skoro
 * identicne kopije po repou, i jedina kompletna). Dve namerne izmene u odnosu
 * na original - obe su preuzete od druge dve kopije, jer objedinjavanje mora da
 * zadrzi sve sto je bilo koja od njih umela:
 *
 * 1. Selektor sada broji i `input` i `select` (tako je radila kopija u
 *    `components/app/chat/chat-dialogs.tsx`). Bez toga bi dijalozi sa formom -
 *    izbor razloga prijave, ime grupe - ispali iz Tab prstena.
 * 2. `[data-dialog-initial-focus]` ima prednost pri prvom fokusu (tako je
 *    radila kopija u `components/app/community-thread-dialog.tsx`). Bez toga
 *    prvi fokus uvek uzme dugme za zatvaranje, jer je prvo u DOM-u, pa polje
 *    zbog koga je dijalog i otvoren ostane preskoceno.
 *
 * 3. Escape/Tab hvata samo modal na vrhu steka, a skrol strane otkljucava tek
 *    poslednji koji se zatvori (vidi `openTraps` ispod). Original je to imao
 *    kao gresku koja se nije videla dok su modali bili sami; cim ih ima dva
 *    jedan preko drugog, bez ovoga se otimaju oko fokusa i zakljucaju stranu.
 *
 * Racun "ko je sledeci na Tab" zivi u `lib/focus-trap.ts` (`tabTrapAction`) i
 * ima testove; ovde ostaje samo rad sa DOM-om, koji se u ovom test okruzenju
 * ionako ne moze proveriti.
 */
/**
 * Stek otvorenih modala. Escape i Tab sme da hvata samo onaj na vrhu.
 *
 * Bez ovoga se dva ugnjezdena modala otimaju oko fokusa: potvrda "Nesnimljene
 * izmene" otvara se povrh admin composer panela, a prijava povrh detalja
 * razgovora. Oba slusaca stoje na `document`, pa bi Shift+Tab u gornjem modalu
 * donji vratio u sebe, a Escape zatvorio i jedan i drugi odjednom.
 */
const openTraps: symbol[] = [];

/**
 * Skrol strane zakljucava PRVI otvoren modal, a otkljucava ga tek POSLEDNJI koji
 * se zatvori. Kad je svaki modal cuvao i vracao `overflow` za sebe, zatvaranje
 * oba u istom potezu (npr. "Ponisti i nastavi" u admin composeru gasi i potvrdu
 * i panel) vratilo bi `hidden` koje je zatekao gornji modal - i strana bi ostala
 * zakljucana zauvek.
 */
let overflowBeforeFirstTrap: string | null = null;

function lockBodyScroll() {
  if (openTraps.length !== 1) return;
  overflowBeforeFirstTrap = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  if (openTraps.length !== 0) return;
  document.body.style.overflow = overflowBeforeFirstTrap ?? "";
  overflowBeforeFirstTrap = null;
}

export function useModalFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const trap = Symbol("modal-focus");
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openTraps.push(trap);
    lockBodyScroll();
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      const first = preferred ?? dialogRef.current?.querySelector<HTMLElement>(
        '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? dialogRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (openTraps[openTraps.length - 1] !== trap) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const action = tabTrapAction({
        count: controls.length,
        activeIndex: active ? controls.indexOf(active) : -1,
        // Namerno `document.activeElement`, a ne `active`: `contains` prihvata bilo
        // koji cvor, pa i fokusiran SVG unutar modala i dalje broji kao "unutra".
        activeInside: dialogRef.current.contains(document.activeElement),
        shiftKey: event.shiftKey,
      });
      if (action.kind === "native") return;
      event.preventDefault();
      if (action.kind === "container") dialogRef.current.focus();
      else controls[action.index].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      const index = openTraps.indexOf(trap);
      if (index !== -1) openTraps.splice(index, 1);
      unlockBodyScroll();
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  return dialogRef;
}

export type DialogSize = "sm" | "md" | "lg";

const centeredWidths: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

// U "sheet" rasporedu modal sedi uz donju ivicu i pun je sirine na telefonu, pa
// ogranicenje sirine sme da se ukljuci tek od `sm` navise.
const sheetWidths: Record<DialogSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  eyebrow,
  description,
  children,
  footer,
  size = "md",
  align = "center",
  showClose = true,
  dismissOnScrim = true,
  className,
  contentClassName,
  overlayClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Pristupacno ime dugmeta za zatvaranje - ide kroz `lib/i18n`, kao i svaki drugi tekst. */
  closeLabel: string;
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  align?: "center" | "sheet";
  showClose?: boolean;
  dismissOnScrim?: boolean;
  className?: string;
  contentClassName?: string;
  overlayClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalFocus(open, onClose);
  const reduceMotion = useReducedMotion();

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn(
            "fixed inset-0 z-[120] grid bg-scrim/50 backdrop-blur-[2px]",
            align === "sheet" ? "place-items-end p-0 sm:place-items-center sm:p-4" : "place-items-center p-4",
            overlayClassName,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (dismissOnScrim && event.currentTarget === event.target) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.05, 0.7, 0.1, 1] }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border-2 border-ink bg-paper-strong shadow-[8px_8px_0_0_var(--shadow-hard-22)]",
              align === "sheet" ? "rounded-t-[16px] sm:rounded-[16px]" : "rounded-[16px]",
              align === "sheet" ? sheetWidths[size] : centeredWidths[size],
              className,
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-ink px-5 py-4">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="type-eyebrow text-muted">{eyebrow}</p>
                ) : null}
                <h2 id={titleId} className={cn("type-h2 text-ink", eyebrow && "mt-1")}>
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-2 type-body-sm font-semibold text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              {showClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            {children ? (
              <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5", contentClassName)}>{children}</div>
            ) : null}
            {footer ? <div className="shrink-0 border-t-2 border-ink px-5 py-4">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  eyebrow,
  busy = false,
  destructive = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  eyebrow?: string;
  /** Dok radnja traje, modal se ne zatvara ni Escape-om ni klikom na pozadinu. */
  busy?: boolean;
  destructive?: boolean;
  /** Mesto za poruku o gresci ili dodatno upozorenje iznad dugmadi. */
  children?: ReactNode;
}) {
  const guardedClose = busy ? () => undefined : onClose;

  return (
    <Dialog
      open={open}
      onClose={guardedClose}
      title={title}
      description={description}
      eyebrow={eyebrow}
      closeLabel={closeLabel}
      size="sm"
      dismissOnScrim={!busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={guardedClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={() => void onConfirm()}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children}
    </Dialog>
  );
}
