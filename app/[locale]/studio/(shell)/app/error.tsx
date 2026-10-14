"use client";

import { IgraErrorState } from "@/components/igra/igra-error-state";

export default function CreaAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <IgraErrorState
      error={error}
      reset={reset}
      title={{ sr: "Crea je zastala", en: "Crea stalled" }}
      body={{ sr: "To nije do tebe. Tvoji radovi su sačuvani, pokušaj ponovo.", en: "That is not on you. Your creations are saved, please try again." }}
    />
  );
}
