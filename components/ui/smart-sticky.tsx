"use client";

import type { FocusEventHandler, HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";

const DIRECTION_THRESHOLD = 4;

function useSmartSticky<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);
  const hiddenRef = useRef(false);
  const [hidden, setHidden] = useState(false);

  function updateHidden(nextHidden: boolean) {
    if (hiddenRef.current === nextHidden) return;
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  }

  useEffect(() => {
    let previousScrollY = Math.max(window.scrollY, 0);
    let animationFrame = 0;

    function update() {
      animationFrame = 0;
      const element = elementRef.current;
      if (!element) return;

      const currentScrollY = Math.max(window.scrollY, 0);
      const delta = currentScrollY - previousScrollY;
      const stickyTop = Number.parseFloat(window.getComputedStyle(element).top) || 0;
      const isPinned = currentScrollY > 0 && element.getBoundingClientRect().top <= stickyTop + 1;

      if (!isPinned || currentScrollY <= stickyTop) {
        updateHidden(false);
        previousScrollY = currentScrollY;
        return;
      }

      if (Math.abs(delta) < DIRECTION_THRESHOLD) return;

      updateHidden(delta > 0);
      previousScrollY = currentScrollY;
    }

    function requestUpdate() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return { elementRef, hidden, show: () => updateHidden(false) };
}

/**
 * `true` čim je stranica skrolovana preko `threshold` px. Pasivni scroll listener,
 * rAF-throttled; čita `scrollY` i na mount-u (poštuje učitavanje već skrolovane strane).
 * Uključuje se samo kad `enabled` (opt-in), da deljeni header nema mrtav listener.
 */
function useScrolledPast(threshold: number, enabled: boolean) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold, enabled]);

  return scrolled;
}

function stickyClassName(className?: string, overlay = false) {
  return cn(
    // `cn` je obično spajanje (ne tailwind-merge), pa se pozicija bira ovde a ne
    // preko className-a. `overlay` = navbar lebdi PREKO heroa (fixed), pa hero
    // počinje od vrha ekrana ispod njega; podrazumevano ostaje `sticky` u toku.
    overlay ? "fixed inset-x-0" : "sticky",
    "z-30 transform-gpu transition-transform duration-200 ease-out data-[hidden=true]:pointer-events-none data-[hidden=true]:-translate-y-full motion-reduce:transition-none",
    className,
  );
}

export function SmartStickyHeader({
  className,
  overlay = false,
  scrollBackground = false,
  onFocusCapture,
  ...props
}: HTMLAttributes<HTMLElement> & { overlay?: boolean; scrollBackground?: boolean }) {
  const { elementRef, hidden, show } = useSmartSticky<HTMLElement>();
  // `scrollBackground` (opt-in): header lebdi providan preko heroa na vrhu, a čim se
  // skrola preko 8px dobija pozadinu/okvir/senku/blur (stilovi u globals.css po
  // `[data-scrolled]`). Prag 8px prati brief; prelaz je animiran u CSS-u bez layout shift-a.
  const scrolled = useScrolledPast(8, scrollBackground);
  const handleFocusCapture: FocusEventHandler<HTMLElement> = (event) => {
    show();
    onFocusCapture?.(event);
  };

  return (
    <header
      ref={elementRef}
      data-hidden={hidden ? "true" : "false"}
      data-scrolled={scrollBackground ? (scrolled ? "true" : "false") : undefined}
      className={stickyClassName(className, overlay)}
      onFocusCapture={handleFocusCapture}
      {...props}
    />
  );
}

export function SmartStickyNav({
  className,
  onFocusCapture,
  ...props
}: HTMLAttributes<HTMLElement>) {
  const { elementRef, hidden, show } = useSmartSticky<HTMLElement>();
  const handleFocusCapture: FocusEventHandler<HTMLElement> = (event) => {
    show();
    onFocusCapture?.(event);
  };

  return (
    <nav
      ref={elementRef}
      data-hidden={hidden ? "true" : "false"}
      className={stickyClassName(className)}
      onFocusCapture={handleFocusCapture}
      {...props}
    />
  );
}

export function SmartStickyRegion({
  className,
  onFocusCapture,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { elementRef, hidden, show } = useSmartSticky<HTMLDivElement>();
  const handleFocusCapture: FocusEventHandler<HTMLDivElement> = (event) => {
    show();
    onFocusCapture?.(event);
  };

  return (
    <div
      ref={elementRef}
      data-hidden={hidden ? "true" : "false"}
      className={stickyClassName(className)}
      onFocusCapture={handleFocusCapture}
      {...props}
    />
  );
}
