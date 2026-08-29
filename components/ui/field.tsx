"use client";

import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Atributi koje `Field` prosledjuje kontroli. Sve troje su pravi DOM atributi,
 * pa smeju da se rasprostru i na `<input>`, i na `<textarea>`, i na `<select>`.
 */
export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

/**
 * Oznaka iznad kontrole, pomocni tekst ili greska ispod nje.
 *
 * Greska se NIKAD ne saopstava samo bojom: uz crveni tekst ide i ikona, a
 * kontrola dobija `aria-invalid` i `aria-describedby`, pa je citac ekrana
 * procita zajedno sa poljem.
 */
export function Field({
  id: idProp,
  label,
  hint,
  error,
  className,
  children,
}: {
  /** Prosledi kad kontrola vec ima stabilan `id` (autofill, `name`, spoljni `htmlFor`). */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (field: FieldControlProps) => ReactNode;
}) {
  const generatedId = useId();
  const controlId = idProp ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  return (
    <div className={cn("block", className)}>
      <label htmlFor={controlId} className="block text-sm font-black text-ink">
        {label}
      </label>
      <div className="mt-2">
        {children({
          id: controlId,
          "aria-describedby": error ? errorId : hint ? hintId : undefined,
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-black text-red-700">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs font-bold text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `outline-none` se ovde namerno NE pise. U Tailwind-u 4 `outline-none` postavi
 * `--tw-outline-style: none`, a `focus-visible:outline-2` cita bas tu
 * promenljivu - pa bi njih dvoje zajedno ugasili prsten koji upravo pokusavamo
 * da vratimo. Bez `outline-none` je pocetna vrednost `solid` i prsten radi.
 */
const controlBase =
  "w-full surface-media border-2 text-ink transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function controlTone(invalid: boolean, readOnly: boolean) {
  if (readOnly) return "border-line bg-paper text-muted";
  if (invalid) return "border-red-600 bg-paper-strong";
  return "border-ink bg-paper-strong focus:border-yellow";
}

export function Input({
  className,
  compact = false,
  ...props
}: ComponentProps<"input"> & {
  /** Gusca varijanta za sporedna polja (linkovi profila): `text-sm` umesto `text-base`. */
  compact?: boolean;
}) {
  return (
    <input
      {...props}
      className={cn(
        controlBase,
        "h-12 px-4",
        compact ? "text-sm font-bold" : "text-base font-extrabold",
        controlTone(props["aria-invalid"] === true, Boolean(props.readOnly)),
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

/**
 * Nativni `<select>` sa istim okvirom i istim fokus prstenom kao `Input`.
 * Postoji zato sto se u istom obrascu mesaju polja i padajuce liste, pa bi
 * inace svaka lista opet dobila rucno ispisan recept (i opet izgubila fokus).
 */
export function Select({
  className,
  compact = false,
  ...props
}: ComponentProps<"select"> & { compact?: boolean }) {
  return (
    <select
      {...props}
      className={cn(
        controlBase,
        "h-12 px-4",
        compact ? "text-sm font-bold" : "text-base font-extrabold",
        controlTone(props["aria-invalid"] === true, false),
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  compact = false,
  ...props
}: ComponentProps<"textarea"> & { compact?: boolean }) {
  return (
    <textarea
      {...props}
      className={cn(
        controlBase,
        "resize-y px-4 py-3 leading-6",
        // Duzi slobodan tekst se cita losije u najtezoj gradaciji, pa je
        // textarea za jedan stepen laksa od jednorednog polja - tako je i danas
        // na svim pozivnim mestima (biografija, razlog prijave).
        compact ? "text-sm font-semibold" : "text-base font-bold",
        controlTone(props["aria-invalid"] === true, Boolean(props.readOnly)),
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
