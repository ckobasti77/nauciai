"use client";

import type Konva from "konva";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Rect, Stage, Star, Text, Transformer } from "react-konva";

import { loadSticker, useStickerImage, type EditorAsset } from "@/components/crea/editor/assets";
import { fontFamilyFor, loadCanvasFonts, measurerFor } from "@/components/crea/editor/fonts";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import {
  coverCrop,
  CREA_SCENE_COLORS,
  displayText,
  EXPORT_FORMATS,
  type CreaImageNode,
  type CreaNodePatch,
  type CreaScene,
  type CreaSceneNode,
  type CreaShadow,
  type CreaShapeNode,
  type CreaStickerNode,
  type CreaTextNode,
  type ExportFormat,
} from "@/lib/crea-editor-scene";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { layoutText } from "@/lib/crea-text-fit";

/**
 * Platno editora (S28/S29, K10): crta scenu kroz Konvu i, kad je
 * `interactive`, daje izbor, prevlačenje, promenu veličine i okretanje.
 * Mere su u pikselima izlaza; prikaz je samo umanjen (`scale` pozornice).
 *
 * Konva radi samo u browseru, pa se ovaj modul uvozi isključivo iz alata koji
 * se učitavaju kroz `dynamic(..., { ssr: false })` (plan K01 §9).
 */

export type SceneCanvasHandle = {
  /** Slika tačne veličine `width × height` u izabranom formatu. */
  exportImage: (options: { width: number; height: number; format: ExportFormat; quality: number }) => Promise<Blob>;
};

type Props = {
  scene: CreaScene;
  assets: ReadonlyMap<string, EditorAsset>;
  interactive: boolean;
  selectedId?: string | null;
  onSelect?: (nodeId: string | null) => void;
  /** Izmena sa platna (prevlačenje, promena veličine); `key` spaja korake u istoriji. */
  onChange?: (nodeId: string, patch: CreaNodePatch, key: string) => void;
  /** Dupli klik na tekst: fokus na polje teksta u panelu. */
  onEditText?: (nodeId: string) => void;
  /** Natpis praznog mesta za sliku (vidi se samo na ekranu, ne u izvozu). */
  slotHint?: string;
  /** Najveća visina prikaza u CSS pikselima (uspravne scene ne smeju da pojedu ekran). */
  maxDisplayHeight: number;
  label: string;
};

function shadowProps(shadow: CreaShadow | undefined) {
  return shadow
    ? { shadowEnabled: true, shadowColor: shadow.color, shadowOffsetX: shadow.x, shadowOffsetY: shadow.y, shadowBlur: 0, shadowOpacity: 1 }
    : { shadowEnabled: false };
}

/** Delovi koji se vide samo na ekranu (natpis praznog mesta) i kriju pri izvozu. */
const UI_ONLY = "ui-only";

