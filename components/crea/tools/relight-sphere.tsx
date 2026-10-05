"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from "three";

import { anglesFromSpherePoint, kelvinToRgb, lightDirection, type LightSetup } from "@/lib/crea-relight";

/** Kugla je poluprečnika 1; kamera vidi ±1,35 - ostaje mesta za sunce oko ivice. */
const VIEW = 1.35;
/** Sunce stoji malo iznad površine kugle. */
const SUN_DISTANCE = 1.18;

type Three = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  key: DirectionalLight;
  ambient: AmbientLight;
  sun: Mesh<SphereGeometry, MeshBasicMaterial>;
  dispose: () => void;
};

/**
 * Kugla sa „suncem" (S18, K12): three.js, ortografska kamera (kugla je tačan
 * krug na ekranu, pa tačka ispod prsta = tačka na kugli). Prevlačenje po kugli
 * pomera sunce; svetlo na kugli pokazuje smer, toplinu i mekoću. Crta se samo
 * kad se nešto promeni - nema stalne animacije (i `prefers-reduced-motion` je
 * tako ispoštovan sam od sebe).
 */
export function RelightSphere({
  setup,
  onChange,
  onUnsupported,
  label,
}: {
  setup: LightSetup;
  onChange: (next: { azimuth: number; elevation: number }) => void;
  onUnsupported: () => void;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<Three | null>(null);
  const draggingRef = useRef(false);
  const setupRef = useRef(setup);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onUnsupported();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 20);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    const geometry = new SphereGeometry(1, 64, 48);
    // Boja kugle je „papir" brenda (svetla tema) - kugla je predmet koji se osvetljava, ne pozadina interfejsa.
    const material = new MeshStandardMaterial({ color: new Color("#f4f0e8"), roughness: 0.55, metalness: 0 });
    const ball = new Mesh(geometry, material);
    scene.add(ball);

    const ambient = new AmbientLight(0xffffff, 0.3);
    scene.add(ambient);
    const key = new DirectionalLight(0xffffff, 2);
    scene.add(key);

    const sunGeometry = new SphereGeometry(0.11, 24, 16);
    const sunMaterial = new MeshBasicMaterial({ color: new Color("#f4be30"), depthTest: false, transparent: true });
    const sun = new Mesh(sunGeometry, sunMaterial);
    sun.renderOrder = 2;
    scene.add(sun);

    const three: Three = {
      renderer,
      scene,
      camera,
      key,
      ambient,
      sun,
      dispose: () => {
        geometry.dispose();
        material.dispose();
        sunGeometry.dispose();
        sunMaterial.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      },
    };
    threeRef.current = three;

    const resize = () => {
      const size = Math.max(1, Math.round(host.clientWidth));
      renderer.setSize(size, size, false);
      draw(three, setupRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      observer.disconnect();
      threeRef.current = null;
      three.dispose();
    };
  }, [onUnsupported]);

  useEffect(() => {
    setupRef.current = setup;
    if (threeRef.current) draw(threeRef.current, setup);
  }, [setup]);

  function pointToAngles(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width / 2 / VIEW;
    const nx = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const ny = -(event.clientY - (rect.top + rect.height / 2)) / radius;
    onChange(anglesFromSpherePoint(nx, ny));
  }

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className="mx-auto aspect-square w-full max-w-[260px] cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointToAngles(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) pointToAngles(event);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    />
  );
}

function draw(three: Three, setup: LightSetup) {
  const direction = lightDirection(setup.azimuth, setup.elevation);
  const [r, g, b] = kelvinToRgb(setup.kelvin);
  three.key.color.setRGB(r / 255, g / 255, b / 255);
  three.key.position.set(direction.x * 5, direction.y * 5, direction.z * 5);
  // Meko svetlo = manje kontrasta (više rasutog), tvrdo = jak usmeren snop.
  three.key.intensity = setup.softness === "tvrdo" ? 2.8 : 1.7;
  three.ambient.intensity = setup.softness === "tvrdo" ? 0.12 : 0.5;
  three.sun.position.set(direction.x * SUN_DISTANCE, direction.y * SUN_DISTANCE, direction.z * SUN_DISTANCE);
  // Sunce iza kugle (kontra svetlo) se vidi providno - zna se da je otpozadi.
  three.sun.material.opacity = direction.z < 0 ? 0.45 : 1;
  three.renderer.render(three.scene, three.camera);
}
