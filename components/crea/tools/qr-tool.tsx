/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { QrCode } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { CREA_QR_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import {
  EMPTY_QR_FIELDS,
  QR_COLOR_PRESETS,
  QR_KINDS,
  qrColorProblem,
  qrFileName,
  qrPayload,
  type QrFields,
  type QrKind,
  type WifiSecurity,
} from "@/lib/crea-qr";
import type { Locale } from "@/lib/i18n";

/** Dovoljno za štampu na A5 i oštro na ekranu. */
const QR_SIZE_PX = 1024;
const DOT_STYLES = ["rounded", "square", "dots"] as const;
type DotStyle = (typeof DOT_STYLES)[number];
const SECURITIES: readonly WifiSecurity[] = ["WPA", "WEP", "nopass"];

type QrColors = { dots: string; background: string };

async function makeQr(data: string, colors: QrColors, style: DotStyle, fileName: string, context: ToolRunContext): Promise<CreaToolOutput<null>> {
  context.reportRunning();
  let blob: Blob | null;
  try {
    const { default: QRCodeStyling } = await import("qr-code-styling");
    const qr = new QRCodeStyling({
      type: "canvas",
      width: QR_SIZE_PX,
      height: QR_SIZE_PX,
      // Tihi rub oko koda (~4 modula) - bez njega kamere teže nađu kod na šarenoj podlozi.
      margin: 96,
      data,
      // „Q" (25 % rezerve): kod se čita i kad je malo izgužvan ili zaprljan.
      qrOptions: { errorCorrectionLevel: "Q" },
      dotsOptions: { type: style, color: colors.dots },
      cornersSquareOptions: { type: style === "square" ? "square" : "extra-rounded", color: colors.dots },
      cornersDotOptions: { type: style === "square" ? "square" : "dot", color: colors.dots },
      backgroundOptions: { color: colors.background },
    });
    const raw = await qr.getRawData("png");
    blob = raw instanceof Blob ? raw : null;
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  if (!blob) throw new CreaLocalAiError("INFERENCE_FAILED");
  return {
    blob,
    kind: "image",
    fileName,
    previewUrl: URL.createObjectURL(blob),
    params: { boje: `${colors.dots}/${colors.background}`, oblik: style },
    extra: null,
  };
}

function Field({ label, children, id }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="type-body-sm font-black text-ink">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const inputClass =
  "surface-inset block min-h-11 w-full border-2 border-ink bg-paper px-3 py-2 text-base font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default function QrTool({ tool, locale, caps, canSave, projectId }: CreaToolProps) {
  const id = useId();
  const [kind, setKind] = useState<QrKind>("link");
  const [fields, setFields] = useState<QrFields>(EMPTY_QR_FIELDS);
  const [presetId, setPresetId] = useState<string>(QR_COLOR_PRESETS[0].id);
  const [custom, setCustom] = useState<QrColors>({ dots: QR_COLOR_PRESETS[0].dots, background: QR_COLOR_PRESETS[0].background });
  const [style, setStyle] = useState<DotStyle>("rounded");
  const preset = QR_COLOR_PRESETS.find((entry) => entry.id === presetId);
  const colors: QrColors = preset ? { dots: preset.dots, background: preset.background } : custom;

  const payload = qrPayload(kind, fields);
  const colorProblem = qrColorProblem(colors.dots, colors.background);
  const set = <K extends keyof QrFields>(key: K, value: QrFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const touched = kind === "link" ? fields.link : kind === "tekst" ? fields.text : fields.ssid;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={payload.ok && colorProblem === null}
      inputKey={payload.ok ? `${payload.data}:${colors.dots}:${colors.background}:${style}` : null}
      icon={<QrCode aria-hidden="true" className="size-5" />}
      run={(context) =>
        makeQr(payload.ok ? payload.data : "", colors, style, qrFileName(kind, fields), context)
      }
      renderResult={(output) => <QrResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ChoiceChips
            legend={CREA_QR_COPY.kind[locale]}
            name="crea-qr-kind"
            options={QR_KINDS.map((entry) => ({ id: entry, label: CREA_QR_COPY.kinds[entry][locale] }))}
            value={kind}
            onChange={setKind}
            disabled={busy}
          />

          <fieldset disabled={busy} className="min-w-0 space-y-4">
            {kind === "link" ? (
              <Field id={`${id}-link`} label={CREA_QR_COPY.link[locale]}>
                <input
                  id={`${id}-link`}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  value={fields.link}
                  placeholder={CREA_QR_COPY.linkPlaceholder[locale]}
                  onChange={(event) => set("link", event.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : null}
            {kind === "tekst" ? (
              <Field id={`${id}-text`} label={CREA_QR_COPY.text[locale]}>
                <textarea
                  id={`${id}-text`}
                  rows={4}
                  value={fields.text}
                  placeholder={CREA_QR_COPY.textPlaceholder[locale]}
                  onChange={(event) => set("text", event.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : null}
            {kind === "wifi" ? (
              <>
                <Field id={`${id}-ssid`} label={CREA_QR_COPY.ssid[locale]}>
                  <input
                    id={`${id}-ssid`}
                    value={fields.ssid}
                    autoComplete="off"
                    onChange={(event) => set("ssid", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <ChoiceChips
                  legend={CREA_QR_COPY.security[locale]}
                  name="crea-qr-security"
                  options={SECURITIES.map((entry) => ({ id: entry, label: CREA_QR_COPY.securities[entry][locale] }))}
                  value={fields.security}
                  onChange={(value) => set("security", value)}
                  disabled={busy}
                />
                {fields.security !== "nopass" ? (
                  <Field id={`${id}-password`} label={CREA_QR_COPY.password[locale]}>
                    <input
                      id={`${id}-password`}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={fields.password}
                      onChange={(event) => set("password", event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                ) : null}
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={fields.hidden}
                    onChange={(event) => set("hidden", event.target.checked)}
                    className="size-5 accent-ink"
                  />
                  {CREA_QR_COPY.hidden[locale]}
                </label>
                <p className="type-body-sm font-semibold text-muted">{CREA_QR_COPY.wifiNote[locale]}</p>
              </>
            ) : null}
            {!payload.ok && touched ? (
              <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
                {CREA_QR_COPY.problems[payload.problem][locale]}
              </p>
            ) : null}
          </fieldset>

          <fieldset disabled={busy} className="min-w-0">
            <legend className="type-body-sm font-black text-ink">{CREA_QR_COPY.colors[locale]}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...QR_COLOR_PRESETS.map((entry) => ({ id: entry.id, label: entry.label[locale], dots: entry.dots, background: entry.background })), {
                id: "svoje",
                label: CREA_QR_COPY.customColors[locale],
                dots: custom.dots,
                background: custom.background,
              }].map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-black transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none",
                    presetId === option.id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="crea-qr-colors"
                    value={option.id}
                    checked={presetId === option.id}
                    onChange={() => setPresetId(option.id)}
                    className="sr-only"
                  />
                  {/* Uzorak: tačka u boji tačaka na krugu u boji pozadine. */}
                  <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border border-line" style={{ backgroundColor: option.background }}>
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: option.dots }} />
                  </span>
                  {option.label}
                </label>
              ))}
            </div>
            {presetId === "svoje" ? (
              <div className="mt-3 flex flex-wrap gap-4">
                {(["dots", "background"] as const).map((key) => (
                  <label key={key} className="inline-flex min-h-11 items-center gap-3 type-body-sm font-bold text-ink">
                    <input
                      type="color"
                      value={custom[key]}
                      onChange={(event) => setCustom((current) => ({ ...current, [key]: event.target.value }))}
                      className="h-11 w-14 cursor-pointer rounded-full border-2 border-ink bg-paper p-1"
                    />
                    {CREA_QR_COPY[key][locale]}
                  </label>
                ))}
              </div>
            ) : null}
            {colorProblem ? (
              <p role="alert" className="mt-2 type-body-sm font-black text-red-700 dark:text-red-300">
                {CREA_QR_COPY.colorProblems[colorProblem][locale]}
              </p>
            ) : null}
          </fieldset>

          <ChoiceChips
            legend={CREA_QR_COPY.style[locale]}
            name="crea-qr-style"
            options={DOT_STYLES.map((entry) => ({ id: entry, label: CREA_QR_COPY.styles[entry][locale] }))}
            value={style}
            onChange={setStyle}
            disabled={busy}
          />
        </div>
      )}
    </ToolRunner>
  );
}

function QrResult({ locale, output }: { locale: Locale; output: CreaToolOutput<null> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-center">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={output.fileName}
          className="surface-media w-full max-w-64 bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <p className="type-body-sm font-bold text-ink">{CREA_QR_COPY.scanHint[locale]}</p>
    </div>
  );
}
