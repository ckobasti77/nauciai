import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { PlanRobot } from "@/components/marketing/plan-robot";
import { Badge } from "@/components/ui/badge";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { marketingContent, type Locale } from "@/lib/i18n";
import type { PlatformPricing } from "@/lib/platform-settings";

/**
 * Kartice planova Basic/Premium — deljene između sekcije „#pricing" na landingu i
 * javne strane pretplate (N6). Izdvojene da obe strane imaju IDENTIČNE kartice
 * (geometrija robota, žuto ostrvo cene, bedž, dugmad) bez dupliranja markupa.
 *
 * Dve stvari koje pozivalac mora da obezbedi:
 *   · kartice stoje na površini A (sekcija nivo 0) — paneli su nivo 1, jer robot ima
 *     UPEČENU #F4F0E8 (surface-b) pozadinu, pa `paper-island` drži karticu krem i u
 *     tamnoj temi;
 *   · pretka sa `id="pricing"` — `PlanRobot` preko njega sinhronizuje početak petlje
 *     oba robota (jedan IntersectionObserver za obe kartice, da fazni pomak ostane).
 *
 * Spisak stavki NIJE ovde: landing šalje kratak (`marketingContent.pricing`), strana
 * pretplate duži (`pricingPageContent.plans`). „%CREDITS%" u Premium spisku se ovde
 * zamenjuje brojem kredita iz baze.
 */
export function PlanCards({
  locale,
  pricing,
  premiumCredits,
  basicFeatures,
  premiumFeatures,
  basicHref,
  premiumHref,
}: {
  locale: Locale;
  /** Cene iz `platformSettings` (N1), već razrešene kroz `resolveSettings`. */
  pricing: PlatformPricing;
  /** Broj Studio kredita uz Premium; `null` → tekst bez broja. */
  premiumCredits: number | null;
  basicFeatures: readonly string[];
  /** Stavka „%CREDITS%" se zamenjuje brojem kredita iz baze. */
  premiumFeatures: readonly string[];
  basicHref: string;
  premiumHref: string;
}) {
  const m = marketingContent[locale];
  const creditsLine =
    premiumCredits != null
      ? m.pricing.premium.creditsWithNumber.replace("{n}", String(premiumCredits))
      : m.pricing.premium.creditsNoNumber;
  const premiumItems = premiumFeatures.map((item) => (item === "%CREDITS%" ? creditsLine : item));

  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      {/* BASIC — standardni panel (površina B → robot #F4F0E8 bešavno). Robot lebdi u
          desnoj trećini; tekst se sklanja levo (`lg:pr-[38%]`), donjih 16% je dugme
          (van robota). */}
      {/* `paper-island`: kartica ostaje krem (#F4F0E8 = surface-b svetli) i u TAMNOJ temi,
          jer robot ima UPEČENU #F4F0E8 pozadinu — da ne ostane svetao pravougaonik oko
          robota na tamnoj kartici. Tekst/tokeni se razrešavaju na svetle (čitljivi). */}
      <Panel level={1} className="paper-island relative flex flex-col p-6 sm:p-8">
        <PlanRobot
          mp4Src="/images/landing/plan-basic-loop.mp4"
          posterSrc="/images/landing/plan-basic-poster.webp"
          phase={0}
          className="right-[1cm] top-3 h-[132px] w-[100px] lg:right-[1cm] lg:top-0 lg:bottom-[16%] lg:h-auto lg:w-[36%]"
        />
        <h3 className="pr-24 text-2xl font-black leading-tight text-ink lg:pr-[calc(38%_+_1cm)]">
          {m.pricing.basic.name}
        </h3>
        <div className="mt-6 flex items-end gap-2 pr-24 lg:pr-[calc(38%_+_1cm)]">
          <span className="text-5xl font-black tabular-nums text-ink">{pricing.basicEur}</span>
          <span className="pb-2 text-base font-extrabold text-muted">EUR / {m.pricing.perMonth}</span>
        </div>
        <ul className="mt-7 flex flex-col gap-2 text-base font-bold leading-7 text-muted lg:pr-[calc(38%_+_1cm)]">
          {basicFeatures.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-7">
          <LinkButton href={basicHref} tone="paper" size="lg" className="w-full">
            {m.pricing.basic.cta}
            <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </Panel>

      {/* PREMIUM — istaknut: „Najpopularnije" badge, žuto ostrvo za cenu, jača senka. */}
      <Panel
        level={1}
        className="paper-island relative flex flex-col p-6 shadow-[8px_8px_0_0_var(--shadow-hard-20)] sm:p-8"
      >
        {/* Robot pre bedža u DOM-u → bedž se crta IZNAD njega. Pomeren malo naviše
            (−0.5cm) i vraćen udesno (net 1.2cm od desne ivice) po dopuni. */}
        <PlanRobot
          mp4Src="/images/landing/plan-premium-loop.mp4"
          posterSrc="/images/landing/plan-premium-poster.webp"
          phase={0.7}
          className="right-[1.2cm] top-[calc(2rem_-_0.5cm)] h-[132px] w-[100px] lg:right-[1.2cm] lg:top-[calc(2.5rem_-_0.5cm)] lg:bottom-[16%] lg:h-auto lg:w-[36%]"
        />
        <Badge
          tone="yellow"
          icon={<Sparkles className="size-3.5" />}
          className="absolute -top-3 right-6 z-10 shadow-[2px_2px_0_0_var(--ink)]"
        >
          {m.pricing.popular}
        </Badge>
        <h3 className="pr-24 text-2xl font-black leading-tight text-ink lg:pr-[calc(38%_+_1.2cm)]">
          {m.pricing.premium.name}
        </h3>
        <div className="mt-6 inline-flex w-fit items-end gap-2 rounded-[12px] border-2 border-ink bg-yellow px-4 py-2 shadow-[3px_3px_0_0_var(--ink)]">
          <span className="text-5xl font-black tabular-nums text-ink">{pricing.premiumEur}</span>
          <span className="pb-1 text-base font-extrabold text-ink">EUR / {m.pricing.perMonth}</span>
        </div>
        <ul className="mt-7 flex flex-col gap-2 text-base font-bold leading-7 text-muted lg:pr-[calc(38%_+_1.2cm)]">
          {premiumItems.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-7">
          <LinkButton href={premiumHref} tone="yellow" size="lg" className="w-full">
            {m.pricing.premium.cta}
            <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </Panel>
    </div>
  );
}
