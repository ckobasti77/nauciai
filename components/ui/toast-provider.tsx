"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

type ToastRecord = ToastInput & { id: string; tone: ToastTone };

type ToastContextValue = {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string, action?: ToastAction) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { surface: string; icon: typeof CheckCircle2 }> = {
  success: { surface: "border-emerald-700 bg-emerald-50 text-emerald-950", icon: CheckCircle2 },
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
      const record: ToastRecord = { ...input, id, tone: input.tone ?? "info" };
      setToasts((current) => [...current.slice(-2), record]);
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
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">{toast.title}</p>
                  {toast.message ? <p className="mt-0.5 text-xs font-semibold leading-5 opacity-80">{toast.message}</p> : null}
                  {toast.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                      className="mt-2 inline-flex min-h-9 items-center rounded-full border border-current px-3 text-xs font-black underline underline-offset-2"
                    >
                      {toast.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-current/30"
                  aria-label="Close notification"
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
