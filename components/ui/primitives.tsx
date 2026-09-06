import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { surfaceClass } from "@/lib/surface";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<typeof Link> & {
  tone?: "ink" | "paper" | "yellow" | "smoke" | "quiet";
  size?: "md" | "lg";
};

export function LinkButton({ className, tone = "ink", size = "md", ...props }: ButtonProps) {
  return (
    <Link
      data-motion="interactive"
      className={cn(
        // `link-button` (globals.css, @layer components) supplies the default
        // `display: inline-flex` so a caller's `hidden`/`sm:inline-flex` utilities can win;
        // the `inline-flex` utility would beat `hidden` (emitted later in @layer utilities).
        "group link-button items-center justify-center gap-2 rounded-full border-2 font-extrabold transition-[transform,translate,box-shadow] duration-200 ease-[var(--ease-studio-out)] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        // `cn` is a plain join, not tailwind-merge, so a caller's `className` cannot reliably
        // beat these — sizing is selected here instead. "md" matches the previous hardcoded base.
        size === "md" && "min-h-11 px-5 py-2.5 text-sm",
        size === "lg" && "min-h-12 px-6 py-3 text-base sm:text-lg",
        tone === "ink" &&
          "border-ink bg-ink text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--yellow)] active:shadow-[2px_2px_0_0_var(--yellow)] focus-visible:outline-ink",
        tone === "yellow" &&
          "border-ink bg-yellow text-ink shadow-[4px_4px_0_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--ink)] active:shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline-ink",
        tone === "paper" &&
          "border-ink bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] hover:-translate-y-0.5 active:shadow-[1px_1px_0_0_var(--shadow-hard)] focus-visible:outline-ink",
        tone === "smoke" &&
          "border-yellow bg-paper text-yellow shadow-[3px_3px_0_0_rgba(244,190,48,0.25)] hover:-translate-y-0.5 hover:border-yellow hover:bg-yellow hover:text-white hover:shadow-[4px_4px_0_0_var(--shadow-hard)] active:shadow-[2px_2px_0_0_var(--shadow-hard)] focus-visible:outline-yellow dark:bg-paper-strong/90 dark:shadow-[3px_3px_0_0_rgba(244,190,48,0.2)]",
        // `quiet`: tiha sekundarna akcija sa ČITLJIVIM tekstom u obe teme. `smoke` je
        // žut tekst na papiru (~1,7:1) — dobar na marketingu, pao je na komandnoj tabli.
        // Ovde: mastilo na papiru u svetloj (12,9:1), žuto na tamnom papiru u tamnoj
        // (7,66:1); na hover se popuni žutom sa mastilom. Sve kroz tokene, bez heksa.
        tone === "quiet" &&
          "border-ink bg-paper text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] hover:-translate-y-0.5 hover:bg-yellow hover:text-ink active:shadow-[1px_1px_0_0_var(--shadow-hard)] focus-visible:outline-ink dark:text-yellow dark:hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

type PlainButtonProps = ComponentProps<"button"> & {
  tone?: "ink" | "paper" | "yellow" | "smoke" | "quiet";
  size?: "md" | "lg";
};

export function Button({ className, tone = "ink", size = "md", type = "button", ...props }: PlainButtonProps) {
  return (
    <button
      type={type}
      data-motion="interactive"
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full border-2 font-extrabold transition-[transform,translate,box-shadow] duration-200 ease-[var(--ease-studio-out)] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        size === "md" && "min-h-11 px-5 py-2.5 text-sm",
        size === "lg" && "min-h-12 px-6 py-3 text-base sm:text-lg",
        tone === "ink" &&
          "border-ink bg-ink text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--yellow)] active:shadow-[2px_2px_0_0_var(--yellow)] focus-visible:outline-ink",
        tone === "yellow" &&
          "border-ink bg-yellow text-ink shadow-[4px_4px_0_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--ink)] active:shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline-ink",
        tone === "paper" &&
          "border-ink bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] hover:-translate-y-0.5 active:shadow-[1px_1px_0_0_var(--shadow-hard)] focus-visible:outline-ink",
        tone === "smoke" &&
          "border-yellow bg-paper text-yellow shadow-[3px_3px_0_0_rgba(244,190,48,0.25)] hover:-translate-y-0.5 hover:border-yellow hover:bg-yellow hover:text-white hover:shadow-[4px_4px_0_0_var(--shadow-hard)] active:shadow-[2px_2px_0_0_var(--shadow-hard)] focus-visible:outline-yellow dark:bg-paper-strong/90 dark:shadow-[3px_3px_0_0_rgba(244,190,48,0.2)]",
        // Vidi `LinkButton` iznad — čitljiva sekundarna akcija u obe teme, kroz tokene.
        tone === "quiet" &&
          "border-ink bg-paper text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] hover:-translate-y-0.5 hover:bg-yellow hover:text-ink active:shadow-[1px_1px_0_0_var(--shadow-hard)] focus-visible:outline-ink dark:text-yellow dark:hover:text-ink",
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
  level,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "article" | "div" | "aside";
  /**
   * Nivo naizmenične površine (v3, `lib/surface.ts`). Kad je dat, pozadina ide iz
   * `surfaceClass(level)` umesto podrazumevanog `bg-paper-strong` — javne strane
   * prosleđuju nivo svoje sekcije + 1 (panel crta sopstvenu pozadinu, pa je za jedan
   * dublji). App ekrani ga izostave i zadrže zatečeni `bg-paper-strong`.
   */
  level?: number;
}) {
  const Tag = as;

  return (
    <Tag
      id={id}
      data-motion="card"
      className={cn(
        "rounded-[16px] border-2 border-ink shadow-[6px_6px_0_0_var(--shadow-hard-13)]",
        level === undefined ? "bg-paper-strong" : surfaceClass(level),
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
  titleLead,
  titleHighlight,
  titleBreak = false,
  body,
  variant = "marketing",
  underline = false,
  className,
}: {
  kicker?: string;
  /** Ceo naslov (kompatibilnost). Ignoriše se ako su dati `titleLead` + `titleHighlight`. */
  title: string;
  /**
   * v2: naslov u dva dela — `titleLead` + marker preko `titleHighlight`. Kad su oba data,
   * marker se iscrtava kad naslov uđe u kadar (`MarkerHighlight variant="view"`) i žuti potez
   * ispod (`underline`) se NE crta (da se ne dupla sa markerom).
   */
  titleLead?: string;
  titleHighlight?: string;
  /** Namerni prelom reda pre highlight-a (npr. planovi: „… —" pa u drugom redu „gotov rad"). */
  titleBreak?: boolean;
  body?: string;
  /**
   * `marketing` je zatečena marketinška skala i ostaje piksel-ista — marketing
   * stranice nisu tema UX run-a. `app` koristi tipografsku skalu iz `lib/type-scale.ts`
   * (`type-eyebrow` → `type-h1` → `type-body`), koja je zajednička svim app ekranima.
   */
  variant?: "marketing" | "app";
  /** Školski žuti potez ispod naslova — obrazac zaglavlja zone. */
  underline?: boolean;
  className?: string;
}) {
  const isApp = variant === "app";
  const hasMarker = Boolean(titleLead && titleHighlight);

  return (
    <div className={cn("max-w-3xl", className)} data-motion="copy">
      {kicker ? (
        <p className={isApp ? "type-eyebrow text-muted" : "font-display text-xl text-ink"}>{kicker}</p>
      ) : null}
      <h2
        className={
          isApp ? "mt-2 type-h1 text-ink" : "mt-2 text-3xl font-black leading-tight text-ink md:text-5xl"
        }
      >
        {hasMarker ? (
          <>
            {titleLead}
            {titleBreak ? <br /> : null}
            <MarkerHighlight variant="view">{titleHighlight}</MarkerHighlight>
          </>
        ) : (
          title
        )}
      </h2>
      {underline && !hasMarker ? <HandUnderline size={isApp ? "sm" : "md"} className="mt-1" /> : null}
      {body ? (
        <p className={isApp ? "mt-3 type-body type-measure text-muted" : "mt-4 text-base leading-7 text-muted md:text-lg"}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function HandUnderline({
  className,
  size = "md",
}: {
  className?: string;
  /**
   * `cn` je obično spajanje, ne tailwind-merge, pa pozivalac ne može pouzdano da pobedi
   * `h-5 w-56` svojom klasom — kao i kod `LinkButton`, veličinu bira komponenta.
   * `sm` je za zaglavlja unutar aplikacije, gde marketinška širina od 224px preplavi red.
   */
  size?: "md" | "sm";
}) {
  return (
    <svg
      aria-hidden="true"
      data-motion="scribble"
      viewBox="0 0 240 18"
      className={cn(size === "md" ? "h-5 w-56" : "h-3.5 w-40", "text-yellow", className)}
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
        className="stroke-ink"
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
      className="inline-flex min-w-0 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <Image
        src="/images/logos/logo-trimmed.png"
        alt="Nauči AI"
        width={1676}
        height={505}
        sizes="(min-width: 1024px) 150px, (min-width: 640px) 132px, 116px"
        className="h-9 w-auto max-w-[45vw] object-contain sm:h-10 lg:h-11 dark:hidden"
        priority
      />
      {/* Ink in the logo is baked into the PNG, so dark gets its own file (generated
          from logo.png with ink recoloured to the dark --ink; yellow untouched).
          Both are trimmed of the exported PNG's transparent padding so the mark fills
          the header height instead of floating in whitespace. */}
      <Image
        src="/images/logos/logo-trimmed-dark.png"
        alt="Nauči AI"
        width={1643}
        height={549}
        sizes="(min-width: 1024px) 150px, (min-width: 640px) 132px, 116px"
        className="hidden h-9 w-auto max-w-[45vw] object-contain sm:h-10 lg:h-11 dark:block"
        // Eager (not lazy): this one is display:none until a theme switch, and a lazy
        // image that only becomes visible later can leave the header without a logo.
        loading="eager"
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
