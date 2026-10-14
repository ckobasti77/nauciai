"use client";

import { PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AdminUsersPanel } from "@/components/app/admin-content-manager";
import { DashboardWindow } from "@/components/app/dashboard-windows";
import { AdminAnalyticsView } from "@/components/igra/admin/admin-analytics";
import { AdminControlHero } from "@/components/igra/admin/admin-control-hero";
import { AdminHead } from "@/components/igra/admin/admin-head";
import { AdminKpiRow } from "@/components/igra/admin/admin-kpi";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { cn } from "@/components/ui/primitives";
import { adminRobiMood, adminSignals, adminTodayKey } from "@/lib/igra-admin";
import { IGRA_ADMIN_COPY } from "@/lib/igra-admin-copy";
import { ADMIN_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „admin" (K21): Kontrolna soba (heroj, stanje sistema, KPI), Analitika i strana
 * „U pripremi" nad test podacima. Stanja: `novi` = prazna platforma, `aktivan` = obična
 * nedelja, `legenda` = sve na granici (plafoni, alarm troška, čuvar kasni, Crea ugašena).
 * Prave strane čitaju iste upite kroz `admin-content-manager.tsx`; ovde se ništa ne zove.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const on = (active: boolean) => (active ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper");

export function IzlogAdmin({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [loading, setLoading] = useState(false);
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
