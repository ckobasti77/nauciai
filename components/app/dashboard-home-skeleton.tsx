/**
 * Kostur komandne table (IGRA K28). Živi van `dashboard-content.tsx` jer ga uvozi
 * `app/[locale]/app/loading.tsx`, koji važi za SVAKU rutu ispod `/app`: sa kosturom u
 * `dashboard-content` ceo taj modul (katalog kurseva, rich text, video petlja, dijalozi)
 * ulazio je u početni JS zajednice, poruka, profila i ostalih ruta. Fajl nije klijentski
 * modul: `loading.tsx` ga crta na serveru, bez klijentskog JS-a.
 */

// Rendered while the Convex query is in flight. Previously this window rendered the static
// marketing courses from lib/content with progress: undefined, so a student mid-course saw
// "0%" and CTAs pointing at fallback lesson slugs before the real data swapped in.
export function DashboardHomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Učitavanje / Loading">
      {/* Heights track the loaded layout so the swap does not shift anything below it.
          HEROJ · NAPREDAK · PULS (4 tile-a) · BEDŽEVI + CREA · PROZORI (grid) · KALENDAR. */}
      <div className="h-[38.5rem] animate-pulse surface-card border-2 border-line bg-paper-strong sm:h-[36rem] xl:h-[27.5rem] min-[1400px]:h-[25.25rem]" />
      <div className="h-[21.5rem] animate-pulse surface-card border-2 border-line bg-paper-strong sm:h-64 lg:h-[9.25rem]" />
      <DashboardPulseSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="h-[15.25rem] animate-pulse surface-card border-2 border-line bg-paper-strong" />
        ))}
      </div>
      <DashboardWindowsSkeleton />
      <div className="h-[23.5rem] animate-pulse surface-card border-2 border-line bg-paper-strong xl:h-64" />
    </div>
  );
}

/** Skelet pulsa (4 pločice) - isti u skeletu cele table i dok tabla čeka upit. */
export function DashboardPulseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-[5.9375rem] animate-pulse surface-card border-2 border-line bg-paper-strong" />
      ))}
    </div>
  );
}

/** Skelet mreže prozora: šest prozora, koliko tabla ima (bez admin para). */
export function DashboardWindowsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="h-[26rem] animate-pulse surface-card border-2 border-line bg-paper-strong" />
      ))}
    </div>
  );
}
