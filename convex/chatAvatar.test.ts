/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}

const chatApi = {
  createGroup: makeFunctionReference<"mutation">("chat:createGroup"),
  createGroupAvatarUpload: makeFunctionReference<"mutation">("chat:createGroupAvatarUpload"),
  prepareGroupAvatar: makeFunctionReference<"action">("chatMedia:prepareGroupAvatar"),
  respondGroupInvite: makeFunctionReference<"mutation">("chat:respondGroupInvite"),
  transferGroupOwnership: makeFunctionReference<"mutation">("chat:transferGroupOwnership"),
  updateGroup: makeFunctionReference<"mutation">("chat:updateGroup"),
};

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `chat-avatar-test|${userId}` });
}

async function seedUsers(t: ReturnType<typeof convexTest>, count: number) {
  return t.run(async (ctx) => {
    const ids: Id<"users">[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(await ctx.db.insert("users", {
        email: `chat-avatar-${index}@example.com`,
        name: `Avatar User ${index}`,
        username: `avatar_user_${index}`,
        role: "student",
        dmPrivacy: "requests",
        language: "sr",
        createdAt: index + 1,
        updatedAt: index + 1,
      }));
    }
    return ids;
  });
}

const validPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
  (char) => char.charCodeAt(0),
);

async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createUploadIntent(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<"users">,
  conversationId: Id<"chatConversations">,
  bytes = validPng,
  contentType = "image/png",
) {
  return asUser(t, ownerId).mutation(chatApi.createGroupAvatarUpload, {
    conversationId,
    sha256: await sha256Hex(bytes),
    byteSize: bytes.byteLength,
    contentType,
  }) as Promise<{ uploadId: Id<"chatGroupAvatarUploads">; uploadUrl: string; expiresAt: number }>;
}

test("group avatar intent sanitizes WebP, consumes once, and deletes only its raw upload", async () => {
  const t = createTest();
  const [ownerId] = await seedUsers(t, 1);
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, { name: "Avatar grupa", memberIds: [] }) as { conversationId: Id<"chatConversations"> };
  const intent = await createUploadIntent(t, ownerId, group.conversationId);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([validPng], { type: "image/png" })));

  const prepared = await asUser(t, ownerId).action(chatApi.prepareGroupAvatar, {
    conversationId: group.conversationId,
    uploadId: intent.uploadId,
    storageId: rawStorageId,
  });

  expect(prepared).toMatchObject({ mimeType: "image/webp", width: 1, height: 1 });
  const state = await t.run(async (ctx) => ({
    conversation: await ctx.db.get(group.conversationId),
    upload: await ctx.db.get(intent.uploadId),
    files: await ctx.db.query("chatGroupAvatarFiles").collect(),
    rawExists: Boolean(await ctx.storage.get(rawStorageId)),
    final: await ctx.storage.get(prepared.storageId).then((blob) => ({ exists: Boolean(blob), type: blob?.type })),
  }));
  expect(state.conversation?.imageStorageId).toBe(prepared.storageId);
  expect(state.upload?.status).toBe("consumed");
  expect(state.files).toHaveLength(1);
  expect(state.rawExists).toBe(false);
  expect(state.final).toEqual({ exists: true, type: "image/webp" });

  await expect(asUser(t, ownerId).action(chatApi.prepareGroupAvatar, {
    conversationId: group.conversationId,
    uploadId: intent.uploadId,
    storageId: rawStorageId,
  })).rejects.toThrow("INVALID_GROUP_AVATAR_UPLOAD");
  expect(await t.run(async (ctx) => Boolean(await ctx.storage.get(prepared.storageId)))).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("chatGroupAvatarFiles").collect())).toHaveLength(1);
});

