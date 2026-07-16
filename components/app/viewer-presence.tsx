"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@/convex/_generated/api";

const HEARTBEAT_MS = 5 * 60 * 1000;

export function ViewerPresence() {
  const { isAuthenticated } = useConvexAuth();
  const touchPresence = useMutation(api.publicProfiles.touchViewerPresence);
  const lastTouchRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    const touch = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTouchRef.current < HEARTBEAT_MS) return;
      lastTouchRef.current = Date.now();
      void touchPresence({}).catch(() => {
        lastTouchRef.current = 0;
      });
    };
    touch();
    const timer = window.setInterval(touch, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [isAuthenticated, touchPresence]);

  return null;
}
