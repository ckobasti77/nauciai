"use client";

import { IgraErrorState } from "@/components/igra/igra-error-state";

export default function CommunityError({
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
      title={{ sr: "Zajednica nije učitana", en: "Community did not load" }}
      body={{ sr: "To nije do tebe. Tvoji filteri i trenutna stranica ostaju sačuvani, pokušaj ponovo.", en: "That is not on you. Your filters and current page stay in place, please try again." }}
    />
  );
}
