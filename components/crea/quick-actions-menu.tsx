"use client";

import Link from "next/link";
import { Clapperboard, Copy, Eraser, FastForward, Film, ImagePlus, Maximize2, PenLine, Volume2, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/components/ui/primitives";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import type { QuickActionId } from "@/lib/crea-quick-actions";
import type { Locale } from "@/lib/i18n";

/** Brza akcija spremna za prikaz: tekst i adresa (`quickActionQuery` u `StudioPage`). */
export type QuickActionLink = { id: QuickActionId; label: string; href: string };

export const QUICK_ACTION_ICONS: Record<QuickActionId, LucideIcon> = {
  animiraj: Clapperboard,
  nastavi: Film,
  produzi: FastForward,
  ozvuci: Volume2,
  izmeni: PenLine,
  uvecaj: Maximize2,
  pozadina: Eraser,
  slicna: Copy,
  referenca: ImagePlus,
};

const MENU_WIDTH = 248;
const GAP = 8;

/**
 * Dugme „Brze akcije" na kartici rada (K16, S44) i meni sa akcijama. Meni je
 * plutajući sloj (svoj okvir, AGENTS.md) i ide kroz portal sa `position: fixed`,
 * jer bi ga medijski bunar kartice (`overflow-hidden`) inače odsekao. Na dodir je
 * dugme uvek vidljivo i 44 px; na mišu se pojavljuje na prelaz, kao ostala dugmad.
 */
export function QuickActionsMenu({ locale, actions, className }: { locale: Locale; actions: readonly QuickActionLink[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportH = window.innerHeight;
      const below = viewportH - rect.bottom - GAP * 2;
      const above = rect.top - GAP * 2;
      const wanted = menuRef.current?.scrollHeight ?? 320;
      const left = Math.max(GAP, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - GAP));
      if (above >= Math.min(wanted, 320) || above > below) {
        const maxHeight = Math.max(160, above);
        setPosition({ left, top: rect.top - GAP - Math.min(wanted, maxHeight), maxHeight });
      } else {
        setPosition({ left, top: rect.bottom + GAP, maxHeight: Math.max(160, below) });
      }
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={L.quickMenu[locale]}
        title={L.quickMenu[locale]}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)] transition duration-150 hover:scale-105 pointer-coarse:size-11 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:scale-100",
          className,
        )}
      >
        <Zap aria-hidden="true" className="size-4" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={L.quickTitle[locale]}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                left: position?.left ?? -9999,
                top: position?.top ?? -9999,
                width: MENU_WIDTH,
                maxHeight: position?.maxHeight,
              }}
              className="surface-card z-[70] overflow-y-auto border-2 border-ink bg-paper-strong p-1.5 text-ink shadow-[4px_4px_0_0_var(--shadow-hard-16)]"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-black uppercase tracking-wide text-muted">{L.quickTitle[locale]}</p>
              {actions.map((action) => {
                const Icon = QUICK_ACTION_ICONS[action.id];
                return (
                  <Link
                    key={action.id}
                    href={action.href}
                    scroll={false}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="surface-inset flex min-h-11 items-center gap-2.5 px-2.5 text-sm font-black text-ink transition-colors hover:bg-yellow/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink motion-reduce:transition-none"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {action.label}
                  </Link>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
