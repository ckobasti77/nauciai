"use client";

import { motion, useReducedMotion, type Easing } from "motion/react";
import type { ReactNode, Ref } from "react";

import { CREA_AREA_PANEL_ID, CreaAreaTabs } from "@/components/crea/crea-area-tabs";
import { CREA_MODE_PANEL_ID, CreaModeTabs } from "@/components/crea/crea-mode-tabs";
import { cn } from "@/components/ui/primitives";
import type { CreaArea, CreaModeId, CreaShellState } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";
import { getStudioMotion } from "@/lib/studio-motion";

/**
 * Širina radionice (px) od koje composer stoji u levom panelu umesto da lebdi na
 * dnu ekrana. Ista vrednost je u `@min-[896px]` klasama ispod - menjaju se zajedno.
 * Meri se širina RADIONICE, ne prozora: školski omotač ima sidebar, samostalna
 * Crea nema.
 */
export const CREA_DOCK_MIN_PX = 896;

/**
 * Jedna ljuska za tri radionice (U1, K03): veliki tabovi oblasti, tabovi režima i
 * raspored levo panel · sredina scena · desno istorija. Na uskom ekranu sve ide u
 * jednu kolonu (tabovi → scena → istorija), a composer je donja fioka (crta ga
 * `StudioPage`, van ove komponente).
 *
 *   ≥ 1152 px  [ panel | scena | istorija ]
 *   ≥  896 px  [ panel | scena    ]
 *              [       | istorija ]
 *   uže        scena / istorija
 */
export function CreaWorkshop({
  locale,
  area,
  mode,
  onNavigate,
  panel,
  stage,
  history,
  containerRef,
}: {
  locale: Locale;
  area: CreaArea | null;
  mode: CreaModeId | null;
  onNavigate: (next: Partial<CreaShellState>) => void;
  /** Levi panel (usidren composer ili kapija); `null` = scena se širi preko njega. */
  panel: ReactNode | null;
  stage: ReactNode;
  history: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
}) {
  const reduceMotion = useReducedMotion();
  const motionParams = getStudioMotion(Boolean(reduceMotion));
  const sceneKey = `${area ?? "start"}:${mode ?? ""}`;
  const enter = {
    initial: reduceMotion ? false : ({ opacity: 0, y: 10 } as const),
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: motionParams.prelaz.enter.duration,
      ease: motionParams.prelaz.enter.ease as Easing,
    },
  };

  const grid = (
    <div
      className={cn(
        "grid items-start gap-5 @min-[896px]:gap-6",
        panel !== null
          ? "@min-[896px]:grid-cols-[minmax(300px,340px)_minmax(0,1fr)] @min-[1152px]:grid-cols-[minmax(300px,340px)_minmax(0,1fr)_minmax(260px,320px)]"
          : "@min-[1152px]:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]",
      )}
    >
      {panel !== null ? (
        <motion.div
          key={`panel:${sceneKey}`}
          {...enter}
          // `z-20`: sticky pravi sopstveni sloj, a izbor modela iz composera pada preko scene.
          className="relative z-20 min-w-0 @min-[896px]:sticky @min-[896px]:top-4 @min-[896px]:row-span-2 @min-[1152px]:row-span-1"
        >
          {panel}
        </motion.div>
      ) : null}
      <motion.div key={`stage:${sceneKey}`} {...enter} className="min-w-0">
        {stage}
      </motion.div>
      <div
        className={cn(
          "min-w-0",
          panel !== null && "@min-[896px]:col-start-2 @min-[1152px]:col-start-3 @min-[1152px]:row-start-1",
        )}
      >
        {history}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="@container">
      <CreaAreaTabs locale={locale} area={area} onSelect={(next) => onNavigate({ area: next, mode: null })} />
      <div
        id={CREA_AREA_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`crea-area-tab-${area ?? "start"}`}
        className="mt-3"
      >
        {area !== null && mode !== null ? (
          <>
            <CreaModeTabs locale={locale} area={area} mode={mode} onSelect={(next) => onNavigate({ mode: next })} />
            <div
              id={CREA_MODE_PANEL_ID}
              role="tabpanel"
              aria-labelledby={`crea-mode-tab-${mode}`}
              className="mt-4 border-t border-line pt-5"
            >
              {grid}
            </div>
          </>
        ) : (
          <div className="pt-2">{grid}</div>
        )}
      </div>
    </div>
  );
}
