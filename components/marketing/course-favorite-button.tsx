"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { MouseEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";

type FavoriteStates = Record<string, boolean> | undefined;

export function CourseFavoriteButton({
  courseSlug,
  signInHref,
  label,
}: {
  courseSlug: string;
  signInHref: string;
  label: string;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const favoriteStates = useQuery(
    api.courses.getCourseFavoriteStates,
    isAuthenticated ? { courseSlugs: [courseSlug] } : "skip",
  ) as FavoriteStates;
  const toggleFavorite = useMutation(api.courses.toggleCourseFavorite);
  const [optimisticFavorite, setOptimisticFavorite] = useState<boolean | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isFavorite = optimisticFavorite ?? favoriteStates?.[courseSlug] ?? false;

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      router.push(signInHref);
      return;
    }

    const nextState = !isFavorite;
    setOptimisticFavorite(nextState);
    setIsPending(true);
    try {
      const result = await toggleFavorite({ courseSlug });
      setOptimisticFavorite(result.favorited);
    } catch {
      setOptimisticFavorite(isFavorite);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      onClick={handleClick}
      disabled={isLoading || isPending}
      className={cn(
        "relative z-10 inline-flex size-11 items-center justify-center rounded-full border-[2px] border-ink bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard-24)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-80",
        isFavorite && "bg-yellow text-red-700 shadow-[3px_3px_0_0_rgba(185,28,28,0.35)]",
      )}
    >
      {isPending ? (
        <Spinner size="md" />
      ) : (
        <Heart className={cn("size-5", isFavorite && "fill-current")} />
      )}
    </button>
  );
}