function subscribePointer(onChange: () => void) {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Prst umesto miša: veće ručke za promenu veličine (≥ 44 px dodira sa razmakom). */
function useCoarsePointer() {
  return useSyncExternalStore(subscribePointer, () => window.matchMedia("(pointer: coarse)").matches, () => false);
}

function TextView({ node, fontsVersion }: { node: CreaTextNode; fontsVersion: number }) {
  const layout = useMemo(() => {
    void fontsVersion; // nova slova = nova merenja
    return layoutText(
      {
        text: displayText(node),
        width: node.width,
        height: node.height,
        fontSize: node.fontSize,
        minFontSize: node.minFontSize,
        lineHeight: node.lineHeight,
        fit: node.fit,
      },
      measurerFor(node.font, node.weight),
    );
  }, [node, fontsVersion]);
  const height = node.fit && node.height !== undefined ? node.height : Math.max(layout.height, layout.fontSize * node.lineHeight);
  return (
    <>
      <Rect name="hit" width={node.width} height={height} fill="rgba(0,0,0,0)" />
      <Text
        text={layout.lines.join("\n")}
        width={node.width}
        height={height}
        fontSize={layout.fontSize}
        fontFamily={fontFamilyFor(node.font)}
        fontStyle={String(node.weight)}
        lineHeight={node.lineHeight}
        align={node.align}
        verticalAlign={node.verticalAlign}
        wrap="none"
        fill={node.fill}
        {...(node.stroke
          ? { stroke: node.stroke.color, strokeWidth: node.stroke.width, fillAfterStrokeEnabled: true, lineJoin: "round" as const }
          : { strokeEnabled: false })}
        {...shadowProps(node.shadow)}
        listening={false}
      />
    </>
  );
}

function ImageView({ node, asset, slotHint }: { node: CreaImageNode; asset: EditorAsset | undefined; slotHint?: string }) {
  const stroke = node.stroke ? { stroke: node.stroke.color, strokeWidth: node.stroke.width } : { strokeEnabled: false };
  if (!asset) {
    const label = Math.min(node.width, node.height);
    return (
      <>
        <Rect width={node.width} height={node.height} fill={node.placeholder} cornerRadius={node.cornerRadius} {...stroke} {...shadowProps(node.shadow)} />
        {slotHint ? (
          <Group name={UI_ONLY} listening={false}>
            <Rect
              x={label * 0.06}
              y={label * 0.06}
              width={node.width - label * 0.12}
              height={node.height - label * 0.12}
              stroke={CREA_SCENE_COLORS.mastilo}
              strokeWidth={Math.max(2, label * 0.012)}
              dash={[label * 0.04, label * 0.03]}
              opacity={0.45}
              cornerRadius={Math.max(0, node.cornerRadius - label * 0.06)}
            />
            <Text
              text={slotHint}
              width={node.width}
              height={node.height}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(14, label * 0.09)}
              fontFamily={fontFamilyFor("nunito")}
              fontStyle="900"
              fill={CREA_SCENE_COLORS.mastilo}
              opacity={0.6}
            />
          </Group>
        ) : null}
      </>
    );
  }
  return (
    <KonvaImage
      image={asset.bitmap}
      width={node.width}
      height={node.height}
      crop={coverCrop(asset.width, asset.height, node.width, node.height)}
      cornerRadius={node.cornerRadius}
      {...stroke}
      {...shadowProps(node.shadow)}
    />
  );
}

function StickerView({ node }: { node: CreaStickerNode }) {
  const image = useStickerImage(node.sticker);
  return (
    <>
      <Rect name="hit" width={node.width} height={node.height} fill="rgba(0,0,0,0)" />
      {image ? <KonvaImage image={image} width={node.width} height={node.height} listening={false} {...shadowProps(node.shadow)} /> : null}
    </>
  );
}

function ShapeView({ node }: { node: CreaShapeNode }) {
  const { width: w, height: h } = node;
  const fill = node.fill ?? undefined;
  const stroke = node.stroke ? { stroke: node.stroke.color, strokeWidth: node.stroke.width } : { strokeEnabled: false };
  const shadow = shadowProps(node.shadow);
  let body: ReactNode;
  switch (node.shape) {
    case "rect":
      body = <Rect width={w} height={h} fill={fill} cornerRadius={node.cornerRadius} {...stroke} {...shadow} listening={false} />;
      break;
    case "ellipse":
      body = <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill={fill} {...stroke} {...shadow} listening={false} />;
      break;
    case "star":
      body = (
        <Star x={w / 2} y={h / 2} numPoints={5} outerRadius={w / 2} innerRadius={w / 4.4} scaleY={h / w} fill={fill} {...stroke} {...shadow} listening={false} />
      );
      break;
    case "arrow": {
      const thickness = h * 0.3;
      const color = node.fill ?? node.stroke?.color ?? CREA_SCENE_COLORS.mastilo;
      body = (
        <Arrow
          points={[thickness / 2, h / 2, w - h * 0.05, h / 2]}
          pointerLength={Math.min(w * 0.45, h * 0.9)}
          pointerWidth={h * 0.95}
          stroke={color}
          fill={color}
          strokeWidth={thickness}
          lineCap="round"
          lineJoin="round"
          {...shadow}
          listening={false}
        />
      );
      break;
    }
  }
  return (
    <>
      <Rect name="hit" width={w} height={h} fill="rgba(0,0,0,0)" />
      {body}
    </>
  );
}

