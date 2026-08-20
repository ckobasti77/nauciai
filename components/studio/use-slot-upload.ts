"use client";

import { useAction, useMutation } from "convex/react";
import { useCallback } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canMeasure } from "@/lib/media-duration";
import type { SlotFile } from "@/lib/studio-slots";

/**
 * Upload jednog ulaznog fajla u Convex storage, sa napretkom. `fetch` ne ume
 * da javi napredak tela zahteva, a video od sto megabajta bez trake napretka
 * izgleda kao zaglavljena stranica - zato `XMLHttpRequest`.
 *
 * Pregled se pravi lokalno (`URL.createObjectURL`), pa sličica stoji odmah i
 * ne čeka drugi obilazak do servera; pozivalac ga oslobadja kad slot isprazni.
 *
 * Prijava posle uploada nije opciona: upload URL ne zna ishod, pa vlasnika
 * fajla pamti tek `registerInputUpload` - a `createJob` neprijavljen `storageId`
 * ne prima (nalaz R4). Ako prijava padne, upload se računa kao neuspeo.
 *
 * Merenje trajanja ide odmah za njom, i to samo za formate koje parser čita
 * (`canMeasure`). Neuspelo merenje NIJE neuspeo upload - fajl je gore i vidi
 * se; posao koji se po trajanju naplaćuje na njemu prosto ne može da krene, pa
 * dugme ostaje zaključano umesto da `createJob` padne posle klika.
 */
export function useSlotUpload() {
  const createUploadUrl = useMutation(api.studio.createInputUploadUrl);
  const registerUpload = useMutation(api.studio.registerInputUpload);
  const measureUpload = useAction(api.studioActions.measureInputUpload);

  return useCallback(
    async (file: File, slot: string, onProgress: (fraction: number) => void): Promise<SlotFile> => {
      const uploadUrl = await createUploadUrl();
      const storageId = await putWithProgress(uploadUrl, file, onProgress);
      await registerUpload({ storageId: storageId as Id<"_storage">, slot });

      let measuredSeconds: number | undefined;
      if (canMeasure(file.type)) {
        const measured = await measureUpload({ storageId: storageId as Id<"_storage"> });
        if (measured.ok) measuredSeconds = measured.seconds;
      }

      return {
        storageId,
        name: file.name,
        mime: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
        ...(measuredSeconds !== undefined ? { measuredSeconds } : {}),
      };
    },
    [createUploadUrl, measureUpload, registerUpload],
  );
}

function putWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });

    request.addEventListener("error", () => reject(new Error("UPLOAD_NEUSPEO")));
    request.addEventListener("abort", () => reject(new Error("UPLOAD_PREKINUT")));
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("UPLOAD_NEUSPEO"));
        return;
      }
      try {
        const body: unknown = JSON.parse(request.responseText);
        const storageId =
          body && typeof body === "object" ? (body as { storageId?: unknown }).storageId : undefined;
        if (typeof storageId !== "string") {
          reject(new Error("UPLOAD_BEZ_ID"));
          return;
        }
        onProgress(1);
        resolve(storageId);
      } catch {
        reject(new Error("UPLOAD_BEZ_ID"));
      }
    });

    request.send(file);
  });
}
