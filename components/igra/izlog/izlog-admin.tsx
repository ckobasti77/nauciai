"use client";

import { ListTree, PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AdminUsersPanel } from "@/components/app/admin-content-manager";
import { DashboardWindow } from "@/components/app/dashboard-windows";
import { AdminAnalyticsView } from "@/components/igra/admin/admin-analytics";
import { AdminControlHero } from "@/components/igra/admin/admin-control-hero";
import { AdminHead } from "@/components/igra/admin/admin-head";
import { AdminKpiRow } from "@/components/igra/admin/admin-kpi";
import { MissionNumber, MissionQueueHead } from "@/components/igra/admin/mission-queue-head";
import { ReadyStamp } from "@/components/igra/admin/ready-stamp";
import { IgraArt } from "@/components/igra/igra-art";
import { IgraLik } from "@/components/igra/igra-lik";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import { adminRobiMood, adminSignals, adminTodayKey } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import { ADMIN_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „admin" (K21): Kontrolna soba (heroj, stanje sistema, KPI), Analitika i strana
 * „U pripremi" nad test podacima. K22 dodaje red misija, pečat spremnosti i zaglavlja ostalih
 * admin strana. Stanja: `novi` = prazna platforma, `aktivan` = obična
 * nedelja, `legenda` = sve na granici (plafoni, alarm troška, čuvar kasni, Crea ugašena).
 * Prave strane čitaju iste upite kroz `admin-content-manager.tsx`; ovde se ništa ne zove.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const on = (active: boolean) => (active ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper");

export function IzlogAdmin({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [loading, setLoading] = useState(false);
  const [stampHits, setStampHits] = useState(0);
  const data = ADMIN_FIXTURES[stanje];
  const signals = loading
    ? null
    : adminSignals({ creaEnabled: data.creaEnabled, usage: data.usage, pendingApprovals: data.pendingApprovals, now: data.now }, locale);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "Podaci", "Data")}>
        <button type="button" aria-pressed={!loading} onClick={() => setLoading(false)} className={cn(CHIP, on(!loading))}>
          {t(locale, "Stiglo", "Loaded")}
        </button>
        <button type="button" aria-pressed={loading} onClick={() => setLoading(true)} className={cn(CHIP, on(loading))}>
          {t(locale, "Učitava se", "Loading")}
        </button>
      </div>

      <IzlogSection
        id="kontrolna-soba"
        title={t(locale, "Kontrolna soba (Sadržaj)", "Control room (Content)")}
        note={t(
          locale,
          "Vrh strane /app/admin/content: heroj sa stanjem sistema i KPI red. Ispod na pravoj strani ostaje urednik sadržaja.",
          "Top of /app/admin/content: hero with system state and the KPI row. The content editor stays below on the real page.",
        )}
      >
        <div className="space-y-6">
          <AdminControlHero locale={locale} title={t(locale, "Sadržaj", "Content")} signals={signals} mood={adminRobiMood(signals, locale)} />
          <section aria-labelledby="izlog-admin-state" className="space-y-3">
            <h2 id="izlog-admin-state" className="type-eyebrow text-muted">
              {IGRA_ADMIN_COPY.platformState[locale]}
            </h2>
            <AdminKpiRow locale={locale} overview={loading ? undefined : data.overview} pending={loading ? undefined : data.pendingApprovals} />
          </section>
        </div>
      </IzlogSection>

      <IzlogSection
        id="analitika"
        title={t(locale, "Analitika", "Analytics")}
        note={t(
          locale,
          "Grafikoni iz postojećih upita: stanje sadržaja, Crea poslovi danas, upiti po danu (plafon 200 zapisa).",
          "Charts from existing queries: content status, Crea jobs today, prompts per day (200-record cap).",
        )}
      >
        <div className="space-y-6">
          <AdminHead art="admin.sistem" eyebrow={t(locale, "Administracija", "Administration")} title={t(locale, "Analitika", "Analytics")} />
          <AdminAnalyticsView
            locale={locale}
            todayKey={adminTodayKey(data.now)}
            overview={loading ? undefined : data.overview}
            usage={loading ? undefined : data.usage}
            passed={loading ? undefined : data.passed}
            refused={loading ? undefined : data.refused}
          />
        </div>
      </IzlogSection>

      <IzlogSection
        id="red-misija"
        title={t(locale, "Red misija (moderacija zajednice)", "Mission queue (community moderation)")}
        note={t(
          locale,
          "Vrh /app/community/moderation za osoblje: broj na čekanju je isti kao u sidebaru. Redovi i akcije ostaju isti; svaki red dobija samo redni broj.",
          "Top of /app/community/moderation for staff: the waiting count is the same as in the sidebar. Rows and actions stay the same; each row only gets its number.",
        )}
      >
        <div className="space-y-6">
          <MissionQueueHead locale={locale} pending={loading ? undefined : data.pendingApprovals} />
          <IzlogDemo label="MissionNumber">
            <div className="flex gap-2">
              {[0, 1, 2].map((index) => (
                <MissionNumber key={index} locale={locale} index={index} />
              ))}
            </div>
          </IzlogDemo>
          <IzlogDemo label={t(locale, "Prazan red", "Empty queue")}>
            <EmptyState
              icon={ShieldCheck}
              art={<IgraLik lik="robi" poza="slavi" size={120} decorative />}
              title={t(locale, "Red je čist", "The queue is clear")}
              body={t(
                locale,
                "Nema tema koje čekaju proveru. Sve nove teme koje zahtevaju moderaciju pojaviće se ovde čim ih studenti pošalju.",
                "No topics are waiting for review. All new topics requiring moderation will appear here as soon as students submit them.",
              )}
            />
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="spremnost"
        title={t(locale, "Spremnost za objavu (Sadržaj)", "Ready to publish (Content)")}
        note={t(
          locale,
          "Nespremna stavka zadržava žutu pilulu x/y; spremna dobija pečat koji udari kad stavka postane spremna.",
          "An unready item keeps the yellow x/y pill; a ready one gets a stamp that lands when the item becomes ready.",
        )}
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-6">
            <IzlogDemo label={t(locale, "nije spremno", "not ready")}>
              <ReadyStamp locale={locale} ready={false} done={3} total={5} stampKey="izlog" />
            </IzlogDemo>
            <IzlogDemo label={t(locale, "spremno", "ready")}>
              <ReadyStamp locale={locale} ready done={5} total={5} stampKey={`izlog:${stampHits}`} />
            </IzlogDemo>
            <button type="button" onClick={() => setStampHits((hits) => hits + 1)} className={cn(CHIP, on(false))}>
              {t(locale, "Udari pečat", "Stamp again")}
            </button>
          </div>
          <EmptyState
            icon={ListTree}
            art={<IgraLik lik="bajt" poza="misli" size="lg" decorative />}
            title={t(locale, "Izaberi šta uređuješ", "Pick what to edit")}
            body={t(
              locale,
              "Klikni na smer u listi levo. Zatim na kurs u njemu, pa na lekciju. Ovde se otvara tačno ono što student vidi - i menjaš ga klikom na sam tekst.",
              "Click a track in the list on the left. Then a course inside it, then a lesson. What a student sees opens here - and you edit it by clicking the text itself.",
            )}
          />
        </div>
      </IzlogSection>

      <IzlogSection
        id="zaglavlja"
        title={t(locale, "Zaglavlja: Crea, Chat sigurnost, Opšte informacije", "Headers: Crea, Chat safety, General info")}
        note={t(
          locale,
          "Iste nalepnice kao na pravim stranama; tabele, forme i akcije ispod zaglavlja se ne menjaju.",
          "The same stickers as on the real pages; tables, forms and actions below the headers are unchanged.",
        )}
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <AdminHead art="admin.generacije" eyebrow={t(locale, "Administracija", "Administration")} title="Crea">
            <span className="mt-2 inline-flex min-h-11 items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4">
              {IGRA_ADMIN_COPY.creaPromptsLink[locale]}
            </span>
          </AdminHead>
          <AdminHead art="admin.moderacija" eyebrow="admin" title={t(locale, "Chat sigurnost", "Chat safety")} />
          <AdminHead art="ikona.podesavanja" eyebrow={t(locale, "Administracija", "Administration")} title={t(locale, "Opšte informacije", "General info")} />
          <IzlogDemo label={t(locale, "Potrošnja (Crea admin)", "Usage (Crea admin)")}>
            <div className="flex items-center gap-3">
              <IgraArt id="admin.troskovi" size="sm" decorative className="shrink-0" />
              <p className="type-h2 text-ink">{t(locale, "Potrošnja", "Usage & Spend")}</p>
            </div>
          </IzlogDemo>
          <IzlogDemo label={t(locale, "Crea poslovi: nema rezultata", "Crea jobs: no results")}>
            <div className="surface-card mx-auto max-w-md border-2 border-ink bg-paper-strong p-6 text-center shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
              <IgraArt id="prazno.pretraga" size="lg" decorative />
              <p className="mt-3 text-base font-bold text-muted">{t(locale, "Nema poslova za ove filtere.", "No jobs match these filters.")}</p>
            </div>
          </IzlogDemo>
          <IzlogDemo label={t(locale, "Chat sigurnost: nije izabrana prijava", "Chat safety: no report selected")}>
            <div className="surface-card grid min-h-60 place-items-center border-2 border-ink bg-paper-strong p-4 text-center">
              <div>
                <IgraLik lik="robi" poza="misli" size="lg" decorative />
                <p className="mt-3 font-black text-muted">{t(locale, "Izaberi prijavu.", "Select a report.")}</p>
              </div>
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        id="u-pripremi"
        title={t(locale, "U pripremi (Korisnici)", "Coming soon (Users)")}
        note={t(locale, "Ista komponenta i za Rast; Analitika ovaj deo crta ispod grafikona.", "Same component for Growth; Analytics draws this part below its charts.")}
      >
        <AdminUsersPanel locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="admin-prozori"
        title={t(locale, "Admin prozori na tabli", "Admin windows on the dashboard")}
        note={t(locale, "Samo admin ih vidi na /app; nalepnica umesto ikone, sve ostalo isto.", "Only admins see them on /app; a sticker instead of the icon, everything else unchanged.")}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <IzlogDemo label="adminContent · admin.sadrzaj">
            <DashboardWindow
              zone="adminContent"
              eyebrow="Admin"
              title={t(locale, "Nacrti i spremnost", "Drafts and readiness")}
              icon={PenLine}
              art="admin.sadrzaj"
              badge={stanje === "novi" ? 0 : 3}
              items={
                stanje === "novi"
                  ? []
                  : [
                      { key: "readiness", primary: t(locale, "2 blokera pre objave", "2 blockers before publishing"), secondary: t(locale, "Objavljeni kursevi kojima nešto nedostaje", "Published courses that are missing something") },
                      { key: "draft-1", primary: "Uvod u AI video", secondary: t(locale, "Kurs u nacrtu", "Draft course") },
                      { key: "draft-2", primary: "AI za male firme", secondary: t(locale, "Smer u nacrtu", "Draft track") },
                    ]
              }
              emptyTitle={t(locale, "Nema nacrta", "No drafts")}
              emptyBody={t(locale, "Sve je objavljeno. Novi smer ili kurs čeka ovde dok ga ne objaviš.", "Everything is published. A new track or course waits here until you publish it.")}
              ctaLabel={t(locale, "Otvori Kontrolni centar", "Open the control centre")}
              ctaHref="#admin-prozori"
            />
          </IzlogDemo>
          <IzlogDemo label="adminPeople · admin.moderacija">
            <DashboardWindow
              zone="adminPeople"
              eyebrow="Admin"
              title={t(locale, "Moderacija i novi članovi", "Moderation and new members")}
              icon={ShieldCheck}
              art="admin.moderacija"
              badge={data.pendingApprovals}
              items={
                data.pendingApprovals > 0
                  ? [{ key: "approvals", primary: `${data.pendingApprovals} ${t(locale, "objava na čekanju", "posts awaiting review")}`, secondary: t(locale, "Moderacija zajednice", "Community moderation") }]
                  : []
              }
              emptyTitle={t(locale, "Ništa ne čeka", "Nothing is waiting")}
              emptyBody={t(locale, "Nema objava za pregled ni novih registracija.", "No posts to review and no new sign-ups.")}
              ctaLabel={t(locale, "Otvori korisnike", "Open users")}
              ctaHref="#admin-prozori"
            />
          </IzlogDemo>
        </div>
      </IzlogSection>
    </div>
  );
}
