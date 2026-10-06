/* eslint-disable @next/next/no-img-element -- logo je lokalni `blob:` ili potpisan URL iz Convex storage-a. */
"use client";

import { useMutation } from "convex/react";
import { CircleCheck, Palette, Pipette, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { colorsFromLogo, logoPng } from "@/components/crea/brand-kit/logo-colors";
import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import { fontFamilyFor } from "@/components/crea/editor/fonts";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useSlotUpload } from "@/components/studio/use-slot-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BRAND_COLORS_MAX,
  BRAND_FONT_INFO,
  BRAND_FONTS,
  BRAND_NAME_MAX,
  BRAND_TONE_MAX,
  BRAND_TONE_PRESETS,
  DEFAULT_BRAND_FONTS,
  cleanBrandName,
  type CreaBrandFonts,
  type CreaBrandKit,
} from "@/lib/crea-brand-kit";
import { fillCopy } from "@/lib/crea-copy";
import type { CreaFontId } from "@/lib/crea-editor-scene";
import { normalizeHex } from "@/lib/crea-matting";
import { colorName, hexToRgb } from "@/lib/crea-palette";
import { CREA_BRAND_KIT_COPY as T } from "@/lib/crea-recipes-copy";
import type { Locale } from "@/lib/i18n";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const FIELD = `surface-inset mt-2 block w-full border-2 border-ink bg-paper px-3 text-base font-bold text-ink placeholder:text-muted ${FOCUS}`;

function errorText(raw: string, locale: Locale): string {
  const code = Object.keys(T.errors).find((key) => key !== "other" && raw.includes(key)) as keyof typeof T.errors | undefined;
  return (code ? T.errors[code] : T.errors.other)[locale];
}

/**
 * Brend kit (S38, K15): ime, logo, boje (izvučene iz logoa - `colorthief`),
 * slova iz allowlist-e editora (sve OFL) i ton. Jedan kit po korisniku; recepti,
 * editor i logo ga sami koriste (`useBrandKit`).
 */
export default function BrandKitTool({ tool, locale, canSave, source }: CreaToolProps) {
  const kit = useBrandKit();
  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Palette aria-hidden="true" className="size-5" />} />
      <div className="mt-5 border-t border-line pt-5">
        {kit === undefined ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner size="md" className="text-muted" />
          </div>
        ) : (
          // Forma kreće od sačuvanog kita; posle čuvanja ostaje ono što je korisnik upisao.
          <BrandKitForm locale={locale} kit={kit} canSave={canSave} source={source} />
        )}
      </div>
    </section>
  );
}

