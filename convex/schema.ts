import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const language = v.union(v.literal("sr"), v.literal("en"));
const role = v.union(
  v.literal("student"),
  v.literal("pro_student"),
  v.literal("moderator"),
  v.literal("admin"),
);
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
const labOutputKind = v.union(v.literal("text"), v.literal("image"), v.literal("audio"), v.literal("video"), v.literal("file"));
const labOutputStatus = v.union(v.literal("draft"), v.literal("ready"), v.literal("failed"));
const labTaskCompletionMode = v.union(v.literal("manual"), v.literal("automatic"), v.literal("hybrid"));
const aiMessageRole = v.union(v.literal("user"), v.literal("assistant"), v.literal("system"));
const communityScopeKind = v.union(v.literal("global"), v.literal("track"), v.literal("course"));
const communityPostStatus = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("published"),
  v.literal("changes_requested"),
);
const leaderboardPeriod = v.union(v.literal("week"), v.literal("all_time"));
const leaderboardSourceType = v.union(
  v.literal("lesson"),
  v.literal("required_task"),
  v.literal("helpful_comment"),
);

// Convex Auth owns the users table, but the community needs the registration
// username before the app-level profile projection is created. Keep this field
// optional during the migration so existing auth documents remain valid.
const authUsers = defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  // App-level confirmation used before a Google/OAuth account can add a
  // password credential. OAuth verification remains separate from this proof.
  passwordEmailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
})
  .index("email", ["email"])
  .index("phone", ["phone"])
  .index("username", ["username"]);


