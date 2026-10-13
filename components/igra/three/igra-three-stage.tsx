"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";
import { canUseIgra3d, IGRA_THREE_MEDIA, igraThreeFallbackId, type IgraMedalTone, type IgraThreeKind, type IgraThreeSpin } from "@/lib/igra-three";
import type { Locale } from "@/lib/i18n";

const IgraThreeCanvas = dynamic(() => import("@/components/igra/three/igra-three-canvas").then((mod) => mod.IgraThreeCanvas), {
  ssr: false,
});

function subscribeMedia(onChange: () => void) {
  const query = window.matchMedia(IGRA_THREE_MEDIA);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribeTab(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function subscribeNever() {
  return () => undefined;
}

let webglProbe: boolean | null = null;

/** Jedna proba po učitanoj strani; kontekst se odmah vraća pregledaču. */
function hasWebGL(): boolean {
  if (webglProbe === null) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webglProbe = gl !== null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglProbe = false;
    }
  }
  return webglProbe;
}

/** Ako platno padne (WebGL, drajver), greška ostaje ovde, a nalepnica ispod ostaje na mestu. */
class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 3D pehar ili medalja kao UKRAS (K03, plan K01 §4). Ova ljuska ne uvozi three.js: u kutiji
 * uvek stoji nalepnica (`rang.pehar`, `rang.zlato`…), a platno stiže preko nje tek kad su
 * ispunjeni svi uslovi - računar (≥ 1024 px, miš), dozvoljen pokret, WebGL radi i kutija je
 * došla u kadar. Nalepnica se povuče kad je prvi frejm nacrtan, pa nema skoka. Na telefonu,
 * uz smanjen pokret i kad platno padne ostaje nalepnica.
 *
 * Kutija je kvadrat; širinu daje pozivalac kroz `className`. Bez `locale` je dekoracija.
 */
export function IgraThreeStage({
  kind,
  tone = "zlato",
  spin,
  fallbackId,
  allow3d = true,
  locale,
  className,
}: {
  kind: IgraThreeKind;
  /** Samo za medalju. */
  tone?: IgraMedalTone;
  spin: IgraThreeSpin;
  fallbackId?: IgraArtId;
  /** `false` = uvek nalepnica (npr. štednja podataka). */
  allow3d?: boolean;
  locale?: Locale;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const wideFine = useSyncExternalStore(subscribeMedia, () => window.matchMedia(IGRA_THREE_MEDIA).matches, () => false);
  const tabHidden = useSyncExternalStore(subscribeTab, () => document.hidden, () => false);
  const wanted = allow3d && wideFine && !reduced;
  const webgl = useSyncExternalStore(subscribeNever, () => wanted && hasWebGL(), () => false);
  const [failed, setFailed] = useState(false);
  const use3d = allow3d && !failed && canUseIgra3d({ wideFine, reduced, webgl });

  const boxRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!use3d) return;
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting ?? false;
      setInView(visible);
      if (visible) setSeen(true);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [use3d]);

  const sticker = fallbackId ?? igraThreeFallbackId(kind, tone);
  const art = locale ? <IgraArt id={sticker} size="hero" locale={locale} /> : <IgraArt id={sticker} size="hero" decorative />;

  return (
    <div ref={boxRef} className={cn("relative aspect-square", className)}>
      <div className={cn("transition-opacity duration-300", use3d && ready ? "opacity-0" : "opacity-100")}>{art}</div>
      {use3d && seen ? (
        <div aria-hidden="true" className="absolute inset-0">
          <CanvasBoundary onError={() => setFailed(true)}>
            <IgraThreeCanvas kind={kind} tone={tone} spin={spin} inView={inView} tabHidden={tabHidden} onReady={() => setReady(true)} />
          </CanvasBoundary>
        </div>
      ) : null}
    </div>
  );
}
