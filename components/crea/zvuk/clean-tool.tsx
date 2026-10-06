"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { paidModel, PaidSubmit, type SendStatus } from "@/components/crea/tools/paid-video";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { SoundInput, useSoundInput } from "@/components/crea/zvuk/sound-input";
import { usePrepareSound } from "@/components/crea/zvuk/use-sound-upload";
import type { DenoiseEngine } from "@/components/crea/zvuk/uredjivac/denoise";
import { AudioResultPanel, type AudioResult } from "@/components/crea/zvuk/uredjivac/result-panel";
import { formatSeconds, RangeField, ToolSection, WorkStatus, type WorkState } from "@/components/crea/zvuk/uredjivac/ui";
import { useDecodedSound } from "@/components/crea/zvuk/uredjivac/use-decoded-sound";
import { Button } from "@/components/ui/button";
import { EDITOR_MAX_SECONDS } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { fillCopy } from "@/lib/crea-copy";
import { classifyDevice } from "@/lib/crea-device";
import { jobCredits } from "@/lib/crea-job-price";
import { toLocalAiError } from "@/lib/crea-local-ai/errors";
import { studioErrorMessage } from "@/lib/studio-messages";
import { useCreaCreateJob } from "@/components/crea/game/crea-tool-context";

type Cleaned = { key: string; engine: DenoiseEngine; cleaned: AudioBuffer; original: AudioBuffer };

/**
 * Očisti zvuk (Crea K24, A15): šum, zujanje i buka se skidaju NA UREĐAJU
 * (RNNoise ili GTCRN, 0 kr), uz „jačinu čišćenja" koja vraća deo originala kad
 * glas zvuči veštački. Težak slučaj (muzika, gužva, odjek) ide postojećom
 * plaćenom izolacijom glasa (`audio-isolation`, po minutu).
 */
export default function CleanTool({ tool, locale, caps, canSave, projectId, paid, source }: CreaToolProps) {
  const input = useSoundInput(source);
  const { picked } = input;
  const maxSeconds = EDITOR_MAX_SECONDS[caps ? classifyDevice(caps) : "desktop"];
  const decoded = useDecodedSound(picked, { sampleRate: 48000, channels: 1, maxSeconds });
  const [engine, setEngine] = useState<DenoiseEngine>("rnnoise");
  const [work, setWork] = useState<WorkState>({ name: "idle" });
  const [cleaned, setCleaned] = useState<Cleaned | null>(null);
  const [amount, setAmount] = useState(100);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const current = cleaned && decoded.status === "ready" && cleaned.key === decoded.key && cleaned.engine === engine ? cleaned : null;
  const busy = work.name === "downloading" || work.name === "running";

  async function run() {
    if (decoded.status !== "ready") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWork({ name: "downloading", percent: null });
    try {
      const { denoiseBuffer } = await import("@/components/crea/zvuk/uredjivac/denoise");
      const result = await denoiseBuffer(decoded.buffer, engine, {
        signal: controller.signal,
        onDownload: (loaded, total) => setWork({ name: "downloading", percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null }),
        onProgress: (fraction) => setWork({ name: "running", percent: Math.round(fraction * 100) }),
      });
      if (controller.signal.aborted) return;
      setCleaned({ key: decoded.key, engine, ...result });
      setAmount(100);
      setWork({ name: "idle" });
    } catch (error) {
      setWork({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  // Mešanje originala i očišćenog posle pomeranja klizača (bez ponovnog računanja modela).
  const [blend, setBlend] = useState<{ for: Cleaned; amount: number; result: AudioResult } | null>(null);
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void import("@/components/crea/zvuk/uredjivac/denoise").then(({ blendClean }) => {
        if (!alive) return;
        const buffer = amount >= 100 ? current.cleaned : blendClean(current.original, current.cleaned, amount / 100);
        setBlend({ for: current, amount, result: { kind: "buffer", buffer } });
      });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [current, amount]);
  const result = blend && blend.for === current && blend.amount === amount ? blend.result : null;
  const originalUrl = useMemo(() => (picked ? picked.url : null), [picked]);

  const blocker =
    !picked ? T.common.pickSound[locale]
    : decoded.status === "tooLong" ? fillCopy(T.common.tooLong[locale], { max: formatSeconds(maxSeconds, locale) })
    : decoded.status === "empty" ? T.common.noSound[locale]
    : decoded.status === "error" ? T.common.failed[locale]
    : null;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Sparkles aria-hidden="true" className="size-5" />} />

      <ToolSection title={T.clean.inputTitle[locale]} id="ciscenje-ulaz">
        <SoundInput locale={locale} input={input} disabled={busy} kinds={["audio", "video"]} />
      </ToolSection>

      <ToolSection title={T.clean.engine[locale]} id="ciscenje-nacin">
        <ChoiceChips<DenoiseEngine>
          legend={T.clean.engineLegend[locale]}
          name="ciscenje-nacin"
          options={(["rnnoise", "gtcrn"] as const).map((id) => ({ id, label: T.clean.engines[id].label[locale], hint: T.clean.engines[id].hint[locale] }))}
          value={engine}
          onChange={setEngine}
          disabled={busy}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void run()} disabled={blocker !== null || decoded.status !== "ready" || busy} loading={decoded.status === "loading"} icon={<Wand2 aria-hidden="true" className="size-4" />}>
            {T.clean.run[locale]}
          </Button>
          {blocker && picked ? <p className="type-body-sm font-black text-muted">{blocker}</p> : null}
        </div>
        <WorkStatus locale={locale} state={work} onCancel={() => abortRef.current?.abort()} />
      </ToolSection>

      {current ? (
        <ToolSection title={T.clean.compare[locale]} id="ciscenje-rezultat">
          <RangeField label={T.clean.amount[locale]} value={amount} min={0} max={100} step={5} onChange={setAmount} format={(value) => `${value} %`} />
          <p className="type-body-sm font-semibold text-muted">{T.clean.amountHint[locale]}</p>
          {originalUrl ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-16 type-body-sm font-black text-ink">{T.clean.before[locale]}</span>
              <audio src={originalUrl} controls preload="metadata" crossOrigin={picked && typeof picked.source === "string" ? "anonymous" : undefined} className="h-11 min-w-0 flex-1 max-w-xl" />
            </div>
          ) : null}
          {result ? (
            <AudioResultPanel
              locale={locale}
              result={result}
              toolId={tool.id}
              fileBase="ocisceno"
              canSave={canSave}
              projectId={projectId}
              parentJobId={picked?.sourceJobId ?? null}
              params={{ nacin: engine, jacina: amount }}
              openInEditor
            />
          ) : null}
        </ToolSection>
      ) : null}

      <HardCase locale={locale} picked={picked} seconds={decoded.status === "ready" ? decoded.buffer.duration : null} paid={paid} projectId={projectId} canSave={canSave} />
    </section>
  );
}

