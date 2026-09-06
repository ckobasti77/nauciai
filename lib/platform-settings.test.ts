import { describe, expect, it } from "vitest";

import { PRICING } from "@/lib/pricing";
import { STATIC_FALLBACK, resolveSettings, type PlatformSettings } from "@/lib/platform-settings";

const FALLBACK: PlatformSettings = {
  contact: { email: "kontakt@nauciai.com", phone: "+381110000000" },
  socials: { instagram: "https://instagram.com/rezerva" },
  pricing: { basicEur: "9,99", premiumEur: "19,99" },
  brand: { legalName: "Rezerva d.o.o." },
};

describe("resolveSettings — spajanje živih vrednosti preko rezerve", () => {
  it("bez živog reda vraća čistu rezervu, a cene stižu iz lib/pricing", () => {
    const resolved = resolveSettings(null);
    expect(resolved.pricing.basicEur).toBe(PRICING.basic.eur);
    expect(resolved.pricing.premiumEur).toBe(PRICING.premium.eur);
    expect(resolved.contact.email).toBe(STATIC_FALLBACK.contact.email);
  });

  it("živa vrednost pobeđuje rezervu", () => {
    const resolved = resolveSettings(
      {
        contact: { email: "zdravo@nauciai.com" },
        pricing: { basicEur: "12,00", premiumEur: "24,00", currencyNote: "Sa PDV-om." },
      },
      FALLBACK,
    );
    expect(resolved.contact.email).toBe("zdravo@nauciai.com");
    expect(resolved.pricing.basicEur).toBe("12,00");
    expect(resolved.pricing.currencyNote).toBe("Sa PDV-om.");
  });

  it("prazno polje (i polje od samih razmaka) pada na rezervu", () => {
    const resolved = resolveSettings(
      { contact: { email: "", phone: "   " }, pricing: { basicEur: "", premiumEur: "" } },
      FALLBACK,
    );
    expect(resolved.contact.email).toBe(FALLBACK.contact.email);
    expect(resolved.contact.phone).toBe(FALLBACK.contact.phone);
    expect(resolved.pricing.basicEur).toBe(FALLBACK.pricing.basicEur);
  });

  it("polje koje ni uživo ni u rezervi nema vrednost se izostavlja", () => {
    const resolved = resolveSettings({ contact: { address: "" } }, FALLBACK);
    expect(resolved.contact.address).toBeUndefined();
    expect("address" in resolved.contact).toBe(false);
    expect(resolved.brand.pib).toBeUndefined();
  });

  it("nevalidan URL se ignoriše i pada na rezervu", () => {
    const resolved = resolveSettings(
      { socials: { instagram: "http://instagram.com/nauciai", facebook: "https://zlonamerno.rs/nauciai" } },
      FALLBACK,
    );
    // http:// nije https:// -> rezerva.
    expect(resolved.socials.instagram).toBe(FALLBACK.socials.instagram);
    // Pogrešan domen, a rezerva za facebook ne postoji -> polje nestaje.
    expect(resolved.socials.facebook).toBeUndefined();
  });

  it("prima adresu sa www poddomena, a odbija domen koji se samo završava isto", () => {
    const resolved = resolveSettings(
      {
        socials: {
          youtube: "https://www.youtube.com/@nauciai",
          tiktok: "https://nijetiktok.com/@nauciai",
          threads: "https://threads.net/@nauciai",
        },
      },
      FALLBACK,
    );
    expect(resolved.socials.youtube).toBe("https://www.youtube.com/@nauciai");
    expect(resolved.socials.tiktok).toBeUndefined();
    expect(resolved.socials.threads).toBe("https://threads.net/@nauciai");
  });

  it("nevalidan e-mail i telefon se ignorišu isto kao nevalidan URL", () => {
    const resolved = resolveSettings(
      { contact: { email: "nije-adresa", phone: "064 123 4567" } },
      FALLBACK,
    );
    expect(resolved.contact.email).toBe(FALLBACK.contact.email);
    expect(resolved.contact.phone).toBe(FALLBACK.contact.phone);
  });
});
