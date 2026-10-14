import type { ComponentType } from "react";

import { IzlogCrea } from "@/components/igra/izlog/izlog-crea";
import { IzlogLjuska } from "@/components/igra/izlog/izlog-ljuska";
import { IzlogMapa } from "@/components/igra/izlog/izlog-mapa";
import { IzlogPoruke } from "@/components/igra/izlog/izlog-poruke";
import { IzlogPokret } from "@/components/igra/izlog/izlog-pokret";
import { IzlogPrimitivi } from "@/components/igra/izlog/izlog-primitivi";
import { IzlogProfil } from "@/components/igra/izlog/izlog-profil";
import { IzlogRang } from "@/components/igra/izlog/izlog-rang";
import { IzlogSlike } from "@/components/igra/izlog/izlog-slike";
import { IzlogTabla } from "@/components/igra/izlog/izlog-tabla";
import { IzlogUcionica } from "@/components/igra/izlog/izlog-ucionica";
import { IzlogZajednica } from "@/components/igra/izlog/izlog-zajednica";
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
  { id: "ljuska", label: { sr: "Ljuska aplikacije", en: "App shell" }, Part: IzlogLjuska },
  { id: "tabla", label: { sr: "Kontrolna tabla", en: "Dashboard" }, Part: IzlogTabla },
  { id: "ucionica", label: { sr: "Učionica", en: "Classroom" }, Part: IzlogUcionica },
  { id: "mapa", label: { sr: "Mapa puta", en: "Journey map" }, Part: IzlogMapa },
  { id: "zajednica", label: { sr: "Zajednica", en: "Community" }, Part: IzlogZajednica },
  { id: "rang", label: { sr: "Rang lista", en: "Leaderboard" }, Part: IzlogRang },
  { id: "profil", label: { sr: "Profil", en: "Profile" }, Part: IzlogProfil },
  { id: "crea", label: { sr: "Crea", en: "Crea" }, Part: IzlogCrea },
  { id: "poruke", label: { sr: "Poruke", en: "Messages" }, Part: IzlogPoruke },
];
