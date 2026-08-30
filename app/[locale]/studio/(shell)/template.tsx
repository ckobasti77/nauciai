import { Suspense, type ReactNode } from "react";

import { AppRouteMotion } from "@/components/motion/page-motion";

/**
 * Isti ulazni pokret kao školski /app (app/[locale]/app/template.tsx) - shell
 * NAMERNO ne dobija marketing SiteRouteMotion: otvaranje/zatvaranje detalja
 * medija već koreografiše StudioPage kroz svoj AnimatePresence.
 */
export default function StudioShellTemplate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppRouteMotion>{children}</AppRouteMotion>
    </Suspense>
  );
}
