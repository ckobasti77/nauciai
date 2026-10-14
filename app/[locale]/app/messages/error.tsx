"use client";

import { IgraErrorState } from "@/components/igra/igra-error-state";

export default function MessagesError({
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
      title={{ sr: "Poruke nisu učitane", en: "Messages did not load" }}
      body={{ sr: "Tvoje poruke su bezbedne. Proveri vezu i pokušaj ponovo.", en: "Your messages are safe. Check your connection and try again." }}
    />
  );
}
