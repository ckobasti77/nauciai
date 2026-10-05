/// <reference types="vite/client" />

/** K13 (S8): „Moji stilovi" - čuvanje, provera ulaza, granica i vlasništvo. */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { MY_STYLES_MAX } from "./creaStyles";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, email = "stil@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Stil",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

describe("Moji stilovi", () => {
  test("čuva stil + kameru (sređenu) + paletu (sređenu) i vraća ih vlasniku", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await asUser.mutation(api.creaStyles.saveMyStyle, {
      name: "  Moj   film ",
      styleId: "foto-film",
      camera: { body: "film35", lens: "fiksni", focal: 80, aperture: "f/2" },
      palette: ["#FFAA00", "nije boja", "#ffaa00", "#112233"],
      promptFragment: " toplo, jesen ",
    });
    const list = await asUser.query(api.creaStyles.listMyStyles, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Moj film",
      styleId: "foto-film",
      camera: { body: "film35", lens: "fiksni", focal: 85, aperture: "f/2" },
      palette: ["#ffaa00", "#112233"],
      promptFragment: "toplo, jesen",
    });
  });

  test("odbija prazno, nepoznat stil, predugo ime i predug dodatak", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await expect(asUser.mutation(api.creaStyles.saveMyStyle, { name: "Prazan" })).rejects.toThrow("PRAZAN_STIL");
    await expect(asUser.mutation(api.creaStyles.saveMyStyle, { name: "X", styleId: "nema-ga" })).rejects.toThrow("NEPOZNAT_STIL");
    await expect(asUser.mutation(api.creaStyles.saveMyStyle, { name: "x".repeat(41), styleId: "ilu-akvarel" })).rejects.toThrow(
      "NEISPRAVNO_IME_STILA",
    );
    await expect(asUser.mutation(api.creaStyles.saveMyStyle, { name: "Dug", promptFragment: "a".repeat(301) })).rejects.toThrow(
      "PREDUG_DODATAK_STILA",
    );
  });

  test("granica broja stilova", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < MY_STYLES_MAX; index += 1) {
        await ctx.db.insert("creaUserStyles", { userId, name: `S${index}`, promptFragment: "x", uses: 0, isPublic: false, createdAt: index });
      }
    });
    await expect(asUser.mutation(api.creaStyles.saveMyStyle, { name: "Još", styleId: "ilu-akvarel" })).rejects.toThrow("PREVISE_STILOVA");
  });

  test("drugi korisnik ne vidi i ne briše tuđ stil; vlasnik briše", async () => {
    const t = makeT();
    const owner = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const id = await owner.asUser.mutation(api.creaStyles.saveMyStyle, { name: "Akvarel", styleId: "ilu-akvarel" });
    expect(await other.asUser.query(api.creaStyles.listMyStyles, {})).toEqual([]);
    expect(await other.asUser.mutation(api.creaStyles.deleteMyStyle, { styleId: id })).toBe(false);
    expect(await owner.asUser.mutation(api.creaStyles.deleteMyStyle, { styleId: id })).toBe(true);
    expect(await owner.asUser.query(api.creaStyles.listMyStyles, {})).toEqual([]);
  });
});
