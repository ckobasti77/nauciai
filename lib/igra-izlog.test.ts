import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Izlog i primitivi (K05) - provere nad izvorom: izlog ne sme u produkciju, pretragu ni
 * sitemap, a primitivi ostaju prezentacioni (podaci samo kroz props).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRIMITIVES = [
  "xp-bar.tsx",
  "level-stamp.tsx",
  "badge-sticker.tsx",
  "streak-flame.tsx",
  "rank-chip.tsx",
  "odometer.tsx",
  "daily-mission.tsx",
  "trophy-shelf.tsx",
  "progress-card.tsx",
  "igra-lik.tsx",
];

describe("izlog", () => {
  const page = read("app/[locale]/igra-izlog/page.tsx");

  it("u produkciji je 404, pre bilo čega drugog u telu stranice", () => {
    const body = page.slice(page.indexOf("export default async function"));
    const guard = body.indexOf('if (process.env.NODE_ENV === "production") notFound();');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("await "));
  });

  it("nije za pretragu i nije u sitemap-u", () => {
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(read("app/sitemap.ts")).not.toContain("igra-izlog");
  });

  it("delovi imaju jedinstvene ID-jeve i svaki svoj fajl", () => {
    const registry = read("components/igra/izlog/registry.ts");
    const ids = [...registry.matchAll(/\{ id: "([a-z0-9-]+)"/g)].map((match) => match[1]!);
    expect(ids).toEqual(["slike", "pokret", "primitivi", "ljuska", "tabla", "ucionica", "mapa", "zajednica", "rang", "profil", "crea", "poruke", "krediti", "admin", "stanja", "mikro"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(readdirSync(join(ROOT, "components/igra/izlog")), id).toContain(`izlog-${id}.tsx`);
  });

  it("ne zove Convex: podaci su samo test podaci", () => {
    for (const file of readdirSync(join(ROOT, "components/igra/izlog"))) {
      expect(read(`components/igra/izlog/${file}`), file).not.toMatch(/from "convex\/react"|_generated\/api/);
    }
  });
});

describe("primitivi", () => {
  it("svaki primitiv iz plana §2.3 ima svoj fajl", () => {
    const files = readdirSync(join(ROOT, "components/igra"));
    for (const file of PRIMITIVES) expect(files, file).toContain(file);
  });

  it("prezentacioni su: bez upita, mutacija i test podataka", () => {
    for (const file of PRIMITIVES) {
      const source = read(`components/igra/${file}`);
      expect(source, file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation/);
      expect(source, file).not.toContain("igra-fixtures");
    }
  });

  it("slike idu samo kroz IgraArt, nikad direktno", () => {
    for (const file of PRIMITIVES) {
      const source = read(`components/igra/${file}`);
      expect(source, file).not.toMatch(/<img\b|\/brand\/igra\//);
    }
  });

  it("nijedan ne forsira radijus ni boju mimo tokena", () => {
    for (const file of PRIMITIVES) {
      const source = read(`components/igra/${file}`);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius/);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
