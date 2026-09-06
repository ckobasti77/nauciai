"use client";

import { useMutation, useQuery } from "convex/react";
import { Info, Mail, Scale, Share2, Tag, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { HandUnderline } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast-provider";
import { t, type Locale } from "@/lib/i18n";
import {
  SOCIAL_KEYS,
  SOCIAL_HOSTS,
  STATIC_FALLBACK,
  isValidEmail,
  isValidPhone,
  isValidSocialUrl,
  type PlatformBrand,
  type PlatformContact,
  type PlatformPricing,
  type PlatformSettings,
  type PlatformSocials,
} from "@/lib/platform-settings";

type CardId = "contact" | "socials" | "pricing" | "brand";

/** Argumenti `platformSettings.update` — jedna kartica po pozivu. */
type UpdateArgs = {
  contact?: PlatformContact;
  socials?: PlatformSocials;
  pricing?: PlatformPricing;
  brand?: PlatformBrand;
};

type CardField = {
  name: string;
  label: string;
  /** Gde se to polje prikazuje na sajtu — stoji ispod svakog polja. */
  hint: string;
  placeholder?: string;
  inputMode?: "email" | "tel" | "url" | "text";
  required?: boolean;
  /** Vraća poruku greške ili `null`. Prazno polje se ovde nikad ne proverava. */
  validate?: (value: string) => string | null;
};

type CardSpec = {
  id: CardId;
  icon: LucideIcon;
  title: string;
  description: string;
  fields: CardField[];
  /** Prevodi vrednosti forme u argumente mutacije — kartica zna svoj oblik. */
  toArgs: (values: Record<string, string>) => UpdateArgs;
};

/** Prazan red dok admin ne sačuva ništa — kartice tada kreću od zatečenih cena. */
const EMPTY: PlatformSettings = {
  contact: {},
  socials: {},
  pricing: STATIC_FALLBACK.pricing,
  brand: {},
};

function cardSpecs(locale: Locale): CardSpec[] {
  const socialHint = t(
    locale,
    "Red ikona u podnožju sajta. Prazno polje znači da se ta mreža ne prikazuje.",
    "Icon row in the site footer. An empty field means that network is not shown.",
  );

  return [
    {
      id: "contact",
      icon: Mail,
      title: t(locale, "Kontakt", "Contact"),
      description: t(
        locale,
        "Podaci preko kojih te posetilac zove ili piše.",
        "How a visitor reaches you by phone or email.",
      ),
      fields: [
        {
          name: "email",
          label: t(locale, "E-adresa", "Email address"),
          hint: t(
            locale,
            "Prikazuje se u podnožju sajta i na stranici kontakta.",
            "Shown in the site footer and on the contact page.",
          ),
          placeholder: "kontakt@nauciai.com",
          inputMode: "email",
          validate: (value) =>
            isValidEmail(value)
              ? null
              : t(locale, "Očekivan oblik: ime@domen.com.", "Expected form: name@domain.com."),
        },
        {
          name: "phone",
          label: t(locale, "Telefon", "Phone"),
          hint: t(
            locale,
            "Prikazuje se u podnožju sajta i na stranici kontakta. Međunarodni oblik, sa pozivnim brojem.",
            "Shown in the site footer and on the contact page. International form, with country code.",
          ),
          placeholder: "+381641234567",
          inputMode: "tel",
          validate: (value) =>
            isValidPhone(value)
              ? null
              : t(
                  locale,
                  "Očekivan oblik: +381641234567 (bez razmaka i crtica).",
                  "Expected form: +381641234567 (no spaces or dashes).",
                ),
        },
        {
          name: "address",
          label: t(locale, "Adresa", "Address"),
          hint: t(
            locale,
            "Prikazuje se u podnožju sajta, uz pravne podatke.",
            "Shown in the site footer, next to the legal details.",
          ),
          placeholder: t(locale, "Ulica i broj, grad", "Street and number, city"),
        },
      ],
      toArgs: (values) => ({
        contact: { email: values.email, phone: values.phone, address: values.address },
      }),
    },
    {
      id: "socials",
      icon: Share2,
      title: t(locale, "Društvene mreže", "Social networks"),
      description: t(
        locale,
        "Puna https adresa profila. Svaka mreža prima adresu samo sa svog domena.",
        "The full https profile URL. Each network only accepts a URL on its own domain.",
      ),
      fields: SOCIAL_KEYS.map((key) => ({
        name: key,
        label: key === "tiktok" ? "TikTok" : key === "youtube" ? "YouTube" : key[0].toUpperCase() + key.slice(1),
        hint: socialHint,
        placeholder: `https://${SOCIAL_HOSTS[key]}/nauciai`,
        inputMode: "url" as const,
        validate: (value: string) =>
          isValidSocialUrl(key, value)
            ? null
            : t(
                locale,
                `Adresa mora počinjati sa https:// i voditi na ${SOCIAL_HOSTS[key]}.`,
                `The URL must start with https:// and point to ${SOCIAL_HOSTS[key]}.`,
              ),
      })),
      toArgs: (values) => ({
        socials: Object.fromEntries(SOCIAL_KEYS.map((key) => [key, values[key]])),
      }),
    },
    {
      id: "pricing",
      icon: Tag,
      title: t(locale, "Cene", "Pricing"),
      description: t(
        locale,
        "Iznosi u evrima, onako kako treba da stoje na kartici plana.",
        "Amounts in euros, exactly as they should read on the plan card.",
      ),
      fields: [
        {
          name: "basicEur",
          label: t(locale, "Cena Basic plana", "Basic plan price"),
          hint: t(
            locale,
            "Prikazuje se na kartici Basic u sekciji „Pretplata“ na naslovnoj strani.",
            "Shown on the Basic card in the “Subscription” section of the home page.",
          ),
          placeholder: "9,99",
          required: true,
        },
        {
          name: "premiumEur",
          label: t(locale, "Cena Premium plana", "Premium plan price"),
          hint: t(
            locale,
            "Prikazuje se na kartici Premium u sekciji „Pretplata“ na naslovnoj strani.",
            "Shown on the Premium card in the “Subscription” section of the home page.",
          ),
          placeholder: "19,99",
          required: true,
        },
        {
          name: "currencyNote",
          label: t(locale, "Napomena uz cenu", "Price note"),
          hint: t(
            locale,
            "Sitan red ispod obe kartice plana, iznad postojeće napomene o naplati.",
            "Small line under both plan cards, above the existing billing note.",
          ),
          placeholder: t(locale, "Cene su sa uračunatim PDV-om.", "Prices include VAT."),
        },
      ],
      toArgs: (values) => ({
        pricing: {
          basicEur: values.basicEur,
          premiumEur: values.premiumEur,
          currencyNote: values.currencyNote,
        },
      }),
    },
    {
      id: "brand",
      icon: Scale,
      title: t(locale, "Pravni podaci", "Legal details"),
      description: t(
        locale,
        "Podaci firme i radno vreme podrške.",
        "Company details and support hours.",
      ),
      fields: [
        {
          name: "legalName",
          label: t(locale, "Pravno ime", "Legal name"),
          hint: t(
            locale,
            "Prikazuje se u podnožju sajta i u uslovima korišćenja.",
            "Shown in the site footer and in the terms of use.",
          ),
          placeholder: t(locale, "Naziv d.o.o.", "Company name Ltd."),
        },
        {
          name: "pib",
          label: "PIB",
          hint: t(
            locale,
            "Prikazuje se u podnožju sajta, uz pravno ime.",
            "Shown in the site footer, next to the legal name.",
          ),
          placeholder: "123456789",
        },
        {
          name: "supportHours",
          label: t(locale, "Radno vreme podrške", "Support hours"),
          hint: t(
            locale,
            "Prikazuje se uz kontakt podatke na stranici kontakta.",
            "Shown next to the contact details on the contact page.",
          ),
          placeholder: t(locale, "Ponedeljak—petak, 9—17h", "Monday—Friday, 9am—5pm"),
        },
      ],
      toArgs: (values) => ({
        brand: {
          legalName: values.legalName,
          pib: values.pib,
          supportHours: values.supportHours,
        },
      }),
    },
  ];
}

function valuesFor(spec: CardSpec, settings: PlatformSettings): Record<string, string> {
  const group = settings[spec.id] as Record<string, string | undefined>;
  return Object.fromEntries(spec.fields.map((field) => [field.name, group[field.name] ?? ""]));
}

function SettingsCard({
  spec,
  settings,
  locale,
  onSave,
}: {
  spec: CardSpec;
  settings: PlatformSettings;
  locale: Locale;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState(() => valuesFor(spec, settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const Icon = spec.icon;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = values[field.name].trim();
      if (!value) {
        if (field.required) {
          nextErrors[field.name] = t(locale, "Polje je obavezno.", "This field is required.");
        }
        continue;
      }
      const message = field.validate?.(value);
      if (message) nextErrors[field.name] = message;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="surface-card border-2 border-ink bg-paper-strong p-6 shadow-[6px_6px_0_0_var(--shadow-hard-13)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="type-h3 text-ink">{spec.title}</h2>
          <p className="mt-1 type-body-sm font-semibold text-muted">{spec.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {spec.fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            hint={field.hint}
            error={errors[field.name]}
          >
            {(control) => (
              <Input
                {...control}
                name={field.name}
                value={values[field.name]}
                placeholder={field.placeholder}
                inputMode={field.inputMode}
                autoComplete="off"
                disabled={saving}
                onChange={(event) => {
                  const next = event.target.value;
                  setValues((current) => ({ ...current, [field.name]: next }));
                  setErrors((current) =>
                    current[field.name] ? { ...current, [field.name]: "" } : current,
                  );
                }}
              />
            )}
          </Field>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="submit" size="lg" loading={saving}>
          {t(locale, "Sačuvaj", "Save")}
        </Button>
      </div>
    </form>
  );
}

export function AdminPlatformSettingsPanel({ locale }: { locale: Locale }) {
  const live = useQuery(api.platformSettings.get, {});
  const toast = useToast();
  // Optimistički prikaz: sačuvana kartica se odmah vidi u ostatku ekrana, ne
  // tek kad server potvrdi. Server posle svejedno prepiše svojom projekcijom.
  const update = useMutation(api.platformSettings.update).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.platformSettings.get, {}) ?? EMPTY;
    localStore.setQuery(api.platformSettings.get, {}, {
      contact: args.contact ?? current.contact,
      socials: args.socials ?? current.socials,
      pricing: args.pricing ?? current.pricing,
      brand: args.brand ?? current.brand,
    });
  });

  async function save(spec: CardSpec, values: Record<string, string>) {
    try {
      await update(spec.toArgs(values));
      toast.success(t(locale, "Sačuvano", "Saved"), spec.title);
    } catch (error) {
      toast.error(
        t(locale, "Nije sačuvano", "Not saved"),
        error instanceof Error ? error.message : spec.title,
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header>
        <p className="type-eyebrow text-muted">{t(locale, "Administracija", "Administration")}</p>
        <h1 className="mt-2 font-display type-display text-ink">
          {t(locale, "Opšte informacije", "General info")}
        </h1>
        <HandUnderline size="sm" className="mt-1" />
      </header>

      <Callout icon={Info} title={t(locale, "Prazno polje ništa ne prikazuje", "An empty field shows nothing")}>
        {t(
          locale,
          "Sve osim cena je opciono — prazno polje se ne pojavljuje nigde. Cene se već čitaju odavde na naslovnoj strani; kontakt, mreže i pravni podaci se ovde pripremaju, a u podnožje i na stranicu kontakta ulaze u sledećem koraku.",
          "Everything except the prices is optional — an empty field appears nowhere. The prices are already read from here on the home page; contact, social and legal details are prepared here and land in the footer and contact page in the next step.",
        )}
      </Callout>

      {live === undefined ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner size="md" className="text-muted" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {cardSpecs(locale).map((spec) => (
            <SettingsCard
              key={spec.id}
              spec={spec}
              settings={live ?? EMPTY}
              locale={locale}
              onSave={(values) => save(spec, values)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
