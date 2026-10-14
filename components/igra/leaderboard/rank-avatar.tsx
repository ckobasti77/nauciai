import { initialsFromName } from "@/components/app/community-identity";
import { IgraArt } from "@/components/igra/igra-art";
import { LevelRing } from "@/components/igra/level-ring";
import { cn } from "@/components/ui/primitives";
import type { RankMedal } from "@/lib/igra-a11y";
import type { IgraArtId } from "@/lib/igra-art";

const MEDAL_ART = { zlato: "rang.zlato", srebro: "rang.srebro", bronza: "rang.bronza" } as const satisfies Record<RankMedal, IgraArtId>;

/**
 * Krug avatara, oreol prstena (krug + 12 px) i medalja prikačena dole desno. Podijum je
 * red na telefonu i stub od `md`, pa njegove veličine rastu sa prelomom (medalja kroz
 * `scale`, jer nalepnica nosi širinu u stilu).
 */
const SIZE = {
  sm: { box: "size-10 text-xs", ring: "size-[3.25rem]", medal: 24, medalBox: "" },
  podium: { box: "size-12 text-sm md:size-16 md:text-base", ring: "size-[3.75rem] md:size-[4.75rem]", medal: 40, medalBox: "scale-75 md:scale-100" },
  podiumFirst: { box: "size-12 text-sm md:size-20 md:text-lg", ring: "size-[3.75rem] md:size-[5.75rem]", medal: 44, medalBox: "scale-[0.65] md:scale-100" },
} as const;

/**
 * Avatar na rang listi (K12): krug sa slikom ili inicijalima, prsten nivoa kad je nivo
 * poznat (`levelProgress`, 0..1 kroz tekući nivo) i medalja za prva tri mesta. Prsten se
 * crta preko kutije (oreol), pa krug ne menja veličinu ni mesto kad prstena nema.
 * Dekorativan je: ime i mesto izgovara red koji ga nosi.
 */
export function RankAvatar({
  name,
  avatarUrl,
  size = "sm",
  levelProgress,
  medal,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE;
  /** Bez vrednosti nema prstena (nivo nije poznat iz reda liste). */
  levelProgress?: number;
  medal?: RankMedal | null;
  className?: string;
}) {
  const dims = SIZE[size];
  return (
    <span aria-hidden="true" className={cn("relative inline-grid shrink-0 place-items-center", className)}>
      {levelProgress === undefined ? null : <LevelRing progress={levelProgress} size={64} stroke={3} className={dims.ring} />}
      <span className={cn("grid place-items-center overflow-hidden rounded-full border-2 border-ink bg-yellow font-black text-ink", dims.box)}>
        {avatarUrl ? (
          /* Adrese avatara su korisničke (runtime), namerno bez ograničenja domena `next/image`. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        ) : (
          initialsFromName(name)
        )}
      </span>
      {medal ? (
        <span className={cn("absolute -bottom-1.5 -right-2.5 origin-bottom-right", dims.medalBox)}>
          <IgraArt id={MEDAL_ART[medal]} size={dims.medal} decorative />
        </span>
      ) : null}
    </span>
  );
}
