"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreaMediaKind } from "@/lib/crea-tools";

/**
 * „Sačuvaj u galeriju" za rezultat lokalnog alata (K04, plan K01 §4.2):
 * dozvola → upload bloba → upis posla. Vraća ishod servera; bačena greška nosi
 * kod (`MINUTNI_LIMIT`, `NEMA_PRISTUPA`…) koji UI prevodi kroz `creaSaveErrorMessage`.
 */
export function useSaveLocalResult() {
  const createUploadUrl = useMutation(api.creaLocal.createLocalResultUploadUrl);
  const saveLocalResult = useMutation(api.creaLocal.saveLocalResult);

  return useCallback(
    async (input: {
      toolId: string;
      kind: CreaMediaKind;
      blob: Blob;
      params?: Record<string, string | number | boolean>;
      projectId: Id<"studioProjects"> | null;
      parentJobId?: Id<"generationJobs"> | null;
      /** K19: izvezena montaža je „montaza" verzija roditelja i navodi sve izvore iz galerije. */
      derivation?: "lokalni-alat" | "montaza" | "produzenje";
      sourceJobIds?: Id<"generationJobs">[];
    }) => {
      const { uploadUrl, grantId } = await createUploadUrl({ kind: input.kind });
      let storageId: Id<"_storage">;
      try {
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": input.blob.type },
          body: input.blob,
        });
        if (!response.ok) throw new Error("SLANJE");
        ({ storageId } = (await response.json()) as { storageId: Id<"_storage"> });
      } catch {
        throw new Error("SLANJE");
      }
      return saveLocalResult({
        grantId,
        storageId,
        toolId: input.toolId,
        kind: input.kind,
        ...(input.params ? { params: JSON.stringify(input.params) } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
        ...(input.parentJobId && input.derivation ? { derivation: input.derivation } : {}),
        ...(input.sourceJobIds && input.sourceJobIds.length > 0 ? { sourceJobIds: input.sourceJobIds } : {}),
      });
    },
    [createUploadUrl, saveLocalResult],
  );
}
