"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function CommunityStickyToolbar({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      setTarget(document.querySelector<HTMLElement>("[data-community-toolbar-target]"));
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return target ? createPortal(children, target) : null;
}