function NodeView({
  node,
  assets,
  interactive,
  fontsVersion,
  slotHint,
  onSelect,
  onChange,
  onEditText,
}: {
  node: CreaSceneNode;
  assets: ReadonlyMap<string, EditorAsset>;
  interactive: boolean;
  fontsVersion: number;
  slotHint?: string;
  onSelect?: (nodeId: string) => void;
  onChange?: Props["onChange"];
  onEditText?: (nodeId: string) => void;
}) {
  const select = () => onSelect?.(node.id);
  return (
    <Group
      id={node.id}
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      visible={node.visible}
      listening={interactive}
      draggable={interactive && !node.locked}
      onMouseDown={select}
      onTouchStart={select}
      onDblClick={node.kind === "text" ? () => onEditText?.(node.id) : undefined}
      onDblTap={node.kind === "text" ? () => onEditText?.(node.id) : undefined}
      onDragEnd={(event) => {
        const group = event.currentTarget;
        onChange?.(node.id, { x: Math.round(group.x()), y: Math.round(group.y()) }, `pomeri:${node.id}`);
      }}
      onTransformEnd={(event) => {
        const group = event.currentTarget;
        const scaleX = group.scaleX();
        const scaleY = group.scaleY();
        group.scale({ x: 1, y: 1 });
        const base = { x: Math.round(group.x()), y: Math.round(group.y()), rotation: Math.round(group.rotation() * 10) / 10 };
        let patch: CreaNodePatch;
        if (node.kind === "text") {
          const textPatch: Partial<CreaTextNode> = { ...base, width: Math.max(20, Math.round(node.width * scaleX)) };
          if (node.fit && node.height !== undefined) textPatch.height = Math.max(20, Math.round(node.height * scaleY));
          else if (Math.abs(scaleY - 1) > 0.001) textPatch.fontSize = Math.max(8, Math.round(node.fontSize * scaleY));
          patch = textPatch;
        } else {
          patch = { ...base, width: Math.max(8, Math.round(node.width * scaleX)), height: Math.max(8, Math.round(node.height * scaleY)) };
        }
        onChange?.(node.id, patch, `oblik:${node.id}`);
      }}
    >
      {node.kind === "text" ? <TextView node={node} fontsVersion={fontsVersion} /> : null}
      {node.kind === "image" ? <ImageView node={node} asset={node.asset ? assets.get(node.asset) : undefined} slotHint={slotHint} /> : null}
      {node.kind === "sticker" ? <StickerView node={node} /> : null}
      {node.kind === "shape" ? <ShapeView node={node} /> : null}
    </Group>
  );
}

/** Platno → Blob; Safari bez WebP kodera na platnu ide kroz jSquash (isto kao „Promeni format", K04). */
async function encodeCanvas(canvas: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  const spec = EXPORT_FORMATS[format];
  const blob = await canvasToBlob(canvas, spec.type, format === "png" ? undefined : quality);
  if (blob.type === spec.type) return blob;
  if (format !== "webp") return blob;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  const { default: encodeWebp } = await import("@jsquash/webp/encode");
  const encoded = await encodeWebp(ctx.getImageData(0, 0, canvas.width, canvas.height), { quality: Math.round(quality * 100) });
  return new Blob([encoded], { type: spec.type });
}

