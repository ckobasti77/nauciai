import { CreditCard, Globe2, UserRound } from "lucide-react";

import { PortalButton } from "@/components/app/checkout-button";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { courses, studentProfile } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, type Locale } from "@/lib/i18n";

function profileInitials(name: string, email: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || email.slice(0, 2) || "AI").toUpperCase();
}

export function ProfilePage({ locale, profile }: { locale: Locale; profile?: ViewerProfile }) {
  const name = profile?.name ?? studentProfile.name;
  const email = profile?.email ?? studentProfile.email;
  const role = profile?.role ?? studentProfile.role;
  const language = profile?.language ?? locale;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={locale === "sr" ? "Profil" : "Profile"}
        body={locale === "sr" ? "Ime, avatar i jezik platforme." : "Name, avatar, and platform language."}
      />
      <Panel className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex size-20 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-2xl font-black text-ink">
            {profileInitials(name, email)}
          </div>
          <div>
            <p className="text-2xl font-black text-ink">{name}</p>
            <p className="mt-1 text-base font-bold text-muted">{email}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-extrabold text-ink">
              <span className="inline-flex items-center gap-2"><UserRound className="size-4" />{role}</span>
              <span className="inline-flex items-center gap-2"><Globe2 className="size-4" />{language.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function BillingPage({ locale }: { locale: Locale }) {
  const t = dictionary[locale];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={locale === "sr" ? "Pretplata" : "Billing"}
        body={
          locale === "sr"
            ? "Status pretplate je vezan za konkretan smer i sinhronizuje se iz Stripe webhooka."
            : "Subscription status is tied to a track and synchronized from Stripe webhooks."
        }
      />
      <Panel className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-3xl text-ink">{localized(courses[0].title, locale)}</p>
            <p className="mt-2 text-base font-bold text-muted">{locale === "sr" ? "Aktivan demo status" : "Active demo status"}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PortalButton locale={locale} label={t.portal} />
            <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-5 text-sm font-extrabold text-ink">
              <CreditCard className="size-4" />
              {locale === "sr" ? "9.99 / mes" : "9.99 / month"}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
