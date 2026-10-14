import { cn } from "@/components/ui/primitives";

/**
 * Props primitiva koji ume da čeka podatke: uz `loading` podaci nisu obavezni, a crta se
 * skelet iste veličine (bez skoka layouta kad upit stigne).
 */
export type Loadable<Data> = ({ loading: true } & Partial<Data>) | ({ loading?: false } & Data);

/** Blok skeleta. Oblik i veličinu daje pozivalac; uz smanjen pokret ne pulsira. */
export function IgraSkeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse bg-igra-track motion-reduce:animate-none", className)} />;
}
