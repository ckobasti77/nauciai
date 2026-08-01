"use client";

import { PlayCircle } from "lucide-react";
import Image from "next/image";

import { cn } from "@/components/ui/primitives";
import { t, type Locale } from "@/lib/i18n";

export function PublicCourseIntroVideo({
  videoUrl,
  title,
  posterSrc,
  locale,
}: {
  videoUrl?: string | null;
  title: string;
  posterSrc: string;
  locale: Locale;
}) {
  if (videoUrl) {
    return (
      <video
        className="aspect-video w-full overflow-hidden rounded-[8px] bg-ink object-contain border-2 border-ink"
        src={videoUrl}
        controls
        preload="metadata"
        poster={posterSrc}
      />
    );
  }

  return (
    <div className="relative aspect-video min-h-[300px] overflow-hidden rounded-[8px] bg-ink text-white">
      <Image
        src={posterSrc}
        alt=""
        fill
        sizes="(min-width: 1024px) 60vw, 100vw"
        loading="eager"
        className="object-cover opacity-35"
      />
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div>
          <span className="mx-auto inline-flex size-20 items-center justify-center rounded-full border-2 border-white bg-yellow text-ink">
            <PlayCircle className="size-10 fill-current" />
          </span>
          <p className="mt-4 text-sm font-black text-white/80">
            {t(locale, "Intro video trenutno nije dostupan.", "The intro video is not available right now.")}
          </p>
        </div>
      </div>
    </div>
  );
}
