import { cn } from "@/components/ui/primitives";
import { nextLevel, surfaceClass, type SurfaceLevel } from "@/lib/surface";

/**
 * Trake Učionice i njen kostur žive van `classroom-hub.tsx` (IGRA K09): kostur uvozi
 * `app/[locale]/app/classroom/loading.tsx`, koji važi za SVAKU rutu ispod učionice
 * (kurs, lekcija, smer). Da je ostao u hub-u, ceo hub sa likovima i manifestom slika
 * ulazio bi u početni JS lekcije.
 */

/**
 * Ritam Učionice (N10): četiri pune trake koje se smenjuju po istom pravilu kao javne
 * strane (`lib/surface.ts`) i razdvajaju talasom (`SectionWave`), umesto niza panela
 * jedne iste boje. Nivo trake se prosleđuje karticama u njoj, pa kartica uvek uzme
 * SUPROTNU boju — bez toga bi `bg-paper-strong` bio identičan traci u jednoj od dve
 * teme (svetla: paper-strong = surface-a; tamna: paper-strong = surface-b).
 */
export const ZONE_RESUME: SurfaceLevel = 0;
export const ZONE_TRACKS: SurfaceLevel = 1;
export const ZONE_COURSES: SurfaceLevel = 0;
export const ZONE_UP_NEXT: SurfaceLevel = 1;

/** Bleed do ivica `<main>`-a: trake su pune širine sadržaja, ne kartice u koloni. */
export const ZONE_BLEED = "-mx-4 -mt-5 sm:-mx-6 md:-mx-8 md:-mt-8 -mb-[calc(4.5rem+env(safe-area-inset-bottom))] md:-mb-8";
/**
 * Poslednja traka sama nosi donji padding ljuske, jer ga `ZONE_BLEED` poništava da bi
 * traka išla do dna. Bez ovoga bi ispod poslednje trake ostala pruga u trećoj boji
 * (`--paper`), a na telefonu bi je pojela fiksna donja navigacija.
 */
export const LAST_ZONE_PB = "pb-[calc(4.5rem+env(safe-area-inset-bottom)+3.5rem)] md:pb-24";
export const ZONE_X = "px-4 sm:px-6 md:px-8";

/**
 * Kostur Ucionice dok traje upit. Ranije je ovde stajao `DashboardHomeSkeleton`, cije
 * su visine merene po komandnoj tabli (puls od cetiri plocice, mreza prozora) — na
 * Ucionici je to bio kostur ekrana koji se posle ne pojavi, pa je swap pomerao sve.
 * Ove visine prate stvarne trake: A „nastavi" · B smerovi · C katalog (2 kolone).
 */
export function ClassroomHubSkeleton() {
  return (
    <div className={cn(ZONE_BLEED, surfaceClass(ZONE_UP_NEXT))} aria-busy="true" aria-label="Učitavanje / Loading">
      <div className={cn("relative pb-14 pt-6 md:pb-20 md:pt-10", ZONE_X, surfaceClass(ZONE_RESUME))}>
        <div className="mx-auto max-w-6xl">
          {/* Visina reda sa pozdravom i Sovom (IGRA K09): 64 px na telefonu, 168 px od `lg`. */}
          <div className="flex h-16 items-end lg:h-[10.5rem]">
            <div className="h-7 w-56 max-w-full animate-pulse rounded-full bg-line" />
          </div>
          <div
            className={cn(
              "mt-6 h-[26rem] animate-pulse surface-card border-2 border-line lg:h-64",
              surfaceClass(nextLevel(ZONE_RESUME)),
            )}
          />
        </div>
      </div>
      <div className={cn("relative py-14 md:py-20", ZONE_X, surfaceClass(ZONE_TRACKS))}>
        <div className="mx-auto max-w-6xl">
          <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
          <div className="mt-8 flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={cn(
                  "h-44 w-56 shrink-0 animate-pulse surface-card border-2 border-line sm:w-64",
                  surfaceClass(nextLevel(ZONE_TRACKS)),
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className={cn("relative pt-14 md:pt-20", ZONE_X, LAST_ZONE_PB, surfaceClass(ZONE_COURSES))}>
        <div className="mx-auto max-w-6xl">
          <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={cn(
                  "h-[26rem] animate-pulse surface-card border-2 border-line",
                  surfaceClass(nextLevel(ZONE_COURSES)),
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
