"use node";

import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import webpush from "web-push";

import type { Id } from "./_generated/dataModel";
import { env, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";

type PushDelivery = {
  endpointHash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  url: string;
  conversationId?: Id<"chatConversations">;
  sequence?: number;
  eventKey?: string;
};

const getPushBatchDataRef = makeFunctionReference<
  "query",
  {
    conversationId: Id<"chatConversations">;
    sequence: number;
    recipientIds: Id<"users">[];
  },
  PushDelivery[]
>("chatCore:getPushBatchData");

const removeInvalidSubscriptionsRef = makeFunctionReference<
  "mutation",
  { endpointHashes: string[] },
  null
>("chatCore:removeInvalidPushSubscriptions");

const getActivityPushBatchDataRef = makeFunctionReference<
  "query",
  {
    category: "requests" | "groups" | "study";
    recipientIds: Id<"users">[];
    senderId?: Id<"users">;
    conversationId?: Id<"chatConversations">;
    title: string;
    body: string;
    urlPath: string;
    eventKey: string;
  },
  PushDelivery[]
>("chatCore:getActivityPushBatchData");

async function sendDeliveries(
  ctx: ActionCtx,
  deliveries: PushDelivery[],
) {
  if (!deliveries.length || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const vapidDetails = {
    subject: env.VAPID_SUBJECT ?? "mailto:support@nauciai.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const invalid: string[] = [];
  await Promise.allSettled(
    deliveries.map(async (delivery) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: delivery.endpoint,
            keys: { p256dh: delivery.p256dh, auth: delivery.auth },
          },
          JSON.stringify({
            title: delivery.title,
            body: delivery.body,
            url: delivery.url,
            conversationId: delivery.conversationId,
            sequence: delivery.sequence,
            eventKey: delivery.eventKey,
          }),
          {
            vapidDetails,
            TTL: 60 * 60,
            urgency: "normal",
            topic: `chat-${String(delivery.eventKey ?? delivery.conversationId ?? "activity").slice(-20)}`,
          },
        );
      } catch (error) {
        if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          invalid.push(delivery.endpointHash);
        }
      }
    }),
  );
  if (invalid.length) await ctx.runMutation(removeInvalidSubscriptionsRef, { endpointHashes: invalid });
  return null;
}

export const sendPushBatch = internalAction({
  args: {
    conversationId: v.id("chatConversations"),
    sequence: v.number(),
    recipientIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
    const deliveries: PushDelivery[] = await ctx.runQuery(getPushBatchDataRef, args);
    return sendDeliveries(ctx, deliveries);
  },
});

export const sendActivityPushBatch = internalAction({
  args: {
    category: v.union(v.literal("requests"), v.literal("groups"), v.literal("study")),
    recipientIds: v.array(v.id("users")),
    senderId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("chatConversations")),
    title: v.string(),
    body: v.string(),
    urlPath: v.string(),
    eventKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
    const deliveries: PushDelivery[] = await ctx.runQuery(getActivityPushBatchDataRef, args);
    return sendDeliveries(ctx, deliveries);
  },
});
