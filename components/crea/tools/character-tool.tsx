/* eslint-disable @next/next/no-img-element -- list lika je potpisan Convex URL. */
"use client";

import { useAction } from "convex/react";
import { CircleCheck, Dices, Gamepad2, Save } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { CharacterDoll } from "@/components/crea/elements/character-doll";
import { ConsentCheck } from "@/components/crea/elements/shared";
import { ToolHeader } from "@/components/crea/tool-runner";
import { useWatchedJob } from "@/components/crea/tools/job-image";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ELEMENT_NAME_MAX } from "@/convex/creaElementsCore";
import {
  CHARACTER_SHEET_PARAMS,
  CHARACTER_SPECIES,
  CHARACTER_SPECIES_LABEL,
  characterSheetPrompt,
  characterSummary,
  DEFAULT_CHARACTER,
  randomChoice,
  suggestedNames,
  visibleMenus,
  type CharacterChoice,
  type CharacterMenuId,
  type CharacterOption,
} from "@/lib/crea-character";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_CHARACTER_COPY as T, CREA_ELEMENTS_COPY, elementErrorMessage } from "@/lib/crea-elements-copy";
import { CHARACTER_ROUTES } from "@/lib/crea-paid-edit";
import { creaPromptQuery, creaShellQuery } from "@/lib/crea-shell";
import type { Locale, LocalizedText } from "@/lib/i18n";

type SaveState = { name: "idle" } | { name: "saving" } | { name: "saved"; handle: string } | { name: "error"; message: string };

/**
 * Kreator lika kao u igrici (S36, K14): meniji bez kucanja (vrsta, godine,
 * kosa, oči, ten, odeća, dodatak, stil) → opis → list lika (napred, bok, leđa)
 * kroz POSTOJEĆI `createJob` → „Sačuvaj kao Lik" (`creaElements.saveFromJob`
 * kopira list u Lik). Ime se bira iz predloga; kucanje nije potrebno.
 */