export default defineSchema({
  ...authTables,
  users: authUsers,

  emailVerificationTokens: defineTable({
    userId: v.id("users"),
    email: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"]),

  profiles: defineTable({
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarPreset: v.optional(
      v.union(v.literal("mythic-mentor"), v.literal("cosmic-scholar"), v.literal("hybrid-guardian")),
    ),
    role,
    language,
    searchText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_username", ["username"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["role"],
    }),

  profileStats: defineTable({
    userId: v.id("users"),
    completedLessons: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  courseTracks: defineTable({
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    descriptionSr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    status: publishStatus,
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_sortOrder", ["status", "sortOrder"]),

  courses: defineTable({
    trackId: v.optional(v.id("courseTracks")),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    subtitleSr: v.string(),
    subtitleEn: v.string(),
    descriptionSr: v.string(),
    descriptionEn: v.string(),
    status: publishStatus,
    stripePriceId: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoFileName: v.optional(v.string()),
    videoByteSize: v.optional(v.number()),
    videoMimeType: v.optional(v.string()),
    videoUpdatedAt: v.optional(v.number()),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status", "sortOrder"])
    .index("by_trackId_and_status_and_sortOrder", ["trackId", "status", "sortOrder"]),

  modules: defineTable({
    courseId: v.id("courses"),
    titleSr: v.string(),
    titleEn: v.string(),
    descriptionSr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageFileName: v.optional(v.string()),
    imageMimeType: v.optional(v.string()),
    imageByteSize: v.optional(v.number()),
    imageAltSr: v.optional(v.string()),
    imageAltEn: v.optional(v.string()),
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
    isPublished: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course_slug", ["courseId", "slug"])
    .index("by_module", ["moduleId", "sortOrder"]),

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

  lessonSteps: defineTable({
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    bodySr: v.string(),
    bodyEn: v.string(),
    outputKind: labOutputKind,
    layout: v.optional(
      v.array(
        v.union(
          v.null(),
          v.object({
            type: v.union(v.literal("explanation"), v.literal("chatbot"), v.literal("output")),
            width: v.number(),
          })
        )
      )
    ),
    prompts: v.optional(
      v.array(
        v.object({
          labelSr: v.string(),
          labelEn: v.string(),
          content: v.string(),
        })
      )
    ),
    systemInstruction: v.optional(v.string()),
    isPublished: v.boolean(),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_lesson", ["lessonId", "sortOrder"])
    .index("by_lesson_slug", ["lessonId", "slug"])
    .index("by_course", ["courseId", "sortOrder"]),

  lessonTasks: defineTable({
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    stepId: v.id("lessonSteps"),
    promptSr: v.string(),
    promptEn: v.string(),
    hintSr: v.optional(v.string()),
    hintEn: v.optional(v.string()),
    required: v.boolean(),
    completionMode: labTaskCompletionMode,
    isPublished: v.boolean(),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_step", ["stepId", "sortOrder"])
    .index("by_lesson", ["lessonId", "sortOrder"])
    .index("by_course", ["courseId", "sortOrder"]),

  aiConversations: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    stepId: v.optional(v.id("lessonSteps")),
    taskId: v.optional(v.id("lessonTasks")),
    title: v.optional(v.string()),
    model: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_lesson", ["userId", "lessonId", "updatedAt"])
    .index("by_user_step", ["userId", "stepId", "updatedAt"]),

  aiMessages: defineTable({
    conversationId: v.id("aiConversations"),
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    role: aiMessageRole,
    content: v.string(),
    model: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_user_lesson", ["userId", "lessonId", "createdAt"]),

  labOutputs: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    stepId: v.optional(v.id("lessonSteps")),
    taskId: v.optional(v.id("lessonTasks")),
    conversationId: v.optional(v.id("aiConversations")),
    messageId: v.optional(v.id("aiMessages")),
    kind: labOutputKind,
    status: labOutputStatus,
    title: v.string(),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    url: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_lesson", ["userId", "lessonId", "updatedAt"])
    .index("by_step", ["stepId", "updatedAt"])
    .index("by_task", ["taskId", "updatedAt"]),

  taskProgress: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    stepId: v.id("lessonSteps"),
    taskId: v.id("lessonTasks"),
    completed: v.boolean(),
    evidenceOutputId: v.optional(v.id("labOutputs")),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_step", ["userId", "stepId"])
    .index("by_user_task", ["userId", "taskId"])
    .index("by_user_lesson", ["userId", "lessonId"])
    .index("by_step", ["stepId"])
    .index("by_task", ["taskId"]),

  lessonStepProgress: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    stepId: v.id("lessonSteps"),
    completed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user_step", ["userId", "stepId"])
    .index("by_user_lesson", ["userId", "lessonId"])
    .index("by_step", ["stepId"]),

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

  courseFavorites: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    createdAt: v.number(),
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
    trackId: v.optional(v.id("courseTracks")),
    moduleId: v.optional(v.id("modules")),
    lessonId: v.optional(v.id("lessons")),
    scopeKind: v.optional(communityScopeKind),
    scopeKey: v.optional(v.string()),
    language,
    title: v.string(),
    body: v.string(),
    searchText: v.optional(v.string()),
    visibility: v.union(v.literal("members"), v.literal("public")),
    isFeaturedGlobal: v.optional(v.boolean()),
    featuredTrackId: v.optional(v.id("courseTracks")),
    featuredCourseId: v.optional(v.id("courses")),
    status: v.optional(communityPostStatus),
    workflowGroup: v.optional(v.union(v.literal("drafts"), v.literal("pending"), v.literal("published"))),
    commentCount: v.optional(v.number()),
    /** Legacy aggregate retained during the vote migration. */
    reactionCount: v.optional(v.number()),
    upvoteCount: v.optional(v.number()),
    downvoteCount: v.optional(v.number()),
    voteScore: v.optional(v.number()),
    hotScore: v.optional(v.number()),
    helpfulAnswerCount: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    moderationReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedBy: v.optional(v.id("users")),
    imageStorageId: v.optional(v.id("_storage")),
    imageMimeType: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_featured_global", ["isFeaturedGlobal", "createdAt"])
    .index("by_featured_track", ["featuredTrackId", "createdAt"])
    .index("by_featured_course", ["featuredCourseId", "createdAt"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_status_and_hotScore", ["status", "hotScore"])
    .index("by_status_and_voteScore", ["status", "voteScore"])
    .index("by_status_and_lastActivityAt", ["status", "lastActivityAt"])
    .index("by_status_and_commentCount_and_lastActivityAt", ["status", "commentCount", "lastActivityAt"])
    .index("by_trackId_and_status_and_createdAt", ["trackId", "status", "createdAt"])
    .index("by_trackId_and_status_and_hotScore", ["trackId", "status", "hotScore"])
    .index("by_trackId_and_status_and_voteScore", ["trackId", "status", "voteScore"])
    .index("by_trackId_and_status_and_lastActivityAt", ["trackId", "status", "lastActivityAt"])
    .index("by_trackId_and_status_and_commentCount_and_lastActivityAt", [
      "trackId",
      "status",
      "commentCount",
      "lastActivityAt",
    ])
    .index("by_moduleId_and_status_and_createdAt", ["moduleId", "status", "createdAt"])
    .index("by_moduleId_and_status_and_hotScore", ["moduleId", "status", "hotScore"])
    .index("by_moduleId_and_status_and_voteScore", ["moduleId", "status", "voteScore"])
    .index("by_moduleId_and_status_and_lastActivityAt", ["moduleId", "status", "lastActivityAt"])
    .index("by_moduleId_and_status_and_commentCount_and_lastActivityAt", [
      "moduleId",
      "status",
      "commentCount",
      "lastActivityAt",
    ])
    .index("by_lessonId_and_status_and_createdAt", ["lessonId", "status", "createdAt"])
    .index("by_lessonId_and_status_and_hotScore", ["lessonId", "status", "hotScore"])
    .index("by_lessonId_and_status_and_voteScore", ["lessonId", "status", "voteScore"])
    .index("by_lessonId_and_status_and_lastActivityAt", ["lessonId", "status", "lastActivityAt"])
    .index("by_lessonId_and_status_and_commentCount_and_lastActivityAt", [
      "lessonId",
      "status",
      "commentCount",
      "lastActivityAt",
    ])
    .index("by_scopeKey_and_status_and_createdAt", ["scopeKey", "status", "createdAt"])
    .index("by_scopeKey_and_status_and_hotScore", ["scopeKey", "status", "hotScore"])
    .index("by_scopeKey_and_status_and_voteScore", ["scopeKey", "status", "voteScore"])
    .index("by_scopeKey_and_status_and_lastActivityAt", ["scopeKey", "status", "lastActivityAt"])
    .index("by_scopeKey_and_status_and_commentCount_and_lastActivityAt", [
      "scopeKey",
      "status",
      "commentCount",
      "lastActivityAt",
    ])
    .index("by_authorId_and_status_and_updatedAt", ["authorId", "status", "updatedAt"])
    .index("by_authorId_and_workflowGroup_and_updatedAt", ["authorId", "workflowGroup", "updatedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["status", "scopeKey", "trackId", "moduleId", "lessonId"],
    }),

  comments: defineTable({
    postId: v.id("communityPosts"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("comments")),
    body: v.string(),
    reactionCount: v.optional(v.number()),
    upvoteCount: v.optional(v.number()),
    downvoteCount: v.optional(v.number()),
    voteScore: v.optional(v.number()),
    isHelpful: v.optional(v.boolean()),
    helpfulMarkedBy: v.optional(v.id("users")),
    helpfulMarkedAt: v.optional(v.number()),
    /** Added for recursive lazy loading and hot sibling ordering. */
    hotScore: v.optional(v.number()),
    directReplyCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_postId_and_parentId_and_hotScore_and_createdAt", ["postId", "parentId", "hotScore", "createdAt"])
    .index("by_parent", ["parentId"])
    .index("by_authorId_and_createdAt", ["authorId", "createdAt"]),

  reactions: defineTable({
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    userId: v.id("users"),
    // `like` and `celebrate` remain readable until the migration has completed.
    reaction: v.union(
      v.literal("like"),
      v.literal("celebrate"),
      v.literal("upvote"),
      v.literal("downvote"),
    ),
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_user_target", ["userId", "targetType", "targetId"]),

  notifications: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    readAt: v.optional(v.number()),
    kind: v.optional(v.string()),
    postId: v.optional(v.id("communityPosts")),
    commentId: v.optional(v.id("comments")),
    senderId: v.optional(v.id("users")),
    excerpt: v.optional(v.string()),
    eventKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_userId_and_kind_and_createdAt", ["userId", "kind", "createdAt"])
    .index("by_userId_and_kind_and_readAt_and_createdAt", ["userId", "kind", "readAt", "createdAt"])
    .index("by_userId_and_eventKey", ["userId", "eventKey"])
    .index("by_userId_and_postId_and_createdAt", ["userId", "postId", "createdAt"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_commentId_and_createdAt", ["commentId", "createdAt"]),

  postFavorites: defineTable({
    userId: v.id("users"),
    postId: v.id("communityPosts"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_post", ["userId", "postId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"]),

  communityModerationEvents: defineTable({
    postId: v.id("communityPosts"),
    moderatorId: v.id("users"),
    decision: v.union(v.literal("approved"), v.literal("changes_requested")),
    previousStatus: communityPostStatus,
    nextStatus: communityPostStatus,
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_moderatorId_and_createdAt", ["moderatorId", "createdAt"]),

  leaderboardEvents: defineTable({
    userId: v.id("users"),
    sourceType: leaderboardSourceType,
    sourceId: v.string(),
    points: v.number(),
    active: v.boolean(),
    occurredAt: v.number(),
    dayKey: v.string(),
    weekKey: v.string(),
    courseId: v.optional(v.id("courses")),
    trackId: v.optional(v.id("courseTracks")),
    postId: v.optional(v.id("communityPosts")),
    commentId: v.optional(v.id("comments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_sourceType_and_sourceId", ["userId", "sourceType", "sourceId"])
    .index("by_userId_and_sourceType_and_dayKey", ["userId", "sourceType", "dayKey"])
    .index("by_userId_and_sourceType_and_dayKey_and_active_and_points", [
      "userId",
      "sourceType",
      "dayKey",
      "active",
      "points",
    ])
    .index("by_userId_and_occurredAt", ["userId", "occurredAt"]),

  leaderboardStats: defineTable({
    userId: v.id("users"),
    scopeKind: communityScopeKind,
    scopeKey: v.string(),
    trackId: v.optional(v.id("courseTracks")),
    courseId: v.optional(v.id("courses")),
    period: leaderboardPeriod,
    periodKey: v.string(),
    xp: v.number(),
    completedLessons: v.number(),
    completedTasks: v.number(),
    helpfulAnswers: v.number(),
    eligible: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_scopeKey_and_period_and_periodKey", ["userId", "scopeKey", "period", "periodKey"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"])
    .index("by_scopeKey_and_period_and_periodKey_and_xp", ["scopeKey", "period", "periodKey", "xp"])
    .index("by_scopeKey_and_period_and_periodKey_and_eligible_and_xp", [
      "scopeKey",
      "period",
      "periodKey",
      "eligible",
      "xp",
    ]),
});
