"use client";

import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { Group, Object3D } from "three";

import {
  blenderDegreesToThreeRadians,
  MASCOT_JOINT_KEYS,
  MASCOT_MODEL_URL,
  mascotAllJointNodeNames,
  mascotJointNodes,
  type MascotJointKey,
  type MascotVariant,
} from "@/lib/mascot-rig";

/**
 * R3F sadržaj canvas-a (3D-FAZA5): sam GLB, idle akcija i primena klizača na
 * imenovane čvorove iz RIG.md. Izdvojeno iz `MascotCanvas` da `useGLTF` (Suspense)
 * ne blokira `<Canvas>`/`<OrbitControls>` dok se model skida.
 */
function MascotModel({
  variant,
  jointValues,
  playing,
  onReady,
}: {
  variant: MascotVariant;
  jointValues: Record<MascotJointKey, number>;
  playing: boolean;
  onReady: (triangles: number) => void;
}) {
  const group = useRef<Group>(null);
  // Lokalni Draco dekoder (`public/draco/`, kopija iz `three/examples/jsm/libs/draco/gltf/`):
  // GLB-ovi nose `KHR_draco_mesh_compression` (REPORT-v5), a drei-jev podrazumevani
  // dekoder je Google-ov CDN (gstatic.com) — nepouzdano/nedostupno bez interneta. Mora biti
  // APSOLUTNI URL (sa poreklom): DRACOLoader dekodira u Worker-u iz `blob:` URL-a, a
  // `importScripts` unutar njega ne razrešava putanju sa vodećom kosom crtom na pravo poreklo.
  const decoderPath = `${window.location.origin}/draco/`;
  const { scene, animations } = useGLTF(MASCOT_MODEL_URL[variant], decoderPath);
  const { actions } = useAnimations(animations, group);
  // Ref umesto direktne zavisnosti u effect-u ispod: pozivalac (MascotViewer) ne mora
  // da memoizuje `onReady`, a trougli se ipak računaju TAČNO jednom po učitanom modelu.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Čvorovi po imenu iz RIG.md, keširani jednom po učitanom modelu (bez
  // `getObjectByName` po frejmu) — `mascotAllJointNodeNames` je jedini izvor imena.
  const nodes = useMemo(() => {
    const map = new Map<string, Object3D>();
    for (const name of mascotAllJointNodeNames(variant)) {
      const found = scene.getObjectByName(name);
      if (found) map.set(name, found);
    }
    return map;
  }, [scene, variant]);

  useEffect(() => {
    let triangles = 0;
    scene.traverse((child) => {
      const mesh = child as unknown as { isMesh?: boolean; geometry?: { index?: { count: number } | null; attributes: { position?: { count: number } } } };
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry;
      triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
    });
    onReadyRef.current(Math.round(triangles));
  }, [scene]);

  useEffect(() => {
    const action = actions.idle;
    if (!action) return;
    if (playing) {
      action.reset().play();
    } else {
      action.stop();
    }
    return () => {
      action.stop();
    };
  }, [actions, playing, variant]);

  // Primenjuje klizače SVAKI frejm, POSLE mixer-a (drei `useAnimations` se
  // pretplaćuje na `useFrame` pre ovog poziva) — klizač uvek pobedi idle
  // animaciju na dodirnutom čvoru, ostatak (npr. lebdenje `root`-a) i dalje animira.
  useFrame(() => {
    for (const key of MASCOT_JOINT_KEYS) {
      const value = jointValues[key];
      for (const joint of mascotJointNodes(variant, key)) {
        const node = nodes.get(joint.name);
        if (!node) continue;
        const { threeAxis, radians } = blenderDegreesToThreeRadians(joint.axis, value * joint.sign);
        node.rotation[threeAxis] = radians;
      }
    }
  });

  return <primitive ref={group} object={scene} />;
}

export function MascotCanvas({
  variant,
  jointValues,
  playing,
  reducedMotion,
  onReady,
}: {
  variant: MascotVariant;
  jointValues: Record<MascotJointKey, number>;
  /** Idle animacija ide samo kad je zadato I pokret nije isključen u sistemu. */
  playing: boolean;
  reducedMotion: boolean;
  onReady: (triangles: number) => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1, 3.2], fov: 35 }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 2]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Suspense fallback={null}>
        <MascotModel variant={variant} jointValues={jointValues} playing={playing && !reducedMotion} onReady={onReady} />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={1.6} maxDistance={5.5} target={[0, 0.85, 0]} />
    </Canvas>
  );
}
