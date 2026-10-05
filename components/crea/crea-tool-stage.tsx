"use client";

import type { ReactNode } from "react";

import { CreaLogo } from "@/components/crea/crea-logo";
import { ToolBadges } from "@/components/crea/tool-badges";
import { CREA_TOOL_COMPONENTS } from "@/components/crea/tools";
import { useCreaDeviceCaps } from "@/components/crea/use-crea-device";
import { LinkButton } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_DEVICE_COPY, CREA_TOOL_COPY } from "@/lib/crea-copy";
import { toolById } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

function StageNote({ children }: { children: ReactNode }) {
  return (
    <div className="surface-card grid min-h-[280px] place-items-center border-2 border-dashed border-line bg-paper/70 px-6 py-10 text-center">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

/**
 * Sredina radionice u režimu sa alatima: izabran alat (`?alat=`), ili poziv da
 * se izabere, ili prijava. Na uskom ekranu spisak alata stoji iznad (`list`).
 */
export function CreaToolStage({
  locale,
  toolId,
  guest,
  signInHref,
  canSave,
  projectId,
  list,
}: {
  locale: Locale;
  toolId: string | null;
  guest: boolean;
  signInHref: string;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  /** Spisak alata kad nema levog panela (telefon, uska radionica). */
  list: ReactNode | null;
}) {
  const caps = useCreaDeviceCaps();
  const tool = toolById(toolId);
  const Component = tool ? CREA_TOOL_COMPONENTS[tool.id] : undefined;

  let body: ReactNode;
  if (guest) {
    body = (
      <StageNote>
        <CreaLogo variant="znak" className="mx-auto size-14" />
        <p className="mt-4 type-h3 text-ink">{CREA_TOOL_COPY.guestTitle[locale]}</p>
        <p className="mt-2 type-body-sm font-semibold text-muted">{CREA_TOOL_COPY.guestBody[locale]}</p>
        <LinkButton href={signInHref} tone="ink" className="mt-4">
          {CREA_TOOL_COPY.guestCta[locale]}
        </LinkButton>
      </StageNote>
    );
  } else if (!tool) {
    body = (
      <StageNote>
        <CreaLogo variant="znak" className="mx-auto size-14" />
        <p className="mt-4 type-h3 text-ink">{CREA_TOOL_COPY.pickTitle[locale]}</p>
        <p className="mt-2 type-body-sm font-semibold text-muted">{CREA_TOOL_COPY.pickBody[locale]}</p>
      </StageNote>
    );
  } else if (tool.status === "soon" || !Component) {
    body = (
      <StageNote>
        <p className="type-h3 text-ink">{tool.title[locale]}</p>
        <p className="mt-2 type-body-sm font-semibold text-muted">{tool.summary[locale]}</p>
        <ToolBadges tool={tool} locale={locale} className="mt-3 justify-center" />
        <p className="mt-3 type-body-sm font-bold text-ink">{CREA_DEVICE_COPY.reasons.soon[locale]}</p>
      </StageNote>
    );
  } else {
    body = <Component key={tool.id} tool={tool} locale={locale} caps={caps} canSave={canSave} projectId={projectId} />;
  }

  return (
    <div className="min-w-0 space-y-5">
      {list}
      {body}
    </div>
  );
}
