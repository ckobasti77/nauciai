"use client";

import { Check, Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { AudioResultPanel } from "@/components/crea/zvuk/uredjivac/result-panel";
import { FOCUS, formatSeconds, ToolSection } from "@/components/crea/zvuk/uredjivac/ui";
import { useRecorder } from "@/components/crea/zvuk/uredjivac/use-recorder";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { fillCopy } from "@/lib/crea-copy";
import { meterZone, RECORDER_LIMITS } from "@/lib/crea-recorder";

/**
 * Snimač (Crea K24, A17): snimanje u pregledaču sa meračem jačine, više pokušaja
 * i „Snimi ponovo". Izabran pokušaj se presluša, preuzme ili sačuva u galeriju
 * (0 kr) i otvori u uređivaču.
 */
export default function RecorderTool({ tool, locale, canSave, projectId }: CreaToolProps) {
  const [clean, setClean] = useState(true);
  const recorder = useRecorder(clean);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const recording = recorder.phase === "recording";
  const picked = recorder.takes.find((take) => take.id === pickedId) ?? recorder.takes[0] ?? null;
  const zone = meterZone(recorder.level);
  const [result, setResult] = useState<{ id: number; result: { kind: "blob"; blob: Blob } } | null>(null);
  const pickedResult = picked ? (result && result.id === picked.id ? result.result : null) : null;
  if (picked && !pickedResult) setResult({ id: picked.id, result: { kind: "blob", blob: picked.blob } });

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Mic aria-hidden="true" className="size-5" />} />

      <ToolSection title={T.recorder.record[locale]} hint={T.recorder.hint[locale]} id="snimac-snimi">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-bold text-ink">
          <input type="checkbox" checked={clean} disabled={recording} onChange={(event) => setClean(event.target.checked)} className="size-5 accent-ink" />
          {T.recorder.cleanMic[locale]}
        </label>

        <div className="flex flex-wrap items-center gap-4">
          {recording ? (
            <Button size="lg" variant="secondary" onClick={recorder.stop} icon={<Square aria-hidden="true" className="size-5" />}>
              {T.recorder.stop[locale]}
            </Button>
          ) : (
            <Button size="lg" onClick={() => void recorder.start()} icon={recorder.takes.length > 0 ? <RotateCcw aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}>
              {recorder.takes.length > 0 ? T.recorder.again[locale] : T.recorder.record[locale]}
            </Button>
          )}
          <p className="font-mono type-body font-black text-ink" aria-live="off">
            {formatSeconds(recorder.seconds, locale, true)}
            <span className="ml-2 type-body-sm font-semibold text-muted">· {fillCopy(T.recorder.limit[locale], { max: formatSeconds(RECORDER_LIMITS.maxSeconds, locale) })}</span>
          </p>
        </div>

        {recording ? (
          <div className="space-y-1">
            <div
              role="meter"
              aria-label={T.recorder.level[locale]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(recorder.level * 100)}
              className="surface-inset h-4 w-full max-w-md overflow-hidden border border-line bg-paper"
            >
              <div
                className={cn("h-full transition-[width] duration-100 motion-reduce:transition-none", zone === "preglasno" ? "bg-red-600" : zone === "dobro" ? "bg-yellow" : "bg-muted")}
                style={{ width: `${Math.round(recorder.level * 100)}%` }}
              />
            </div>
            <p className={cn("type-body-sm font-black", zone === "preglasno" ? "text-red-700 dark:text-red-300" : "text-ink")} aria-live="polite">
              {T.recorder.zones[zone][locale]}
            </p>
          </div>
        ) : null}

        {recorder.denied ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {T.recorder.denied[locale]}
          </p>
        ) : null}
      </ToolSection>

      {recorder.takes.length > 0 ? (
        <ToolSection title={T.recorder.takes[locale]} id="snimac-pokusaji">
          <ul className="divide-y divide-line">
            {recorder.takes.map((take) => {
              const active = picked?.id === take.id;
              return (
                <li key={take.id} className="flex flex-wrap items-center gap-3 py-2">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPickedId(take.id)}
                    className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-black", active ? "border-ink bg-ink text-paper-strong" : "border-ink/30 bg-paper text-ink hover:border-ink", FOCUS)}
                  >
                    {active ? <Check aria-hidden="true" className="size-4" /> : null}
                    {fillCopy(T.recorder.take[locale], { n: take.id })} · {formatSeconds(take.seconds, locale)}
                  </button>
                  <audio src={take.url} controls preload="metadata" className="h-11 min-w-0 flex-1" />
                  <button
                    type="button"
                    aria-label={fillCopy(T.recorder.remove[locale], { n: take.id })}
                    onClick={() => recorder.remove(take.id)}
                    className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink", FOCUS)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </ToolSection>
      ) : null}

      {picked && pickedResult ? (
        <div className="mt-5 border-t border-line pt-5">
          <AudioResultPanel locale={locale} result={pickedResult} toolId={tool.id} fileBase="snimak" canSave={canSave} projectId={projectId} params={{ trajanje: Math.round(picked.seconds) }} openInEditor />
        </div>
      ) : null}
    </section>
  );
}
