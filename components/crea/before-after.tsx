/* eslint-disable @next/next/no-img-element -- potpisani Convex URL-ovi u punoj rezoluciji, kao i ostatak detalja rada. */
"use client";

import { ReactCompareSlider, ReactCompareSliderHandle } from "react-compare-slider";

/**
 * Pre/posle (K05, S25): stara i nova slika jedna preko druge, sa ručkom između.
 * Učitava se samo kroz `dynamic` iz detalja rada i samo kad su i roditelj i dete
 * slike. Paket sam gasi prelaz ručke za `prefers-reduced-motion` i daje tastaturu
 * (strelice) na ručki.
 */
export default function BeforeAfter({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  label,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  label: string;
}) {
  const image = "block max-h-[560px] w-full object-contain";
  return (
    <div className="relative w-full p-2">
      <ReactCompareSlider
        aria-label={label}
        keyboardIncrement="5%"
        className="surface-media"
        handle={
          // `paper-island`: žuta ručka nosi mastilo svetle teme i u tamnoj (isti mehanizam kao `.bg-yellow`).
          <div className="paper-island h-full">
            <ReactCompareSliderHandle
              buttonStyle={{
                background: "var(--yellow)",
                color: "var(--ink)",
                border: "2px solid var(--ink)",
                backdropFilter: "none",
                boxShadow: "2px 2px 0 0 var(--ink)",
              }}
              linesStyle={{ background: "var(--yellow)", width: 3 }}
            />
          </div>
        }
        itemOne={<img src={beforeUrl} alt={beforeLabel} className={image} />}
        itemTwo={<img src={afterUrl} alt={afterLabel} className={image} />}
      />
      <span className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 text-xs font-black text-ink">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink">
        {afterLabel}
      </span>
    </div>
  );
}