/** Plaćena izolacija glasa za teške slučajeve (postojeći red `audio-isolation`). */
function HardCase({
  locale,
  picked,
  seconds,
  paid,
  projectId,
  canSave,
}: {
  locale: CreaToolProps["locale"];
  picked: ReturnType<typeof useSoundInput>["picked"];
  seconds: number | null;
  paid: CreaToolProps["paid"];
  projectId: CreaToolProps["projectId"];
  canSave: boolean;
}) {
  const createJob = useCreaCreateJob();
  const prepareSound = usePrepareSound();
  const [status, setStatus] = useState<{ key: string | null; status: SendStatus }>({ key: null, status: { name: "idle" } });
  const model = paidModel(paid, "audio-isolation", "audio");
  if (!model) return null;
  const key = picked?.key ?? null;
  const current = status.key === key ? status.status : ({ name: "idle" } as SendStatus);
  const price = paid && seconds !== null ? jobCredits({ modelSlug: "audio-isolation", inputMode: "audio", params: {}, measured: { minutes: seconds / 60 } }, paid.catalog) : null;
  const blocker = !canSave ? T.result.noAccess[locale] : !picked ? T.common.pickSound[locale] : current.name === "working" ? T.common.working[locale] : null;

  async function send() {
    if (!picked) return;
    setStatus({ key: picked.key, status: { name: "working" } });
    try {
      const prepared = await prepareSound(picked, { sampleRate: 44100, channels: 1 });
      const result = await createJob({
        modelSlug: "audio-isolation",
        params: JSON.stringify({}),
        inputMode: "audio",
        inputs: JSON.stringify({ audio: [prepared.storageId] }),
        ...(projectId ? { projectId } : {}),
        ...(picked.sourceJobId ? { parentJobId: picked.sourceJobId } : {}),
      });
      if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT");
      setStatus({ key: picked.key, status: { name: "sent" } });
    } catch (error) {
      setStatus({ key: picked.key, status: { name: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) } });
    }
  }

  return (
    <ToolSection title={T.clean.hardTitle[locale]} hint={T.clean.hardHint[locale]} id="ciscenje-tesko">
      <PaidSubmit locale={locale} label={T.clean.hardRun[locale]} icon={<Sparkles aria-hidden="true" className="size-4" />} credits={price} blocker={blocker} status={current} demo={model.demo} onSubmit={() => void send()} />
      {current.name === "sent" ? <p className="type-body-sm font-black text-ink">{T.clean.hardSent[locale]}</p> : null}
    </ToolSection>
  );
}
