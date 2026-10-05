/* eslint-disable @next/next/no-img-element -- sličice su potpisani Convex URL-ovi, kao u ostatku detalja rada. */
"use client";

import { AudioLines, Clapperboard, CornerDownRight, GitBranch, ImageOff } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreaDerivation } from "@/convex/creaVersionsCore";
import { CREA_VERSION_COPY } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";

export type VersionNode = {
  _id: Id<"generationJobs">;
  parentJobId: Id<"generationJobs"> | null;
  depth: number;
  derivation: CreaDerivation | null;
  kind: "image" | "video" | "audio";
  status: string;
  createdAt: number;
  hasOutput: boolean;
  thumbUrl: string | null;
};

/** Uvlačenje po nivou; dublje grane ostaju na četvrtom nivou da red ne pobegne iz panela. */
const INDENT_PX = 14;
const MAX_INDENT_LEVEL = 4;

function Thumb({ node }: { node: VersionNode }) {
  const box = "surface-media grid size-11 shrink-0 place-items-center overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]";
  if (node.thumbUrl) return <img src={node.thumbUrl} alt="" className={cn(box, "object-cover")} />;
  const Icon = !node.hasOutput ? ImageOff : node.kind === "video" ? Clapperboard : AudioLines;
  return (
    <span className={cn(box, "text-muted")}>
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

/**
 * Stablo verzija u detalju rada (K05, S25): od korena do svih grana, dubinski,
 * grane kao uvlačenje. Spisak, ne mreža - redovi se dele tankom linijom, okvir je
 * panel oko njega (AGENTS.md, „jedan okvir po grupi").
 */
export function VersionStrip({
  locale,
  nodes,
  currentId,
  truncated,
  onOpen,
}: {
  locale: Locale;
  nodes: VersionNode[];
  currentId: string;
  truncated: boolean;
  onOpen: (jobId: Id<"generationJobs">) => void;
}) {
  const copy = CREA_VERSION_COPY;
  const time = new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section aria-labelledby="crea-versions-title">
      <div className="flex items-center gap-2">
        <GitBranch aria-hidden="true" className="size-4 text-ink" />
        <h3 id="crea-versions-title" className="text-sm font-black uppercase tracking-wider text-ink">
          {copy.title[locale]}
        </h3>
        <span className="ml-auto font-mono text-xs font-bold tabular-nums text-muted">{nodes.length}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-muted">{copy.hint[locale]}</p>

      <ol className="mt-2 divide-y divide-line">
        {nodes.map((node) => {
          const current = node._id === currentId;
          const label = node.derivation ? copy.derivations[node.derivation][locale] : copy.derivations.original[locale];
          const failed = node.status === "failed" || node.status === "refunded";
          return (
            <li key={node._id}>
              <button
                type="button"
                onClick={() => onOpen(node._id)}
                aria-current={current ? "true" : undefined}
                style={{ paddingInlineStart: Math.min(node.depth, MAX_INDENT_LEVEL) * INDENT_PX + 6 }}
                className={cn(
                  "surface-inset flex min-h-11 w-full items-center gap-2.5 py-1.5 pr-2 text-left transition-colors hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                  current && "bg-yellow hover:bg-yellow",
                  failed && !current && "opacity-60",
                )}
              >
                {node.depth > 0 ? (
                  <CornerDownRight aria-hidden="true" className={cn("size-3.5 shrink-0", current ? "text-ink" : "text-muted")} />
                ) : null}
                <Thumb node={node} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black text-ink">
                    {label}
                    {current ? <span className="font-bold"> · {copy.current[locale]}</span> : null}
                  </span>
                  <span className={cn("block text-[11px] font-bold tabular-nums", current ? "text-ink" : "text-muted")}>
                    {time.format(node.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {truncated ? <p className="mt-2 text-[11px] font-bold text-muted">{copy.truncated[locale]}</p> : null}
    </section>
  );
}
