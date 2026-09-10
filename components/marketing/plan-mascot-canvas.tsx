"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { type AnimationAction, MathUtils, NoToneMapping, type Object3D, type OrthographicCamera, SRGBColorSpace, type Group } from "three";

import {
  MASCOT_MODEL_URL,
  mascotFaceMeshNames,
  mascotWaveNodes,
  setMorphInfluence,
  type MascotMorphMesh,
  type MascotVariant,
} from "@/lib/mascot-rig";

/**
 * Žive 3D maskote u karticama planova (KORAK 2). Ortografska kamera pod istim uglom kao
 * poster (azimut +16°, elevacija +5°) da se poster i 3D poklope — poster se vidi dok se
 * GLB skida i na mobilnom, pa moraju biti isti kadar. Providan canvas (bez pozadine): boja
 * kartice (paper-island) prolazi kroz njega u obe teme.
 */
const AZIMUTH_DEG = 16;
const ELEVATION_DEG = 5;
// Poster kadar (izmereno iz poster-*.png): lik puni 86,6% visine kadra, centar na ~0.516.
// Kamera reprodukuje BAŠ taj kadar pa se 3D poklopi sa posterom (koji se vidi dok se GLB
// skida i na mobilnom). POSTER_H je svetska visina kadra (Blender ortho_scale ≈ 1.17).
const TARGET_Y = 0.516;
const POSTER_H = 1.155;
const POSTER_ASPECT = 1200 / 1400;
const WAVE_MS = 1200;

function cameraPosition(radius: number): [number, number, number] {
  const az = MathUtils.degToRad(AZIMUTH_DEG);
  const el = MathUtils.degToRad(ELEVATION_DEG);
  return [
    radius * Math.cos(el) * Math.sin(az),
    TARGET_Y + radius * Math.sin(el),
    radius * Math.cos(el) * Math.cos(az),
  ];
}

/** „Koverta" pozdrava: dizanje 0→1 za ~350 ms, drži, pa spuštanje na kraju. */
function waveEnvelope(p: number): number {
  if (p < 0.29) return p / 0.29;
  if (p < 0.75) return 1;
  return Math.max(0, 1 - (p - 0.75) / 0.25);
}

/**
 * Imperativne three-mutacije idu kroz obične funkcije (objekat je parametar), pa React
 * Compiler ne prijavljuje „vrednost iz hook-a se menja" — isti obrazac kao `setMorphInfluence`.
 */
function applyOrthoFrustum(camera: OrthographicCamera, canvasAspect: number): void {
  let halfH: number;
  let halfW: number;
  if (canvasAspect < POSTER_ASPECT) {
    // Kutija uža od postera → uklapa se po širini (margina gore/dole).
    halfW = (POSTER_H * POSTER_ASPECT) / 2;
    halfH = halfW / canvasAspect;
  } else {
    halfH = POSTER_H / 2;
    halfW = halfH * canvasAspect;
  }
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.zoom = 1;
  camera.position.set(...cameraPosition(10));
  camera.lookAt(0, TARGET_Y, 0);
  camera.updateProjectionMatrix();
}

function primeIdle(action: AnimationAction, phaseSeconds: number, seeded: { current: boolean }): void {
  action.play();
  if (!seeded.current) {
    action.time = phaseSeconds;
    seeded.current = true;
  }
}

function setActionPaused(action: AnimationAction, paused: boolean): void {
  action.paused = paused;
}

function setNodeRotation(node: Object3D | undefined, axis: "x" | "y", radians: number): void {
  if (node) node.rotation[axis] = radians;
}

/**
 * Ortografski kadar koji „contain"-uje poster region (POSTER_ASPECT × POSTER_H) u canvas —
 * isto kao `object-contain` na posteru — pa su 3D i poster identično kadrirani bez obzira na
 * odnos stranica kutije.
 */
function FitOrtho() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    applyOrthoFrustum(camera, size.width / size.height);
  }, [camera, size]);
  return null;
}

