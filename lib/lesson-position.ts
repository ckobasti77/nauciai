/**
 * „Gde sam?" — pozicija lekcije u kursu i pozicija koraka u lekciji.
 *
 * Spisak lekcija u sidebar-u je do sada aktivnu lekciju oznacavao samo zutom
 * podlogom reda. To kaze KOJA je lekcija otvorena, ali ne i GDE je student u kursu:
 * da li je na drugoj od osam ili na osmoj od osam. Za pocetnika je bas taj drugi
 * podatak ono sto smiruje („ostalo je jos malo"), pa marker mora da nosi i broj.
 *
 * Isti racun radi i unutar lekcije: sadrzajni blokovi su „koraci", pa svaki dobija
 * „Korak 2 od 5" umesto da bude bezimeni pasus u nizu.
 *
 * Ovde nema ni React-a ni Convex-a — samo pozicija i gotov srpski/engleski tekst,
 * po uzoru na `lib/progress-encouragement.ts`.
 */

export type LessonPositionInput = { slug: string };

export type LessonPosition = {
  /** Redni broj, 1-based — broj koji se ispisuje korisniku. */
  position: number;
  /** Koliko ih ukupno ima. */
  total: number;
};

/**
 * Pozicija lekcije u vec poredjanom spisku.
 *
 * Vraca `null` kad pozicije nema — prazan spisak, nema aktivne lekcije (student je
 * na stranici kursa, ne u lekciji) ili slug koji u spisku ne postoji (lekcija je u
 * medjuvremenu skinuta). U svim tim slucajevima marker se NE crta; izmisljena
 * pozicija je gora od nikakve.
 */
export function lessonPosition(
  lessons: readonly LessonPositionInput[],
  currentSlug?: string,
): LessonPosition | null {
  if (!currentSlug || lessons.length === 0) return null;
  const index = lessons.findIndex((lesson) => lesson.slug === currentSlug);
  if (index < 0) return null;
  return { position: index + 1, total: lessons.length };
}

/** „Lekcija 3 od 8" — kontekst uz aktivan red u spisku lekcija. */
export function lessonPositionLabel(locale: "sr" | "en", { position, total }: LessonPosition): string {
  return locale === "sr" ? `Lekcija ${position} od ${total}` : `Lesson ${position} of ${total}`;
}

/** „Korak 2 od 5" — etiketa iznad jednog sadrzajnog bloka u lekciji. */
export function lessonStepLabel(locale: "sr" | "en", position: number, total: number): string {
  return locale === "sr" ? `Korak ${position} od ${total}` : `Step ${position} of ${total}`;
}
