/// <reference types="vite/client" />

/** Tabla (K28, U13): raspored se čuva po korisniku; tuđa tabla se ne vidi i ne pomera. */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BOARD_LIMITS } from "./creaBoard";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, email: string) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email, name: "T", username: email.split("@")[0]!, language: "sr" as const, createdAt: 1, updatedAt: 1 }),
  );
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function doneJob(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["x"]));
    return ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image",
      params: "{}",
      promptHash: "h",
      status: "done",
      creditCost: 16,
      outputStorageId: storageId,
      createdAt: 1,
    });
  });
}

test("raspored se čuva po korisniku i preživi novo učitavanje", async () => {
  const t = makeT();
  const ana = await seedUser(t, "ana@example.com");
  const jobId = await doneJob(t, ana.userId);

  const workId = await ana.as.mutation(api.creaBoard.addWork, { jobId, x: 10.4, y: -20 });
  const noteId = await ana.as.mutation(api.creaBoard.addNote, { text: "topli tonovi", x: 300, y: 40 });
  await ana.as.mutation(api.creaBoard.moveItem, { itemId: workId, x: 512, y: 128, w: 9999 });
  await ana.as.mutation(api.creaBoard.updateNote, { itemId: noteId, text: "topli tonovi, drvo" });

  const board = await ana.as.query(api.creaBoard.listBoard, {});
  const work = board.find((item) => item._id === workId)!;
  expect(work).toMatchObject({ kind: "work", x: 512, y: 128, w: BOARD_LIMITS.maxWidth, jobId, mediaKind: "image" });
  expect(work.outputUrl).toBeTruthy();
  expect(board.find((item) => item._id === noteId)).toMatchObject({ kind: "note", text: "topli tonovi, drvo", x: 300, y: 40 });

  // Isti rad drugi put ne pravi duplikat, samo ga pomeri.
  expect(await ana.as.mutation(api.creaBoard.addWork, { jobId, x: 0, y: 0 })).toBe(workId);
  expect((await ana.as.query(api.creaBoard.listBoard, {})).length).toBe(2);

  await ana.as.mutation(api.creaBoard.removeItem, { itemId: noteId });
  expect((await ana.as.query(api.creaBoard.listBoard, {})).map((item) => item._id)).toEqual([workId]);
});

test("tuđa tabla se ne vidi, ne pomera i ne prima tuđ rad", async () => {
  const t = makeT();
  const ana = await seedUser(t, "ana@example.com");
  const ben = await seedUser(t, "ben@example.com");
  const jobId = await doneJob(t, ana.userId);
  const itemId = await ana.as.mutation(api.creaBoard.addWork, { jobId, x: 1, y: 2 });

  expect(await ben.as.query(api.creaBoard.listBoard, {})).toEqual([]);
  await expect(ben.as.mutation(api.creaBoard.moveItem, { itemId, x: 9, y: 9 })).rejects.toThrow("NEMA_PRISTUPA");
  await expect(ben.as.mutation(api.creaBoard.removeItem, { itemId })).rejects.toThrow("NEMA_PRISTUPA");
  await expect(ben.as.mutation(api.creaBoard.addWork, { jobId, x: 0, y: 0 })).rejects.toThrow("IZVOR_NIJE_DOSTUPAN");
  expect((await ana.as.query(api.creaBoard.listBoard, {}))[0]).toMatchObject({ x: 1, y: 2 });
});

test("tabla ima granicu stavki", async () => {
  const t = makeT();
  const ana = await seedUser(t, "ana@example.com");
  await t.run(async (ctx) => {
    for (let index = 0; index < BOARD_LIMITS.items; index += 1) {
      await ctx.db.insert("creaBoardItems", { userId: ana.userId, kind: "note", text: "", x: 0, y: 0, w: 200, createdAt: 1 });
    }
  });
  await expect(ana.as.mutation(api.creaBoard.addNote, { text: "još", x: 0, y: 0 })).rejects.toThrow("TABLA_PUNA");
});