test("failed avatar ownership check never deletes the supplied storage file", async () => {
  const t = createTest();
  const [ownerId, outsiderId] = await seedUsers(t, 2);
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, { name: "Privatna grupa", memberIds: [] }) as { conversationId: Id<"chatConversations"> };
  const intent = await createUploadIntent(t, ownerId, group.conversationId);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([validPng], { type: "image/png" })));

  await expect(asUser(t, outsiderId).action(chatApi.prepareGroupAvatar, {
    conversationId: group.conversationId,
    uploadId: intent.uploadId,
    storageId: rawStorageId,
  })).rejects.toThrow("Forbidden");
  expect(await t.run(async (ctx) => Boolean(await ctx.storage.get(rawStorageId)))).toBe(true);
  expect((await t.run((ctx) => ctx.db.get(intent.uploadId)))?.status).toBe("pending");
});

test("ownership transfer before apply blocks the former owner without deleting raw data", async () => {
  const t = createTest();
  const [ownerId, nextOwnerId] = await seedUsers(t, 2);
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, {
    name: "Prenos vlasnistva",
    memberIds: [nextOwnerId],
  }) as { conversationId: Id<"chatConversations"> };
  await asUser(t, nextOwnerId).mutation(chatApi.respondGroupInvite, {
    conversationId: group.conversationId,
    accept: true,
  });
  const intent = await createUploadIntent(t, ownerId, group.conversationId);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([validPng], { type: "image/png" })));
  await asUser(t, ownerId).mutation(chatApi.transferGroupOwnership, {
    conversationId: group.conversationId,
    newOwnerId: nextOwnerId,
  });

  await expect(asUser(t, ownerId).action(chatApi.prepareGroupAvatar, {
    conversationId: group.conversationId,
    uploadId: intent.uploadId,
    storageId: rawStorageId,
  })).rejects.toThrow("Forbidden");
  expect(await t.run(async (ctx) => Boolean(await ctx.storage.get(rawStorageId)))).toBe(true);
});

test("invalid image consumes its own intent and cleans only its claimed raw upload", async () => {
  const t = createTest();
  const [ownerId] = await seedUsers(t, 1);
  const invalidBytes = new TextEncoder().encode("nije slika");
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, { name: "Los avatar", memberIds: [] }) as { conversationId: Id<"chatConversations"> };
  const intent = await createUploadIntent(t, ownerId, group.conversationId, invalidBytes);
  const rawStorageId = await t.run((ctx) => ctx.storage.store(new Blob([invalidBytes], { type: "image/png" })));

  await expect(asUser(t, ownerId).action(chatApi.prepareGroupAvatar, {
    conversationId: group.conversationId,
    uploadId: intent.uploadId,
    storageId: rawStorageId,
  })).rejects.toThrow();
  expect(await t.run(async (ctx) => Boolean(await ctx.storage.get(rawStorageId)))).toBe(false);
  expect((await t.run((ctx) => ctx.db.get(intent.uploadId)))?.status).toBe("failed");
});

test("removing a legacy shared avatar never deletes another conversation's file", async () => {
  const t = createTest();
  const [ownerId] = await seedUsers(t, 1);
  const first = await asUser(t, ownerId).mutation(chatApi.createGroup, { name: "Prva grupa", memberIds: [] }) as { conversationId: Id<"chatConversations"> };
  const second = await asUser(t, ownerId).mutation(chatApi.createGroup, { name: "Druga grupa", memberIds: [] }) as { conversationId: Id<"chatConversations"> };
  const legacyStorageId = await t.run((ctx) => ctx.storage.store(new Blob([validPng], { type: "image/png" })));
  await t.run(async (ctx) => {
    await ctx.db.patch(first.conversationId, { imageStorageId: legacyStorageId });
    await ctx.db.patch(second.conversationId, { imageStorageId: legacyStorageId });
  });

  await asUser(t, ownerId).mutation(chatApi.updateGroup, {
    conversationId: first.conversationId,
    removeImage: true,
  });
  const state = await t.run(async (ctx) => ({
    first: await ctx.db.get(first.conversationId),
    second: await ctx.db.get(second.conversationId),
    legacyExists: Boolean(await ctx.storage.get(legacyStorageId)),
  }));
  expect(state.first?.imageStorageId).toBeUndefined();
  expect(state.second?.imageStorageId).toBe(legacyStorageId);
  expect(state.legacyExists).toBe(true);
});
