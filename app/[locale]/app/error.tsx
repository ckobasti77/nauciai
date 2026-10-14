"use client";

import { IgraErrorState } from "@/components/igra/igra-error-state";

export default function DashboardError({
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
      title={{ sr: "Pregled nije učitan", en: "The overview did not load" }}
      body={{ sr: "To nije do tebe. Tvoj napredak je sačuvan i ništa nije izgubljeno, pokušaj ponovo.", en: "That is not on you. Your progress is saved and nothing was lost, please try again." }}
    />
  );
}
