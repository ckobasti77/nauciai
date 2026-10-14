"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";

import { ChatMotionScope } from "@/components/app/chat/chat-motion";
import { InboxEmpty, InboxSearchEmpty, MessagesPickEmpty, StudyEmptyArt, ThreadEmpty } from "@/components/igra/chat/chat-empty";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import type { IgraFixtureId } from "@/lib/igra-fixtures";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „poruke" (K18): PRAVA prazna stanja četa (`components/igra/chat/chat-empty.tsx`)
 * i obrazac mikrointerakcija. Pravi čet čita Convex, pa je baloniće ovde sklopio izlog od
 * istih `data-chat-motion` atributa koje čita `ChatMotionScope`. Test korisnik se ovde ne
 * menja: prazna stanja ne zavise od njega.
 */

type DemoItem = { id: number; mine: boolean; text: string; reactions: string[] };

const noop = () => undefined;

function Bubble({ item, onReact }: { item: DemoItem; onReact: (id: number) => void }) {
  return (
    <article
      data-chat-motion="bubble"
      data-chat-motion-new="true"
      data-chat-motion-direction={item.mine ? "right" : "left"}
      className={cn("flex max-w-[88%] flex-col", item.mine ? "ml-auto items-end" : "mr-auto items-start")}
    >
      <p className={cn("surface-card border-2 border-ink px-4 py-3 type-body-sm font-semibold text-ink", item.mine ? "bg-yellow" : "bg-paper-strong")}>{item.text}</p>
      <div className="mt-1 flex min-h-7 flex-wrap items-center gap-1">
        {item.reactions.map((emoji) => (
          <span key={emoji} data-chat-motion="reaction" data-chat-motion-new="true" className="rounded-full border border-line bg-paper-strong px-2 py-0.5 type-caption font-black">
            {emoji} <span className="font-mono">1</span>
          </span>
        ))}
        {item.reactions.length ? null : (
          <button type="button" onClick={() => onReact(item.id)} className="rounded-full border border-line bg-paper px-2 py-0.5 type-caption font-black text-muted">
            👍
          </button>
        )}
        {item.mine ? <Check className="size-3.5 text-muted" aria-hidden="true" /> : null}
      </div>
    </article>
  );
}

function MikroInterakcije({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<DemoItem[]>([{ id: 0, mine: false, text: t(locale, "Imaš li pet minuta za domaći iz prompta?", "Do you have five minutes for the prompt homework?"), reactions: [] }]);

  function add(mine: boolean) {
    setItems((current) => [...current, { id: current.length, mine, text: mine ? t(locale, "Naravno, kreni.", "Of course, go ahead.") : t(locale, "Super, hvala ti!", "Great, thank you!"), reactions: [] }]);
  }

  function react(id: number) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, reactions: ["👍"] } : item)));
  }

  return (
    <div className="max-w-md">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<Send className="size-4" />} onClick={() => add(true)}>{t(locale, "Pošalji", "Send")}</Button>
        <Button size="sm" variant="secondary" onClick={() => add(false)}>{t(locale, "Stiglo je", "One arrives")}</Button>
      </div>
      <ChatMotionScope sceneKey="izlog-poruke" className="h-72 space-y-2 overflow-y-auto surface-card border border-line bg-paper p-4">
        {items.map((item) => (
          <Bubble key={item.id} item={item} onReact={react} />
        ))}
      </ChatMotionScope>
    </div>
  );
}

export function IzlogPoruke({ locale }: { locale: Locale; stanje: IgraFixtureId }) {
  return (
    <div className="space-y-8">
      <IzlogSection
        id="prazna-stanja"
        title={t(locale, "Prazna stanja", "Empty states")}
        note={t(
          locale,
          "Isti tekstovi kao pre, samo sa ilustracijom. Desno je strana bez izabranog razgovora (od 1024 px); lista je prazna, pa ona nosi Eha, a na telefonu `prazno.poruke`.",
          "The same copy as before, now with an illustration. On the right is the no-conversation pane (from 1024 px); the empty list carries Eho, and on a phone it carries `prazno.poruke`.",
        )}
      >
        <div className="space-y-8">
          <IzlogDemo label={t(locale, "Računar: lista 340 px + desna strana", "Desktop: 340 px list + right pane")}>
            <div data-izlog-poruke-desktop="" className="flex gap-4">
              <div className="hidden w-[340px] shrink-0 lg:block"><InboxEmpty locale={locale} onStart={noop} onFindPartner={noop} /></div>
              <div className="min-h-[360px] min-w-0 flex-1"><MessagesPickEmpty locale={locale} onFindPartner={noop} /></div>
            </div>
          </IzlogDemo>
          <div className="grid gap-8 md:grid-cols-2">
            <IzlogDemo label={t(locale, "Prazna lista u koloni od 390 px", "Empty list in a 390 px column")}>
              <div className="max-w-[390px]"><InboxEmpty locale={locale} onStart={noop} onFindPartner={noop} /></div>
            </IzlogDemo>
            <IzlogDemo label={t(locale, "Pretraga bez rezultata", "Search without results")}>
              <div className="max-w-[390px]"><InboxSearchEmpty locale={locale} onStart={noop} onFindPartner={noop} /></div>
            </IzlogDemo>
            <IzlogDemo label={t(locale, "Razgovor bez poruka", "Conversation without messages")}>
              <div className="max-w-[420px] surface-card border border-line bg-paper p-4"><ThreadEmpty locale={locale} /></div>
            </IzlogDemo>
            <IzlogDemo label={t(locale, "Uči zajedno (Sova)", "Study together (Owl)")}>
              <div className="max-w-[420px]">
                <EmptyState
                  icon={Check}
                  art={<StudyEmptyArt />}
                  title={t(locale, "Još nema partnerstava", "No partnerships yet")}
                  body={t(locale, "Pošalji poziv iz predloga iznad. Kada poziv bude prihvaćen, razgovor se otvara automatski.", "Send an invite from the suggestions above. Once accepted, the conversation opens automatically.")}
                />
              </div>
            </IzlogDemo>
          </div>
        </div>
      </IzlogSection>

      <IzlogSection
        id="mikrointerakcije"
        title={t(locale, "Mikrointerakcije", "Micro-interactions")}
        note={t(
          locale,
          "Nova poruka i nova reakcija ulaze kroz `ChatMotionScope` (opacity i transform, visina redova se ne menja). Dugme „Pošalji“ se samo utisne. Uz smanjen pokret: kratko pojavljivanje bez pomeranja. Zvuka nema, osim ako ga korisnik već ima uključenog u obaveštenjima.",
          "A new message and a new reaction enter through `ChatMotionScope` (opacity and transform, row heights never change). The Send button only presses in. With reduced motion: a short fade, no movement. No sound unless the user already enabled it in notifications.",
        )}
      >
        <MikroInterakcije locale={locale} />
      </IzlogSection>
    </div>
  );
}