function BrandKitForm({
  locale,
  kit,
  canSave,
  source,
}: {
  locale: Locale;
  kit: CreaBrandKit | null;
  canSave: boolean;
  source: CreaToolProps["source"];
}) {
  const saveMine = useMutation(api.creaBrandKit.saveMine);
  const deleteMine = useMutation(api.creaBrandKit.deleteMine);
  const upload = useSlotUpload();
  const logoInput = useImageInput(source);
  const nameId = useId();
  const toneId = useId();
  const colorId = useId();

  const [name, setName] = useState(kit?.name ?? "");
  const [colors, setColors] = useState<string[]>([...(kit?.colors ?? [])]);
  const [fonts, setFonts] = useState<CreaBrandFonts>(kit?.fonts ?? DEFAULT_BRAND_FONTS);
  const [tone, setTone] = useState(kit?.tone ?? "");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [custom, setCustom] = useState("#f4be30");
  const [reading, setReading] = useState<"idle" | "busy" | "failed">("idle");
  const [status, setStatus] = useState<{ name: "idle" | "saving" | "uploading" | "saved" | "removed" } | { name: "error"; message: string }>({
    name: "idle",
  });

  const picked = logoInput.picked;
  const logoUrl = picked ? picked.url : removeLogo ? null : (kit?.logoUrl ?? null);

  async function readColors(file: Blob) {
    setReading("busy");
    try {
      const found = await colorsFromLogo(file);
      if (found.length > 0) setColors(found.slice(0, BRAND_COLORS_MAX));
      setReading("idle");
    } catch {
      setReading("failed");
    }
  }

  // Nov logo → boje se odmah izvlače iz njega (korisnik ih posle menja).
  useEffect(() => {
    if (!picked) return;
    let alive = true;
    void colorsFromLogo(picked.file)
      .then((found) => {
        if (alive && found.length > 0) setColors(found.slice(0, BRAND_COLORS_MAX));
      })
      .catch(() => {
        if (alive) setReading("failed");
      });
    return () => {
      alive = false;
    };
  }, [picked]);

  async function fromCurrentLogo() {
    if (picked) return readColors(picked.file);
    if (!logoUrl) return;
    setReading("busy");
    try {
      const response = await fetch(logoUrl);
      await readColors(await response.blob());
    } catch {
      setReading("failed");
    }
  }

  function addColor(value: string) {
    const hex = normalizeHex(value);
    if (!hex || colors.includes(hex) || colors.length >= BRAND_COLORS_MAX) return;
    setColors([...colors, hex]);
  }

  async function save() {
    if (!cleanBrandName(name)) {
      setStatus({ name: "error", message: T.needName[locale] });
      return;
    }
    try {
      let logoStorageId: Id<"_storage"> | null | undefined;
      if (picked) {
        setStatus({ name: "uploading" });
        const uploaded = await upload(await logoPng(picked.file), "image", () => undefined);
        if (uploaded.url) URL.revokeObjectURL(uploaded.url);
        logoStorageId = uploaded.storageId as Id<"_storage">;
      } else if (removeLogo) {
        logoStorageId = null;
      }
      setStatus({ name: "saving" });
      await saveMine({ name, colors, fonts, tone, ...(logoStorageId !== undefined ? { logoStorageId } : {}) });
      setStatus({ name: "saved" });
    } catch (error) {
      setStatus({ name: "error", message: errorText(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  async function remove() {
    try {
      await deleteMine({});
      setStatus({ name: "removed" });
    } catch (error) {
      setStatus({ name: "error", message: errorText(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  const busy = status.name === "saving" || status.name === "uploading";

  return (
    <div className="space-y-6">
      <p className="type-body-sm font-semibold text-muted">{T.intro[locale]}</p>

      <div className="grid gap-6 @min-[760px]:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <div>
            <label htmlFor={nameId} className="type-body-sm font-black text-ink">
              {T.name[locale]}
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={BRAND_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder={T.namePlaceholder[locale]}
              className={cn(FIELD, "min-h-11")}
            />
          </div>

          <div>
            <p className="type-body-sm font-black text-ink">{T.logo[locale]}</p>
            <p className="mt-1 type-body-sm font-semibold text-muted">{T.logoHint[locale]}</p>
            <div className="mt-2">
              {logoUrl && !picked ? (
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src={logoUrl}
                    alt=""
                    className="surface-media size-24 shrink-0 bg-paper object-contain p-1 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
                  />
                  <Button variant="secondary" size="sm" onClick={() => setRemoveLogo(true)} icon={<X aria-hidden="true" className="size-4" />}>
                    {T.removeLogo[locale]}
                  </Button>
                </div>
              ) : (
                <ImageInput locale={locale} input={logoInput} disabled={busy} />
              )}
            </div>
          </div>

          <fieldset className="min-w-0">
            <legend className="type-body-sm font-black text-ink">{T.colors[locale]}</legend>
            <ul className="mt-2 flex flex-wrap items-center gap-2">
              {colors.map((hex) => {
                const rgb = hexToRgb(hex);
                const label = rgb ? `${colorName(rgb, locale)} ${hex}` : hex;
                return (
                  <li key={hex}>
                    <button
                      type="button"
                      onClick={() => setColors(colors.filter((entry) => entry !== hex))}
                      aria-label={fillCopy(T.removeColor[locale], { color: label })}
                      title={label}
                      className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink/25 bg-paper px-2 pr-3 text-xs font-black text-ink hover:border-ink", FOCUS)}
                    >
                      <span
                        aria-hidden="true"
                        className="block size-7 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]"
                        // Boja uzorka je podatak brenda (HEX), ne boja interfejsa.
                        style={{ backgroundColor: hex }}
                      />
                      <span className="font-mono">{hex}</span>
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                htmlFor={colorId}
                className={cn(
                  "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-ink/25 px-3 text-sm font-black text-ink hover:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                )}
              >
                <span aria-hidden="true" className="block size-6 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]" style={{ backgroundColor: custom }} />
                <input id={colorId} type="color" value={custom} onChange={(event) => setCustom(event.target.value)} className="sr-only" />
                <span className="font-mono">{custom}</span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={colors.length >= BRAND_COLORS_MAX || colors.includes(custom)}
                onClick={() => addColor(custom)}
                icon={<Plus aria-hidden="true" className="size-4" />}
              >
                {T.addColor[locale]}
              </Button>
              {logoUrl ? (
                <Button variant="ghost" size="sm" loading={reading === "busy"} onClick={() => void fromCurrentLogo()} icon={<Pipette aria-hidden="true" className="size-4" />}>
                  {reading === "busy" ? T.colorsReading[locale] : T.colorsFromLogo[locale]}
                </Button>
              ) : null}
            </div>
            <p aria-live="polite" className="mt-2 type-body-sm font-semibold text-muted">
              {reading === "failed" ? T.colorsFailed[locale] : colors.length >= BRAND_COLORS_MAX ? fillCopy(T.colorsMax[locale], { max: BRAND_COLORS_MAX }) : null}
            </p>
          </fieldset>
        </div>

        <div className="min-w-0 space-y-5">
          {(["heading", "body"] as const).map((slot) => (
            <div key={slot} className="space-y-2">
              <ChoiceChips<CreaFontId>
                legend={(slot === "heading" ? T.headingFont : T.bodyFont)[locale]}
                name={`crea-brand-font-${slot}`}
                options={BRAND_FONTS.map((font) => ({ id: font, label: BRAND_FONT_INFO[font].label[locale], hint: BRAND_FONT_INFO[font].hint[locale] }))}
                value={fonts[slot]}
                onChange={(font) => setFonts({ ...fonts, [slot]: font })}
                disabled={busy}
              />
              <p
                className={cn("surface-inset bg-paper px-3 py-2 text-ink", slot === "heading" ? "text-2xl font-black" : "text-base")}
                // Uzorak slova tim fontom (font je podatak brenda, ne tema interfejsa).
                style={{ fontFamily: fontFamilyFor(fonts[slot]) }}
              >
                {name.trim() || T.fontSample[locale]}
              </p>
            </div>
          ))}

          <div>
            <label htmlFor={toneId} className="type-body-sm font-black text-ink">
              {T.tone[locale]}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND_TONE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setTone(preset.text[locale])}
                  aria-pressed={tone === preset.text[locale]}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black",
                    tone === preset.text[locale] ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                    FOCUS,
                  )}
                >
                  {preset.label[locale]}
                </button>
              ))}
            </div>
            <textarea
              id={toneId}
              value={tone}
              rows={2}
              maxLength={BRAND_TONE_MAX}
              onChange={(event) => setTone(event.target.value)}
              placeholder={T.tonePlaceholder[locale]}
              className={cn(FIELD, "resize-y py-2")}
            />
            <FieldMic locale={locale} value={tone} onChange={setTone} maxLength={BRAND_TONE_MAX} />
          </div>
        </div>
      </div>

      <section className="surface-inset space-y-1 bg-paper p-4">
        <h3 className="type-body font-black text-ink">{T.where[locale]}</h3>
        <p className="type-body-sm font-semibold text-muted">{T.whereList[locale]}</p>
      </section>

      {canSave ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button onClick={() => void save()} loading={busy} icon={<CircleCheck aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
            {status.name === "uploading" ? T.uploading[locale] : T.save[locale]}
          </Button>
          {kit ? (
            <Button variant="ghost" disabled={busy} onClick={() => void remove()} icon={<Trash2 aria-hidden="true" className="size-4" />}>
              {T.remove[locale]}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
      )}
      <div aria-live="polite">
        {status.name === "saved" ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
            <CircleCheck aria-hidden="true" className="size-4" />
            {T.saved[locale]}
          </p>
        ) : null}
        {status.name === "removed" ? <p className="type-body-sm font-black text-ink">{T.removed[locale]}</p> : null}
        {status.name === "error" ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