function PlanMascotModel({
  variant,
  phaseSeconds,
  playing,
  waveNonce,
  onReady,
}: {
  variant: MascotVariant;
  phaseSeconds: number;
  playing: boolean;
  /** Raste na svaki hover — svaka promena pokreće jedan „pozdrav". */
  waveNonce: number;
  onReady: () => void;
}) {
  const group = useRef<Group>(null);
  const decoderPath = `${window.location.origin}/draco/`;
  const { scene, animations } = useGLTF(MASCOT_MODEL_URL[variant], decoderPath);
  const { actions } = useAnimations(animations, group);

  // Čvorovi pozdrava u Map-i i čitani sa `.get()` u useFrame — kao `mascot-canvas`, da
  // React Compiler ne prijavi mutaciju memoizovane vrednosti.
  const waveNodes = useMemo(() => {
    const { forearm, hand } = mascotWaveNodes(variant);
    const map = new Map<string, Object3D>();
    const f = scene.getObjectByName(forearm);
    if (f) map.set("forearm", f);
    const h = scene.getObjectByName(hand);
    if (h) map.set("hand", h);
    return map;
  }, [scene, variant]);
  const faceMeshes = useMemo(() => {
    const meshes: MascotMorphMesh[] = [];
    for (const name of mascotFaceMeshNames(variant)) {
      const node = scene.getObjectByName(name);
      node?.traverse((child) => {
        const mesh = child as unknown as MascotMorphMesh;
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) meshes.push(mesh);
      });
    }
    return meshes;
  }, [scene, variant]);

  // Idle: pušta se čim je model tu; `action.time` se seed-uje JEDNOM (fazni pomak: basic 0 s,
  // premium 2,1 s klipa). Pauza/nastavak preko `paused` — NE resetuje vreme (faza se čuva).
  const seeded = useRef(false);
  useEffect(() => {
    const action = actions.idle;
    if (!action) return;
    primeIdle(action, phaseSeconds, seeded);
    return () => {
      action.stop();
    };
  }, [actions, phaseSeconds]);

  useEffect(() => {
    const action = actions.idle;
    if (action) setActionPaused(action, !playing);
  }, [actions, playing]);

  // Start pozdrava: performance.now() u trenutku novog `waveNonce` (preskoči prvi mount).
  const waveStart = useRef(-1);
  const firstNonce = useRef(waveNonce);
  useEffect(() => {
    if (waveNonce !== firstNonce.current) waveStart.current = performance.now();
  }, [waveNonce]);

  const notified = useRef(false);

  useFrame(() => {
    // onReady tek kad je prvi frejm iscrtan (model preko postera) — da se poster sakrije
    // bez „duplog" lika dok lebdi.
    if (!notified.current) {
      notified.current = true;
      onReady();
    }

    // POZDRAV: ručni override POSLE mixer-a (idle i dalje teče na ostalim čvorovima).
    if (waveStart.current >= 0) {
      const elapsed = performance.now() - waveStart.current;
      if (elapsed >= WAVE_MS) {
        waveStart.current = -1;
        // Šaka nije animirana idle-om — vrati je u miran položaj sam.
        setNodeRotation(waveNodes.get("hand"), "y", 0);
        for (const mesh of faceMeshes) setMorphInfluence(mesh, "smile_wide", 0);
      } else {
        const p = elapsed / WAVE_MS;
        const raise = waveEnvelope(p);
        // Podlaktica: −80° Blender X = savijanje NAPRED (bx→three.x, znak +1).
        setNodeRotation(waveNodes.get("forearm"), "x", MathUtils.degToRad(-80 * raise));
        // Šaka maše: dva puta ±20° oko Blender Z (bz→three.y).
        setNodeRotation(waveNodes.get("hand"), "y", MathUtils.degToRad(20 * raise * Math.sin(p * Math.PI * 4)));
        // Osmeh do 1 tokom pozdrava (blink ostaje mixer-u — druge morfove ne diramo).
        for (const mesh of faceMeshes) setMorphInfluence(mesh, "smile_wide", raise);
      }
    }
  });

  return <primitive ref={group} object={scene} />;
}

export function PlanMascotCanvas({
  variant,
  phaseSeconds,
  playing,
  waveNonce,
  onReady,
}: {
  variant: MascotVariant;
  phaseSeconds: number;
  playing: boolean;
  waveNonce: number;
  onReady: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      orthographic
      camera={{ position: cameraPosition(10), near: 0.1, far: 100, zoom: 1 }}
      gl={{ antialias: true, alpha: true }}
      // Providna pozadina — boja kartice se vidi kroz canvas.
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
        gl.setClearAlpha(0);
      }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 2]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <FitOrtho />
      <Suspense fallback={null}>
        <PlanMascotModel
          variant={variant}
          phaseSeconds={phaseSeconds}
          playing={playing}
          waveNonce={waveNonce}
          onReady={onReady}
        />
      </Suspense>
    </Canvas>
  );
}
