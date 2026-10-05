"use client";

import { useMutation } from "convex/react";
import { Replace, UserRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { checkFacePhoto } from "@/components/crea/elements/face-check";
import { ConsentCheck, ElementCover, PhotoCheckItems, useMyElements, type MyElement } from "@/components/crea/elements/shared";
import { ToolHeader } from "@/components/crea/tool-runner";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy, photoCheckItemText } from "@/lib/crea-copy";
import { CREA_SWAP_COPY as T, elementErrorMessage } from "@/lib/crea-elements-copy";
import { nearestAspectRatio, SWAP_ROUTES } from "@/lib/crea-paid-edit";
import { photoCheckProblem, type PhotoCheckResult } from "@/lib/crea-photo-check";
import { CREA_ELEMENT_PARAM, creaShellQuery } from "@/lib/crea-shell";

type TargetCheck = { key: string; result: PhotoCheckResult | null };

/**
 * Zameni lik (S24, O5): u fotku ide SAMO tvoj sačuvan Lik sa pristankom, i
 * pristanak se potvrđuje pri svakoj zameni. Fotka prvo prolazi proveru lica na
 * uređaju (S35) - bez lica nema plaćanja. Posao pravi `creaElements.startFaceSwap`:
 * server sam dodaje slike Lika i opis, pa tuđe lice ne može da uđe ovim putem.
 */
export default function SwapTool(props: CreaToolProps) {
  const elements = useMyElements(props.canSave);
  return <SwapBoard {...props} elements={elements} />;
}

/** Prikaz alata nad datim spiskom likova (`undefined` dok se učitava). */
export function SwapBoard({
  tool,
  locale,
  canSave,
  projectId,
  source,
  paid,
  elements,
}: CreaToolProps & { elements: readonly MyElement[] | undefined }) {
  const formId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const startFaceSwap = useMutation(api.creaElements.startFaceSwap);
  const liks = (elements ?? []).filter((element) => element.canSwap);
  const [likId, setLikId] = useState<string | null>(() => searchParams.get(CREA_ELEMENT_PARAM));
  const lik = liks.find((element) => element._id === likId) ?? (liks.length === 1 ? liks[0] : null);
  const image = useImageInput(source);
  const [check, setCheck] = useState<TargetCheck | null>(null);
  const [consent, setConsent] = useState(false);

  // Provera fotke kreće sama kad se fotka izabere; rezultat važi samo za tu fotku.
  useEffect(() => {
    const picked = image.picked;
    if (!picked) return;
    let alive = true;
    checkFacePhoto(picked.file, "opsta")
      .then((result) => {
        if (alive) setCheck({ key: picked.key, result });
      })
      .catch(() => {
        if (alive) setCheck({ key: picked.key, result: null });
      });
    return () => {
      alive = false;
    };
  }, [image.picked]);

  const current = check && image.picked && check.key === image.picked.key ? check : null;
  const checking = image.picked !== null && current === null;
  const problem = current?.result ? photoCheckProblem(current.result) : null;
  const badPhoto = current !== null && (current.result === null || current.result.verdict === "fail");

  const notReady = !lik
    ? T.needLik[locale]
    : !image.picked
      ? T.needPhoto[locale]
      : checking
        ? T.needCheck[locale]
        : badPhoto
          ? fillCopy(T.badPhoto[locale], { reason: problem ? photoCheckItemText(problem, locale) : "" })
          : null;

  const openLikovi = () => router.push(`${pathname}?${creaShellQuery({ area: "slika", mode: "likovi", tool: null }, searchParams)}`, { scroll: false });

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Replace aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        {elements !== undefined && liks.length === 0 ? (
          <div className="surface-inset grid place-items-center border border-dashed border-line bg-paper px-6 py-8 text-center">
            <UserRound aria-hidden="true" className="size-9 text-muted" />
            <p className="mt-3 max-w-md type-body-sm font-semibold text-ink">{T.noLiks[locale]}</p>
            <Button className="mt-4" onClick={openLikovi}>
              {T.openLikovi[locale]}
            </Button>
          </div>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className="type-body-sm font-black text-ink">{T.pickLik[locale]}</legend>
              {elements === undefined ? (
                <Spinner size="sm" className="mt-2 text-muted" />
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {liks.map((element) => {
                    const selected = lik?._id === element._id;
                    return (
                      <label
                        key={element._id}
                        className={cn(
                          "surface-inset cursor-pointer border-2 p-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                          selected ? "border-ink bg-yellow" : "border-transparent bg-paper hover:border-ink/40",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${formId}-lik`}
                          value={element._id}
                          checked={selected}
                          onChange={() => setLikId(element._id)}
                          className="sr-only"
                        />
                        <ElementCover element={element} className="surface-media aspect-square w-full" />
                        <span className="mt-1 block truncate text-center text-xs font-black text-ink">{element.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="space-y-2">
              <p className="type-body-sm font-black text-ink">{T.photo[locale]}</p>
              <ImageInput locale={locale} input={image} disabled={false} />
              {checking ? (
                <p className="inline-flex items-center gap-2 type-body-sm font-bold text-ink" aria-live="polite">
                  <Spinner size="sm" />
                  {T.checking[locale]}
                </p>
              ) : current?.result ? (
                <PhotoCheckItems items={current.result.items} locale={locale} onlyProblems className="surface-inset border border-line bg-paper px-3" />
              ) : null}
              <p className="type-body-sm font-semibold text-muted">{T.info[locale]}</p>
            </div>

            <ConsentCheck id={`${formId}-pristanak`} checked={consent} onChange={setConsent} text={T.consent[locale]} />

            <PaidEditPanel
              locale={locale}
              routes={SWAP_ROUTES}
              purpose="edit"
              ready={notReady === null}
              notReadyReason={notReady}
              extraBlocker={consent ? null : T.needConsent[locale]}
              prepare={async () => {
                const photo = await providerPhoto(image.picked!.file);
                return { files: { image: [photo.blob] }, width: photo.width, height: photo.height };
              }}
              // Opis sastavlja server (`swapPrompt`); ovde ide samo odnos stranica fotke.
              request={(_route, _text, size) => ({ aspect_ratio: nearestAspectRatio(size.width, size.height) })}
              textField={null}
              label={T.cta[locale]}
              parentJobId={image.picked?.sourceJobId ?? null}
              projectId={projectId}
              canSubmit={canSave}
              paid={paid}
              errorMessage={elementErrorMessage}
              create={async (job) => {
                const target = job.inputs.image?.[0];
                if (!lik || !target) throw new Error("LIK_NIJE_DOSTUPAN");
                return startFaceSwap({
                  elementId: lik._id as Id<"creaElements">,
                  targetStorageId: target as Id<"_storage">,
                  modelSlug: job.modelSlug,
                  params: job.params,
                  consent: true,
                  ...(job.projectId ? { projectId: job.projectId } : {}),
                  ...(job.parentJobId ? { parentJobId: job.parentJobId } : {}),
                });
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
