/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeAll(() => {
  // "admin" nije dodeljiva uloga - jedini put do nje je `INITIAL_ADMIN_EMAILS`,
  // isto kao u `studioAdmin.test.ts`.
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

type TestConvex = ReturnType<typeof convexTest>;

async function seedUser(t: TestConvex, email: string, role: "admin" | "student") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: email,
      role,
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("get je javan i vraća null dok admin ništa nije sačuvao", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.platformSettings.get, {})).toBeNull();
});

test("update sme samo admin", async () => {
  const t = convexTest(schema, modules);
  const asStudent = await seedUser(t, "student@example.com", "student");

  await expect(
    t.mutation(api.platformSettings.update, { contact: { email: "a@b.com" } }),
  ).rejects.toThrow();
  await expect(
    asStudent.mutation(api.platformSettings.update, { contact: { email: "a@b.com" } }),
  ).rejects.toThrow(/Forbidden/);
});

test("admin upisuje po kartici; netaknuta kartica ostaje kakva je bila", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedUser(t, "admin@example.com", "admin");

  await asAdmin.mutation(api.platformSettings.update, {
    contact: { email: "zdravo@nauciai.com", phone: "+381641234567", address: "  " },
  });
  await asAdmin.mutation(api.platformSettings.update, {
    pricing: { basicEur: "12,00", premiumEur: "24,00" },
  });

  const settings = await t.query(api.platformSettings.get, {});
  expect(settings?.contact.email).toBe("zdravo@nauciai.com");
  expect(settings?.contact.phone).toBe("+381641234567");
  // Polje od samih razmaka se upisuje kao izostavljeno, ne kao prazan string.
  expect(settings?.contact.address).toBeUndefined();
  expect(settings?.pricing.basicEur).toBe("12,00");
});

test("get ne vraća ništa osim četiri javne grupe", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedUser(t, "admin@example.com", "admin");
  await asAdmin.mutation(api.platformSettings.update, { brand: { pib: "123456789" } });

  const settings = await t.query(api.platformSettings.get, {});
  expect(Object.keys(settings ?? {}).sort()).toEqual(["brand", "contact", "pricing", "socials"]);
});

test("odbija nevalidan e-mail, telefon van E.164 i adresu mreže sa pogrešnog domena", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await seedUser(t, "admin@example.com", "admin");

  await expect(
    asAdmin.mutation(api.platformSettings.update, { contact: { email: "nije-adresa" } }),
  ).rejects.toThrow(/E-adresa/);
  await expect(
    asAdmin.mutation(api.platformSettings.update, { contact: { phone: "064 123 4567" } }),
  ).rejects.toThrow(/E\.164/);
  await expect(
    asAdmin.mutation(api.platformSettings.update, { socials: { instagram: "http://instagram.com/x" } }),
  ).rejects.toThrow(/https/);
  await expect(
    asAdmin.mutation(api.platformSettings.update, { socials: { facebook: "https://zlonamerno.rs/x" } }),
  ).rejects.toThrow(/facebook\.com/);
});