export default function CharacterTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const [choice, setChoice] = useState<CharacterChoice>(DEFAULT_CHARACTER);
  const [jobId, setJobId] = useState<Id<"generationJobs"> | null>(null);
  const job = useWatchedJob(jobId);

  const menus: Array<{ id: CharacterMenuId; label: LocalizedText; options: readonly CharacterOption[] }> = [
    { id: "vrsta", label: CHARACTER_SPECIES_LABEL, options: CHARACTER_SPECIES },
    ...visibleMenus(choice),
  ];
  const [menuId, setMenuId] = useState<CharacterMenuId>("vrsta");
  const menu = menus.find((entry) => entry.id === menuId) ?? menus[0];

  const ready = job?.status === "done" && job.outputUrl ? job.outputUrl : null;
  const failedJob = job?.status === "failed" || job?.status === "refunded";

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Gamepad2 aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <p className="type-body-sm font-semibold text-muted">{T.intro[locale]}</p>

        {jobId === null ? (
          <>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
              <div className="min-w-0 space-y-4">
                <div role="group" aria-label={T.menus[locale]} className="flex flex-wrap gap-2">
                  {menus.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={entry.id === menu.id}
                      onClick={() => setMenuId(entry.id)}
                      className={cn(
                        "inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                        entry.id === menu.id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                      )}
                    >
                      {entry.label[locale]}
                    </button>
                  ))}
                </div>
                <div>
                  <OptionGrid
                    locale={locale}
                    label={menu.label[locale]}
                    options={menu.options}
                    value={choice[menu.id]}
                    onPick={(id) => setChoice((current) => ({ ...current, [menu.id]: id }))}
                  />
                </div>
              </div>

              <aside className="surface-inset space-y-3 bg-paper p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="type-body font-black text-ink">{T.yourCharacter[locale]}</h3>
                  <Button variant="secondary" size="sm" onClick={() => setChoice(randomChoice())} icon={<Dices aria-hidden="true" className="size-4" />}>
                    {T.surprise[locale]}
                  </Button>
                </div>
                <CharacterDoll choice={choice} className="mx-auto h-40 w-auto text-ink" />
                <ul className="flex flex-wrap gap-1.5" aria-label={T.yourCharacter[locale]}>
                  {characterSummary(choice, locale).map((line) => (
                    <li key={line} className="rounded-full border border-line bg-paper-strong px-2.5 py-1 text-xs font-black text-ink">
                      {line}
                    </li>
                  ))}
                </ul>
                <details className="text-xs font-bold text-muted">
                  <summary className="cursor-pointer select-none py-1 text-ink pointer-coarse:py-3">{T.preview[locale]}</summary>
                  <p className="mt-1 break-words font-semibold">{characterSheetPrompt(choice)}</p>
                </details>
              </aside>
            </div>

            <PaidEditPanel
              locale={locale}
              routes={CHARACTER_ROUTES}
              purpose="edit"
              ready
              notReadyReason={null}
              prepare={async () => ({ files: {}, width: 16, height: 9 })}
              request={() => ({ prompt: characterSheetPrompt(choice), ...CHARACTER_SHEET_PARAMS })}
              textField={null}
              label={T.cta[locale]}
              parentJobId={null}
              projectId={projectId}
              canSubmit={canSave}
              paid={paid}
              onSent={setJobId}
              privacyNote={null}
            />
          </>
        ) : (
          <div className="space-y-4" aria-live="polite">
            {failedJob ? (
              <>
                <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
                <Button variant="secondary" onClick={() => setJobId(null)}>
                  {T.another[locale]}
                </Button>
              </>
            ) : ready ? (
              <>
                <p className="inline-flex items-center gap-2 type-body font-black text-ink">
                  <CircleCheck aria-hidden="true" className="size-5" />
                  {T.arrived[locale]}
                </p>
                <img src={ready} alt={characterSummary(choice, locale).join(", ")} className="surface-media block max-h-80 w-full bg-paper object-contain" />
                {job?.isMock ? (
                  <p className="type-body-sm font-bold text-muted">{T.demo[locale]}</p>
                ) : (
                  <SaveAsLik locale={locale} jobId={jobId} names={suggestedNames(choice)} />
                )}
                <Button variant="ghost" onClick={() => setJobId(null)}>
                  {T.another[locale]}
                </Button>
              </>
            ) : (
              <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <Spinner size="sm" />
                {T.waiting[locale]}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function OptionGrid({
  locale,
  label,
  options,
  value,
  onPick,
}: {
  locale: Locale;
  label: string;
  options: readonly CharacterOption[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(option.id)}
            className={cn(
              "surface-inset flex min-h-14 items-center gap-2.5 border-2 px-3 py-2 text-left text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
              selected
                ? "border-ink bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)]"
                : "igra-press border-ink/20 bg-paper text-ink hover:border-ink",
            )}
          >
            {option.swatch ? (
              <span
                aria-hidden="true"
                className="size-6 shrink-0 rounded-full shadow-[inset_0_0_0_2px_var(--shadow-hard-14)]"
                style={{ backgroundColor: option.swatch }}
              />
            ) : null}
            <span>{option.label[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}

function SaveAsLik({ locale, jobId, names }: { locale: Locale; jobId: Id<"generationJobs">; names: readonly string[] }) {
  const formId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const saveFromJob = useAction(api.creaElements.saveFromJob);
  const [picked, setPicked] = useState(names[0] ?? "");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SaveState>({ name: "idle" });
  const name = typed.trim() || picked;

  async function save() {
    if (!consent || !name || state.name === "saving") return;
    setState({ name: "saving" });
    try {
      const saved = await saveFromJob({ jobId, name, consent: true });
      setState({ name: "saved", handle: saved.handle });
    } catch (error) {
      setState({ name: "error", message: elementErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  if (state.name === "saved") {
    return (
      <div className="surface-inset space-y-3 bg-paper p-4">
        <p className="inline-flex items-center gap-2 type-body font-black text-ink">
          <CircleCheck aria-hidden="true" className="size-5" />
          {fillCopy(T.saved[locale], { handle: state.handle })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(`${pathname}?${creaPromptQuery(`@${state.handle} `, searchParams)}`, { scroll: false })}>
            {T.useInImage[locale]}
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`${pathname}?${creaShellQuery({ tool: "slika.likovi" }, searchParams)}`, { scroll: false })}
          >
            {T.openLikovi[locale]}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-inset space-y-4 bg-paper p-4">
      <h3 className="type-body font-black text-ink">{T.saveTitle[locale]}</h3>
      <fieldset>
        <legend className="type-body-sm font-black text-ink">{T.name[locale]}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {names.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={!typed.trim() && picked === option}
              onClick={() => {
                setPicked(option);
                setTyped("");
              }}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                !typed.trim() && picked === option ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper-strong text-ink hover:border-ink",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="type-body-sm font-bold text-muted">{T.otherName[locale]}</span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={ELEMENT_NAME_MAX}
          autoComplete="off"
          className="surface-inset mt-2 block min-h-11 w-full max-w-sm border-2 border-ink bg-paper-strong px-3 py-2 type-body font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </label>
      <ConsentCheck id={`${formId}-izmisljen`} checked={consent} onChange={setConsent} text={CREA_ELEMENTS_COPY.consentFictional[locale]} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void save()}
          disabled={!consent || !name}
          loading={state.name === "saving"}
          icon={<Save aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {T.saveCta[locale]}
        </Button>
        {!consent ? <p className="type-body-sm font-semibold text-muted">{CREA_ELEMENTS_COPY.needConsent[locale]}</p> : null}
      </div>
      {state.name === "error" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
