"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NoToneMapping, SRGBColorSpace, type Camera, type Group } from "three";

import { Medal } from "@/components/igra/three/medal";
import { createToonGradient, type IgraThreePalette } from "@/components/igra/three/toon";
import { Trophy } from "@/components/igra/three/trophy";
import {
  IGRA_THREE_DPR,
  igraFrameloop,
  igraSpinAngle,
  igraSpinRunning,
  type IgraMedalTone,
  type IgraThreeKind,
  type IgraThreeSpin,
} from "@/lib/igra-three";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

/**
 * Platno za 3D pehar i medalje (K03, plan K01 §4). Uvozi se SAMO kroz `next/dynamic` iz
 * `igra-three-stage.tsx` - three.js ne ulazi u početni JS nijedne rute. Scena je mirna:
 * ortografska kamera, jedno svetlo, providna pozadina, bez tekstura i bez GLB-a.
 */

/** Visina sveta koja staje u kraću stranu platna (modeli su visoki ~2,1). */
const WORLD_SIZE = 2.7;

/** Token → rezervna boja (svetla tema) ako token nije čitljiv kao heks. */
const TOKENS: ReadonlyArray<readonly [keyof IgraThreePalette, string, string]> = [
  ["gold", "--igra-medal-gold", "#f4be30"],
  ["silver", "--igra-medal-silver", "#c9d4df"],
  ["bronze", "--igra-medal-bronze", "#d98a5b"],
  ["ink", "--ink", "#0e3158"],
];
const HEX = /^#[0-9a-f]{6}$/i;

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

/** Boje čita SA PLATNA, ne sa `<html>`: unutar svetlog ostrva mastilo ostaje tamno i u tamnoj temi. */
function readPalette(element: Element): string {
  const styles = getComputedStyle(element);
  return TOKENS.map(([, token, fallback]) => {
    const value = styles.getPropertyValue(token).trim();
    return HEX.test(value) ? value : fallback;
  }).join("|");
}

// Imperativne three-mutacije idu kroz obične funkcije (isti obrazac kao `plan-mascot-canvas`).
function fitZoom(camera: Camera & { zoom?: number; updateProjectionMatrix?: () => void }, zoom: number) {
  camera.zoom = zoom;
  camera.updateProjectionMatrix?.();
}

function setTurn(group: Group | null, radians: number) {
  if (group) group.rotation.y = radians;
}

function Scene({
  spin,
  onReady,
  onSettled,
  children,
}: {
  spin: IgraThreeSpin;
  onReady: () => void;
  onSettled: () => void;
  children: (palette: IgraThreePalette) => ReactNode;
}) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const paletteKey = useSyncExternalStore(
    subscribeTheme,
    () => readPalette(canvas),
    () => "",
  );
  const palette = useMemo(() => {
    const values = paletteKey.split("|");
    return Object.fromEntries(TOKENS.map(([name, , fallback], index) => [name, values[index] || fallback])) as IgraThreePalette;
  }, [paletteKey]);

  useEffect(() => {
    fitZoom(camera, Math.min(size.width, size.height) / WORLD_SIZE);
    invalidate();
  }, [camera, size, invalidate]);

  const turntable = useRef<Group>(null);
  const seconds = useRef(0);
  const ready = useRef(false);
  const settled = useRef(false);

  useFrame((_, delta) => {
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    // Posle pauze (tab u pozadini) `delta` ume da bude ogroman; okret ne sme da preskoči.
    seconds.current += Math.min(delta, 0.1);
    setTurn(turntable.current, igraSpinAngle(spin, seconds.current));
    if (!settled.current && !igraSpinRunning(spin, seconds.current)) {
      settled.current = true;
      onSettled();
    }
  });

  return <group ref={turntable}>{children(palette)}</group>;
}

export function IgraThreeCanvas({
  kind,
  tone = "zlato",
  spin,
  inView,
  tabHidden,
  onReady,
}: {
  kind: IgraThreeKind;
  tone?: IgraMedalTone;
  spin: IgraThreeSpin;
  inView: boolean;
  tabHidden: boolean;
  /** Prvi frejm je nacrtan: nalepnica ispod sme da se povuče. */
  onReady: () => void;
}) {
  const [animating, setAnimating] = useState(true);
  const gradientMap = useMemo(() => createToonGradient(), []);
  useEffect(() => () => gradientMap.dispose(), [gradientMap]);

  return (
    <Canvas
      dpr={IGRA_THREE_DPR}
      orthographic
      frameloop={igraFrameloop({ inView, hidden: tabHidden, animating })}
      camera={{ position: [0, 1.4, 10], near: 0.1, far: 40, zoom: 40 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
        gl.setClearAlpha(0);
      }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2.5, 4, 5]} intensity={2.2} />
      <Scene spin={spin} onReady={onReady} onSettled={() => setAnimating(false)}>
        {(palette) =>
          kind === "pehar" ? <Trophy palette={palette} gradientMap={gradientMap} /> : <Medal tone={tone} palette={palette} gradientMap={gradientMap} />
        }
      </Scene>
    </Canvas>
  );
}
