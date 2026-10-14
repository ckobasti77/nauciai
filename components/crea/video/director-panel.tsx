"use client";

import { Check, Clapperboard, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { CameraMoveSketch } from "@/components/crea/video/camera-move-sketch";
import type { DirectorState } from "@/components/crea/video/director-state";
import { cn } from "@/components/ui/primitives";
import { CAMERA_APERTURES, CAMERA_LENSES } from "@/lib/crea-camera";
import { CAMERA_MOVE_GROUPS, CAMERA_MOVES, type CameraMove, type CameraMoveGroup } from "@/lib/crea-camera-moves";
import { fillCopy } from "@/lib/crea-copy";
import {
  DESK_EMOTIONS,
  DESK_ERAS,
  DESK_GENRES,
  DESK_LIGHTS,
  DESK_PRESETS,
  DESK_SOUNDS,
  DESK_TEMPOS,
  type DeskPreset,
  type DirectorDesk,
} from "@/lib/crea-director";
import { CREA_PALETTES } from "@/lib/crea-styles";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import {
  combineEffects,
  combineProblem,
  VIDEO_EFFECT_GROUPS,
  VIDEO_EFFECTS,
  type VideoEffect,
  type VideoEffectGroup,
} from "@/lib/crea-video-effects";
import type { Locale } from "@/lib/i18n";

export type DirectorTab = "pokret" | "efekti" | "pult";

const TAB_BUTTON =
  "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none";

const CARD =
  "igra-press surface-inset flex h-full w-full flex-col gap-1.5 border-2 p-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Panel „Režija" ispod opisa u Video · Napravi (Crea K18, V6-V9). Učitava se lenjo,
 * kao „Izgled" (K13): ~45 pokreta sa skicama, ~30 efekata i pult ne ulaze u početni
 * JS radionice. Izbor se ne upisuje u opis - composer ga sklapa pri slanju
 * (`composeVideoPrompt`) i pokazuje „Modelu ide:".
 */
export default function DirectorPanel({
  locale,
  state,
  onChange,
  onEffectPicked,
  onClose,
  initialTab = "pokret",
  modelMakesSound,
}: {
  locale: Locale;
  state: DirectorState;
  onChange: (next: DirectorState) => void;
  /** Efekat je izabran: composer bira model i režim koji ga rade. */
  onEffectPicked: (effect: VideoEffect) => void;
  onClose: () => void;
  initialTab?: DirectorTab;
  modelMakesSound: boolean;
}) {
  const [tab, setTab] = useState<DirectorTab>(initialTab);
  const tabs: DirectorTab[] = ["pokret", "efekti", "pult"];

  return (
    <section aria-label={T.direction[locale]} className="@container surface-inset mt-3 border border-line bg-paper p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={T.direction[locale]}>
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
        <button type="button" onClick={onClose} className={cn(TAB_BUTTON, "gap-1.5 border-ink bg-yellow text-ink")}>
          <Check aria-hidden="true" className="size-4" />
          {T.done[locale]}
        </button>
      </div>

      <div className="mt-4 max-h-[min(56vh,460px)] overflow-y-auto pr-1" role="tabpanel">
        {tab === "pokret" ? <MoveTab locale={locale} state={state} onChange={onChange} /> : null}
        {tab === "efekti" ? <EffectTab locale={locale} state={state} onChange={onChange} onEffectPicked={onEffectPicked} /> : null}
        {tab === "pult" ? <DeskTab locale={locale} state={state} onChange={onChange} modelMakesSound={modelMakesSound} /> : null}
      </div>
    </section>
  );
}

function MoveCard({ move, active, locale, onPick }: { move: CameraMove; active: boolean; locale: Locale; onPick: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      className={cn(CARD, active ? "border-ink bg-yellow/40 shadow-[3px_3px_0_0_var(--shadow-hard)]" : "border-ink/20 bg-paper-strong hover:border-ink")}
    >
      <CameraMoveSketch move={move} playing={hot || active} className="surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
      <span className="px-1 text-sm font-black leading-tight text-ink">{move.label[locale]}</span>
    </button>
  );
}

function MoveTab({ locale, state, onChange }: { locale: Locale; state: DirectorState; onChange: (next: DirectorState) => void }) {
  const [group, setGroup] = useState<CameraMoveGroup | "sve">("sve");
  const shown = group === "sve" ? CAMERA_MOVES : CAMERA_MOVES.filter((move) => move.group === group);
  const current = state.move;
  return (
    <div className="space-y-3">
      {current ? (
        <div className="surface-inset grid gap-3 border border-line bg-paper-strong p-3 @lg:grid-cols-[160px_1fr]">
          <CameraMoveSketch move={current} playing className="surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
          <div className="min-w-0 space-y-2">
            <p className="type-body-sm font-black text-ink">
              <Clapperboard aria-hidden="true" className="mr-1.5 inline size-4" />
              {current.label[locale]}
            </p>
            <p className="text-sm font-semibold text-ink">
              <span className="font-black">{T.lesson[locale]}: </span>
              {current.lesson[locale]}
            </p>
            {current.intensity ? (
              <ChoiceChips
                legend={T.intensity[locale]}
                name="crea-move-intensity"
                options={(["blago", "jako"] as const).map((id) => ({ id, label: T.intensities[id][locale] }))}
                value={state.moveIntensity}
                onChange={(moveIntensity) => onChange({ ...state, moveIntensity })}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <ChoiceChips<CameraMoveGroup | "sve">
        legend={T.tabs.pokret[locale]}
        name="crea-move-group"
        options={[{ id: "sve" as const, label: T.allGroups[locale] }, ...CAMERA_MOVE_GROUPS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))]}
        value={group}
        onChange={setGroup}
      />
      <ul className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
        <li>
          <button
            type="button"
            aria-pressed={current === null}
            onClick={() => onChange({ ...state, move: null })}
            className={cn(
              "surface-inset flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 border-2 p-2 text-center text-sm font-black text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              current === null ? "border-ink bg-yellow/40" : "border-dashed border-ink/30 bg-paper-strong hover:border-ink",
            )}
          >
            <X aria-hidden="true" className="size-5" />
            {T.noMove[locale]}
          </button>
        </li>
        {shown.map((move) => (
          <li key={move.id}>
            <MoveCard
              move={move}
              locale={locale}
              active={current?.id === move.id}
              onPick={() => onChange({ ...state, move: current?.id === move.id ? null : move })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EffectTab({
  locale,
  state,
  onChange,
  onEffectPicked,
}: {
  locale: Locale;
  state: DirectorState;
  onChange: (next: DirectorState) => void;
  onEffectPicked: (effect: VideoEffect) => void;
}) {
  const [group, setGroup] = useState<VideoEffectGroup | "sve">("sve");
  const [combine, setCombine] = useState(state.picked.length === 2);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = group === "sve" ? VIDEO_EFFECTS : VIDEO_EFFECTS.filter((effect) => effect.group === group);

  function apply(picked: VideoEffect[]) {
    const effect = picked.length === 2 ? combineEffects(picked[0], picked[1]) : picked[0] ?? null;
    onChange({ ...state, picked, effect });
    if (effect) onEffectPicked(effect);
  }

  function pick(effect: VideoEffect) {
    setProblem(null);
    const already = state.picked.some((entry) => entry.id === effect.id);
    if (already) {
      apply(state.picked.filter((entry) => entry.id !== effect.id));
      return;
    }
    if (combine && state.picked.length === 1) {
      const issue = combineProblem(state.picked[0], effect);
      if (issue) {
        setProblem(T.combineProblems[issue][locale]);
        return;
      }
      apply([state.picked[0], effect]);
      return;
    }
    apply([effect]);
  }

  return (
    <div className="space-y-3">
      <ChoiceChips<VideoEffectGroup | "sve">
        legend={T.tabs.efekti[locale]}
        name="crea-effect-group"
        options={[{ id: "sve" as const, label: T.allGroups[locale] }, ...VIDEO_EFFECT_GROUPS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))]}
        value={group}
        onChange={setGroup}
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 type-body-sm font-black text-ink">
        <input
          type="checkbox"
          checked={combine}
          onChange={(event) => {
            setCombine(event.target.checked);
            setProblem(null);
            if (!event.target.checked && state.picked.length === 2) apply([state.picked[0]]);
          }}
          className="size-5 accent-ink"
        />
        {T.combine[locale]}
      </label>
      {combine ? <p className="text-xs font-bold text-muted">{T.combineHint[locale]}</p> : null}
      {problem ? (
        <p role="alert" className="text-sm font-black text-red-700 dark:text-red-300">
          {problem}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
        {shown.map((effect) => {
          const index = state.picked.findIndex((entry) => entry.id === effect.id);
          const active = index >= 0;
          return (
            <li key={effect.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => pick(effect)}
                className={cn(CARD, "flex-row items-start gap-3 p-3", active ? "border-ink bg-yellow/40 shadow-[3px_3px_0_0_var(--shadow-hard)]" : "border-ink/20 bg-paper-strong hover:border-ink")}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper font-mono text-sm font-black text-ink">
                  {active ? index + 1 : <Sparkles aria-hidden="true" className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black leading-tight text-ink">{effect.label[locale]}</span>
                  <span className="mt-0.5 block text-xs font-bold leading-snug text-muted">{effect.hint[locale]}</span>
                  {effect.needs === "foto" ? (
                    <span className="mt-1 inline-flex rounded-full border border-ink/30 px-2 py-0.5 text-[11px] font-black text-ink">
                      {locale === "sr" ? "tvoja fotka" : "your photo"}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeskTab({
  locale,
  state,
  onChange,
  modelMakesSound,
}: {
  locale: Locale;
  state: DirectorState;
  onChange: (next: DirectorState) => void;
  modelMakesSound: boolean;
}) {
  const desk = state.desk;
  const set = (patch: Partial<DirectorDesk>) => onChange({ ...state, desk: { ...desk, ...patch } });
  const NONE = "__bez" as const;
  type Pickable = { id: string; label: { sr: string; en: string } };
  const chips = <K extends keyof DirectorDesk>(key: K, legend: string, options: readonly Pickable[]) => (
    <ChoiceChips<string>
      legend={legend}
      name={`crea-desk-${String(key)}`}
      options={[{ id: NONE, label: T.none[locale] }, ...options.map((option) => ({ id: option.id, label: option.label[locale] }))]}
      value={(desk[key] as string | undefined) ?? NONE}
      onChange={(id) => set({ [key]: id === NONE ? undefined : id } as Partial<DirectorDesk>)}
    />
  );
  const lens = CAMERA_LENSES.find((entry) => entry.id === desk.lens);
  const paletteId = CREA_PALETTES.find((preset) => preset.colors.join() === (desk.palette ?? []).join())?.id ?? NONE;

  function applyPreset(preset: DeskPreset) {
    const move = CAMERA_MOVES.find((entry) => entry.id === preset.move) ?? null;
    onChange({ ...state, desk: preset.desk, move });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="type-body-sm font-black text-ink">{T.presets[locale]}</p>
        <p className="text-xs font-bold text-muted">{T.presetsHint[locale]}</p>
        <ul className="mt-2 grid grid-cols-1 gap-2 @lg:grid-cols-2">
          {DESK_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => applyPreset(preset)}
                className={cn(CARD, "p-3", "border-ink/20 bg-paper-strong hover:border-ink")}
              >
                <span className="text-sm font-black leading-tight text-ink">{preset.label[locale]}</span>
                <span className="text-xs font-bold leading-snug text-muted">{preset.hint[locale]}</span>
                <span className="font-display text-base leading-snug text-ink">„{preset.example[locale]}”</span>
                <span className="mt-auto inline-flex text-xs font-black text-ink underline decoration-yellow decoration-2 underline-offset-4">
                  {T.presetUse[locale]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {chips("genre", T.genre[locale], DESK_GENRES)}
      {chips("era", T.era[locale], DESK_ERAS)}
      {chips("tempo", T.tempo[locale], DESK_TEMPOS)}
      <ChoiceChips<string>
        legend={T.lens[locale]}
        name="crea-desk-lens"
        options={[{ id: NONE, label: T.none[locale] }, ...CAMERA_LENSES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.explain[locale] }))]}
        value={desk.lens ?? NONE}
        onChange={(id) => {
          const next = CAMERA_LENSES.find((entry) => entry.id === id);
          set({ lens: next?.id, focal: next ? (next.focals.includes(desk.focal ?? -1) ? desk.focal : next.focals[0]) : undefined });
        }}
      />
      {lens ? (
        <ChoiceChips<number>
          legend={T.focal[locale]}
          name="crea-desk-focal"
          options={lens.focals.map((focal) => ({ id: focal, label: `${focal} mm` }))}
          value={desk.focal ?? lens.focals[0]}
          onChange={(focal) => set({ focal })}
        />
      ) : null}
      <ChoiceChips<string>
        legend={T.aperture[locale]}
        name="crea-desk-aperture"
        options={[{ id: NONE, label: T.none[locale] }, ...CAMERA_APERTURES.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.explain[locale] }))]}
        value={desk.aperture ?? NONE}
        onChange={(id) => set({ aperture: CAMERA_APERTURES.find((entry) => entry.id === id)?.id })}
      />
      {chips("light", T.light[locale], DESK_LIGHTS)}
      <ChoiceChips<string>
        legend={T.palette[locale]}
        name="crea-desk-palette"
        options={[{ id: NONE, label: T.none[locale] }, ...CREA_PALETTES.map((preset) => ({ id: preset.id, label: preset.label[locale] }))]}
        value={paletteId}
        onChange={(id) => set({ palette: CREA_PALETTES.find((preset) => preset.id === id)?.colors.slice() })}
      />
      {chips("emotion", T.emotion[locale], DESK_EMOTIONS)}
      <div className="space-y-1">
        {chips("sound", T.sound[locale], DESK_SOUNDS)}
        {!modelMakesSound && desk.sound ? <p className="text-xs font-bold text-muted">{T.soundNoAudio[locale]}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...state, desk: {} })}
        className={cn(TAB_BUTTON, "border-ink/25 bg-paper-strong text-ink hover:border-ink")}
      >
        <X aria-hidden="true" className="mr-1.5 size-4" />
        {T.clearDesk[locale]}
      </button>
      {state.move ? <p className="text-xs font-bold text-muted">{fillCopy(T.pickedMove[locale], { move: state.move.label[locale] })}</p> : null}
    </div>
  );
}
