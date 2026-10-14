"use client";

import { Clapperboard, ImagePlus, Lock, ShieldCheck, Sparkles, UserRound, WandSparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { ElementEditor } from "@/components/crea/elements/element-editor";
import { ElementCover, useMyElements, type MyElement } from "@/components/crea/elements/shared";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { ELEMENT_KINDS, ELEMENTS_MAX, type ElementKind } from "@/convex/creaElementsCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_ELEMENT_KIND_COPY, CREA_ELEMENTS_COPY as T } from "@/lib/crea-elements-copy";
import { CREA_ELEMENT_PARAM, creaPromptQuery, creaShellQuery } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

type View = { name: "list" } | { name: "edit"; element: MyElement | null; kind: ElementKind };
type Filter = "sve" | ElementKind;

/**
 * Ekran „Likovi" (S34, K14): moji likovi, mesta i predmeti - sačuvaj jednom,
 * pozovi sa `@ime` u svakoj slici i videu. Čuvanje je besplatno; provera fotke
 * (S35) radi na uređaju; krediti idu tek kad se element pozove u poslu.
 */
export default function ElementsTool({ tool, locale, canSave }: CreaToolProps) {
  const elements = useMyElements(canSave);
  return <ElementsBoard tool={tool} locale={locale} canSave={canSave} elements={elements} />;
}

/** Prikaz ekrana nad datim spiskom (`undefined` dok se učitava) - podaci stižu iz `ElementsTool`. */
export function ElementsBoard({
  tool,
  locale,
  canSave,
  elements,
}: Pick<CreaToolProps, "tool" | "locale" | "canSave"> & { elements: readonly MyElement[] | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>({ name: "list" });
  const [filter, setFilter] = useState<Filter>("sve");
  const [savedHandle, setSavedHandle] = useState<string | null>(null);

  function go(query: string) {
    router.push(`${pathname}?${query}`, { scroll: false });
  }
  const openIn = (element: MyElement, area: "slika" | "video") => go(creaPromptQuery(`@${element.handle} `, searchParams, area));
  const swap = (element: MyElement) => {
    const query = new URLSearchParams(creaShellQuery({ area: "slika", mode: "izmeni", tool: "slika.zameni-lik" }, searchParams));
    query.set(CREA_ELEMENT_PARAM, element._id);
    go(query.toString());
  };

  const list = elements ?? [];
  const full = list.length >= ELEMENTS_MAX;
  const shown = filter === "sve" ? list : list.filter((element) => element.kind === filter);

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<UserRound aria-hidden="true" className="size-5" />} />

      <div className="mt-5 space-y-5 border-t border-line pt-5">
        {!canSave ? (
          <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p>
        ) : view.name === "edit" ? (
          <ElementEditor
            key={view.element?._id ?? `novi-${view.kind}`}
            locale={locale}
            element={view.element}
            initialKind={view.kind}
            onDone={(handle) => {
              setSavedHandle(handle);
              setView({ name: "list" });
            }}
            onCancel={() => setView({ name: "list" })}
          />
        ) : (
          <>
            <HowItWorks locale={locale} />

            <div className="flex flex-wrap items-center gap-2">
              {ELEMENT_KINDS.map((kind, index) => (
                <Button
                  key={kind}
                  variant={index === 0 ? "primary" : "secondary"}
                  disabled={full || elements === undefined}
                  onClick={() => {
                    setSavedHandle(null);
                    setView({ name: "edit", element: null, kind });
                  }}
                  icon={<ImagePlus aria-hidden="true" className="size-4" />}
                  className={index === 0 ? "shadow-[4px_4px_0_0_var(--ink)]" : undefined}
                >
                  {CREA_ELEMENT_KIND_COPY[kind].add[locale]}
                </Button>
              ))}
              <Button
                variant="ghost"
                disabled={full}
                onClick={() => go(creaShellQuery({ tool: "slika.kreator-lika" }, searchParams))}
                icon={<WandSparkles aria-hidden="true" className="size-4" />}
              >
                {T.creator[locale]}
              </Button>
            </div>

            <div aria-live="polite">
              {savedHandle ? (
                <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                  <Sparkles aria-hidden="true" className="size-4" />
                  {fillCopy(T.saved[locale], { handle: savedHandle })}
                </p>
              ) : null}
              {full ? <p className="type-body-sm font-bold text-muted">{fillCopy(T.limit[locale], { n: list.length })}</p> : null}
            </div>

            {elements === undefined ? (
              <p className="inline-flex items-center gap-2 type-body-sm font-bold text-muted">
                <Spinner size="sm" />
                {T.loading[locale]}
              </p>
            ) : list.length === 0 ? (
              <EmptyElements locale={locale} />
            ) : (
              <>
                {new Set(list.map((element) => element.kind)).size > 1 ? (
                  <ChoiceChips
                    legend={T.filter[locale]}
                    name="crea-likovi-filter"
                    options={[
                      { id: "sve" as Filter, label: `${T.all[locale]} · ${list.length}` },
                      ...ELEMENT_KINDS.map((kind) => ({
                        id: kind as Filter,
                        label: `${CREA_ELEMENT_KIND_COPY[kind].many[locale]} · ${list.filter((element) => element.kind === kind).length}`,
                      })),
                    ]}
                    value={filter}
                    onChange={setFilter}
                  />
                ) : null}
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {shown.map((element) => (
                    <ElementTile
                      key={element._id}
                      element={element}
                      locale={locale}
                      onEdit={() => {
                        setSavedHandle(null);
                        setView({ name: "edit", element, kind: element.kind });
                      }}
                      onUseImage={() => openIn(element, "slika")}
                      onUseVideo={() => openIn(element, "video")}
                      onSwap={() => swap(element)}
                    />
                  ))}
                </ul>
              </>
            )}

            <p className="inline-flex items-start gap-2 type-body-sm font-semibold text-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {T.privacy[locale]}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function HowItWorks({ locale }: { locale: Locale }) {
  return (
    <div className="surface-inset bg-paper p-4">
      <h3 className="type-body font-black text-ink">{T.how[locale]}</h3>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {T.steps.map((step, index) => (
          <li key={step.sr} className="flex items-start gap-3">
            <span className="paper-island grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow font-mono text-sm font-black text-ink">
              {index + 1}
            </span>
            <span className="type-body-sm font-semibold text-ink">{step[locale]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyElements({ locale }: { locale: Locale }) {
  return (
    <div className="surface-inset grid place-items-center border border-dashed border-line bg-paper px-6 py-10 text-center">
      <IgraArt id="lik.piksi.misli" size="lg" decorative />
      <p className="mt-3 type-h4 text-ink">{T.emptyTitle[locale]}</p>
      <p className="mt-2 max-w-md type-body-sm font-semibold text-muted">{T.emptyBody[locale]}</p>
    </div>
  );
}

function TileAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

function ElementTile({
  element,
  locale,
  onEdit,
  onUseImage,
  onUseVideo,
  onSwap,
}: {
  element: MyElement;
  locale: Locale;
  onEdit: () => void;
  onUseImage: () => void;
  onUseVideo: () => void;
  onSwap: () => void;
}) {
  return (
    <li className="surface-inset flex flex-col bg-paper p-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${T.edit[locale]}: ${element.name}`}
        className="surface-inset group block text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="surface-media block overflow-hidden">
          <ElementCover
            element={element}
            className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </span>
        <span className="mt-2 block truncate px-1 text-sm font-black text-ink">{element.name}</span>
        <span className="block truncate px-1 font-mono text-xs font-bold text-muted">@{element.handle}</span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-black text-ink">
          {CREA_ELEMENT_KIND_COPY[element.kind].one[locale]}
        </span>
        <span className="font-mono text-[11px] font-bold text-muted">{fillCopy(T.images[locale], { n: element.images.length })}</span>
        {element.kind === "lik" && element.canSwap ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-black text-ink" title={T.consentGiven[locale]}>
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            <span className={cn(element.origin === "kreator" ? "" : "sr-only")}>
              {element.origin === "kreator" ? T.fictional[locale] : T.consentGiven[locale]}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 px-1 pt-2">
        <TileAction label={`${T.useImage[locale]}: @${element.handle}`} onClick={onUseImage}>
          <ImagePlus aria-hidden="true" className="size-4" />
        </TileAction>
        <TileAction label={`${T.useVideo[locale]}: @${element.handle}`} onClick={onUseVideo}>
          <Clapperboard aria-hidden="true" className="size-4" />
        </TileAction>
        {element.kind === "lik" && element.canSwap ? (
          <TileAction label={`${T.swap[locale]}: ${element.name}`} onClick={onSwap}>
            <Sparkles aria-hidden="true" className="size-4" />
          </TileAction>
        ) : null}
      </div>
    </li>
  );
}
