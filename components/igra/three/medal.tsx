"use client";

import { useMemo } from "react";
import type { Texture } from "three";

import { starShape, ToonMesh, type IgraThreePalette } from "@/components/igra/three/toon";
import type { IgraMedalTone } from "@/lib/igra-three";

const TONE_COLOR: Record<IgraMedalTone, keyof IgraThreePalette> = { zlato: "gold", srebro: "silver", bronza: "bronze" };

/** Proceduralna medalja: pločica sa obodom i zvezdom u boji mastila, na traci od dve ploče. */
export function Medal({ tone, palette, gradientMap }: { tone: IgraMedalTone; palette: IgraThreePalette; gradientMap: Texture }) {
  const star = useMemo(() => starShape(0.42, 0.18), []);
  const metal = { color: palette[TONE_COLOR[tone]], ink: palette.ink, gradientMap };
  const ribbon = { color: palette.ink, ink: palette.ink, gradientMap };

  return (
    <group position={[0, -0.4, 0]}>
      <ToonMesh {...ribbon} position={[-0.21, 1.12, -0.08]} rotation={[0, 0, -0.38]}>
        <boxGeometry args={[0.36, 0.95, 0.05]} />
      </ToonMesh>
      <ToonMesh {...ribbon} position={[0.21, 1.12, -0.08]} rotation={[0, 0, 0.38]}>
        <boxGeometry args={[0.36, 0.95, 0.05]} />
      </ToonMesh>
      <ToonMesh {...metal} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.16, 40]} />
      </ToonMesh>
      <ToonMesh {...metal}>
        <torusGeometry args={[0.78, 0.085, 10, 48]} />
      </ToonMesh>
      <ToonMesh color={palette.ink} gradientMap={gradientMap} position={[0, 0, 0.06]}>
        <extrudeGeometry args={[star, { depth: 0.07, bevelEnabled: false }]} />
      </ToonMesh>
    </group>
  );
}
