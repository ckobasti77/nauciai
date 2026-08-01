import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<typeof Link> & {
  tone?: "ink" | "paper" | "yellow";
  size?: "md" | "lg";
};

export function LinkButton({ className, tone = "ink", size = "md", ...props }: ButtonProps) {
  return (
    <Link
      data-motion="interactive"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border-2 font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        // `cn` is a plain join, not tailwind-merge, so a caller's `className` cannot reliably
        // beat these — sizing is selected here instead. "md" matches the previous hardcoded base.
        size === "md" && "min-h-11 px-5 py-2.5 text-sm",
        size === "lg" && "min-h-12 px-6 py-3 text-base sm:text-lg",
        tone === "ink" &&
          "border-ink bg-ink text-white shadow-[4px_4px_0_0_#f4be30] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#f4be30] focus-visible:outline-ink",
        tone === "yellow" &&
          "border-ink bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#0e3158] focus-visible:outline-ink",
        tone === "paper" &&
          "border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5 focus-visible:outline-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({
  children,
  className,
  id,
  as = "section",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "article" | "div" | "aside";
}) {
  const Tag = as;

  return (
    <Tag
      id={id}
      data-motion="card"
      className={cn(
        "rounded-[16px] border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.13)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({
  kicker,
  title,
  body,
}: {
  kicker?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-3xl" data-motion="copy">
      {kicker ? <p className="font-display text-xl text-ink">{kicker}</p> : null}
      <h2 className="mt-2 text-3xl font-black leading-tight text-ink md:text-5xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-7 text-muted md:text-lg">{body}</p> : null}
    </div>
  );
}

export function HandUnderline({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-motion="scribble"
      viewBox="0 0 240 18"
      className={cn("h-5 w-56 text-yellow", className)}
      fill="none"
    >
      <path
        d="M4 12C38 3 75 9 111 7c37-2 76-7 125 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M9 14c51-3 95-1 137-6 27-3 52-1 86 4"
        stroke="#0e3158"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function BrandMark({ href = "/sr" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label="Nauči AI"
      className="inline-flex min-w-0 items-center focus-visible:outline focus-visible:outline-2"
    >
      <Image
        src="/images/logos/logo.png"
        alt="Nauči AI"
        width={1338}
        height={460}
        className="h-auto w-[142px] max-w-[45vw] object-contain sm:w-[176px] lg:w-[198px]"
        priority
      />
    </Link>
  );
}

export function SketchIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-motion="circle"
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-[16px] border-2 border-ink bg-yellow text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
