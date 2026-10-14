"use client";

import { ArrowDown, ArrowUp, Clapperboard, Minus, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { FieldMic } from "@/components/crea/create/mic-button";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel, type PaidEditFiles } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { CAMERA_MOVE_GROUPS, CAMERA_MOVES } from "@/lib/crea-camera-moves";
import { fillCopy } from "@/lib/crea-copy";
import { cameraMovePhrase } from "@/lib/crea-director";
import type { CreaPaidRoute } from "@/lib/crea-paid-edit";
import {
  distributeSeconds,
  MULTI_SHOT_MODEL,
  SCENES_MAX,
  SCENES_MIN,
  scenesParams,
  scenesProblem,
  totalSecondsRange,
  type SceneCard,
} from "@/lib/crea-scenes";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";

type SceneDraft = { id: number; text: string; moveId: string; seconds: number };

const ICON_BUTTON =
  "igra-press inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";

const RESOLUTIONS = ["720p", "1080p"] as const;

/**
 * „Više scena u jednom klipu" (Crea K18, V11): do šest kartica - šta se dešava,
 * pokret kamere i sekunde - postaje JEDAN Kling 3.0 posao (`multi_prompt`, fal
 * šema). Plaća se ukupno trajanje, kao jedan klip; zbir sekundi proverava i
 * server (`parseMultiShot`). Početna slika nije obavezna (`image` režim).
 */
