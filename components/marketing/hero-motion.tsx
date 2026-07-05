"use client";

import { gsap } from "gsap";
import { motion } from "motion/react";
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
        duration: 2.4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.18,
      });
    }, rootRef);

    return () => context.revert();
  }, []);

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
