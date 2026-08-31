/**
 * Traka ishoda (Faza 2). Dve identične kopije liste u `.marquee-track` daju bešavnu petlju
 * (CSS pomera za -50%); pauza na hover/focus, ugašena uz reduced-motion — sve u globals.css.
 * `bg-yellow` je žuto ostrvo pa `text-ink` čita tamnoplavo u obe teme; `font-display` daje
 * rukom pisan ton. Druga kopija je `aria-hidden` da čitač ekrana ne čita ishode dvaput.
 */
export function OutcomeMarquee({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <div
      className="marquee-viewport relative overflow-hidden border-y-2 border-ink bg-yellow"
      aria-label={label}
    >
      <div className="marquee-track flex w-max items-center">
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-hidden={copy === 1 ? true : undefined}
            className="flex w-max shrink-0 items-center"
          >
            {items.map((item, index) => (
              <li
                key={`${copy}-${index}`}
                className="flex shrink-0 items-center whitespace-nowrap font-display text-2xl text-ink sm:text-3xl"
              >
                <span className="px-5 py-3 sm:px-7">{item}</span>
                <span aria-hidden="true" className="text-ink/40">
                  ✳
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
