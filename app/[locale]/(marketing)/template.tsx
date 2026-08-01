import { Suspense, type ReactNode } from "react";

import { SiteRouteMotion } from "@/components/motion/page-motion";

export default function MarketingTemplate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SiteRouteMotion>{children}</SiteRouteMotion>
    </Suspense>
  );
}
