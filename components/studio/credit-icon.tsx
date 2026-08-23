import { Coins } from "lucide-react";

import { cn } from "@/components/ui/primitives";

/**
 * Znak kredita na celom sajtu. Jedan znak za jednu stvar.
 * Uvek aria-hidden="true" jer roditeljski element nosi punu tekstualnu
 * labelu za čitače ekrana ("N kredita").
 */
export function CreditIcon({ className }: { className?: string }) {
  return <Coins aria-hidden="true" className={cn("size-3.5 shrink-0", className)} />;
}
