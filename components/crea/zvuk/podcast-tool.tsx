"use client";

import { useAction } from "convex/react";
import { Pencil, Podcast } from "lucide-react";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { DialogueEditor } from "@/components/crea/zvuk/dialogue-editor";
import { FIELD } from "@/components/crea/zvuk/voice-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { PODCAST_LIMITS, PODCAST_MINUTES, type PodcastMinutes } from "@/convex/creaLlmVoiceCore";
import { fillCopy } from "@/lib/crea-copy";
import { emptyDialogue, newSpeaker, type DialogueDoc } from "@/lib/crea-dialogue";
import { CREA_VOICE_COPY as T } from "@/lib/crea-voice-copy";
import { studioErrorMessage } from "@/lib/studio-messages";

const STORAGE_KEY = "crea-podkast-v1";

function hasDraft(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Podkast iz lekcije (Crea K22, A6): tekst lekcije → jeftin LLM piše razgovor dva
 * voditelja (0 kr) → razgovor ide u Dijalog, gde se izgovara replika po replika i
 * spaja na uređaju. Bez Google ključa: DEMO razgovor od rečenica lekcije.
 */
export default function PodcastTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const writePodcast = useAction(api.creaLlm.writePodcast);
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState<PodcastMinutes>(2);
  const [hosts, setHosts] = useState<[string, string]>(["Ana", "Marko"]);
  const [status, setStatus] = useState<{ name: "idle" | "working" } | { name: "error"; message: string }>({ name: "idle" });
  const [demo, setDemo] = useState(false);
  // Razgovor u radu: nacrt sa uređaja (povratak na alat) ili nov iz LLM-a.
  const [script, setScript] = useState<{ doc: DialogueDoc; fromDraft: boolean; version: number } | null>(() =>
    hasDraft() ? { doc: emptyDialogue(), fromDraft: true, version: 0 } : null,
  );

  async function write() {
    setStatus({ name: "working" });
    try {
      const reply = await writePodcast({ text, minutes, hosts, locale });
      if (!reply.ok) {
        setStatus({ name: "error", message: T.llmErrors[reply.reason][locale] });
        return;
      }
      const speakers = [newSpeaker(0, "gemini", hosts[0] || "Ana"), newSpeaker(1, "gemini", hosts[1] || "Marko")];
      const doc: DialogueDoc = {
        v: 1,
        title: reply.title,
        speakers,
        lines: reply.lines.map((line, index) => ({ id: `r${index + 1}`, speakerId: speakers[line.host]!.id, text: line.text })),
      };
      setDemo(reply.demo);
      setScript((current) => ({ doc, fromDraft: false, version: (current?.version ?? 0) + 1 }));
      setStatus({ name: "idle" });
    } catch (caught) {
      setStatus({ name: "error", message: studioErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    }
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Podcast aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <label className="block">
          <span className="type-body font-black text-ink">{T.podcastText[locale]}</span>
          <textarea
            value={text}
            rows={7}
            maxLength={PODCAST_LIMITS.textChars}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.podcastPlaceholder[locale]}
            className={cn(FIELD, "mt-2 resize-y")}
          />
          <span className="mt-1 block font-mono text-xs font-bold text-muted">
            {text.length}/{PODCAST_LIMITS.textChars}
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceChips<PodcastMinutes>
            legend={T.podcastLength[locale]}
            name="crea-podkast-duzina"
            options={PODCAST_MINUTES.map((id) => ({ id, label: fillCopy(T.minutes[locale], { n: id }) }))}
            value={minutes}
            onChange={setMinutes}
          />
          <fieldset className="min-w-0">
            <legend className="type-body-sm font-black text-ink">{T.hostNames[locale]}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {hosts.map((host, index) => (
                <input
                  key={index}
                  value={host}
                  maxLength={PODCAST_LIMITS.hostChars}
                  aria-label={fillCopy(T.hostLabel[locale], { n: index + 1 })}
                  onChange={(event) => setHosts((current) => (index === 0 ? [event.target.value, current[1]] : [current[0], event.target.value]))}
                  className={cn(FIELD, "min-h-11")}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <div className="space-y-2">
          <Button onClick={() => void write()} loading={status.name === "working"} disabled={!canSave || text.trim().length === 0} icon={<Pencil aria-hidden="true" className="size-4" />}>
            {status.name === "working" ? T.writing[locale] : T.writeScript[locale]}
          </Button>
          {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p> : null}
          {status.name === "error" ? (
            <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
              {status.message}
            </p>
          ) : null}
        </div>
      </div>

      {script ? (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          {script.fromDraft ? null : <p className="type-body-sm font-black text-ink">{T.scriptReady[locale]}</p>}
          {demo ? <p className="type-body-sm font-semibold text-muted">{T.demoScript[locale]}</p> : null}
          {script.doc.title ? <h3 className="type-h4 text-ink">{script.doc.title}</h3> : null}
          <DialogueEditor
            key={script.version}
            locale={locale}
            canSave={canSave}
            projectId={projectId}
            paid={paid}
            toolId={tool.id}
            storageKey={STORAGE_KEY}
            initial={script.doc}
            preferDraft={script.fromDraft}
          />
        </div>
      ) : null}
    </section>
  );
}
