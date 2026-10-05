"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, ImageUp, Plus, Trash2, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { LookState } from "@/components/crea/create/look-state";
import { StyleThumb } from "@/components/crea/create/style-thumb";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CAMERA_APERTURES,
  CAMERA_BODIES,
  CAMERA_LENSES,
  cameraExplain,
  DEFAULT_CAMERA,
  normalizeCamera,
  type CreaCamera,
} from "@/lib/crea-camera";
import { CREA_CREATE_COPY as T } from "@/lib/crea-create-copy";
import { fillCopy } from "@/lib/crea-copy";
import { colorName, hexToRgb, tidyPalette, type Rgb } from "@/lib/crea-palette";
import { CREA_PALETTE_MAX, CREA_PALETTES, CREA_STYLE_GROUPS, CREA_STYLES, normalizePalette, type CreaStyleGroup } from "@/lib/crea-styles";
import type { Locale } from "@/lib/i18n";

type Tab = "stil" | "kamera" | "paleta" | "moji";

const TAB_BUTTON =
  "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none";

/**
 * Panel „Izgled" ispod polja za opis (Crea K13, S8). Učitava se lenjo (ne ulazi u
 * početni JS radionice). Izbor se ne upisuje u opis - composer ga dodaje tek pri
 * slanju i pokazuje „Modelu ide:", pa korisnik uvek vidi šta plaća.
 */
export default function LookPanel({
  locale,
  look,
  onChange,
  onClose,
  canSaveStyles,
}: {
  locale: Locale;
  look: LookState;
  onChange: (next: LookState) => void;
  onClose: () => void;
  canSaveStyles: boolean;
}) {
  const [tab, setTab] = useState<Tab>("stil");
  const tabs: Tab[] = canSaveStyles ? ["stil", "kamera", "paleta", "moji"] : ["stil", "kamera", "paleta"];

  return (
    <section aria-label={T.lookTitle[locale]} className="surface-inset mt-3 border border-line bg-paper p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={T.lookTitle[locale]}>
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(TAB_BUTTON, tab === id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper-strong text-ink hover:border-ink")}
          >
            {T.tabs[id][locale]}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className={cn(TAB_BUTTON, "gap-1.5 border-ink bg-yellow text-ink")}
        >
          <Check aria-hidden="true" className="size-4" />
          {T.lookClose[locale]}
        </button>
      </div>

      <div className="mt-4 max-h-[min(52vh,420px)] overflow-y-auto pr-1" role="tabpanel">
        {tab === "stil" ? <StyleTab locale={locale} look={look} onChange={onChange} /> : null}
        {tab === "kamera" ? <CameraTab locale={locale} look={look} onChange={onChange} /> : null}
        {tab === "paleta" ? <PaletteTab locale={locale} look={look} onChange={onChange} /> : null}
        {tab === "moji" ? <MyStylesTab locale={locale} look={look} onChange={onChange} /> : null}
      </div>
    </section>
  );
}

function StyleTab({ locale, look, onChange }: { locale: Locale; look: LookState; onChange: (next: LookState) => void }) {
  const [group, setGroup] = useState<CreaStyleGroup | "sve">("sve");
  const shown = group === "sve" ? CREA_STYLES : CREA_STYLES.filter((style) => style.group === group);
  return (
    <div className="space-y-3">
      <ChoiceChips<CreaStyleGroup | "sve">
        legend={T.tabs.stil[locale]}
        name="crea-look-group"
        options={[{ id: "sve" as const, label: T.allGroups[locale] }, ...CREA_STYLE_GROUPS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))]}
        value={group}
        onChange={setGroup}
      />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <li>
          <button
            type="button"
            aria-pressed={look.styleId === null}
            onClick={() => onChange({ ...look, styleId: null })}
            className={cn(
              "surface-inset flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 border-2 p-2 text-center text-sm font-black text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              look.styleId === null ? "border-ink bg-yellow/40" : "border-dashed border-ink/30 bg-paper-strong hover:border-ink",
            )}
          >
            <X aria-hidden="true" className="size-5" />
            {T.noStyle[locale]}
          </button>
        </li>
        {shown.map((style) => {
          const active = look.styleId === style.id;
          return (
            <li key={style.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...look, styleId: active ? null : style.id })}
                className={cn(
                  "surface-inset flex h-full w-full flex-col gap-1.5 border-2 p-1.5 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  active ? "border-ink bg-yellow/40 shadow-[3px_3px_0_0_var(--shadow-hard)]" : "border-ink/20 bg-paper-strong hover:border-ink",
                )}
              >
                <StyleThumb style={style} className="surface-media aspect-[4/3] w-full shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                <span className="px-1 text-sm font-black leading-tight text-ink">{style.label[locale]}</span>
                <span className="px-1 pb-1 text-xs font-bold leading-tight text-muted">{style.hint[locale]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CameraTab({ locale, look, onChange }: { locale: Locale; look: LookState; onChange: (next: LookState) => void }) {
  const camera = look.camera;
  const set = (patch: Partial<CreaCamera>) => onChange({ ...look, camera: normalizeCamera({ ...(camera ?? DEFAULT_CAMERA), ...patch }) });
  const lens = CAMERA_LENSES.find((entry) => entry.id === (camera ?? DEFAULT_CAMERA).lens)!;
  return (
    <div className="space-y-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
        <input
          type="checkbox"
          checked={camera !== null}
          onChange={(event) => onChange({ ...look, camera: event.target.checked ? DEFAULT_CAMERA : null })}
          className="size-5 accent-ink"
        />
        {T.cameraOn[locale]}
      </label>
      {camera ? (
        <>
          <ChoiceChips
            legend={T.cameraBody[locale]}
            name="crea-camera-body"
            options={CAMERA_BODIES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.explain[locale] }))}
            value={camera.body}
            onChange={(body) => set({ body })}
          />
          <ChoiceChips
            legend={T.cameraLens[locale]}
            name="crea-camera-lens"
            options={CAMERA_LENSES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.explain[locale] }))}
            value={camera.lens}
            onChange={(id) => set({ lens: id })}
          />
          <ChoiceChips
            legend={T.cameraFocal[locale]}
            name="crea-camera-focal"
            options={lens.focals.map((focal) => ({ id: focal, label: `${focal} mm` }))}
            value={camera.focal}
            onChange={(focal) => set({ focal })}
          />
          <ChoiceChips
            legend={T.cameraAperture[locale]}
            name="crea-camera-aperture"
            options={CAMERA_APERTURES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.explain[locale] }))}
            value={camera.aperture}
            onChange={(aperture) => set({ aperture })}
          />
          <p className="type-body-sm font-bold text-ink">{cameraExplain(camera, locale)}</p>
        </>
      ) : null}
    </div>
  );
}

