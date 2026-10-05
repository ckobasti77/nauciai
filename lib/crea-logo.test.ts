import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { computeCredits } from "@/convex/studioPricing";
import { LOGO_ROUTES, LOGO_STYLES, logoFileName, logoMissing, logoParams, logoPrompt, VECTOR_OUTPUT_MODELS } from "./crea-logo";

describe("logo i ikone (S41)", () => {
  test("rute su modeli iz kataloga koji prave sliku iz opisa, sa cenom > 0", () => {
    for (const route of LOGO_ROUTES) {
      const seed = STUDIO_MODELS.find((model) => model.slug === route.modelSlug);
      expect(seed, route.modelSlug).toBeDefined();
      expect(seed!.inputModes).toContain(route.inputMode);
      const params = logoParams(route, logoPrompt({ kind: "logo", name: "Klas", about: "pekara", styleId: "rukom" }, null));
      const sanitized = sanitizeSpecParams(seed!.paramSpec, seed!.priceRule, params, route.inputMode);
      expect(sanitized.ok, route.modelSlug).toBe(true);
      if (sanitized.ok) expect(computeCredits(seed!.priceRule, sanitized.params, route.inputMode)).toBeGreaterThan(0);
    }
  });

  test("vektor odmah daje samo Recraft vektor (SVG izlaz u katalogu)", () => {
    for (const slug of VECTOR_OUTPUT_MODELS) {
      const seed = STUDIO_MODELS.find((model) => model.slug === slug);
      expect(seed?.capabilities.output).toBe("image/svg+xml");
    }
    expect(LOGO_ROUTES[0]!.modelSlug).toBe("recraft-41-vector");
  });

  test("opis: ime doslovno kod logoa, bez teksta kod ikonice, ravne boje i brend", () => {
    const logo = logoPrompt({ kind: "logo", name: " Pekara Đurđa ", about: "domaći hleb", styleId: "zanatski" }, {
      name: "Pekara Đurđa",
      colors: ["#c8402f"],
      fonts: { heading: "lora", body: "nunito" },
      tone: "",
    });
    expect(logo).toContain("“Pekara Đurđa”");
    expect(logo).toContain("old shop sign");
    expect(logo).toContain("no gradients");
    expect(logo).toContain("#c8402f");
    const icon = logoPrompt({ kind: "ikonica", name: "", about: "aplikacija za recepte", styleId: "nepostojeci" }, null);
    expect(icon).toContain("no text and no letters");
    expect(icon).toContain(LOGO_STYLES[0]!.prompt);
    expect(icon).not.toContain("Brand:");
  });

  test("šta fali: ime samo kod logoa, opis uvek", () => {
    expect(logoMissing({ kind: "logo", name: " ", about: "x", styleId: "" })).toBe("name");
    expect(logoMissing({ kind: "ikonica", name: "", about: "x", styleId: "" })).toBeNull();
    expect(logoMissing({ kind: "ikonica", name: "", about: " ", styleId: "" })).toBe("about");
  });

  test("ime fajla bez kvačica i razmaka", () => {
    expect(logoFileName("Pekara Đurđa & Sinovi", "logo")).toBe("crea-logo-pekara-djurdja-sinovi.svg");
    expect(logoFileName("", "ikonica")).toBe("crea-ikonica.svg");
  });
});
