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

function stickyClassName(className?: string) {
  return cn(
    "sticky z-30 transform-gpu transition-transform duration-200 ease-out data-[hidden=true]:pointer-events-none data-[hidden=true]:-translate-y-full motion-reduce:transition-none",
    className,
  );
}

export function SmartStickyHeader({
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
    <header
      ref={elementRef}
      data-hidden={hidden ? "true" : "false"}
      className={stickyClassName(className)}
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
