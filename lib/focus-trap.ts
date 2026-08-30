/**
 * Odluka Tab zamke u modalu, izdvojena iz `useModalFocus`
 * (`components/ui/dialog.tsx`) kao cista funkcija.
 *
 * Zasto izdvojeno: sama zamka barata `document`-om i `focus()`-om, pa se ne moze
 * proveriti u ovom test okruzenju (vitest radi u `edge-runtime`, bez DOM-a).
 * Pravilo o tome KO dobija fokus na Tab je, medjutim, cista aritmetika nad
 * indeksima - i bas je ono sto lako tiho pukne pri refaktoru. Zato je ovde,
 * sa testovima u `lib/focus-trap.test.ts`.
 *
 * Ponasanje je istovetno originalu iz `member-profile.tsx`.
 */
export type TabTrapAction =
  /** Nema nijedne fokusabilne kontrole - fokus ide na sam okvir modala. */
  | { kind: "container" }
  /** Fokus se prebacuje na kontrolu sa ovim indeksom (obilazak kruga). */
  | { kind: "focus"; index: number }
  /** Tab ostaje pregledacu - fokus je usred prstena i ne treba ga dirati. */
  | { kind: "native" };

export function tabTrapAction({
  count,
  activeIndex,
  activeInside,
  shiftKey,
}: {
  /** Broj vidljivih fokusabilnih kontrola u modalu. */
  count: number;
  /** Indeks trenutno fokusiranog elementa u toj listi, ili -1 ako ga nema. */
  activeIndex: number;
  /** Da li je trenutni fokus uopste unutar modala. */
  activeInside: boolean;
  shiftKey: boolean;
}): TabTrapAction {
  if (count <= 0) return { kind: "container" };

  // Shift+Tab sa prve kontrole ide na poslednju. Isto vazi i kad je fokus nekako
  // ispao iz modala: vraca se unutra, na poslednju kontrolu.
  if (shiftKey && (activeIndex === 0 || !activeInside)) return { kind: "focus", index: count - 1 };

  // Tab sa poslednje kontrole ide na prvu.
  if (!shiftKey && activeIndex === count - 1) return { kind: "focus", index: 0 };

  return { kind: "native" };
}
