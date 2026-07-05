"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return children;
  }

  return <ConvexAuthNextjsProvider client={convexClient}>{children}</ConvexAuthNextjsProvider>;
}
