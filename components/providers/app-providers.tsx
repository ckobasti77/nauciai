"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast-provider";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return <ToastProvider><ScrollToTop />{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <ScrollToTop />
      <ConvexAuthNextjsProvider client={convexClient}>{children}</ConvexAuthNextjsProvider>
    </ToastProvider>
  );
}
