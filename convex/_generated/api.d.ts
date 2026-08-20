/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authInternal from "../authInternal.js";
import type * as avatar from "../avatar.js";
import type * as billing from "../billing.js";
import type * as chat from "../chat.js";
import type * as chatCore from "../chatCore.js";
import type * as chatInboxSummaryCore from "../chatInboxSummaryCore.js";
import type * as chatLinkPreview from "../chatLinkPreview.js";
import type * as chatLinkPreviewData from "../chatLinkPreviewData.js";
import type * as chatMedia from "../chatMedia.js";
import type * as chatMediaData from "../chatMediaData.js";
import type * as chatModeration from "../chatModeration.js";
import type * as chatPush from "../chatPush.js";
import type * as chatSearchProjection from "../chatSearchProjection.js";
import type * as community from "../community.js";
import type * as communityScope from "../communityScope.js";
import type * as contentHierarchy from "../contentHierarchy.js";
import type * as contentReadiness from "../contentReadiness.js";
import type * as courses from "../courses.js";
import type * as creditPacks from "../creditPacks.js";
import type * as credits from "../credits.js";
import type * as creditsCore from "../creditsCore.js";
import type * as crons from "../crons.js";
import type * as emailVerification from "../emailVerification.js";
import type * as emailVerificationInternal from "../emailVerificationInternal.js";
import type * as falWebhook from "../falWebhook.js";
import type * as falWebhookCore from "../falWebhookCore.js";
import type * as helpTopics from "../helpTopics.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as identityMerge from "../identityMerge.js";
import type * as lab from "../lab.js";
import type * as leaderboard from "../leaderboard.js";
import type * as leaderboardCore from "../leaderboardCore.js";
import type * as migrations from "../migrations.js";
import type * as modelCatalog from "../modelCatalog.js";
import type * as notifications from "../notifications.js";
import type * as profileActivityCore from "../profileActivityCore.js";
import type * as profiles from "../profiles.js";
import type * as providers_bytePlusCore from "../providers/bytePlusCore.js";
import type * as providers_bytePlusModels from "../providers/bytePlusModels.js";
import type * as providers_byteplus from "../providers/byteplus.js";
import type * as providers_catalogModels from "../providers/catalogModels.js";
import type * as providers_falAudioModels from "../providers/falAudioModels.js";
import type * as providers_falImageModels from "../providers/falImageModels.js";
import type * as providers_falToolModels from "../providers/falToolModels.js";
import type * as providers_falVideoModels from "../providers/falVideoModels.js";
import type * as providers_google from "../providers/google.js";
import type * as providers_googleCore from "../providers/googleCore.js";
import type * as providers_googleImageModels from "../providers/googleImageModels.js";
import type * as providers_googleModels from "../providers/googleModels.js";
import type * as providers_jobInputs from "../providers/jobInputs.js";
import type * as providers_modelControls from "../providers/modelControls.js";
import type * as providers_modelSeed from "../providers/modelSeed.js";
import type * as publicProfiles from "../publicProfiles.js";
import type * as seed from "../seed.js";
import type * as studio from "../studio.js";
import type * as studioActions from "../studioActions.js";
import type * as studioAdmin from "../studioAdmin.js";
import type * as studioCore from "../studioCore.js";
import type * as studioModels from "../studioModels.js";
import type * as studioParamSpec from "../studioParamSpec.js";
import type * as studioPricing from "../studioPricing.js";
import type * as study from "../study.js";
import type * as studyHubSummaryCore from "../studyHubSummaryCore.js";
import type * as video from "../video.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authInternal: typeof authInternal;
  avatar: typeof avatar;
  billing: typeof billing;
  chat: typeof chat;
  chatCore: typeof chatCore;
  chatInboxSummaryCore: typeof chatInboxSummaryCore;
  chatLinkPreview: typeof chatLinkPreview;
  chatLinkPreviewData: typeof chatLinkPreviewData;
  chatMedia: typeof chatMedia;
  chatMediaData: typeof chatMediaData;
  chatModeration: typeof chatModeration;
  chatPush: typeof chatPush;
  chatSearchProjection: typeof chatSearchProjection;
  community: typeof community;
  communityScope: typeof communityScope;
  contentHierarchy: typeof contentHierarchy;
  contentReadiness: typeof contentReadiness;
  courses: typeof courses;
  creditPacks: typeof creditPacks;
  credits: typeof credits;
  creditsCore: typeof creditsCore;
  crons: typeof crons;
  emailVerification: typeof emailVerification;
  emailVerificationInternal: typeof emailVerificationInternal;
  falWebhook: typeof falWebhook;
  falWebhookCore: typeof falWebhookCore;
  helpTopics: typeof helpTopics;
  helpers: typeof helpers;
  http: typeof http;
  identityMerge: typeof identityMerge;
  lab: typeof lab;
  leaderboard: typeof leaderboard;
  leaderboardCore: typeof leaderboardCore;
  migrations: typeof migrations;
  modelCatalog: typeof modelCatalog;
  notifications: typeof notifications;
  profileActivityCore: typeof profileActivityCore;
  profiles: typeof profiles;
  "providers/bytePlusCore": typeof providers_bytePlusCore;
  "providers/bytePlusModels": typeof providers_bytePlusModels;
  "providers/byteplus": typeof providers_byteplus;
  "providers/catalogModels": typeof providers_catalogModels;
  "providers/falAudioModels": typeof providers_falAudioModels;
  "providers/falImageModels": typeof providers_falImageModels;
  "providers/falToolModels": typeof providers_falToolModels;
  "providers/falVideoModels": typeof providers_falVideoModels;
  "providers/google": typeof providers_google;
  "providers/googleCore": typeof providers_googleCore;
  "providers/googleImageModels": typeof providers_googleImageModels;
  "providers/googleModels": typeof providers_googleModels;
  "providers/jobInputs": typeof providers_jobInputs;
  "providers/modelControls": typeof providers_modelControls;
  "providers/modelSeed": typeof providers_modelSeed;
  publicProfiles: typeof publicProfiles;
  seed: typeof seed;
  studio: typeof studio;
  studioActions: typeof studioActions;
  studioAdmin: typeof studioAdmin;
  studioCore: typeof studioCore;
  studioModels: typeof studioModels;
  studioParamSpec: typeof studioParamSpec;
  studioPricing: typeof studioPricing;
  study: typeof study;
  studyHubSummaryCore: typeof studyHubSummaryCore;
  video: typeof video;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  chatInbox: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"chatInbox">;
  studyHub: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"studyHub">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
