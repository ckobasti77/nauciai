"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";

export function AppComposerSheet({
  title,
  eyebrow,
  children,
  open,
  onClose,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !contentRef.current || shouldReduceMotion) return;

    const context = gsap.context(() => {
      gsap.from(".composer-stagger", {
        autoAlpha: 0,
        y: 14,
        duration: 0.36,
        ease: "power2.out",
        stagger: 0.05,
      });
    }, contentRef);

    return () => context.revert();
  }, [open, shouldReduceMotion]);

  const sheet = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-scrim/35 p-0 backdrop-blur-[2px] sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={onClose}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 42, scale: 0.985 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="ml-auto flex h-full w-full max-w-6xl flex-col overflow-hidden border-l-2 border-ink bg-paper shadow-[-12px_0_0_0_var(--shadow-hard-16)] sm:rounded-[16px] sm:border-2"
          >
            <div className="flex items-start justify-between gap-4 border-b-2 border-ink bg-paper-strong px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-muted">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-ink sm:text-3xl">{title}</h2>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close"
                whileHover={{ rotate: 3 }}
                whileTap={{ scale: 0.92 }}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <X className="size-4" />
              </motion.button>
            </div>
            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {children}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document === "undefined" ? null : createPortal(sheet, document.body);
}
