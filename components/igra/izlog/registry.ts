import type { ComponentType } from "react";

import { IzlogPokret } from "@/components/igra/izlog/izlog-pokret";
import { IzlogPrimitivi } from "@/components/igra/izlog/izlog-primitivi";
import { IzlogSlike } from "@/components/igra/izlog/izlog-slike";
import type { IgraFixtureId } from "@/lib/igra-fixtures";
import type { Locale, LocalizedText } from "@/lib/i18n";

/**
 * Delovi izloga (`/igra-izlog?deo=<id>`). Korak koji donosi novu površinu dodaje svoj fajl
 * `izlog-<deo>.tsx` i jedan red ovde; stranica se ne dira. Svaki deo dobija jezik i
 * izabranog test korisnika (`?stanje=`), a prvi u nizu je podrazumevan.
 */
export type IzlogPart = {
  id: string;
  label: LocalizedText;
  Part: ComponentType<{ locale: Locale; stanje: IgraFixtureId }>;
};

export const IZLOG_PARTS: readonly IzlogPart[] = [
  { id: "slike", label: { sr: "Slike i tokeni", en: "Images and tokens" }, Part: IzlogSlike },
  { id: "pokret", label: { sr: "Pokret i 3D", en: "Motion and 3D" }, Part: IzlogPokret },
  { id: "primitivi", label: { sr: "Primitivi", en: "Primitives" }, Part: IzlogPrimitivi },
];
