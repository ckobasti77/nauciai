import { Heart } from "lucide-react";

import { cn } from "@/components/ui/primitives";

/**
 * Suptilna nalepnica na kartici rada u biblioteci (K17): „omiljeno" (srce na žutom) i
 * „novo" (krem). Die-cut izgled: krem ivica i tvrda senka koja prati oblik, blago
 * nakrivljeno. Stoji na tamnom bunaru medija, pa su obe svetla ostrva u obe teme.
 */
export function WorkSticker({ kind, label }: { kind: "omiljeno" | "novo"; label: string }) {
  return (
    <span
      className={cn(
        "igra-sticker inline-flex min-h-5 items-center gap-1 rounded-full px-2 text-[10px] font-black uppercase tracking-wider text-ink shadow-[0_0_0_2px_var(--igra-sticker-edge)]",
        kind === "omiljeno" ? "-rotate-3 bg-yellow px-1.5" : "paper-island rotate-2 bg-igra-sticker-edge",
      )}
    >
      {kind === "omiljeno" ? (
        <>
          <Heart aria-hidden="true" className="size-2.5 fill-current" />
          <span className="sr-only">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );
}
