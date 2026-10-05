"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Izbor jedne opcije kao niz pilula (radio grupa) - isti izgled kao izbor
 * formata u „Promeni format" (K04). Ivica je oznaka kontrole, ne okvir grupe.
 */
export function ChoiceChips<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ id: T; label: ReactNode; hint?: string }>;
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="type-body-sm font-black text-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "inline-flex min-h-11 cursor-pointer flex-col justify-center rounded-full border-2 px-4 py-1 text-sm font-black leading-tight transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 motion-reduce:transition-none",
              value === option.id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(option.id)}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            <span>{option.label}</span>
            {option.hint ? (
              <span className={cn("text-xs font-bold", value === option.id ? "text-paper-strong/80" : "text-muted")}>
                {option.hint}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
