"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return (
      <ThemeProvider>
        <ToastProvider><ScrollToTop />{children}</ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <ScrollToTop />
        <ConvexAuthNextjsProvider client={convexClient}>{children}</ConvexAuthNextjsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
