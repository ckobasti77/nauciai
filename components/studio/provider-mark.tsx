import type { ReactNode } from "react";

import {
  familyMark,
  PROVIDER_BRAND_NAME,
  providerBrandOf,
  type ProviderBrand,
  type StudioModel,
} from "@/lib/studio-models";

export type { ProviderBrand } from "@/lib/studio-models";

/**
 * Monohromni znak firme koja pravi model (SP1, tačka 2). Ne zbog ukrasa - zbog
 * prepoznavanja: „Google" studentu znači nešto, „Nano Banana 2" ne znači ništa.
 *
 * Pravila (sva namerna, ne slučajna):
 *  - Inline SVG, bez ijednog `<img src>` ni CDN-a - sve je putanja u kodu, radi
 *    u build-u i runtime-u bez mreže.
 *  - Jedna boja, `fill="currentColor"` - isti znak radi u svetloj i tamnoj temi
 *    bez ijednog zakucanog heksa.
 *  - `viewBox="0 0 24 24"`, optička (ne geometrijska) normalizacija: svaki znak
 *    zauzima ~16 od 24 jedinice i cilja jednaku vizuelnu težinu.
 *  - Gde se logo NE može pošteno svesti na jednu siluetu, stoji čist geometrijski
 *    inicijal firme u istom stilu (odbrana po brendu u ODLUKAMA):
 *      • silueta: Google (prsten+prečka „G"), OpenAI (šestokraka rozeta),
 *        ElevenLabs (dve grede);
 *      • inicijal: ByteDance (B), Kling (K), MiniMax (M).
 *  - Bez ijedne tvrdnje o partnerstvu: znak kaže čiji je model i ništa više.
 */

/** Bold geometrijski inicijal u istom stilu kao siluete - za brend bez poštene siluete. */
function Monogram({ letter }: { letter: string }): ReactNode {
  return (
    <text
      x="12"
      y="12.5"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="17"
      fontWeight="900"
      fontFamily="var(--font-nunito, ui-sans-serif), system-ui, sans-serif"
      fill="currentColor"
    >
      {letter}
    </text>
  );
}

export const PROVIDER_MARKS: Record<ProviderBrand, ReactNode> = {
  // Google „G" u firminim bojama (4 luka + plava prečka). Jedini znak koji NIJE
  // `currentColor` - Google logo je u boji, i cita se na svetloj i tamnoj temi.
  google: (
    <g fill="none" strokeWidth="4.1" strokeLinecap="butt">
      <path stroke="#4285F4" d="M19.29 10.71 A7.4 7.4 0 0 0 12 4.6" />
      <path stroke="#EA4335" d="M12 4.6 A7.4 7.4 0 0 0 4.85 10.08" />
      <path stroke="#FBBC05" d="M4.85 10.08 A7.4 7.4 0 0 0 8.3 18.41" />
      <path stroke="#34A853" d="M8.3 18.41 A7.4 7.4 0 0 0 17.23 17.23" />
      <rect fill="#4285F4" stroke="none" x="11.6" y="9.95" width="7.8" height="4.1" rx="0.4" />
    </g>
  ),
  // OpenAI: šestokraka rozeta - poštena apstrakcija „cveta", ne pogađanje čvora.
  openai: (
    <g fill="currentColor">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse key={deg} cx="12" cy="7.5" rx="2.2" ry="3.7" transform={`rotate(${deg} 12 12)`} />
      ))}
    </g>
  ),
  // ByteDance: čist inicijal (korporativni logo se ne svodi pošteno na siluetu).
  bytedance: <Monogram letter="B" />,
  // Kling: čist inicijal.
  kling: <Monogram letter="K" />,
  // MiniMax: čist inicijal.
  minimax: <Monogram letter="M" />,
  // ElevenLabs: dve uspravne grede - njihov stvaran znak, verna silueta.
  elevenlabs: (
    <g fill="currentColor">
      <rect x="6.4" y="4" width="4" height="16" rx="1.1" />
      <rect x="13.6" y="4" width="4" height="16" rx="1.1" />
    </g>
  ),
};

export function ProviderMark({
  brand,
  size = 18,
  className,
}: {
  brand: ProviderBrand;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={PROVIDER_BRAND_NAME[brand]}
      className={className}
    >
      {PROVIDER_MARKS[brand]}
    </svg>
  );
}

/**
 * Znak modela: firmin znak ako je familija mapirana, inače dvoslovni `familyMark`
 * kao rezerva (SP1, tačka 2 - rezerva ostaje, ne briše se). Sve u `currentColor`,
 * ista kolona, bez okvira - da cela vertikala spiska bude poravnata.
 */
export function ModelMark({
  model,
  size = 18,
  className,
}: {
  model: Pick<StudioModel, "family">;
  size?: number;
  className?: string;
}) {
  const brand = providerBrandOf(model);
  if (brand) return <ProviderMark brand={brand} size={size} className={className} />;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={model.family}
      className={className}
    >
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10"
        fontWeight="900"
        fontFamily="var(--font-nunito, ui-sans-serif), system-ui, sans-serif"
        fill="currentColor"
      >
        {familyMark(model as StudioModel)}
      </text>
    </svg>
  );
}
