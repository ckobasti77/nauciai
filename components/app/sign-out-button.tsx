"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type Locale, withLocale } from "@/lib/i18n";

export function SignOutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    try {
      await signOut();
      router.push(withLocale(locale, "/sign-in"));
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-3 rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-extrabold text-ink transition hover:bg-yellow disabled:cursor-wait disabled:opacity-70 sm:justify-start"
    >
      <LogOut className="size-4" />
      {locale === "sr" ? "Odjavi se" : "Sign out"}
    </button>
  );
}
