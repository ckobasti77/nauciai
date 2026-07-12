import { Suspense, type ReactNode } from "react";

import { SiteRouteMotion } from "@/components/motion/page-motion";

export default function LocaleTemplate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="contents">{children}</div>}>
      <SiteRouteMotion>{children}</SiteRouteMotion>
    </Suspense>
  );
}
