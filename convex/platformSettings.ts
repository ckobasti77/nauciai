import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./helpers";
import {
  SOCIAL_KEYS,
  SOCIAL_HOSTS,
  STATIC_FALLBACK,
  isValidEmail,
  isValidPhone,
  isValidSocialUrl,
  type PlatformSocialKey,
} from "../lib/platform-settings";

/** Jedini red u tabeli. Ključ postoji da bi indeks imao šta da traži. */
const SINGLETON_KEY = "default";

const contactValidator = v.object({
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
});

const socialsValidator = v.object({
  instagram: v.optional(v.string()),
  facebook: v.optional(v.string()),
  tiktok: v.optional(v.string()),
  youtube: v.optional(v.string()),
  threads: v.optional(v.string()),
});

const pricingValidator = v.object({
  basicEur: v.string(),
  premiumEur: v.string(),
  currencyNote: v.optional(v.string()),
});

const brandValidator = v.object({
  supportHours: v.optional(v.string()),
  legalName: v.optional(v.string()),
  pib: v.optional(v.string()),
});

/** Prazno polje je dozvoljeno i znači „ne prikazuj to nigde“ — zato `undefined`. */
function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanContact(input: { phone?: string; email?: string; address?: string }) {
  const email = clean(input.email);
  if (email && !isValidEmail(email)) {
    throw new Error("E-adresa nije ispravna. Očekivan oblik: ime@domen.com.");
  }
  const phone = clean(input.phone);
  if (phone && !isValidPhone(phone)) {
    throw new Error("Telefon mora biti u E.164 obliku, na primer +381641234567.");
  }
  return { email, phone, address: clean(input.address) };
}

function cleanSocials(input: Partial<Record<PlatformSocialKey, string>>) {
  const socials: Partial<Record<PlatformSocialKey, string>> = {};
  for (const key of SOCIAL_KEYS) {
    const url = clean(input[key]);
    if (!url) continue;
    if (!isValidSocialUrl(key, url)) {
      throw new Error(`Adresa za ${key} mora počinjati sa https:// i voditi na ${SOCIAL_HOSTS[key]}.`);
    }
    socials[key] = url;
  }
  return socials;
}

function cleanPricing(input: { basicEur: string; premiumEur: string; currencyNote?: string }) {
  const basicEur = clean(input.basicEur);
  const premiumEur = clean(input.premiumEur);
  if (!basicEur || !premiumEur) {
    throw new Error("Obe cene su obavezne — sekcija cena na sajtu prikazuje obe.");
  }
  return { basicEur, premiumEur, currencyNote: clean(input.currencyNote) };
}

function cleanBrand(input: { supportHours?: string; legalName?: string; pib?: string }) {
  return {
    supportHours: clean(input.supportHours),
    legalName: clean(input.legalName),
    pib: clean(input.pib),
  };
}

function readRow(ctx: QueryCtx) {
  return ctx.db
    .query("platformSettings")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .unique();
}

/**
 * Javan namerno: iste podatke landing prikazuje svakom posetiocu. Projekcija je
 * doslovna — `_id`, `updatedAt` i `updatedBy` ostaju u bazi, jer ko je i kad
 * menjao kontakt nije javan podatak.
 */
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      contact: contactValidator,
      socials: socialsValidator,
      pricing: pricingValidator,
      brand: brandValidator,
    }),
  ),
  handler: async (ctx) => {
    const row = await readRow(ctx);
    if (!row) return null;
    return {
      contact: row.contact,
      socials: row.socials,
      pricing: row.pricing,
      brand: row.brand,
    };
  },
});

/**
 * Upisuje jednu ili više kartica odjednom — admin ekran čuva po kartici, pa
 * šalje samo grupu koju je dirao. Izostavljena grupa ostaje netaknuta.
 */
export const update = mutation({
  args: {
    contact: v.optional(contactValidator),
    socials: v.optional(socialsValidator),
    pricing: v.optional(pricingValidator),
    brand: v.optional(brandValidator),
  },
  returns: v.object({ updated: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const patch: Record<string, unknown> = {};
    if (args.contact) patch.contact = cleanContact(args.contact);
    if (args.socials) patch.socials = cleanSocials(args.socials);
    if (args.pricing) patch.pricing = cleanPricing(args.pricing);
    if (args.brand) patch.brand = cleanBrand(args.brand);
    const updated = Object.keys(patch);
    if (updated.length === 0) {
      throw new Error("Nema izmena za upis.");
    }

    const now = Date.now();
    const updatedBy = admin.userId as Id<"users">;
    const existing = await readRow(ctx);
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now, updatedBy });
      return { updated };
    }

    // Prvi upis pravi ceo red: grupe koje admin nije dirao ostaju prazne, a
    // cene — jedine bez praznog oblika — kreću od zatečenih vrednosti, pa
    // čuvanje bilo koje kartice radi i pre nego što je kartica „Cene“ dirana.
    await ctx.db.insert("platformSettings", {
      key: SINGLETON_KEY,
      contact: {},
      socials: {},
      brand: {},
      pricing: { ...STATIC_FALLBACK.pricing },
      ...patch,
      updatedAt: now,
      updatedBy,
    });
    return { updated };
  },
});
