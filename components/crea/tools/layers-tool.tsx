/* eslint-disable @next/next/no-img-element -- sličice slojeva su lokalni `blob:` URL-ovi, koje next/image ne obrađuje. */
"use client";

import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Merge, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type Konva from "konva";

import { ColorPicker, RangeField } from "@/components/crea/editor/controls";
import { useCanvasMaxHeight } from "@/components/crea/editor/export-options";
import { ToolHeader, ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { loadImageFromUrl, naturalSize } from "@/components/crea/tools/job-image";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import { TransparentPreview } from "@/components/crea/tools/transparent-preview";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LAYER_COUNT_RANGE } from "@/convex/creaLayersCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_LAYERS_COPY as T, CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import {
  canMergeDown,
  initialLayers,
  layerName,
  layersChanged,
  mergeDown,
  mergePair,
  moveLayer,
  nudgeLayer,
  reorderLayer,
  setLayerTint,
  tintPixels,
  toggleLayer,
  visibleLayers,
  type EditorLayer,
  type LayersState,
} from "@/lib/crea-layers";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { LAYERIZE_ROUTES } from "@/lib/crea-paid-edit";
import type { Locale } from "@/lib/i18n";

/** Najduža stranica platna u editoru: dovoljno za izvoz, štedi memoriju telefona (do 17 slojeva). */
const EDIT_MAX_SIDE = 2048;
/** Mapa providnosti za izbor klikom: dovoljno sitna da 17 slojeva ne košta ništa. */
const HIT_MAX_SIDE = 256;
const DEFAULT_LAYER_COUNT = 4;

type LayerAsset = {
  source: HTMLImageElement | HTMLCanvasElement;
  /** Alfa umanjena na ≤ 256 px (za klik) i okvir sadržaja u istim jedinicama. */
  hit: { width: number; height: number; alpha: Uint8ClampedArray };
  box: { x: number; y: number; width: number; height: number } | null;
  thumbUrl: string;
};

type LayerEntry = { jobId: Id<"generationJobs">; number: number; url: string | null };