function Swatches({ colors, locale, onRemove }: { colors: readonly string[]; locale: Locale; onRemove?: (hex: string) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {colors.map((hex) => {
        const rgb = hexToRgb(hex) as Rgb;
        const name = colorName(rgb, locale);
        return onRemove ? (
          <button
            key={hex}
            type="button"
            onClick={() => onRemove(hex)}
            aria-label={fillCopy(T.paletteRemove[locale], { hex: `${name} ${hex}` })}
            title={`${name} ${hex}`}
            className="inline-flex size-11 items-center justify-center rounded-full border-2 border-ink shadow-[inset_0_0_0_2px_var(--paper-strong)]"
            style={{ backgroundColor: hex }}
          >
            <X aria-hidden="true" className="size-4 rounded-full bg-paper-strong text-ink" />
          </button>
        ) : (
          <span key={hex} title={`${name} ${hex}`} className="inline-block size-6 rounded-full border-2 border-ink" style={{ backgroundColor: hex }} />
        );
      })}
    </span>
  );
}

function PaletteTab({ locale, look, onChange }: { locale: Locale; look: LookState; onChange: (next: LookState) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const colorId = useId();
  const [reading, setReading] = useState<"idle" | "busy" | "failed">("idle");
  const [custom, setCustom] = useState("#f4be30");

  async function fromImage(file: File | undefined) {
    if (!file) return;
    setReading("busy");
    try {
      const [{ decodeImage, drawScaled }, { getPaletteSync }] = await Promise.all([
        import("@/components/crea/tools/canvas"),
        import("colorthief"),
      ]);
      const bitmap = await decodeImage(file);
      const { canvas } = drawScaled(bitmap, 400);
      bitmap.close();
      const raw = getPaletteSync(canvas, { colorCount: 8, quality: 2 }) ?? [];
      const colors = tidyPalette(raw.map((color) => ({ rgb: color.array() as Rgb, share: color.proportion })), CREA_PALETTE_MAX);
      onChange({ ...look, palette: colors.map((color) => color.hex) });
      setReading("idle");
    } catch {
      setReading("failed");
    }
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        <li>
          <button
            type="button"
            aria-pressed={look.palette.length === 0}
            onClick={() => onChange({ ...look, palette: [] })}
            className={cn(
              "surface-inset flex min-h-11 w-full items-center gap-2 border-2 px-3 py-2 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              look.palette.length === 0 ? "border-ink bg-yellow/40" : "border-dashed border-ink/30 bg-paper-strong hover:border-ink",
            )}
          >
            <X aria-hidden="true" className="size-4" />
            {T.paletteNone[locale]}
          </button>
        </li>
        {CREA_PALETTES.map((palette) => {
          const active = palette.colors.join() === look.palette.join();
          return (
            <li key={palette.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...look, palette: [...palette.colors] })}
                className={cn(
                  "surface-inset flex min-h-11 w-full items-center justify-between gap-2 border-2 px-3 py-2 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  active ? "border-ink bg-yellow/40" : "border-ink/20 bg-paper-strong hover:border-ink",
                )}
              >
                {palette.label[locale]}
                <Swatches colors={palette.colors} locale={locale} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void fromImage(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          disabled={reading === "busy"}
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none"
        >
          <ImageUp aria-hidden="true" className="size-4" />
          {reading === "busy" ? T.paletteReading[locale] : T.paletteFromImage[locale]}
        </button>
        <label htmlFor={colorId} className="sr-only">
          {T.paletteAdd[locale]}
        </label>
        <input
          id={colorId}
          type="color"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="size-11 cursor-pointer rounded-full border-2 border-ink bg-paper-strong p-1"
        />
        <button
          type="button"
          disabled={look.palette.length >= CREA_PALETTE_MAX}
          onClick={() => onChange({ ...look, palette: normalizePalette([...look.palette, custom]) })}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none"
        >
          <Plus aria-hidden="true" className="size-4" />
          {T.paletteAdd[locale]}
        </button>
      </div>
      {reading === "failed" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {T.paletteFailed[locale]}
        </p>
      ) : null}
      {look.palette.length > 0 ? (
        <Swatches colors={look.palette} locale={locale} onRemove={(hex) => onChange({ ...look, palette: look.palette.filter((entry) => entry !== hex) })} />
      ) : null}
    </div>
  );
}

function MyStylesTab({ locale, look, onChange }: { locale: Locale; look: LookState; onChange: (next: LookState) => void }) {
  const mine = useQuery(api.creaStyles.listMyStyles, {});
  const save = useMutation(api.creaStyles.saveMyStyle);
  const remove = useMutation(api.creaStyles.deleteMyStyle);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "error" | "full" | "nothing">("idle");
  const nameId = useId();
  const extraId = useId();
  const hasSomething = look.styleId !== null || look.camera !== null || look.palette.length > 0 || look.extra.trim().length > 0;

  async function onSave() {
    if (!hasSomething) {
      setStatus("nothing");
      return;
    }
    setStatus("busy");
    try {
      await save({
        name,
        ...(look.styleId ? { styleId: look.styleId } : {}),
        ...(look.camera ? { camera: look.camera } : {}),
        ...(look.palette.length > 0 ? { palette: look.palette } : {}),
        ...(look.extra.trim() ? { promptFragment: look.extra } : {}),
      });
      setName("");
      setStatus("saved");
    } catch (error) {
      setStatus(error instanceof Error && error.message.includes("PREVISE_STILOVA") ? "full" : "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label htmlFor={extraId} className="type-body-sm font-black text-ink">
            {T.myExtra[locale]}
          </label>
          <input
            id={extraId}
            value={look.extra}
            maxLength={300}
            onChange={(event) => onChange({ ...look, extra: event.target.value })}
            placeholder={T.myExtraPlaceholder[locale]}
            className="surface-inset mt-1.5 block min-h-11 w-full border-2 border-ink bg-paper-strong px-3 type-body-sm font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="type-body-sm font-black text-ink">
              {T.myName[locale]}
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={40}
              onChange={(event) => {
                setName(event.target.value);
                if (status !== "busy") setStatus("idle");
              }}
              placeholder={T.myNamePlaceholder[locale]}
              className="surface-inset mt-1.5 block min-h-11 w-full border-2 border-ink bg-paper-strong px-3 type-body-sm font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </div>
          <button
            type="button"
            disabled={status === "busy" || name.trim().length === 0}
            onClick={() => void onSave()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none"
          >
            {T.mySave[locale]}
          </button>
        </div>
        <p aria-live="polite" className="type-body-sm font-bold text-muted">
          {status === "saved" ? T.mySaved[locale] : status === "error" ? T.myError[locale] : status === "full" ? T.myFull[locale] : status === "nothing" ? T.myNothing[locale] : ""}
        </p>
      </div>

      <div className="border-t border-line pt-4">
        {mine === undefined ? null : mine.length === 0 ? (
          <p className="type-body-sm font-semibold text-muted">{T.myEmpty[locale]}</p>
        ) : (
          <ul className="divide-y divide-line">
            {mine.map((entry) => (
              <li key={entry._id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-body-sm font-black text-ink">{entry.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
                    {entry.styleId ? CREA_STYLES.find((style) => style.id === entry.styleId)?.label[locale] : null}
                    {entry.camera ? `${entry.camera.focal} mm ${entry.camera.aperture}` : null}
                    {entry.palette.length > 0 ? <Swatches colors={entry.palette} locale={locale} /> : null}
                    {entry.promptFragment ? <span className="truncate">{entry.promptFragment}</span> : null}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      styleId: entry.styleId,
                      camera: entry.camera ? normalizeCamera(entry.camera) : null,
                      palette: entry.palette,
                      extra: entry.promptFragment,
                    })
                  }
                  className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  {T.myApply[locale]}
                </button>
                <button
                  type="button"
                  onClick={() => void remove({ styleId: entry._id as Id<"creaUserStyles"> })}
                  aria-label={fillCopy(T.myDelete[locale], { name: entry.name })}
                  className="inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
