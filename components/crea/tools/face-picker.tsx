/* eslint-disable @next/next/no-img-element -- potpisane adrese Convex storage-a, kao u ostalim izborima radova. */
"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Check, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";

/** Izabrano lice: tvoj Lik sa pristankom ili rad koji je Crea napravila (proverava server). */
export type FaceChoice =
  | { kind: "lik"; elementId: Id<"creaElements">; name: string; description: string | null; imageIds: Id<"_storage">[]; url: string | null }
  | { kind: "rad"; jobId: Id<"generationJobs">; url: string };

export function faceKey(choice: FaceChoice | null): string | null {
  if (!choice) return null;
  return choice.kind === "lik" ? `lik:${choice.elementId}` : `rad:${choice.jobId}`;
}

/** Argument za `creaFaceJobs.*`: samo id, nikad fajl lica. */
export function faceArg(choice: FaceChoice): { elementId: Id<"creaElements"> } | { jobId: Id<"generationJobs"> } {
  return choice.kind === "lik" ? { elementId: choice.elementId } : { jobId: choice.jobId };
}

const tile =
  "surface-media relative block aspect-square w-full overflow-hidden border-2 bg-paper transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

function Selected() {
  return (
    <span className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink">
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
    </span>
  );
}

/**
 * Izbor lica za video alate (K20, K17-15): Likovi sa pristankom i radovi iz Cree
 * koje server smatra bezbednim (`creaFaceJobs.listFaceSources`). Tuđa fotka se
 * ovde ni ne nudi; server svejedno ponovo proverava pri slanju.
 */
export function FacePicker({
  locale,
  kind,
  value,
  onChange,
  disabled,
}: {
  locale: Locale;
  kind: "image" | "video";
  value: FaceChoice | null;
  onChange: (choice: FaceChoice) => void;
  disabled: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const sources = useQuery(api.creaFaceJobs.listFaceSources, isAuthenticated ? { kind } : "skip");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = faceKey(value);
  const liksHref = `${pathname}?${creaShellQuery({ area: "slika", mode: "likovi", tool: null }, searchParams)}`;

  if (isAuthenticated && sources === undefined) return <p className="type-body-sm font-bold text-muted">{T.faceLoading[locale]}</p>;
  const liks = sources?.liks ?? [];
  const jobs = sources?.jobs ?? [];

  return (
    <div className="space-y-3">
      {liks.length === 0 && jobs.length === 0 ? (
        <div className="surface-inset space-y-2 border border-dashed border-line bg-paper p-3">
          <p className="type-body-sm font-bold text-muted">{kind === "image" ? T.faceEmpty[locale] : T.faceEmptyVideo[locale]}</p>
          {kind === "image" ? (
            <Link
              href={liksHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
            >
              <UserRound aria-hidden="true" className="size-4" />
              {T.faceOpenLiks[locale]}
            </Link>
          ) : null}
        </div>
      ) : null}

      {liks.length > 0 ? (
        <div>
          <p className="type-body-sm font-black text-ink">{T.faceLiks[locale]}</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {liks.map((lik) => {
              const choice: FaceChoice = {
                kind: "lik",
                elementId: lik._id,
                name: lik.name,
                description: lik.description,
                imageIds: lik.imageIds,
                url: lik.url,
              };
              const active = selected === faceKey(choice);
              return (
                <li key={lik._id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={fillCopy(T.facePick[locale], { name: lik.name })}
                    disabled={disabled}
                    onClick={() => onChange(choice)}
                    className={cn(tile, active ? "border-ink" : "border-ink/25 hover:border-ink")}
                  >
                    {lik.url ? <img src={lik.url} alt="" className="size-full object-cover" /> : null}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-paper-strong/90 px-1.5 py-0.5 text-xs font-black text-ink">{lik.name}</span>
                    {active ? <Selected /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div>
          <p className="type-body-sm font-black text-ink">{kind === "image" ? T.faceWorks[locale] : T.faceTitleVideo[locale]}</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {jobs.map((job) => {
              const choice: FaceChoice = { kind: "rad", jobId: job._id, url: job.url };
              const active = selected === faceKey(choice);
              return (
                <li key={job._id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={fillCopy(T.facePick[locale], { name: T.faceWork[locale] })}
                    disabled={disabled}
                    onClick={() => onChange(choice)}
                    className={cn(tile, active ? "border-ink" : "border-ink/25 hover:border-ink")}
                  >
                    {kind === "image" ? (
                      <img src={job.url} alt="" className="size-full object-cover" />
                    ) : (
                      <video preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" src={`${job.url}#t=0.1`} />
                    )}
                    {active ? <Selected /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="type-body-sm font-semibold text-muted">{T.faceRule[locale]}</p>
    </div>
  );
}