export default function ScenesTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const model = paid?.catalog.find((entry) => entry.slug === MULTI_SHOT_MODEL);
  const range = totalSecondsRange(model?.paramSpec ?? []);
  const start = distributeSeconds(8, 3);
  const [cards, setCards] = useState<SceneDraft[]>(() => start.map((seconds, index) => ({ id: index, text: "", moveId: "", seconds })));
  const [nextId, setNextId] = useState(3);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [audio, setAudio] = useState(true);
  const image = useImageInput(source);
  const baseId = useId();

  const sceneCards: SceneCard[] = cards.map((card) => {
    const move = CAMERA_MOVES.find((entry) => entry.id === card.moveId);
    return { text: card.text, move: move ? cameraMovePhrase(move) : "", seconds: card.seconds };
  });
  const problem = scenesProblem(sceneCards, range);
  const total = cards.reduce((sum, card) => sum + card.seconds, 0);
  const route: CreaPaidRoute = {
    modelSlug: MULTI_SHOT_MODEL,
    inputMode: image.picked ? "image" : "text",
    kind: "photo",
    label: { sr: "Kling 3.0", en: "Kling 3.0" },
  };

  const update = (id: number, patch: Partial<SceneDraft>) => setCards((list) => list.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  const move = (index: number, delta: -1 | 1) =>
    setCards((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Clapperboard aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <p className="type-body-sm font-semibold text-muted">{T.scenesHow[locale]}</p>
        <ol className="divide-y divide-line">
          {cards.map((card, index) => {
            const textId = `${baseId}-scena-${card.id}`;
            const moveId = `${baseId}-pokret-${card.id}`;
            return (
              <li key={card.id} className="space-y-3 py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-h4 text-ink">{fillCopy(T.scene[locale], { n: index + 1 })}</span>
                  <span className="flex-1" />
                  <button type="button" className={ICON_BUTTON} disabled={index === 0} onClick={() => move(index, -1)} aria-label={fillCopy(T.moveUp[locale], { n: index + 1 })}>
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" className={ICON_BUTTON} disabled={index === cards.length - 1} onClick={() => move(index, 1)} aria-label={fillCopy(T.moveDown[locale], { n: index + 1 })}>
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    disabled={cards.length <= SCENES_MIN}
                    onClick={() => setCards((list) => list.filter((entry) => entry.id !== card.id))}
                    aria-label={fillCopy(T.removeScene[locale], { n: index + 1 })}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
                <div>
                  <label htmlFor={textId} className="type-body-sm font-black text-ink">
                    {T.sceneText[locale]}
                  </label>
                  <textarea
                    id={textId}
                    value={card.text}
                    rows={2}
                    maxLength={400}
                    onChange={(event) => update(card.id, { text: event.target.value })}
                    placeholder={T.scenePlaceholder[locale]}
                    className="surface-inset mt-2 block w-full resize-y border-2 border-ink bg-paper px-3 py-2 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  />
                  <FieldMic locale={locale} value={card.text} onChange={(next) => update(card.id, { text: next })} maxLength={400} />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label htmlFor={moveId} className="type-body-sm font-black text-ink">
                      {T.sceneMove[locale]}
                    </label>
                    <select
                      id={moveId}
                      value={card.moveId}
                      onChange={(event) => update(card.id, { moveId: event.target.value })}
                      className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <option value="">{T.noMove[locale]}</option>
                      {CAMERA_MOVE_GROUPS.map((group) => (
                        <optgroup key={group.id} label={group.label[locale]}>
                          {CAMERA_MOVES.filter((entry) => entry.group === group.id).map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.label[locale]}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="type-body-sm font-black text-ink">{T.sceneSeconds[locale]}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        disabled={card.seconds <= 1}
                        onClick={() => update(card.id, { seconds: card.seconds - 1 })}
                        aria-label={`${T.sceneSeconds[locale]} −1`}
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </button>
                      <span className="w-8 text-center font-mono text-base font-black tabular-nums text-ink">{card.seconds}</span>
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        disabled={total >= range.max}
                        onClick={() => update(card.id, { seconds: card.seconds + 1 })}
                        aria-label={`${T.sceneSeconds[locale]} +1`}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={cards.length >= SCENES_MAX || total >= range.max}
            onClick={() => {
              setCards((list) => [...list, { id: nextId, text: "", moveId: "", seconds: 1 }]);
              setNextId((id) => id + 1);
            }}
            className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="size-4" />
            {T.addScene[locale]}
          </button>
          <button
            type="button"
            onClick={() => {
              const even = distributeSeconds(Math.min(range.max, Math.max(range.min, total)), cards.length);
              setCards((list) => list.map((card, index) => ({ ...card, seconds: Math.max(1, even[index] ?? 1) })));
            }}
            className="inline-flex min-h-11 items-center rounded-full border-2 border-ink/25 bg-paper px-4 text-sm font-black text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {T.evenOut[locale]}
          </button>
          <p className={cn("type-body-sm font-black", problem === "trajanje" ? "text-red-700 dark:text-red-300" : "text-ink")}>
            {fillCopy(T.total[locale], { s: total, min: range.min, max: range.max })}
          </p>
        </div>
        <ChoiceChips
          legend={locale === "sr" ? "Rezolucija" : "Resolution"}
          name="crea-scenes-resolution"
          options={RESOLUTIONS.map((id) => ({ id, label: id }))}
          value={resolution}
          onChange={setResolution}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
          <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} className="size-5 accent-ink" />
          {locale === "sr" ? "Zvuk koji model sam pravi" : "Sound the model makes itself"}
        </label>
        <div className="space-y-2">
          <p className="type-body-sm font-black text-ink">{T.startImage[locale]}</p>
          <ImageInput locale={locale} input={image} disabled={false} />
        </div>
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={[route]}
          purpose="edit"
          ready={problem === null}
          notReadyReason={problem ? fillCopy(T.scenesProblems[problem][locale], { min: range.min, max: range.max }) : null}
          prepare={async (): Promise<PaidEditFiles> => {
            if (!image.picked) return { files: {}, width: 1, height: 1 };
            const prepared = await providerPhoto(image.picked.file);
            return { files: { image: [prepared.blob] }, width: prepared.width, height: prepared.height };
          }}
          request={() => ({ ...scenesParams(sceneCards), resolution, audio })}
          textField={null}
          label={T.scenesCreate[locale]}
          parentJobId={image.picked?.sourceJobId ?? null}
          derivation="animacija"
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
          privacyNote={image.picked ? undefined : null}
        />
      </div>
    </section>
  );
}
