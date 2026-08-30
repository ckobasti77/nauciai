import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  TYPE_MEASURE_MAX_WIDTH,
  TYPE_MEASURE_UTILITY,
  trackedTypeUtilities,
  typeRoleOrder,
  typeScale,
} from "./type-scale";

const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** Izvuce telo `@utility <ime> { ... }` bloka iz globals.css. */
function utilityBody(name: string): string | null {
  const match = new RegExp(`@utility\\s+${name}\\s*\\{([^}]*)\\}`).exec(globalsCss);
  return match ? match[1] : null;
}

function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*([^;\\n]+)`).exec(body);
  return match ? match[1].trim() : null;
}

describe("tipografska skala", () => {
  it("ima jedinstvenu utility klasu po ulozi i pokriva sve uloge", () => {
    const utilities = typeRoleOrder.map((role) => typeScale[role].utility);
    expect(new Set(utilities).size).toBe(utilities.length);
    expect(new Set(typeRoleOrder)).toEqual(new Set(Object.keys(typeScale)));
  });

  it("globals.css definise svaku ulogu tacno onako kako contract kaze", () => {
    for (const role of typeRoleOrder) {
      const spec = typeScale[role];
      const body = utilityBody(spec.utility);
      expect(body, `nedostaje @utility ${spec.utility} u app/globals.css`).not.toBeNull();
      expect(declaration(body!, "font-size"), `${spec.utility} font-size`).toBe(spec.fontSize);
      expect(declaration(body!, "line-height"), `${spec.utility} line-height`).toBe(spec.lineHeight);
      expect(declaration(body!, "letter-spacing"), `${spec.utility} letter-spacing`).toBe(spec.letterSpacing);
      expect(declaration(body!, "font-weight"), `${spec.utility} font-weight`).toBe(spec.fontWeight ?? null);
      expect(declaration(body!, "text-transform"), `${spec.utility} text-transform`).toBe(
        spec.textTransform ?? null,
      );
    }
  });

  it("mera citljivosti postoji i drzi dokumentovanu sirinu", () => {
    const body = utilityBody(TYPE_MEASURE_UTILITY);
    expect(body).not.toBeNull();
    expect(declaration(body!, "max-width")).toBe(TYPE_MEASURE_MAX_WIDTH);
  });

  it("uloge tela ne postavljaju tezinu, pa pozivalac sme da bira font-bold", () => {
    for (const role of ["reading", "body", "body-sm", "caption"] as const) {
      expect(typeScale[role].fontWeight).toBeUndefined();
    }
  });

  it("samo display uloge nose Patrick Hand tezinu 400; ostali naslovi su 900", () => {
    expect(typeScale.display.fontWeight).toBe("400");
    expect(typeScale["display-sm"].fontWeight).toBe("400");
    for (const role of ["hero", "h1", "h2", "h3", "h4", "eyebrow", "eyebrow-sm"] as const) {
      expect(typeScale[role].fontWeight, role).toBe("900");
    }
  });

  it("skala je monotona: svaka uloga u nizu je manja ili jednaka prethodnoj", () => {
    // clamp(min, ...) — poredimo minimalnu (mobilnu) vrednost, jer je to velicina
    // koju pocetnik na telefonu stvarno vidi.
    const minPx = (fontSize: string): number => {
      const clamp = /^clamp\(([^,]+),/.exec(fontSize);
      const value = clamp ? clamp[1].trim() : fontSize;
      const rem = /^([\d.]+)rem$/.exec(value);
      if (!rem) throw new Error(`neocekivan zapis velicine: ${fontSize}`);
      return Number(rem[1]) * 16;
    };

    const headings = ["display", "hero", "h1", "h2", "h3", "h4"] as const;
    for (let i = 1; i < headings.length; i += 1) {
      expect(
        minPx(typeScale[headings[i]].fontSize),
        `${headings[i]} mora biti <= ${headings[i - 1]}`,
      ).toBeLessThanOrEqual(minPx(typeScale[headings[i - 1]].fontSize));
    }
    expect(minPx(typeScale.eyebrow.fontSize)).toBeGreaterThan(minPx(typeScale["eyebrow-sm"].fontSize));
    expect(minPx(typeScale.body.fontSize)).toBeGreaterThan(minPx(typeScale["body-sm"].fontSize));
    expect(minPx(typeScale["body-sm"].fontSize)).toBeGreaterThan(minPx(typeScale.caption.fontSize));
  });

  it("nijedna uloga ne pada ispod 10px — donja granica citljivosti za pocetnika", () => {
    for (const role of typeRoleOrder) {
      const fontSize = typeScale[role].fontSize;
      const clamp = /^clamp\(([^,]+),/.exec(fontSize);
      const value = (clamp ? clamp[1] : fontSize).trim();
      const rem = Number(/^([\d.]+)rem$/.exec(value)?.[1] ?? "0");
      expect(rem * 16, role).toBeGreaterThanOrEqual(10);
    }
  });

  it("duga forma za citanje ima prostraniji prored od uvodnog pasusa", () => {
    expect(Number(typeScale.reading.lineHeight)).toBeGreaterThan(Number(typeScale.body.lineHeight));
    expect(Number(typeScale.reading.fontSize.replace("rem", "")) * 16).toBeGreaterThanOrEqual(16);
  });

  it("reset letter-spacing stoji u @layer base, inace tracking uloge umire na dugmadima", () => {
    // AGENTS.md: nelayerovan autorski CSS pobedjuje svaki sloj. Ako ovaj reset
    // ikad izadje iz `@layer base`, `type-eyebrow` na <button>/<a> tiho gubi razmak.
    const layered = /@layer base\s*\{[\s\S]*?letter-spacing:\s*0;[\s\S]*?\}\s*\}/.exec(globalsCss);
    expect(layered, "letter-spacing reset mora ostati unutar @layer base").not.toBeNull();
    expect(layered![0]).toContain("button");
    expect(layered![0]).toContain("select");
    expect(trackedTypeUtilities.length).toBeGreaterThan(0);
  });
});
