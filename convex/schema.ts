import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const language = v.union(v.literal("sr"), v.literal("en"));
const role = v.union(v.literal("student"), v.literal("admin"));
const publishStatus = v.union(v.literal("draft"), v.literal("published"), v.literal("archived"));
const subscriptionStatus = v.union(
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("unpaid"),
  v.literal("paused"),
);
const assetKind = v.union(v.literal("pdf"), v.literal("prompt"), v.literal("worksheet"), v.literal("project"));
const lessonPartKind = v.union(v.literal("text"), v.literal("video"), v.literal("file"));
const muxStatus = v.union(
  v.literal("draft"),
  v.literal("waiting"),
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("errored"),
);

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role,
    language,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  courses: defineTable({
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    subtitleSr: v.string(),
    subtitleEn: v.string(),
    descriptionSr: v.string(),
    descriptionEn: v.string(),
    status: publishStatus,
    stripePriceId: v.optional(v.string()),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status", "sortOrder"]),

  modules: defineTable({
    courseId: v.id("courses"),
    titleSr: v.string(),
    titleEn: v.string(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  }).index("by_course", ["courseId", "sortOrder"]),

  lessons: defineTable({
    courseId: v.id("courses"),
    moduleId: v.id("modules"),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    summarySr: v.string(),
    summaryEn: v.string(),
    durationSeconds: v.number(),
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    muxStatus,
    isPublished: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course_slug", ["courseId", "slug"])
    .index("by_module", ["moduleId", "sortOrder"])
    .index("by_mux_upload", ["muxUploadId"])
    .index("by_mux_asset", ["muxAssetId"]),

  lessonParts: defineTable({
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    parentPartId: v.optional(v.id("lessonParts")),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    kind: lessonPartKind,
    bodySr: v.optional(v.string()),
    bodyEn: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    isPublished: v.boolean(),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_lesson", ["lessonId", "sortOrder"])
    .index("by_lesson_parent", ["lessonId", "parentPartId", "sortOrder"])
    .index("by_lesson_slug", ["lessonId", "slug"])
    .index("by_course", ["courseId", "sortOrder"])
    .index("by_course_slug", ["courseId", "slug"]),

  lessonAssets: defineTable({
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    titleSr: v.string(),
    titleEn: v.string(),
    kind: assetKind,
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    byteSize: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_course", ["courseId"]),

  documents: defineTable({
    courseId: v.id("courses"),
    lessonId: v.optional(v.id("lessons")),
    titleSr: v.string(),
    titleEn: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_lesson", ["lessonId"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    status: subscriptionStatus,
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_subscription", ["stripeSubscriptionId"])
    .index("by_customer", ["stripeCustomerId"]),

  enrollments: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    status: v.union(v.literal("active"), v.literal("blocked")),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user", ["userId"]),

  progress: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    completed: v.boolean(),
    positionSeconds: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_lesson", ["userId", "lessonId"]),

  communityPosts: defineTable({
    authorId: v.id("users"),
    courseId: v.optional(v.id("courses")),
    language,
    title: v.string(),
    body: v.string(),
    visibility: v.union(v.literal("members"), v.literal("public")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),

  comments: defineTable({
    postId: v.id("communityPosts"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("comments")),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_parent", ["parentId"]),

  reactions: defineTable({
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    userId: v.id("users"),
    reaction: v.union(v.literal("like"), v.literal("celebrate")),
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_user_target", ["userId", "targetType", "targetId"]),

  notifications: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),
});
