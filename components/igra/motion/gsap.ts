"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

/**
 * Jedino mesto registracije GSAP-a za IGRA-u (K03, plan K01 §3.1). Jezgro `gsap` je već u
 * svakoj app ruti (`components/motion/page-motion.tsx`), pa ono i `useGSAP` smeju statički;
 * pluginovi (Flip, DrawSVG, SplitText) idu SAMO kroz `loadIgraPlugin` iz `lib/igra-motion.ts`.
 */
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
