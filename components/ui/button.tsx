import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { Spinner, type SpinnerSize } from "@/components/ui/spinner";

/**
 * Dugme u aplikaciji. Namerno NE ispisuje `rounded-*`: `app/globals.css` u
 * `@layer base` daje svakom `<button>` sa klasom pilulu (`--button-radius`), pa
 * bi rucni radius ovde bio i suvisan i lako pogresan (vidi AGENTS.md).
 *
 * Varijantu i velicinu bira komponenta, ne pozivalac preko `className`: `cn` je
 * obican join, a ne tailwind-merge, pa dve utility klase iste grupe resava
 * redosled u generisanom CSS-u, ne redosled u stringu. `className` je zato samo
 * za dopune (sirina, margina, senka), nikad za pregazivanje varijante.
 */
const buttonVariants = {
  primary: "border-2 border-ink bg-yellow text-ink hover:bg-yellow/85",
  secondary: "border-2 border-ink bg-paper-strong text-ink hover:bg-paper",
  ghost: "border-2 border-transparent bg-transparent text-ink hover:bg-paper",
  destructive: "border-2 border-ink bg-red-600 text-white hover:bg-red-700",
} as const;

const buttonSizes = {
  sm: "min-h-10 gap-1.5 px-3.5 text-xs",
  md: "min-h-11 gap-2 px-4 text-sm",
  lg: "min-h-12 gap-2 px-5 text-base",
} as const;

const spinnerForSize: Record<keyof typeof buttonSizes, SpinnerSize> = {
  sm: "xs",
  md: "sm",
  lg: "sm",
};

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Prikazuje Spinner umesto ikone i sam onemogucava dugme, da se radnja ne posalje dvaput. */
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-motion="interactive"
      className={cn(
        "inline-flex select-none items-center justify-center font-black transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "active:translate-y-px",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
    >
      {loading ? <Spinner size={spinnerForSize[size]} /> : icon}
      {children}
    </button>
  );
}
