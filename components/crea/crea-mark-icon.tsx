import { CreaLogo } from "@/components/crea/crea-logo";

/**
 * Crea znak kao dekorativna ikonica navigacije (K02) - natpis „Crea" stoji pored,
 * pa je znak skriven od čitača ekrana. Isti oblik propsa kao lucide ikonice.
 */
export function CreaMarkIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <CreaLogo variant="znak" className={className} />
    </span>
  );
}