export const SceneCanvas = forwardRef<SceneCanvasHandle, Props>(function SceneCanvas(
  { scene, assets, interactive, selectedId = null, onSelect, onChange, onEditText, slotHint, maxDisplayHeight, label },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [width, setWidth] = useState(0);
  const [fontsVersion, setFontsVersion] = useState(0);
  const coarse = useCoarsePointer();

  useEffect(() => {
    let alive = true;
    void loadCanvasFonts().then(() => {
      if (alive) setFontsVersion((value) => value + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(width / scene.width, maxDisplayHeight / scene.height) : 0;
  const stageWidth = Math.max(1, Math.round(scene.width * scale));
  const stageHeight = Math.max(1, Math.round(scene.height * scale));

  const selected = interactive && selectedId ? scene.nodes.find((node) => node.id === selectedId) : undefined;
  const transformable = selected && selected.visible && !selected.locked ? selected : undefined;

  // Transformer prati izabrani čvor (i kad se posle poništavanja čvor zameni novim objektom).
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const target = transformable ? contentRef.current?.findOne(`#${transformable.id}`) : undefined;
    transformer.nodes(target ? [target] : []);
    transformer.getLayer()?.batchDraw();
  }, [transformable, scene, fontsVersion, stageWidth]);

  useImperativeHandle(
    ref,
    () => ({
      async exportImage({ width: outWidth, height: outHeight, format, quality }) {
        const layer = contentRef.current;
        if (!layer || stageWidth <= 1) throw new CreaLocalAiError("UNSUPPORTED");
        // Nalepnice moraju biti učitane pre crtanja; slova takođe.
        await Promise.all([
          loadCanvasFonts(),
          ...scene.nodes.flatMap((node) => (node.kind === "sticker" ? [loadSticker(node.sticker).catch(() => null)] : [])),
        ]);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const hidden = layer.find(`.${UI_ONLY}`);
        hidden.forEach((node) => node.hide());
        let drawn: HTMLCanvasElement;
        try {
          drawn = layer.toCanvas({ x: 0, y: 0, width: stageWidth, height: stageHeight, pixelRatio: outWidth / stageWidth });
        } finally {
          hidden.forEach((node) => node.show());
        }
        // Zaokruživanje pri množenju ume da da piksel manje - izlaz je uvek tačno traženih mera.
        let exact = drawn;
        if (drawn.width !== outWidth || drawn.height !== outHeight) {
          const { canvas, ctx } = createCanvas(outWidth, outHeight);
          ctx.drawImage(drawn, 0, 0, outWidth, outHeight);
          exact = canvas;
        }
        return encodeCanvas(exact, format, quality);
      },
    }),
    [scene.nodes, stageWidth, stageHeight],
  );

  const anchorSize = coarse ? 22 : 12;
  const transformerAnchors =
    transformable?.kind === "text"
      ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
      : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"];

  return (
    <div ref={wrapRef} className="w-full">
      {scale > 0 ? (
        <div
          // Interaktivno platno opisuje editor (fokus, prečice); pregled je slika.
          role={interactive ? undefined : "img"}
          aria-label={interactive ? undefined : label}
          className="surface-media mx-auto overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
          style={{ width: stageWidth, height: stageHeight }}
        >
          <Stage
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) onSelect?.(null);
            }}
          >
            <Layer ref={contentRef}>
              <Rect
                name="background"
                width={scene.width}
                height={scene.height}
                fill={scene.background}
                // Prevlačenje preko pozadine na telefonu skroluje stranu (nije „uhvaćeno" platnom).
                preventDefault={false}
                onMouseDown={() => onSelect?.(null)}
                onTouchStart={() => onSelect?.(null)}
              />
              {scene.nodes.map((node) => (
                <NodeView
                  key={node.id}
                  node={node}
                  assets={assets}
                  interactive={interactive}
                  fontsVersion={fontsVersion}
                  slotHint={slotHint}
                  onSelect={onSelect}
                  onChange={onChange}
                  onEditText={onEditText}
                />
              ))}
            </Layer>
            {interactive ? (
              <Layer>
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  flipEnabled={false}
                  keepRatio
                  enabledAnchors={transformerAnchors}
                  anchorSize={anchorSize}
                  anchorCornerRadius={anchorSize / 2}
                  anchorFill={CREA_SCENE_COLORS.zuta}
                  anchorStroke={CREA_SCENE_COLORS.mastilo}
                  anchorStrokeWidth={2}
                  borderStroke={CREA_SCENE_COLORS.mastilo}
                  borderStrokeWidth={2}
                  rotateAnchorOffset={coarse ? 36 : 26}
                  // Dodirna meta ručke ≥ 44 px: vidljiv krug 22 px + nevidljiv obod sa svake strane.
                  anchorStyleFunc={(anchor) => anchor.hitStrokeWidth(coarse ? 22 : 8)}
                  rotationSnaps={[0, 90, 180, 270]}
                  rotationSnapTolerance={4}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 12 || newBox.height < 12 ? oldBox : newBox)}
                />
              </Layer>
            ) : null}
          </Stage>
        </div>
      ) : (
        <div className="surface-media mx-auto bg-paper" style={{ aspectRatio: `${scene.width} / ${scene.height}`, maxHeight: maxDisplayHeight }} />
      )}
    </div>
  );
});
