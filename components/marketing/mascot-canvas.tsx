"use client";

import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { NoToneMapping, SRGBColorSpace, type Group, type Object3D } from "three";

import {
  blenderDegreesToThreeRadians,
  MASCOT_JOINT_KEYS,
  MASCOT_MODEL_URL,
  MASCOT_MORPHS,
  mascotAllJointNodeNames,
  mascotFaceMeshNames,
  mascotJointNodes,
  setMorphInfluence,
  type MascotExpression,
  type MascotJointKey,
  type MascotMorphMesh,
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
  expression,
  playing,
  onReady,
}: {
  variant: MascotVariant;
  jointValues: Record<MascotJointKey, number>;
  expression: MascotExpression;
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

  // Facijalni mesh-evi (eye_L/eye_R/mouth) keširani jednom — svaki nosi iste morph
  // ključeve. Traverse jer je morph na samom mesh-u (spojen fill+hull pod istim imenom).
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

  // Tekući uticaj svakog morpha (lerp cilj: aktivni izraz → 1, ostalo → 0). Van React
  // state-a jer se menja po frejmu; reset pri promeni modela.
  const morphWeights = useRef<Record<string, number>>({});
  useEffect(() => {
    morphWeights.current = {};
  }, [variant]);

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
  useFrame((_, delta) => {
    for (const key of MASCOT_JOINT_KEYS) {
      const value = jointValues[key];
      for (const joint of mascotJointNodes(variant, key)) {
        const node = nodes.get(joint.name);
        if (!node) continue;
        const { threeAxis, radians } = blenderDegreesToThreeRadians(joint.axis, value * joint.sign);
        node.rotation[threeAxis] = radians;
      }
    }

    // Izraz lica: lerp svakog morpha ka cilju za ~200 ms (linearno po delti). Isto
    // klizač-pravilo kao za zglobove — pišemo POSLE mixer-a. Kad je izraz „mirno" i
    // uticaj se slegao na 0, NE pišemo taj morph → idle treptaj iz klipa se vidi.
    const step = delta > 0 ? Math.min(1, delta / 0.2) : 1;
    const weights = morphWeights.current;
    for (const morph of MASCOT_MORPHS) {
      const target = expression === morph ? 1 : 0;
      const next = (weights[morph] ?? 0) + (target - (weights[morph] ?? 0)) * step;
      weights[morph] = target === 0 && next < 1e-3 ? 0 : next;
      if (weights[morph] > 1e-4) {
        for (const mesh of faceMeshes) setMorphInfluence(mesh, morph, weights[morph]);
      }
    }
  });

  return <primitive ref={group} object={scene} />;
}

export function MascotCanvas({
  variant,
  jointValues,
  expression,
  playing,
  reducedMotion,
  onReady,
}: {
  variant: MascotVariant;
  jointValues: Record<MascotJointKey, number>;
  expression: MascotExpression;
  /** Idle animacija ide samo kad je zadato I pokret nije isključen u sistemu. */
  playing: boolean;
  reducedMotion: boolean;
  onReady: (triangles: number) => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      // Lik je visok 1.0 sa temenom na y≈1 (origin na podu), centar na y≈0.5. Na d≈1.97
      // i fov 35° vidljiva visina je ~1.25 → lik puni ~80% kutije pri prvom prikazu.
      camera={{ position: [0, 0.72, 1.97], fov: 35 }}
      gl={{ antialias: true }}
      // Unlit materijali (KHR_materials_unlit) sa upečenim bojama — bez tone-mappinga i uz
      // sRGB izlaz, inače boje ispadnu isprane (REPORT: „Matching colors requires sRGB output
      // and no tone mapping").
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 2]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Suspense fallback={null}>
        <MascotModel
          variant={variant}
          jointValues={jointValues}
          expression={expression}
          playing={playing && !reducedMotion}
          onReady={onReady}
        />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={1.6} maxDistance={5.5} target={[0, 0.5, 0]} />
    </Canvas>
  );
}
