"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { MathUtils, NoToneMapping, SRGBColorSpace, type AnimationAction, type Group, type Object3D } from "three";

import { cameraPosition, FitOrtho } from "@/components/marketing/plan-mascot-canvas";
import { mascotPoseAt, type CreaMascotMood } from "@/lib/crea-mascot";
import {
  blenderDegreesToThreeRadians,
  MASCOT_JOINT_KEYS,
  MASCOT_MODEL_URL,
  MASCOT_MORPHS,
  mascotAllJointNodeNames,
  mascotFaceMeshNames,
  mascotJointNodes,
  setMorphInfluence,
  type MascotJointKey,
  type MascotMorphMesh,
} from "@/lib/mascot-rig";

/**
 * 3D maskota u Crei (K25, U5). Isti GLB, Draco dekoder i kadar kao kartice planova
 * (`plan-mascot-canvas`), pa se poster i 3D poklope. Poza dolazi iz `mascotPoseAt` i
 * pretapa se ka cilju (bez skokova kad se raspoloženje promeni). Ovaj modul se uvozi
 * SAMO kroz `next/dynamic` - three.js ne ulazi u početni chunk radionice.
 */
const VARIANT = "basic" as const;
/** Brzina pretapanja poze (po sekundi). */
const BLEND_RATE = 6;

function setY(group: Group | null, y: number) {
  if (group) group.position.y = y;
}

function setRotation(node: Object3D | undefined, axis: "x" | "y" | "z", radians: number) {
  if (node) node.rotation[axis] = radians;
}

function setTimeScale(action: AnimationAction | undefined | null, scale: number) {
  if (action) action.timeScale = scale;
}

function MascotModel({ mood, onReady }: { mood: CreaMascotMood; onReady: () => void }) {
  const holder = useRef<Group>(null);
  const decoderPath = `${window.location.origin}/draco/`;
  const { scene: shared, animations } = useGLTF(MASCOT_MODEL_URL[VARIANT], decoderPath);
  // Svaka maskota dobija svoju kopiju scene: keširan GLB je jedan objekat, a jedan objekat
  // može da stoji samo u jednom canvasu (geometrija i materijali se dele, pozicije ne).
  const scene = useMemo(() => shared.clone(true), [shared]);
  const { actions } = useAnimations(animations, holder);

  const nodes = useMemo(() => {
    const map = new Map<string, Object3D>();
    for (const name of mascotAllJointNodeNames(VARIANT)) {
      const found = scene.getObjectByName(name);
      if (found) map.set(name, found);
    }
    return map;
  }, [scene]);
  const faceMeshes = useMemo(() => {
    const meshes: MascotMorphMesh[] = [];
    for (const name of mascotFaceMeshNames(VARIANT)) {
      scene.getObjectByName(name)?.traverse((child) => {
        const mesh = child as unknown as MascotMorphMesh;
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) meshes.push(mesh);
      });
    }
    return meshes;
  }, [scene]);

  useEffect(() => {
    const action = actions.idle;
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [actions]);

  // Raspoloženje počinje od 0 s kad se promeni (skok kad slavi kreće odmah).
  const moodStart = useRef(0);
  const clock = useRef(0);
  useEffect(() => {
    moodStart.current = clock.current;
  }, [mood]);

  const joints = useRef<Record<string, number>>({});
  const morphs = useRef<Record<string, number>>({});
  const lift = useRef(0);
  const notified = useRef(false);

  useFrame((_, delta) => {
    clock.current += delta;
    if (!notified.current) {
      notified.current = true;
      onReady();
    }
    const pose = mascotPoseAt(mood, clock.current - moodStart.current, VARIANT);
    const blend = Math.min(1, delta * BLEND_RATE);
    setTimeScale(actions.idle, pose.idleSpeed);

    for (const key of MASCOT_JOINT_KEYS) {
      const current = joints.current[key] ?? 0;
      const value = current + (pose.joints[key as MascotJointKey] - current) * blend;
      joints.current[key] = value;
      for (const joint of mascotJointNodes(VARIANT, key)) {
        const { threeAxis, radians } = blenderDegreesToThreeRadians(joint.axis, value * joint.sign);
        setRotation(nodes.get(joint.name), threeAxis, radians);
      }
    }

    // Izraz lica: pretapanje ka cilju; morf koji se slegao na 0 se ne piše (idle treptaj ostaje).
    for (const morph of MASCOT_MORPHS) {
      const target = pose.morphs[morph] ?? 0;
      const current = morphs.current[morph] ?? 0;
      const value = current + (target - current) * blend;
      morphs.current[morph] = target === 0 && value < 1e-3 ? 0 : value;
      if (morphs.current[morph] > 1e-4 || target > 0) {
        for (const mesh of faceMeshes) setMorphInfluence(mesh, morph, morphs.current[morph]!);
      }
    }

    lift.current = MathUtils.lerp(lift.current, pose.lift, Math.min(1, delta * 14));
    setY(holder.current, lift.current);
  });

  return (
    <group ref={holder}>
      <primitive object={scene} />
    </group>
  );
}

export function CreaMascotCanvas({ mood, active, onReady }: { mood: CreaMascotMood; active: boolean; onReady: () => void }) {
  return (
    <Canvas
      // IGRA K28: DPR ≤ 1,5 kao i ostali 3D u aplikaciji (`IGRA_THREE_DPR`); maskota je ≤ 160 px.
      dpr={[1, 1.5]}
      orthographic
      // Van ekrana ili u pozadinskom tabu ne crta nijedan frejm.
      frameloop={active ? "always" : "never"}
      camera={{ position: cameraPosition(10), near: 0.1, far: 100, zoom: 1 }}
      gl={{ antialias: true, alpha: true }}
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
        <MascotModel mood={mood} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
