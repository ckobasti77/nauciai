"use client";

import { useEffect, useState } from "react";

import { detectCreaDeviceCaps, type CreaDeviceCaps } from "@/lib/crea-device";

let detected: Promise<CreaDeviceCaps> | null = null;

/**
 * Šta ovaj uređaj ume (U15). Detekcija se radi jednom po strani (WebGPU adapter
 * se ne traži iznova na svaki prelaz taba); `null` dok ne stigne.
 */
export function useCreaDeviceCaps(): CreaDeviceCaps | null {
  const [caps, setCaps] = useState<CreaDeviceCaps | null>(null);
  useEffect(() => {
    let alive = true;
    detected ??= detectCreaDeviceCaps();
    void detected.then((value) => {
      if (alive) setCaps(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}
