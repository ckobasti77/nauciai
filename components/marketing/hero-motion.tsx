"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";

export function HeroMotion({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const context = gsap.context(() => {
      gsap.to(".sketch-float", {
        y: -8,
        delay: 1.1,
        duration: 2.4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.18,
        overwrite: false,
      });
    }, rootRef);

    return () => context.revert();
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