function hitMap(source: CanvasImageSource, width: number, height: number): Pick<LayerAsset, "hit" | "box"> {
  const scale = Math.min(1, HIT_MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { ctx } = createCanvas(w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = rgba[i * 4 + 3]!;
    if (alpha[i]! > 32) {
      const x = i % w;
      const y = (i - x) / w;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    hit: { width: w, height: h, alpha },
    box: maxX < 0 ? null : { x: minX / w, y: minY / h, width: (maxX - minX + 1) / w, height: (maxY - minY + 1) / h },
  };
}

async function thumbnail(source: CanvasImageSource, width: number, height: number): Promise<string> {
  const scale = Math.min(1, 96 / Math.max(width, height));
  const { canvas, ctx } = createCanvas(width * scale, height * scale);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return URL.createObjectURL(await canvasToBlob(canvas, "image/png"));
}

/** Prefarbani slojevi po izvoru (keš po boji, jačini i veličini); izvor koji ode sa ekrana nosi i svoj keš. */
const tintCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/** Slika sloja kakva se crta: original ili prefarban. */
function useRenderedSources(state: LayersState | null, assets: ReadonlyMap<string, LayerAsset> | null) {
  return useMemo(() => {
    const out = new Map<string, HTMLImageElement | HTMLCanvasElement>();
    if (!state || !assets) return out;
    for (const layer of state.layers) {
      const asset = assets.get(layer.asset);
      if (!asset) continue;
      if (!layer.tint) {
        out.set(layer.id, asset.source);
        continue;
      }
      const key = `${layer.tint.color}:${layer.tint.amount}:${state.width}x${state.height}`;
      let byTint = tintCache.get(asset.source);
      if (!byTint) {
        byTint = new Map();
        tintCache.set(asset.source, byTint);
      }
      let tinted = byTint.get(key);
      if (!tinted) {
        const { canvas, ctx } = createCanvas(state.width, state.height);
        ctx.drawImage(asset.source, 0, 0, state.width, state.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        tintPixels(pixels.data, layer.tint);
        ctx.putImageData(pixels, 0, 0);
        // Klizač jačine pravi mnogo varijanti - čuvaju se samo poslednje.
        if (byTint.size > 6) byTint.clear();
        byTint.set(key, canvas);
        tinted = canvas;
      }
      out.set(layer.id, tinted);
    }
    return out;
  }, [state, assets]);
}

/** Slojevi složeni u jednu sliku (odozdo nagore, sa pomerajem i bojom). */
function compose(layers: readonly EditorLayer[], rendered: ReadonlyMap<string, CanvasImageSource>, width: number, height: number) {
  const { canvas, ctx } = createCanvas(width, height);
  for (const layer of layers) {
    const source = rendered.get(layer.id);
    if (source) ctx.drawImage(source, layer.x, layer.y, width, height);
  }
  return canvas;
}

/**
 * Slojevi (S20, K12): Seedream 5 Pro razloži sliku na providne slojeve (plaćeno,
 * po sloju), a editor na uređaju ih pomera, sakriva, prefarbava, spaja i izvozi
 * kao novu sliku - verziju razlaganja u stablu. Rad iz galerije koji je već
 * razlaganje (`?ulaz=`) otvara se pravo u editoru.
 */
export default function LayersTool(props: CreaToolProps) {
  const { tool, locale, canSave, projectId, source, paid } = props;
  const [jobId, setJobId] = useState<Id<"generationJobs"> | null>(source?.jobId ?? null);
  const layers = useQuery(api.creaLayers.getLayers, jobId ? { jobId } : "skip");
  const image = useImageInput(source);
  const [count, setCount] = useState(DEFAULT_LAYER_COUNT);
  // Rad iz galerije koji NIJE razlaganje je samo ulazna slika.
  const watching = jobId !== null && layers !== null;
  const ready = watching && layers?.status === "done" && layers.layers.length > 0 ? layers : null;

  if (ready) {
    return (
      <>
        {ready.requested !== null && ready.layers.length < ready.requested ? (
          <p className="mb-3 inline-flex items-center gap-2 type-body-sm font-black text-ink" aria-live="polite">
            <Spinner size="sm" />
            {fillCopy(T.arriving[locale], { n: ready.layers.length, total: ready.requested })}
          </p>
        ) : null}
        <LayersEditor
          key={ready.layers.map((layer) => layer.jobId).join("|")}
          {...props}
          entries={ready.layers}
          mainJobId={ready.mainJobId}
          demo={ready.isMock}
        />
      </>
    );
  }

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Layers aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5" aria-live="polite">
        {jobId !== null && layers === undefined ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
            <Spinner size="sm" />
            {T.loading[locale]}
          </p>
        ) : watching && layers && (layers.status === "failed" || layers.status === "refunded") ? (
          <div className="space-y-3">
            <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
            <Button variant="secondary" onClick={() => setJobId(null)}>
              {T.again[locale]}
            </Button>
          </div>
        ) : watching ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
            <Spinner size="sm" />
            {T.waiting[locale]}
          </p>
        ) : (
          <>
            <ImageInput locale={locale} input={image} disabled={false} />
            <RangeField
              label={T.count[locale]}
              value={count}
              min={LAYER_COUNT_RANGE.min}
              max={LAYER_COUNT_RANGE.max}
              display={fillCopy(T.countUnit[locale], { n: count })}
              onChange={setCount}
            />
            <p className="type-body-sm font-semibold text-muted">{T.priceNote[locale]}</p>
            <PaidEditPanel
              locale={locale}
              routes={LAYERIZE_ROUTES}
              purpose="edit"
              ready={image.picked !== null}
              notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
              prepare={async () => {
                const photo = await providerPhoto(image.picked!.file);
                return { files: { image: [photo.blob] }, width: photo.width, height: photo.height };
              }}
              request={(_route, text) => ({
                prompt:
                  locale === "sr"
                    ? `Razloži ovu sliku na ${count} providnih slojeva (pozadina pa predmeti i tekst).${text.trim() ? ` Zasebni slojevi: ${text.trim()}.` : ""}`
                    : `Split this image into ${count} transparent layers (background, then objects and text).${text.trim() ? ` Separate layers: ${text.trim()}.` : ""}`,
                layers: count,
              })}
              textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
              label={T.cta[locale]}
              parentJobId={image.picked?.sourceJobId ?? null}
              projectId={projectId}
              canSubmit={canSave}
              paid={paid}
              onSent={setJobId}
            />
          </>
        )}
      </div>
    </section>
  );
}

type EditorExtra = { width: number; height: number; visible: number };

