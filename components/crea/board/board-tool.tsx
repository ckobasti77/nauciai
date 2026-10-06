"use client";

import { LayoutDashboard } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreaBoard } from "@/components/crea/board/crea-board";
import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_INPUT_PARAM } from "@/lib/crea-versions";

/**
 * Tabla preko cele scene (K28, U13; alat `slika.tabla`). Ovde composer nije na
 * ekranu, pa „Kao referenca" vodi u Slika · Napravi sa radom kao ulazom (`?ulaz=`),
 * isti put kao „Koristi kao referencu" iz galerije.
 */
export default function BoardTool({ tool, locale }: CreaToolProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <section aria-labelledby="crea-tool-title" className="space-y-4">
      <ToolHeader tool={tool} locale={locale} icon={<LayoutDashboard aria-hidden="true" className="size-5" />} />
      <CreaBoard
        locale={locale}
        size="full"
        onUseAsReference={(jobId) => {
          const query = new URLSearchParams(creaShellQuery({ area: "slika", mode: "napravi", tool: null, recipe: null, goal: null }, searchParams));
          query.set(CREA_INPUT_PARAM, jobId);
          router.push(`${pathname}?${query.toString()}`, { scroll: false });
        }}
      />
    </section>
  );
}
