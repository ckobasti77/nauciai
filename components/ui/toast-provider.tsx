"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { normalizeLocale, t, type Locale } from "@/lib/i18n";
import { playIgraSfx } from "@/lib/igra-sound";

// Mali Robi u tostu uspeha (K24). Lenjo: tost se pojavljuje samo posle prijave, a provajder
// stoji na svakoj strani, pa slike i manifest ne idu u početni JS javnog sajta.
const ToastLik = dynamic(() => import("@/components/igra/igra-lik").then((m) => m.IgraLik));

type ToastTone = "success" | "error" | "warning" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message?: string;
  action?: ToastAction;
  duration?: number;
};

type ToastRecord = ToastInput & { id: string; tone: ToastTone; locale: Locale };

type ToastContextValue = {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string, action?: ToastAction) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Uspeh je sveska (K24): papir, mastilo, marker preko naslova i lik umesto ikone. Greška,
// upozorenje i info zadržavaju statusne boje i ikonu, da se na prvi pogled razlikuju.
const toneStyles: Record<ToastTone, { surface: string; icon: typeof CheckCircle2 }> = {
  success: { surface: "border-ink bg-paper-strong text-ink", icon: CheckCircle2 },
  error: { surface: "border-red-700 bg-red-50 text-red-950", icon: CircleAlert },
  warning: { surface: "border-ink bg-yellow/30 text-ink", icon: CircleAlert },
  info: { surface: "border-blue-700 bg-blue-50 text-blue-950", icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const locale = normalizeLocale(document.documentElement.lang);
      const record: ToastRecord = { ...input, id, tone: input.tone ?? "info", locale };
      setToasts((current) => [...current.slice(-2), record]);
      // Zvuk samo kroz postojeći prekidač (`playIgraSfx` ćuti kad je isključen).
      if (record.tone === "success") playIgraSfx("success");
      return id;
    },
    [],
  );

  useEffect(() => {
    const timers = toasts.map((toast) => {
      const duration = toast.duration ?? (toast.tone === "success" ? 5000 : 8000);
      return window.setTimeout(() => dismiss(toast.id), duration);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismiss, toasts]);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (title, message) => push({ tone: "success", title, message }),
      error: (title, message) => push({ tone: "error", title, message }),
      warning: (title, message, action) => push({ tone: "warning", title, message, action }),
    }),
    [dismiss, push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Traka poruka nikad ne sme da izađe iz ekrana, ni na jednom brejkpointu:
        - mobilni: `inset-x-3` je drži tačno 12px od obe ivice (širina je razlika, ne sadržaj);
        - od `sm`: usidrena je desno (`right-4`), a `max-w` je manje od 28rem i raspoloživog
          prostora do leve ivice, pa duga poruka lomi red umesto da gura desnu ivicu.
        `100svw` (a ne `100vw`) jer `vw` na mobilnom Safariju ne oduzima traku za skrol.
      */}
      <div
        className="pointer-events-none fixed inset-x-3 top-3 z-[200] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:max-w-[min(28rem,calc(100svw-2rem))]"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = toneStyles[toast.tone];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`toast-enter pointer-events-auto w-full rounded-[16px] border-2 p-3 shadow-[5px_5px_0_var(--shadow-hard)] ${style.surface}`}
            >
              <div className="flex items-start gap-3">
                {toast.tone === "success" ? (
                  <ToastLik lik="robi" poza="slavi" size="sm" decorative className="-my-1 shrink-0" />
                ) : (
                  <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="type-body-sm font-black">
                    {toast.tone === "success" ? <span className="igra-marker bg-yellow text-ink">{toast.title}</span> : toast.title}
                  </p>
                  {toast.message ? <p className="mt-1 type-caption font-semibold opacity-80">{toast.message}</p> : null}
                  {toast.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                      className="mt-2 inline-flex min-h-9 items-center rounded-full border border-current px-3 type-caption font-black underline underline-offset-2"
                    >
                      {toast.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-my-1.5 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-current"
                  aria-label={t(toast.locale, "Zatvori obaveštenje", "Close notification")}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
