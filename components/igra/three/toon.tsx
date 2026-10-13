"use client";

import { Outlines } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import type { ReactNode } from "react";
import { DataTexture, DoubleSide, NearestFilter, RedFormat, Shape, type Texture } from "three";

/** Boje modela, pročitane iz tokena teme (`--igra-medal-*`, `--ink`). */
export type IgraThreePalette = { gold: string; silver: string; bronze: string; ink: string };

/** Debljina mastila u pikselima platna (uz DPR 1,5 to su 2 CSS piksela, kao `border-2`). */
const OUTLINE_PX = 3;

/** Senka u tri stepena (tamno, srednje, svetlo) - bez preliva, kao bojeno flomasterom. */
export function createToonGradient(): DataTexture {
  const texture = new DataTexture(new Uint8Array([70, 160, 255]), 3, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Petokraka zvezda u ravni XY, sa centrom u nuli i krakom nagore. */
export function starShape(outer: number, inner: number): Shape {
  const shape = new Shape();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * Deo modela: toon materijal + ink outline (obrnuta ljuska iz drei-a, bez postprocessinga).
 * Bez `ink` nema outline-a - za detalj koji je i sam u boji mastila (zvezda). Geometrija je
 * dete; R3F je sam oslobađa kad se platno skine.
 */
export function ToonMesh({
  color,
  ink,
  gradientMap,
  children,
  ...props
}: Omit<ThreeElements["mesh"], "children"> & { color: string; ink?: string; gradientMap: Texture; children: ReactNode }) {
  return (
    <mesh {...props}>
      {children}
      <meshToonMaterial color={color} gradientMap={gradientMap} side={DoubleSide} />
      {ink ? <Outlines thickness={OUTLINE_PX} color={ink} /> : null}
    </mesh>
  );
}
