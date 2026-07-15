/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { upsertProfileFromAuthUser } from "./helpers";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("profile edits patch the same user without touching accounts or sessions", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "profile@example.com",
      name: "Old Name",
      firstName: "Old",
      lastName: "Name",
      username: "old_name",
      role: "student",
      language: "sr",
      searchText: "Old Name old_name profile@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const accountId = await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: "profile@example.com",
      secret: "hash",
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return { userId, accountId, sessionId };
  });
  const viewer = t.withIdentity({ subject: ids.userId, tokenIdentifier: `test|${ids.userId}` });
  const before = await t.run(async (ctx) => ({
    account: await ctx.db.get(ids.accountId),
    session: await ctx.db.get(ids.sessionId),
  }));

  await viewer.mutation(api.profiles.updateViewerProfile, {
    firstName: "Novo",
    lastName: "Ime",
    username: "novo_ime",
    language: "en",
  });

  const after = await t.run(async (ctx) => ({
    user: await ctx.db.get(ids.userId),
    account: await ctx.db.get(ids.accountId),
    session: await ctx.db.get(ids.sessionId),
  }));
  expect(after.user).toMatchObject({
    _id: ids.userId,
    name: "Novo Ime",
    firstName: "Novo",
    lastName: "Ime",
    username: "novo_ime",
    language: "en",
  });
  expect(after.account).toEqual(before.account);
  expect(after.session).toEqual(before.session);
});

test("Google auth refresh does not overwrite member-owned profile fields", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      email: "member@example.com",
      name: "Ručno Ime",
      firstName: "Ručno",
      lastName: "Ime",
      username: "rucno_ime",
      avatarUrl: "/custom-avatar.png",
      avatarPreset: "cosmic-scholar",
      role: "moderator",
      language: "en",
      searchText: "Ručno Ime rucno_ime member@example.com",
      createdAt: 4,
      updatedAt: 5,
    });
    await upsertProfileFromAuthUser(ctx, id, {
      email: "member@example.com",
      name: "Google Name",
      image: "https://google.example/avatar.png",
      username: "google_name",
    });
    return id;
  });

  const user = await t.run((ctx) => ctx.db.get(userId));
  expect(user).toMatchObject({
    name: "Ručno Ime",
    firstName: "Ručno",
    lastName: "Ime",
    username: "rucno_ime",
    avatarUrl: "/custom-avatar.png",
    avatarPreset: "cosmic-scholar",
    role: "moderator",
    language: "en",
    updatedAt: 5,
  });
});
