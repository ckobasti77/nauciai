import { Loader2 } from "lucide-react";

import { cn } from "@/components/ui/primitives";

/** Jedan recept za `Loader2` umesto 21 rucno ispisane varijante po repou. */
const spinnerSizes = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
  /** Jedina velicina za "ceo ekran/panel jos nema sadrzaj"; ranije je to bilo 7, 8 ili 9. */
  xl: "size-8",
} as const;

export type SpinnerSize = keyof typeof spinnerSizes;

export function Spinner({
  size = "sm",
  label,
  className,
}: {
  size?: SpinnerSize;
  /**
   * Kad spinner stoji sam (nije pored teksta koji vec objasnjava sta se cheka),
   * `label` mu daje pristupacno ime i ukljucuje `role="status"`. Bez njega je
   * spinner cisto dekorativan i sakriven od citaca ekrana - sto je ispravno kad
   * je unutar dugmeta ciji tekst vec nosi znacenje.
   */
  label?: string;
  className?: string;
}) {
  const icon = <Loader2 aria-hidden="true" className={cn(spinnerSizes[size], "animate-spin", className)} />;

  if (!label) return icon;

  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