function LayersEditor({
  tool,
  locale,
  caps,
  canSave,
  projectId,
  entries,
  mainJobId,
  demo,
}: CreaToolProps & { entries: readonly LayerEntry[]; mainJobId: Id<"generationJobs">; demo: boolean }) {
  const [assets, setAssets] = useState<Map<string, LayerAsset> | null>(null);
  const [failed, setFailed] = useState(false);
  const [initial, setInitial] = useState<LayersState | null>(null);
  const [state, setState] = useState<LayersState | null>(null);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const owned = useRef<string[]>([]);
  const mergeCounter = useRef(0);
  const rendered = useRenderedSources(state, assets);
  // Upit slojeva se ponovo izvrši kad stablo dobije novu verziju (npr. sačuvan izvoz) - učitava se samo kad se promeni spisak slojeva.
  const entriesKey = entries.map((entry) => entry.jobId).join("|");
  const entriesRef = useRef(entries);

  useEffect(() => {
    const entries = entriesRef.current;
    let alive = true;
    const releases: Array<() => void> = [];
    void (async () => {
      try {
        const loaded = await Promise.all(entries.map((entry) => loadImageFromUrl(entry.url ?? "")));
        releases.push(...loaded.map((item) => item.release));
        const first = naturalSize(loaded[0]!.image);
        const scale = Math.min(1, EDIT_MAX_SIDE / Math.max(first.width, first.height));
        const width = Math.max(1, Math.round(first.width * scale));
        const height = Math.max(1, Math.round(first.height * scale));
        const map = new Map<string, LayerAsset>();
        for (const [index, item] of loaded.entries()) {
          const key = `sloj-${entries[index]!.jobId}`;
          const thumbUrl = await thumbnail(item.image, width, height);
          owned.current.push(thumbUrl);
          map.set(key, { source: item.image, ...hitMap(item.image, width, height), thumbUrl });
        }
        if (!alive) return;
        const start = initialLayers(width, height, entries.map((entry) => ({ asset: `sloj-${entry.jobId}`, number: entry.number })));
        setAssets(map);
        setInitial(start);
        setState(start);
        setSelectedId(start.layers[start.layers.length - 1]?.id ?? null);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      for (const release of releases) release();
      for (const url of owned.current) URL.revokeObjectURL(url);
      owned.current = [];
    };
  }, [entriesKey]);

  function apply(next: LayersState) {
    if (next === state) return;
    setState(next);
    setRevision((value) => value + 1);
    setNotice(null);
  }

  async function mergeSelected() {
    if (!state || !assets || !selectedId) return;
    const pair = mergePair(state, selectedId);
    if (!pair) return;
    if (!pair[0].visible || !pair[1].visible) {
      setNotice(T.mergeHidden[locale]);
      return;
    }
    const canvas = compose(pair, rendered, state.width, state.height);
    mergeCounter.current += 1;
    const key = `spojeno-${mergeCounter.current}`;
    const thumbUrl = await thumbnail(canvas, state.width, state.height);
    owned.current.push(thumbUrl);
    const next = new Map(assets);
    next.set(key, { source: canvas, ...hitMap(canvas, state.width, state.height), thumbUrl });
    setAssets(next);
    const merged = mergeDown(state, selectedId, key);
    apply(merged);
    setSelectedId(merged.layers.find((layer) => layer.asset === key)?.id ?? null);
  }

  async function run(context: ToolRunContext): Promise<CreaToolOutput<EditorExtra>> {
    if (!state) throw new CreaLocalAiError("BAD_INPUT");
    context.reportRunning();
    const visible = visibleLayers(state);
    const blob = await canvasToBlob(compose(visible, rendered, state.width, state.height), "image/png");
    return {
      blob,
      kind: "image",
      fileName: "crea-slojevi.png",
      previewUrl: URL.createObjectURL(blob),
      params: { sirina: state.width, visina: state.height, slojeva: visible.length },
      extra: { width: state.width, height: state.height, visible: visible.length },
    };
  }

  const selected = state?.layers.find((layer) => layer.id === selectedId) ?? null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={mainJobId}
      canRun={state !== null && visibleLayers(state).length > 0}
      inputKey={state ? String(revision) : null}
      runLabel={T.run[locale]}
      icon={<Layers aria-hidden="true" className="size-5" />}
      run={run}
      renderResult={(output) => (
        <div className="space-y-2">
          {output.previewUrl ? <TransparentPreview url={output.previewUrl} alt={T.run[locale]} transparent /> : null}
          <p className="font-mono text-sm font-black text-ink">
            {fillCopy(T.result[locale], { w: output.extra.width, h: output.extra.height, n: output.extra.visible })}
          </p>
        </div>
      )}
    >
      {({ busy }) =>
        failed ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {T.loadFailed[locale]}
          </p>
        ) : !state || !assets ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
            <Spinner size="sm" />
            {T.loading[locale]}
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <div className="min-w-0 space-y-2">
              <LayersCanvas
                locale={locale}
                state={state}
                assets={assets}
                rendered={rendered}
                selectedId={selectedId}
                disabled={busy}
                onSelect={setSelectedId}
                onMove={(id, x, y) => apply(moveLayer(state, id, x, y))}
                onNudge={(id, dx, dy) => apply(nudgeLayer(state, id, dx, dy))}
              />
              <p className="type-body-sm font-semibold text-muted">
                {selected ? fillCopy(T.selected[locale], { name: layerName(selected, locale) }) : T.noneSelected[locale]}
              </p>
              {demo ? <p className="type-body-sm font-semibold text-muted">{T.demoNote[locale]}</p> : null}
            </div>

            <div className="min-w-0 space-y-4">
              <fieldset disabled={busy} className="min-w-0">
                <legend className="type-body-sm font-black text-ink">{T.list[locale]}</legend>
                <ul className="mt-2 divide-y divide-line">
                  {[...state.layers].reverse().map((layer) => {
                    const index = state.layers.indexOf(layer);
                    const asset = assets.get(layer.asset);
                    const name = layerName(layer, locale);
                    return (
                      <li key={layer.id} className="flex items-center gap-1 py-1.5">
                        <button
                          type="button"
                          aria-pressed={layer.id === selectedId}
                          onClick={() => setSelectedId(layer.id)}
                          className={cn(
                            "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full border-2 px-2 text-left text-sm font-black text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                            layer.id === selectedId ? "border-ink bg-yellow" : "border-transparent hover:border-ink/25",
                            !layer.visible && "opacity-60",
                          )}
                        >
                          {asset ? (
                            <img src={asset.thumbUrl} alt="" className="size-8 shrink-0 rounded-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                          ) : null}
                          <span className="min-w-0 break-words leading-tight">{name}</span>
                        </button>
                        <IconToggle
                          label={`${layer.visible ? T.hide[locale] : T.show[locale]}: ${name}`}
                          onClick={() => apply(toggleLayer(state, layer.id))}
                        >
                          {layer.visible ? <Eye aria-hidden="true" className="size-4" /> : <EyeOff aria-hidden="true" className="size-4" />}
                        </IconToggle>
                        <IconToggle
                          label={`${T.up[locale]}: ${name}`}
                          disabled={index === state.layers.length - 1}
                          onClick={() => apply(reorderLayer(state, layer.id, "up"))}
                        >
                          <ArrowUp aria-hidden="true" className="size-4" />
                        </IconToggle>
                        <IconToggle
                          label={`${T.down[locale]}: ${name}`}
                          disabled={index === 0}
                          onClick={() => apply(reorderLayer(state, layer.id, "down"))}
                        >
                          <ArrowDown aria-hidden="true" className="size-4" />
                        </IconToggle>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              {selected ? (
                <div className="space-y-3 border-t border-line pt-4">
                  <ColorPicker
                    locale={locale}
                    legend={T.recolorColor[locale]}
                    value={selected.tint?.color ?? "#2e6f9f"}
                    customLabel={T.recolorCustom[locale]}
                    onChange={(color) => apply(setLayerTint(state, selected.id, { color, amount: selected.tint?.amount ?? 0.7 }))}
                  />
                  <RangeField
                    label={T.recolorAmount[locale]}
                    value={Math.round((selected.tint?.amount ?? 0) * 100)}
                    min={0}
                    max={100}
                    display={`${Math.round((selected.tint?.amount ?? 0) * 100)} %`}
                    onChange={(value) =>
                      apply(setLayerTint(state, selected.id, value === 0 ? null : { color: selected.tint?.color ?? "#2e6f9f", amount: value / 100 }))
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !canMergeDown(state, selected.id)}
                    icon={<Merge aria-hidden="true" className="size-4" />}
                    onClick={() => void mergeSelected()}
                  >
                    {T.merge[locale]}
                  </Button>
                </div>
              ) : null}

              <div className="border-t border-line pt-4">
                <Button
                  variant="ghost"
                  disabled={busy || !initial || !layersChanged(initial, state)}
                  icon={<RotateCcw aria-hidden="true" className="size-4" />}
                  onClick={() => {
                    if (!initial) return;
                    apply(initial);
                    setSelectedId(initial.layers[initial.layers.length - 1]?.id ?? null);
                  }}
                >
                  {T.reset[locale]}
                </Button>
              </div>
              <div aria-live="polite">{notice ? <p className="type-body-sm font-bold text-ink">{notice}</p> : null}</div>
            </div>
          </div>
        )
      }
    </ToolRunner>
  );
}

function IconToggle({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-30 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/**
 * Platno (Konva): svi vidljivi slojevi; izabran sloj se vuče mišem ili prstom,
 * strelice ga pomeraju (Shift = 10 px). Klik bira najviši sloj čiji je piksel
 * na tom mestu neproziran (mapa providnosti), ne pravougaonik slike.
 */
function LayersCanvas({
  locale,
  state,
  assets,
  rendered,
  selectedId,
  disabled,
  onSelect,
  onMove,
  onNudge,
}: {
  locale: Locale;
  state: LayersState;
  assets: ReadonlyMap<string, LayerAsset>;
  rendered: ReadonlyMap<string, HTMLImageElement | HTMLCanvasElement>;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onNudge: (id: string, dx: number, dy: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const maxHeight = useCanvasMaxHeight();

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(1, width / state.width, maxHeight / state.height) : 0;
  const stageWidth = Math.max(1, Math.round(state.width * scale));
  const stageHeight = Math.max(1, Math.round(state.height * scale));
  const selected = state.layers.find((layer) => layer.id === selectedId) ?? null;
  const selectedBox = selected ? assets.get(selected.asset)?.box : null;

  function pick(stage: Konva.Stage | null) {
    const point = stage?.getPointerPosition();
    if (!point || scale <= 0) return;
    const sx = point.x / scale;
    const sy = point.y / scale;
    for (const layer of [...visibleLayers(state)].reverse()) {
      const asset = assets.get(layer.asset);
      if (!asset) continue;
      const u = (sx - layer.x) / state.width;
      const v = (sy - layer.y) / state.height;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const hx = Math.min(asset.hit.width - 1, Math.floor(u * asset.hit.width));
      const hy = Math.min(asset.hit.height - 1, Math.floor(v * asset.hit.height));
      if (asset.hit.alpha[hy * asset.hit.width + hx]! > 32) {
        onSelect(layer.id);
        return;
      }
    }
    onSelect(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selected || disabled) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onNudge(selected.id, move[0], move[1]);
  }

  return (
    <div ref={wrapRef} className="w-full">
      {scale > 0 ? (
        <div
          tabIndex={0}
          role="application"
          aria-label={T.canvasLabel[locale]}
          onKeyDown={onKeyDown}
          className="surface-media mx-auto touch-none overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          // Šahovnica (kao `TransparentPreview`): vidi se gde sloj nema piksela.
          style={{
            width: stageWidth,
            height: stageHeight,
            backgroundImage: "repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%)",
            backgroundSize: "20px 20px",
          }}
        >
          <Stage
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            onClick={(event) => pick(event.target.getStage())}
            onTap={(event) => pick(event.target.getStage())}
          >
            <Layer>
              {state.layers.map((layer) => {
                const source = rendered.get(layer.id);
                if (!layer.visible || !source) return null;
                const active = layer.id === selectedId && !disabled;
                return (
                  <KonvaImage
                    key={layer.id}
                    image={source}
                    x={layer.x}
                    y={layer.y}
                    width={state.width}
                    height={state.height}
                    listening={active}
                    draggable={active}
                    onDragEnd={(event) => onMove(layer.id, event.target.x(), event.target.y())}
                  />
                );
              })}
              {selected && selected.visible && selectedBox ? (
                <Rect
                  x={selected.x + selectedBox.x * state.width}
                  y={selected.y + selectedBox.y * state.height}
                  width={selectedBox.width * state.width}
                  height={selectedBox.height * state.height}
                  // Žuta brenda: oznaka izbora na platnu (Konva traži pravu boju, ne CSS promenljivu).
                  stroke="#f4be30"
                  strokeWidth={2 / scale}
                  dash={[8 / scale, 6 / scale]}
                  listening={false}
                />
              ) : null}
            </Layer>
          </Stage>
        </div>
      ) : null}
    </div>
  );
}
