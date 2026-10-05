import { cn } from "@/components/ui/primitives";
import type { PromptPartKind } from "@/convex/creaLlmCore";
import { CREA_CREATE_COPY } from "@/lib/crea-create-copy";
import type { Locale } from "@/lib/i18n";
import { promptSegments } from "@/lib/crea-prompt-parts";

/**
 * Boja dela opisa (S6). Pet delova traži pet boja koje tema nema kao tokene, pa
 * se koristi Tailwind paleta sa svetlom i tamnom varijantom (kontrast ≥ 4.5:1 u
 * obe teme) - isto kao statusne boje (`amber`, `red`) u ostatku aplikacije.
 */
export const PART_TONE: Record<PromptPartKind, string> = {
  ko: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
  sta: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
  stil: "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
  svetlo: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  kamera: "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100",
};

/**
 * Postojeći opis rada obojen po delovima (K16, S45): tekst ostaje doslovno isti,
 * samo su delovi (Ko · Šta · Stil · Svetlo · Kamera) označeni bojom, a legenda
 * ispod imenuje samo boje koje se pojavljuju.
 */
export function PromptSegmentsView({ locale, prompt, legendLabel }: { locale: Locale; prompt: string; legendLabel: string }) {
  const segments = promptSegments(prompt);
  const kinds = [...new Set(segments.map((segment) => segment.kind))];
  return (
    <div>
      <p className="text-xs font-bold leading-relaxed text-ink">
        {segments.map((segment, index) => (
          <span
            key={index}
            className={cn("box-decoration-clone rounded-full px-1 py-0.5", PART_TONE[segment.kind])}
            title={CREA_CREATE_COPY.parts[segment.kind][locale]}
          >
            {segment.text}
          </span>
        ))}
      </p>
      {kinds.length > 1 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted">
          <span>{legendLabel}</span>
          {kinds.map((kind) => (
            <span key={kind} className={cn("rounded-full px-2 py-0.5 font-black", PART_TONE[kind])}>
              {CREA_CREATE_COPY.parts[kind][locale]}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
