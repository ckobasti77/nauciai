"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CreaToolProps } from "@/components/crea/tools/types";
import { Spinner } from "@/components/ui/spinner";

/**
 * Granica bundle-a za alate Cree (plan K01 §9): svaki alat je svoj async chunk,
 * a teške biblioteke (MediaPipe, jSquash, exifr) se uvoze tek unutar njega -
 * ništa od toga ne ulazi u radionicu ni u zajednički bundle. Next traži da
 * putanja u `import()` bude doslovna, pa po jedan `dynamic` za svaki alat.
 */
function ToolLoading() {
  return (
    <div className="surface-card grid min-h-[220px] place-items-center border-2 border-ink bg-paper-strong">
      <Spinner size="md" className="text-muted" />
    </div>
  );
}

const FormatTool = dynamic(() => import("./format-tool"), { ssr: false, loading: ToolLoading });
const PhotoCheckTool = dynamic(() => import("./photo-check-tool"), { ssr: false, loading: ToolLoading });

export const CREA_TOOL_COMPONENTS: Readonly<Record<string, ComponentType<CreaToolProps>>> = {
  "slika.format": FormatTool,
  "slika.provera": PhotoCheckTool,
};
