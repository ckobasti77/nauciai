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
  saveCourseVideo: makeFunctionReference<"mutation">("video:saveCourseVideo"),
  deleteCourseVideo: makeFunctionReference<"mutation">("video:deleteCourseVideo"),
  markProgress: makeFunctionReference<"mutation">("courses:markProgress"),
  upsertLessonPart: makeFunctionReference<"mutation">("courses:upsertLessonPart"),
  createDocumentUploadUrl: makeFunctionReference<"mutation">("video:createDocumentUploadUrl"),
  saveLessonAsset: makeFunctionReference<"mutation">("video:saveLessonAsset"),
  recordAiExchange: makeFunctionReference<"mutation">("lab:recordAiExchange"),
  applyStripeGrant: makeFunctionReference<"mutation">("credits:applyStripeGrant"),
  applyStripeReversal: makeFunctionReference<"mutation">("credits:applyStripeReversal"),
};

export const convexQueries = {
  viewer: makeFunctionReference<"query">("courses:viewer"),
  getAppNavigation: makeFunctionReference<"query">("courses:getAppNavigation"),
  getCourseBySlug: makeFunctionReference<"query">("courses:getCourseBySlug"),
  getPublishedCourseOutline: makeFunctionReference<"query">("courses:getPublishedCourseOutline"),
  getLessonForStudent: makeFunctionReference<"query">("courses:getLessonForStudent"),
  getTrackPage: makeFunctionReference<"query">("contentHierarchy:getTrackPage"),
  getPostDetail: makeFunctionReference<"query">("community:getPostDetail"),
  getPublicPostForSeo: makeFunctionReference<"query">("community:getPublicPostForSeo"),
  listPublicPostsPage: makeFunctionReference<"query">("community:listPublicPostsPage"),
  listPublicRootCommentsPage: makeFunctionReference<"query">("community:listPublicRootCommentsPage"),
  listPublicRepliesPage: makeFunctionReference<"query">("community:listPublicRepliesPage"),
  listPublicInitialRepliesForPost: makeFunctionReference<"query">("community:listPublicInitialRepliesForPost"),
  listPublicPostRefsForSitemap: makeFunctionReference<"query">("community:listPublicPostRefsForSitemap"),
  listPublishedThreadsForSitemap: makeFunctionReference<"query">("community:listPublishedThreadsForSitemap"),
  getLessonLab: makeFunctionReference<"query">("lab:getLessonLab"),
  getBillingSummary: makeFunctionReference<"query">("billing:getBillingSummary"),
  getViewerProfileStatus: makeFunctionReference<"query">("profiles:getViewerProfileStatus"),
  getMySuspension: makeFunctionReference<"query">("chatModeration:getMySuspension"),
  getPackBySlug: makeFunctionReference<"query">("creditPacks:getPackBySlug"),
  // Opšte informacije platforme (N1): javan upit, čita ga i landing u SSR-u.
  getPlatformSettings: makeFunctionReference<"query">("platformSettings:get"),
  // Javni landing Studija (studio-public F3): obe su no-auth projektovane
  // queries, pa cene stižu u SSR HTML koji Google čita.
  listPacks: makeFunctionReference<"query">("creditPacks:listPacks"),
  listCatalogModels: makeFunctionReference<"query">("modelCatalog:listModels"),
};
