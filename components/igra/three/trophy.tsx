"use client";

import { useMemo } from "react";
import { Vector2, type Texture } from "three";

import { starShape, ToonMesh, type IgraThreePalette } from "@/components/igra/three/toon";

/**
 * Profil pehara (poluprečnik, visina) odozdo nagore: postolje, stopa, drška, čaša, pa
 * unutrašnji zid nazad do dna čaše. `LatheGeometry` ga okrene oko uspravne ose.
 */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, -1.05],
  [0.62, -1.05],
  [0.62, -0.87],
  [0.46, -0.83],
  [0.4, -0.74],
  [0.15, -0.6],
  [0.11, -0.36],
  [0.17, -0.2],
  [0.44, -0.04],
  [0.66, 0.26],
  [0.76, 0.62],
  [0.8, 1],
  [0.7, 1],
  [0.62, 0.5],
  [0.36, 0.16],
  [0, 0.08],
];
const LATHE_SEGMENTS = 24;
/** Luk drške: 200° oko tačke na zidu čaše. */
const HANDLE_ARC = (200 * Math.PI) / 180;

/** Proceduralni pehar (bez GLB-a i tekstura): čaša sa postoljem, dve drške i zvezda u boji mastila napred. */
export function Trophy({ palette, gradientMap }: { palette: IgraThreePalette; gradientMap: Texture }) {
  const profile = useMemo(() => PROFILE.map(([radius, height]) => new Vector2(radius, height)), []);
  const star = useMemo(() => starShape(0.2, 0.085), []);
  const toon = { color: palette.gold, ink: palette.ink, gradientMap };

  return (
    <group>
      <ToonMesh {...toon}>
        <latheGeometry args={[profile, LATHE_SEGMENTS]} />
      </ToonMesh>
      <ToonMesh {...toon} position={[0.74, 0.55, 0]} rotation={[0, 0, -HANDLE_ARC / 2]}>
        <torusGeometry args={[0.3, 0.055, 8, 18, HANDLE_ARC]} />
      </ToonMesh>
      <ToonMesh {...toon} position={[-0.74, 0.55, 0]} rotation={[0, Math.PI, -HANDLE_ARC / 2]}>
        <torusGeometry args={[0.3, 0.055, 8, 18, HANDLE_ARC]} />
      </ToonMesh>
      <ToonMesh color={palette.ink} gradientMap={gradientMap} position={[0, 0.5, 0.7]}>
        <extrudeGeometry args={[star, { depth: 0.07, bevelEnabled: false }]} />
      </ToonMesh>
    </group>
  );
}
