import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { readEnv } from "./env";

export function getConvexHttpClient(authToken?: string): ConvexHttpClient | null {
  const convexUrl = readEnv("NEXT_PUBLIC_CONVEX_URL");
  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl, {
    auth: authToken,
    logger: false,
  });
}

export const convexMutations = {
  syncStripeSubscription: makeFunctionReference<"mutation">("billing:syncStripeSubscription"),
  syncMuxAsset: makeFunctionReference<"mutation">("video:syncMuxAsset"),
  attachMuxUpload: makeFunctionReference<"mutation">("video:attachMuxUpload"),
  markProgress: makeFunctionReference<"mutation">("courses:markProgress"),
  upsertLessonPart: makeFunctionReference<"mutation">("courses:upsertLessonPart"),
  createDocumentUploadUrl: makeFunctionReference<"mutation">("video:createDocumentUploadUrl"),
  saveLessonAsset: makeFunctionReference<"mutation">("video:saveLessonAsset"),
};

export const convexQueries = {
  viewer: makeFunctionReference<"query">("courses:viewer"),
  getAppNavigation: makeFunctionReference<"query">("courses:getAppNavigation"),
  getCourseBySlug: makeFunctionReference<"query">("courses:getCourseBySlug"),
  getLessonForStudent: makeFunctionReference<"query">("courses:getLessonForStudent"),
  getBillingSummary: makeFunctionReference<"query">("billing:getBillingSummary"),
};
