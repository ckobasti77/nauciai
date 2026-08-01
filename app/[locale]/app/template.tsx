import { Suspense, type ReactNode } from "react";

import { AppRouteMotion } from "@/components/motion/page-motion";

/**
 * Renders between app/[locale]/app/layout.tsx (which owns AppShell) and the page,
 * so the route-entrance motion never encloses the shell.
 */
export default function AppRouteTemplate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppRouteMotion>{children}</AppRouteMotion>
    </Suspense>
  );
}
