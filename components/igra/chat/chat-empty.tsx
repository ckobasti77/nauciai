"use client";

import { BookOpenCheck, Inbox, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/primitives";
import { IgraArt } from "@/components/igra/igra-art";
import { IgraLik } from "@/components/igra/igra-lik";
import { IGRA_MESSAGES_COPY } from "@/lib/igra-copy";
import { t, withLocale, type Locale } from "@/lib/i18n";
import type { IgraPoza } from "@/lib/igra-art";

/**
 * Prazna stanja poruka (K18), prezentaciona: tekstovi su isti kao pre, dobili su samo
 * ilustraciju. Razgovor, lista i pretraga ne menjaju visinu ničega što se već crta jer
 * ilustracija stoji u praznoj kutiji koja i inače popunjava svoj prostor.
 */

/** Desna strana kad nijedan razgovor nije izabran (samo od `lg`, na telefonu je sakrivena). */
export function MessagesPickEmpty({ locale, onFindPartner }: { locale: Locale; onFindPartner: () => void }) {
  return (
    <EmptyState
      className="h-full flex-1"
      icon={BookOpenCheck}
      art={<IgraArt id="prazno.poruke" size={160} decorative />}
      title={t(locale, "Ovde se otvaraju tvoji razgovori", "Your conversations open here")}
      body={t(locale, "Klikni na razgovor sa liste sa leve strane. Ako lista još nema nikoga, prvo pronađi nekoga sa kim ćeš da učiš.", "Click a conversation in the list on the left. If the list is still empty, first find someone to study with.")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" icon={<Sparkles className="size-4" />} onClick={onFindPartner}>{t(locale, "Pronađi partnera", "Find a partner")}</Button>
          <LinkButton href={withLocale(locale, "/app/community/members")} tone="paper"><Users className="size-4" />{t(locale, "Pregledaj članove", "Browse members")}</LinkButton>
        </div>
      }
    />
  );
}

/**
 * Prazna lista razgovora. Na telefonu je to jedini prazan ekran, pa nosi `prazno.poruke`;
 * od `lg` desna strana već crta tu sliku, pa lista ima Eha da se ista slika ne ponovi dva puta.
 */
export function InboxEmpty({ locale, onStart, onFindPartner }: { locale: Locale; onStart: () => void; onFindPartner: () => void }) {
  return (
    <EmptyState
      className="min-h-52"
      icon={Inbox}
      art={
        <>
          <span className="lg:hidden"><IgraArt id="prazno.poruke" size={120} decorative /></span>
          <span className="hidden lg:inline"><IgraLik lik="eho" poza="mase" size="lg" decorative /></span>
        </>
      }
      title={t(locale, "Ovde je za sada mirno.", "It is quiet here for now.")}
      body={t(locale, "Nemaš nijedan razgovor. Započni prvi ili pronađi nekoga s kim ćeš učiti.", "You have no conversations yet. Start the first one, or find someone to study with.")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onStart}>{t(locale, "Započni razgovor", "Start a conversation")}</Button>
          <Button variant="secondary" size="sm" onClick={onFindPartner}>{t(locale, "Pronađi partnera", "Find a study partner")}</Button>
        </div>
      }
    />
  );
}

/** Pretraga ljudi i razgovora bez rezultata. */
export function InboxSearchEmpty({ locale, onStart, onFindPartner }: { locale: Locale; onStart: () => void; onFindPartner: () => void }) {
  return (
    <EmptyState
      className="min-h-52"
      icon={Inbox}
      art={<IgraArt id="prazno.pretraga" size="lg" decorative />}
      title={t(locale, "Nema nikoga za ovu pretragu", "Nothing matches this search")}
      body={t(locale, "Nijedan razgovor ni član ne odgovara onome što si upisao/la. Obriši reč iz pretrage ili kreni od nekog novog.", "No conversation or member matches what you typed. Clear the search word, or start with someone new.")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onStart}>{t(locale, "Započni razgovor", "Start a conversation")}</Button>
          <Button variant="secondary" size="sm" onClick={onFindPartner}>{t(locale, "Pronađi partnera", "Find a study partner")}</Button>
        </div>
      }
    />
  );
}

/** Otvoren razgovor bez ijedne poruke: Eho i jedna ohrabrujuća rečenica. */
export function ThreadEmpty({ locale }: { locale: Locale }) {
  return (
    <div className="grid min-h-48 place-items-center text-center">
      <div>
        <IgraLik lik="eho" poza="mase" size="md" decorative />
        <p className="mt-3 type-h4 text-ink">{t(locale, "Pošalji prvu poruku.", "Send the first message.")}</p>
        <p className="mt-1 type-body-sm font-semibold text-muted">{IGRA_MESSAGES_COPY.threadEmptyHint[locale]}</p>
      </div>
    </div>
  );
}

/** Ilustracija praznih stanja „Uči zajedno": Sova, jedna za ceo prazan okvir. */
export function StudyEmptyArt({ poza = "mase" }: { poza?: IgraPoza }) {
  return <IgraLik lik="sova" poza={poza} size="md" decorative />;
}
