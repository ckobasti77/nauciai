"use client";

import Link from "next/link";
import { useRef, type ComponentProps } from "react";

import { useStickerPeel } from "@/components/igra/motion/use-sticker-peel";

/**
 * Poseban CTA sa nalepnicom (K24): link čija se nalepnica (`[data-igra-peel]` dete)
 * „odlepi" pod mišem kroz `useStickerPeel`. Sam link miruje; na dodir i uz smanjen
 * pokret nema pomeranja. Za obične linkove i dugmad je `igra-press` / `igra-lift`.
 */
export function PeelLink(props: ComponentProps<typeof Link>) {
  const ref = useRef<HTMLAnchorElement>(null);
  useStickerPeel(ref);
  return <Link ref={ref} {...props} />;
}
