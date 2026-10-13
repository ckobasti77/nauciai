import {
  Award,
  Banknote,
  Bell,
  BookOpen,
  Bot,
  Brush,
  CircleArrowUp,
  Clapperboard,
  Clock,
  Code2,
  Coins,
  Crown,
  FileText,
  Flame,
  Gem,
  GraduationCap,
  Hourglass,
  Inbox,
  LifeBuoy,
  Lightbulb,
  Lock,
  MapPinOff,
  Medal,
  MessageCircle,
  MessagesSquare,
  Mic,
  Palette,
  PartyPopper,
  Receipt,
  SearchX,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  User,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

import type { IgraArtKind, IgraLik } from "@/lib/igra-art";

/**
 * Ikona koja stoji u krem krugu dok slika ne stigne (K02). Bira se po ID-ju; ID bez
 * svog reda dobija ikonu vrste. Nijedna od ovih nije ilustracija - samo znak da tu
 * dolazi nalepnica, da prazno mesto ne izgleda kao greška.
 */
const BY_LIK: Record<IgraLik, LucideIcon> = {
  robi: Bot,
  piksi: Brush,
  kadar: Clapperboard,
  eho: Mic,
  bajt: Code2,
  sova: GraduationCap,
  iskra: Lightbulb,
};

const BY_ID: Record<string, LucideIcon> = {
  "rang.zlato": Medal,
  "rang.srebro": Medal,
  "rang.bronza": Medal,
  "rang.pehar": Trophy,
  "rang.kruna": Crown,
  "rang.plamen": Flame,
  "rang.xp": Gem,
  "rang.meta": Target,
  "scena.nivo-gore": CircleArrowUp,
  "scena.kurs-zavrsen": PartyPopper,
  "prazno.kursevi": BookOpen,
  "prazno.objave": MessageCircle,
  "prazno.poruke": MessagesSquare,
  "prazno.obavestenja": Bell,
  "prazno.radovi": Palette,
  "prazno.pretraga": SearchX,
  "prazno.greska": TriangleAlert,
  "prazno.404": MapPinOff,
  "prazno.ucitavanje": Hourglass,
  "prazno.offline": WifiOff,
  "prazno.zakljucano": Lock,
  "prazno.uskoro": Clock,
  "admin.korisnici": Users,
  "admin.prihod": Banknote,
  "admin.generacije": Sparkles,
  "admin.troskovi": Receipt,
  "admin.moderacija": ShieldCheck,
  "admin.sadrzaj": FileText,
  "admin.zajednica": MessageCircle,
  "admin.sistem": Server,
  "ikona.ucionica": GraduationCap,
  "ikona.crea": Palette,
  "ikona.zajednica": MessageCircle,
  "ikona.poruke": MessagesSquare,
  "ikona.profil": User,
  "ikona.krediti": Coins,
  "ikona.pomoc": LifeBuoy,
  "ikona.podesavanja": Settings,
};

const BY_KIND: Partial<Record<IgraArtKind, LucideIcon>> = {
  lik: Bot,
  bedz: Award,
  rang: Medal,
  "scena-nalepnica": Sparkles,
  prazno: Inbox,
  admin: Server,
  ikona: Sparkles,
};

function iconFor(id: string, kind: IgraArtKind): LucideIcon {
  // Sve poze jednog lika dele ikonu: drugi segment ID-ja je ime lika.
  const byLik: Record<string, LucideIcon | undefined> = BY_LIK;
  const lik = kind === "lik" ? byLik[id.split(".")[1] ?? ""] : undefined;
  return lik ?? BY_ID[id] ?? BY_KIND[kind] ?? Sparkles;
}

export function IgraFallbackIcon({ id, kind, className }: { id: string; kind: IgraArtKind; className?: string }) {
  return createElement(iconFor(id, kind), { className, strokeWidth: 2.25, "aria-hidden": true });
}
