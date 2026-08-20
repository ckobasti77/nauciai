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
const lessonPartKind = v.union(v.literal("text"), v.literal("image"), v.literal("video"), v.literal("file"));
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
const helpMode = v.union(v.literal("seeking"), v.literal("offering"), v.literal("both"));
const dmPrivacy = v.union(v.literal("requests"), v.literal("following"), v.literal("nobody"));
const studyProgressZone = v.union(
  v.literal("0_25"),
  v.literal("26_50"),
  v.literal("51_75"),
  v.literal("76_100"),
);
const chatConversationKind = v.union(v.literal("direct"), v.literal("group"), v.literal("support"));
const chatMemberStatus = v.union(
  v.literal("invited"),
  v.literal("active"),
  v.literal("left"),
  v.literal("removed"),
);
const chatRequestStatus = v.union(
  v.literal("none"),
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
);
const planTier = v.union(v.literal("basic"), v.literal("premium"));
const creditLotSource = v.union(
  v.literal("purchase"),
  v.literal("plan_grant"),
  v.literal("welcome_bonus"),
  v.literal("admin_grant"),
  // Refund neuspelog posla otvara nov lot umesto da vraća kredite u originalni.
  v.literal("refund"),
);
const creditTransactionType = v.union(
  v.literal("purchase"),
  v.literal("spend"),
  v.literal("refund"),
  v.literal("bonus"),
  v.literal("trial"),
  v.literal("expiry"),
  v.literal("admin_adjust"),
);
const creditPackKind = v.union(v.literal("pack"), v.literal("plan"));
const studioModelKind = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));
const studioModelProvider = v.union(v.literal("fal"), v.literal("google"), v.literal("byteplus"));
const modelCatalogBadge = v.union(
  v.literal("preporuceno"),
  v.literal("skupo"),
  v.literal("novo"),
);
const generationJobStatus = v.union(
  v.literal("reserved"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("refunded"),
);
const localizedCopy = v.object({ sr: v.string(), en: v.string() });
const pageCopy = v.object({
  primaryCta: v.optional(localizedCopy),
  communityCta: v.optional(localizedCopy),
  continueCta: v.optional(localizedCopy),
  sectionEyebrow: v.optional(localizedCopy),
  sectionTitle: v.optional(localizedCopy),
  sectionDescription: v.optional(localizedCopy),
  introVideoEmpty: v.optional(localizedCopy),
  introVideoTitle: v.optional(localizedCopy),
});

// Convex Auth owns the users table, but the community needs the registration
// username before the app-level profile projection is created. Keep this field
// optional during the migration so existing auth documents remain valid.
const authUsers = defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  avatarStorageId: v.optional(v.id("_storage")),
  avatarPreset: v.optional(
    v.union(v.literal("mythic-mentor"), v.literal("cosmic-scholar"), v.literal("hybrid-guardian")),
  ),
  role: v.optional(role),
  language: v.optional(language),
  bio: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  instagramUrl: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  youtubeUrl: v.optional(v.string()),
  helpStatus: v.optional(helpMode),
  dmPrivacy: v.optional(dmPrivacy),
  anonymizedAt: v.optional(v.number()),
  searchText: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  emailVerificationTime: v.optional(v.number()),
  // App-level confirmation used before a Google/OAuth account can add a
  // password credential. OAuth verification remains separate from this proof.
  passwordEmailVerificationTime: v.optional(v.number()),
  // General app-level proof used for course access and account linking.
  // Keep the legacy field above during the compatible migration window.
  appEmailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  mergedInto: v.optional(v.id("users")),
})
  .index("email", ["email"])
  .index("phone", ["phone"])
  .index("username", ["username"])
  .index("by_role", ["role"])
  .searchIndex("search_searchText", {
    searchField: "searchText",
    filterFields: ["role"],
  });


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

  profileStats: defineTable({
    userId: v.id("users"),
    completedLessons: v.number(),
    contributionCount: v.optional(v.number()),
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    role: v.optional(role),
    aggregateVersion: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_role_and_contributionCount", ["role", "contributionCount"]),

  userFollows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_followerId_and_followingId", ["followerId", "followingId"])
    .index("by_followerId_and_createdAt", ["followerId", "createdAt"])
    .index("by_followingId_and_createdAt", ["followingId", "createdAt"]),

  userPresence: defineTable({
    userId: v.id("users"),
    lastSeenAt: v.number(),
  }).index("by_userId", ["userId"]),

  profileActivityDays: defineTable({
    userId: v.id("users"),
    dayKey: v.string(),
    lessons: v.number(),
    tasks: v.number(),
    threads: v.number(),
    comments: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_dayKey", ["userId", "dayKey"]),

  profileContributions: defineTable({
    userId: v.id("users"),
    postId: v.id("communityPosts"),
    courseId: v.optional(v.id("courses")),
    hasThread: v.optional(v.boolean()),
    hasComments: v.optional(v.boolean()),
    threadCount: v.number(),
    commentCount: v.number(),
    lastActivityAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_postId", ["userId", "postId"])
    .index("by_userId_and_lastActivityAt", ["userId", "lastActivityAt"])
    .index("by_userId_and_courseId_and_lastActivityAt", ["userId", "courseId", "lastActivityAt"])
    .index("by_userId_and_hasThread_and_lastActivityAt", ["userId", "hasThread", "lastActivityAt"])
    .index("by_userId_and_courseId_and_hasThread_and_lastActivityAt", [
      "userId",
      "courseId",
      "hasThread",
      "lastActivityAt",
    ])
    .index("by_userId_and_hasComments_and_lastActivityAt", ["userId", "hasComments", "lastActivityAt"])
    .index("by_userId_and_courseId_and_hasComments_and_lastActivityAt", [
      "userId",
      "courseId",
      "hasComments",
      "lastActivityAt",
    ])
    .index("by_postId", ["postId"]),

  helpTopics: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    courseId: v.optional(v.id("courses")),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalizedName_and_courseId", ["normalizedName", "courseId"])
    .index("by_courseId_and_normalizedName", ["courseId", "normalizedName"]),

  helpTopicSuggestions: defineTable({
    proposerId: v.id("users"),
    name: v.string(),
    normalizedName: v.string(),
    courseId: v.optional(v.id("courses")),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("merged")),
    resolvedTopicId: v.optional(v.id("helpTopics")),
    reviewedBy: v.optional(v.id("users")),
    reviewReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_proposerId_and_status_and_createdAt", ["proposerId", "status", "createdAt"])
    .index("by_normalizedName_and_courseId_and_status", ["normalizedName", "courseId", "status"]),

  userHelpTopics: defineTable({
    userId: v.id("users"),
    topicId: v.id("helpTopics"),
    mode: helpMode,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_topicId", ["userId", "topicId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"])
    .index("by_topicId_and_mode_and_updatedAt", ["topicId", "mode", "updatedAt"]),

  studyPartnerAvailability: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    progressZone: studyProgressZone,
    progressPercent: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_courseId", ["userId", "courseId"])
    .index("by_courseId_and_progressZone_and_active_and_updatedAt", [
      "courseId",
      "progressZone",
      "active",
      "updatedAt",
    ]),

  studyPartnerInvites: defineTable({
    pairKey: v.string(),
    senderId: v.id("users"),
    recipientId: v.id("users"),
    courseId: v.id("courses"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("cancelled")),
    cooldownUntil: v.optional(v.number()),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_pairKey_and_courseId", ["pairKey", "courseId"])
    .index("by_recipientId_and_status_and_createdAt", ["recipientId", "status", "createdAt"])
    .index("by_senderId_and_status_and_createdAt", ["senderId", "status", "createdAt"]),

  studyPartnerships: defineTable({
    pairKey: v.string(),
    userAId: v.id("users"),
    userBId: v.id("users"),
    courseId: v.id("courses"),
    directConversationId: v.optional(v.id("chatConversations")),
    createdFromInviteId: v.id("studyPartnerInvites"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pairKey_and_courseId", ["pairKey", "courseId"])
    .index("by_userAId_and_courseId_and_createdAt", ["userAId", "courseId", "createdAt"])
    .index("by_userBId_and_courseId_and_createdAt", ["userBId", "courseId", "createdAt"]),

  studyPartnershipMembers: defineTable({
    partnershipId: v.id("studyPartnerships"),
    userId: v.id("users"),
    partnerId: v.id("users"),
    courseId: v.id("courses"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_partnershipId_and_userId", ["partnershipId", "userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_and_courseId_and_createdAt", ["userId", "courseId", "createdAt"]),

  studyGroups: defineTable({
    courseId: v.id("courses"),
    creatorId: v.id("users"),
    name: v.string(),
    status: v.union(v.literal("forming"), v.literal("active")),
    activeMemberCount: v.number(),
    conversationId: v.optional(v.id("chatConversations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creatorId_and_createdAt", ["creatorId", "createdAt"])
    .index("by_courseId_and_status_and_createdAt", ["courseId", "status", "createdAt"]),

  studyGroupMembers: defineTable({
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
    courseId: v.id("courses"),
    role: v.union(v.literal("owner"), v.literal("member")),
    active: v.boolean(),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_groupId_and_userId", ["groupId", "userId"])
    .index("by_groupId_and_active_and_joinedAt", ["groupId", "active", "joinedAt"])
    .index("by_userId_and_active_and_joinedAt", ["userId", "active", "joinedAt"])
    .index("by_userId_and_courseId_and_active_and_joinedAt", ["userId", "courseId", "active", "joinedAt"]),

  studyGroupInvites: defineTable({
    groupId: v.id("studyGroups"),
    courseId: v.id("courses"),
    invitedBy: v.id("users"),
    userId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("cancelled")),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_groupId_and_userId", ["groupId", "userId"])
    .index("by_groupId_and_status_and_createdAt", ["groupId", "status", "createdAt"])
    .index("by_userId_and_status_and_createdAt", ["userId", "status", "createdAt"]),

  studyHubSummaryVersions: defineTable({
    key: v.string(),
    ready: v.boolean(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  chatConversations: defineTable({
    kind: chatConversationKind,
    directKey: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    createdById: v.id("users"),
    title: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    courseId: v.optional(v.id("courses")),
    studyGroupId: v.optional(v.id("studyGroups")),
    nextSequence: v.number(),
    lastMessageSequence: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_directKey", ["directKey"])
    .index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"])
    .index("by_studyGroupId", ["studyGroupId"]),

  chatConversationSearchEntries: defineTable({
    viewerId: v.id("users"),
    conversationId: v.id("chatConversations"),
    kind: v.union(v.literal("group"), v.literal("support")),
    status: v.literal("visible"),
    searchText: v.string(),
    updatedAt: v.number(),
  })
    .index("by_viewerId_and_conversationId", ["viewerId", "conversationId"])
    .index("by_conversationId", ["conversationId"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["viewerId", "status"],
    }),

  chatConversationSearchVersions: defineTable({
    key: v.string(),
    ready: v.boolean(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  chatMembers: defineTable({
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    conversationKind: chatConversationKind,
    role: v.union(v.literal("owner"), v.literal("member")),
    status: chatMemberStatus,
    requestStatus: chatRequestStatus,
    lastReadSequence: v.number(),
    lastDeliveredSequence: v.number(),
    lastDeliveredAt: v.number(),
    unreadCount: v.number(),
    hasUnread: v.boolean(),
    isArchived: v.boolean(),
    isPinned: v.boolean(),
    historyCutoffSequence: v.number(),
    mutedUntil: v.optional(v.number()),
    requestImagesAllowedAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("users")),
    invitedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_conversationId_and_userId", ["conversationId", "userId"])
    .index("by_conversationId_and_status_and_joinedAt", ["conversationId", "status", "joinedAt"])
    .index("by_userId_and_status_and_lastDeliveredAt", ["userId", "status", "lastDeliveredAt"])
    .index("by_userId_and_conversationKind_and_lastDeliveredAt", ["userId", "conversationKind", "lastDeliveredAt"])
    .index("by_userId_and_requestStatus_and_lastDeliveredAt", ["userId", "requestStatus", "lastDeliveredAt"])
    .index("by_userId_and_hasUnread_and_lastDeliveredAt", ["userId", "hasUnread", "lastDeliveredAt"])
    .index("by_userId_and_isPinned_and_lastDeliveredAt", ["userId", "isPinned", "lastDeliveredAt"])
    .index("by_userId_and_isArchived_and_lastDeliveredAt", ["userId", "isArchived", "lastDeliveredAt"])
    .index("by_userId_and_invitedAt", ["userId", "invitedAt"]),

  chatInboxSummaries: defineTable({
    userId: v.id("users"),
    totalUnread: v.number(),
    unreadConversations: v.number(),
    pendingRequests: v.number(),
    pendingGroupInvites: v.number(),
    ready: v.boolean(),
    aggregateReady: v.optional(v.boolean()),
    aggregateUpdatedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  chatInboxSummaryMembers: defineTable({
    chatMemberId: v.id("chatMembers"),
    userId: v.id("users"),
    totalUnread: v.number(),
    unreadConversations: v.number(),
    pendingRequests: v.number(),
    pendingGroupInvites: v.number(),
    updatedAt: v.number(),
  })
    .index("by_chatMemberId", ["chatMemberId"])
    .index("by_userId", ["userId"]),

  chatDirectRequests: defineTable({
    conversationId: v.id("chatConversations"),
    pairKey: v.string(),
    senderId: v.id("users"),
    recipientId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
    senderMessageCount: v.number(),
    cooldownUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_pairKey", ["pairKey"])
    .index("by_recipientId_and_senderId", ["recipientId", "senderId"])
    .index("by_recipientId_and_status_and_createdAt", ["recipientId", "status", "createdAt"]),

  chatMessages: defineTable({
    conversationId: v.id("chatConversations"),
    sequence: v.number(),
    senderId: v.optional(v.id("users")),
    senderName: v.string(),
    kind: v.union(v.literal("user"), v.literal("system")),
    body: v.optional(v.string()),
    searchText: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("chatMessages")),
    clientNonce: v.optional(v.string()),
    mentionUserIds: v.array(v.id("users")),
    imageCount: v.number(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_conversationId_and_sequence", ["conversationId", "sequence"])
    .index("by_conversationId_and_senderId_and_clientNonce", ["conversationId", "senderId", "clientNonce"])
    .index("by_senderId_and_createdAt", ["senderId", "createdAt"])
    .searchIndex("search_searchText", { searchField: "searchText", filterFields: ["conversationId"] }),

  chatImages: defineTable({
    uploaderId: v.id("users"),
    messageId: v.optional(v.id("chatMessages")),
    conversationId: v.optional(v.id("chatConversations")),
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
    status: v.union(v.literal("prepared"), v.literal("attached"), v.literal("deleted")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_uploaderId_and_status_and_createdAt", ["uploaderId", "status", "createdAt"])
    .index("by_conversationId_and_status_and_createdAt", ["conversationId", "status", "createdAt"])
    .index("by_messageId", ["messageId"])
    .index("by_storageId", ["storageId"]),

  chatGroupAvatarUploads: defineTable({
    uploaderId: v.id("users"),
    conversationId: v.id("chatConversations"),
    expectedSha256: v.string(),
    expectedByteSize: v.number(),
    expectedContentType: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("consumed"),
      v.literal("failed"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_uploaderId_and_status_and_createdAt", ["uploaderId", "status", "createdAt"])
    .index("by_storageId", ["storageId"]),

  chatGroupAvatarFiles: defineTable({
    conversationId: v.id("chatConversations"),
    uploaderId: v.id("users"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
    createdAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_storageId", ["storageId"]),

  chatLinkPreviews: defineTable({
    messageId: v.id("chatMessages"),
    conversationId: v.id("chatConversations"),
    url: v.string(),
    normalizedUrl: v.string(),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"]),

  chatReactions: defineTable({
    messageId: v.id("chatMessages"),
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_messageId_and_userId_and_emoji", ["messageId", "userId", "emoji"])
    .index("by_messageId_and_createdAt", ["messageId", "createdAt"]),

  chatTyping: defineTable({
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversationId_and_userId", ["conversationId", "userId"])
    .index("by_conversationId_and_expiresAt", ["conversationId", "expiresAt"]),

  chatDrafts: defineTable({
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    body: v.string(),
    updatedAt: v.number(),
  })
    .index("by_conversationId_and_userId", ["conversationId", "userId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  chatDockState: defineTable({
    userId: v.id("users"),
    deviceId: v.string(),
    openConversationIds: v.array(v.id("chatConversations")),
    minimizedConversationIds: v.array(v.id("chatConversations")),
    updatedAt: v.number(),
  }).index("by_userId_and_deviceId", ["userId", "deviceId"]),

  chatBlocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blockerId_and_blockedId", ["blockerId", "blockedId"])
    .index("by_blockedId_and_blockerId", ["blockedId", "blockerId"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    endpointHash: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_endpointHash", ["endpointHash"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  notificationPreferences: defineTable({
    userId: v.id("users"),
    category: v.string(),
    conversationId: v.optional(v.id("chatConversations")),
    inApp: v.boolean(),
    push: v.boolean(),
    sound: v.boolean(),
    updatedAt: v.number(),
  }).index("by_userId_and_category_and_conversationId", ["userId", "category", "conversationId"]),

  chatReports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(v.literal("message"), v.literal("profile"), v.literal("group")),
    targetUserId: v.optional(v.id("users")),
    targetConversationId: v.optional(v.id("chatConversations")),
    targetMessageId: v.optional(v.id("chatMessages")),
    reason: v.string(),
    snapshotJson: v.string(),
    status: v.union(v.literal("open"), v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_reporterId_and_createdAt", ["reporterId", "createdAt"])
    .index("by_targetConversationId_and_createdAt", ["targetConversationId", "createdAt"]),

  chatReportMessages: defineTable({
    reportId: v.id("chatReports"),
    messageId: v.id("chatMessages"),
    conversationId: v.id("chatConversations"),
    sequence: v.number(),
    snapshotJson: v.string(),
    createdAt: v.number(),
  }).index("by_reportId_and_sequence", ["reportId", "sequence"]),

  chatModerationActions: defineTable({
    reportId: v.optional(v.id("chatReports")),
    actorId: v.id("users"),
    targetUserId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("chatConversations")),
    messageId: v.optional(v.id("chatMessages")),
    kind: v.union(
      v.literal("remove_message"),
      v.literal("warn"),
      v.literal("suspend_chat"),
      v.literal("recommend_account_suspension"),
    ),
    reason: v.string(),
    endsAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_reportId_and_createdAt", ["reportId", "createdAt"])
    .index("by_targetUserId_and_createdAt", ["targetUserId", "createdAt"]),

  chatAccessAudit: defineTable({
    adminId: v.id("users"),
    targetUserId: v.id("users"),
    conversationId: v.optional(v.id("chatConversations")),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_adminId_and_createdAt", ["adminId", "createdAt"])
    .index("by_targetUserId_and_createdAt", ["targetUserId", "createdAt"]),

  accountSuspensions: defineTable({
    userId: v.id("users"),
    createdBy: v.id("users"),
    reason: v.string(),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    permanent: v.boolean(),
    active: v.boolean(),
    liftedAt: v.optional(v.number()),
    liftedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_userId_and_active_and_createdAt", ["userId", "active", "createdAt"])
    .index("by_active_and_createdAt", ["active", "createdAt"]),

  suspensionAppeals: defineTable({
    suspensionId: v.id("accountSuspensions"),
    userId: v.id("users"),
    body: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    reviewedBy: v.optional(v.id("users")),
    response: v.optional(v.string()),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_suspensionId_and_userId", ["suspensionId", "userId"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  courseTracks: defineTable({
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    subtitleSr: v.optional(v.string()),
    subtitleEn: v.optional(v.string()),
    descriptionSr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionRichSr: v.optional(v.string()),
    descriptionRichEn: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoFileName: v.optional(v.string()),
    videoByteSize: v.optional(v.number()),
    videoMimeType: v.optional(v.string()),
    videoUpdatedAt: v.optional(v.number()),
    status: publishStatus,
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    pageCopy: v.optional(pageCopy),
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
    descriptionRichSr: v.optional(v.string()),
    descriptionRichEn: v.optional(v.string()),
    status: publishStatus,
    stripePriceId: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoFileName: v.optional(v.string()),
    videoByteSize: v.optional(v.number()),
    videoMimeType: v.optional(v.string()),
    videoUpdatedAt: v.optional(v.number()),
    coverStorageId: v.optional(v.id("_storage")),
    coverFileName: v.optional(v.string()),
    coverByteSize: v.optional(v.number()),
    coverMimeType: v.optional(v.string()),
    coverUpdatedAt: v.optional(v.number()),
    sortOrder: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
    pageCopy: v.optional(pageCopy),
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
    // Deprecated hierarchy bridge. Existing lessons retain their former cycle
    // id during the widen/migrate phase; new lessons belong directly to course.
    moduleId: v.optional(v.id("modules")),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    summarySr: v.string(),
    summaryEn: v.string(),
    summaryRichSr: v.optional(v.string()),
    summaryRichEn: v.optional(v.string()),
    durationSeconds: v.number(),
    isPublished: v.boolean(),
    proEnabled: v.optional(v.boolean()),
    lightEnabled: v.optional(v.boolean()),
    sortOrder: v.number(),
    updatedAt: v.number(),
    pageCopy: v.optional(pageCopy),
  })
    .index("by_course_slug", ["courseId", "slug"])
    .index("by_course_and_sortOrder", ["courseId", "sortOrder"])
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
    bodyRichSr: v.optional(v.string()),
    bodyRichEn: v.optional(v.string()),
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
    // Optional so existing rows stay valid; absence means "basic".
    plan: v.optional(planTier),
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

  // ── STUDIO: KREDITI ───────────────────────────────────────────────────
  creditLots: defineTable({
    userId: v.id("users"),
    source: creditLotSource,
    granted: v.number(),
    remaining: v.number(),
    // Uvek grantedAt + 12 meseci, bez obzira na izvor.
    expiresAt: v.number(),
    grantedAt: v.number(),
    stripeInvoiceId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
    packId: v.optional(v.id("creditPacks")),
    exhaustedAt: v.optional(v.number()),
  })
    .index("by_user_expiry", ["userId", "expiresAt"])
    .index("by_user_active", ["userId", "exhaustedAt"])
    // Bonus dobrodošlice je jednom po korisniku, pa se pre dodele traži
    // postojeći lot tog izvora - i kad je odavno potrošen.
    .index("by_user_source", ["userId", "source"])
    .index("by_stripe_invoice", ["stripeInvoiceId"])
    .index("by_stripe_session", ["stripeSessionId"])
    .index("by_expiry", ["expiresAt"]),

  creditTransactions: defineTable({
    userId: v.id("users"),
    amount: v.number(),
    type: creditTransactionType,
    balanceAfter: v.number(),
    jobId: v.optional(v.id("generationJobs")),
    lotId: v.optional(v.id("creditLots")),
    stripeSessionId: v.optional(v.string()),
    packId: v.optional(v.id("creditPacks")),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_job_type", ["jobId", "type"])
    .index("by_stripe_session", ["stripeSessionId"])
    .index("by_expiry", ["expiresAt"]),

  // Denormalizovan keš; izvor istine je zbir `creditLots.remaining`.
  creditBalances: defineTable({
    userId: v.id("users"),
    balance: v.number(),
    lifetimePurchased: v.number(),
    lifetimeSpent: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  creditPacks: defineTable({
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    priceEurCents: v.number(),
    credits: v.number(),
    bonusPercent: v.number(),
    stripePriceId: v.optional(v.string()),
    kind: creditPackKind,
    planTier: v.optional(planTier),
    sortOrder: v.number(),
    isActive: v.boolean(),
  }).index("by_slug", ["slug"]),

  // ── STUDIO: KATALOG MODELA ───────────────────────────────────────────
  modelCatalog: defineTable({
    slug: v.string(),
    kind: studioModelKind,
    labelSr: v.string(),
    labelEn: v.string(),
    descriptionSr: v.string(),
    descriptionEn: v.string(),
    provider: v.string(),
    falEndpoint: v.string(),
    defaultParams: v.string(),
    paramSchema: v.string(),
    creditCost: v.number(),
    costPerSecond: v.optional(v.number()),
    estimatedCostUsd: v.number(),
    badge: v.optional(modelCatalogBadge),
    isEnabled: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  })
    .index("by_kind_enabled", ["kind", "isEnabled", "sortOrder"])
    .index("by_slug", ["slug"]),

  // ── STUDIO: KATALOG v4 ───────────────────────────────────────────────
  // STUDIO-CATALOG-V4 sekcija 1.1. Nasleđuje `modelCatalog`: tamo je jedan red
  // po KOMBINACIJI parametara (`nb2`, `nb2-2k`, `nb2-4k`), ovde jedan red po
  // stvarnom modelu, a rezolucija/zvuk/trajanje su parametri iz kojih se cena
  // RAČUNA (`convex/studioPricing.ts`). Stara tabela namerno ostaje jedan
  // ciklus - v4 katalog se seeduje iznova, redovi se ne prevode automatski.
  models: defineTable({
    slug: v.string(),
    provider: studioModelProvider,
    kind: studioModelKind,
    family: v.string(),

    labelSr: v.string(),
    labelEn: v.string(),
    taglineSr: v.string(),
    taglineEn: v.string(),
    descriptionSr: v.string(),
    descriptionEn: v.string(),

    // Svi su JSON stringovi iz istog razloga iz kojeg je to i `paramSchema`:
    // oblik im se razlikuje po modelu, a Convex validator za uniju svih oblika
    // bio bi duži od kataloga koji opisuje.
    endpoints: v.string(), // { inputMode: "endpoint ili model ID kod provajdera" }
    inputModes: v.string(), // ["text","image","reference"]
    inputSpec: v.string(), // { inputMode: { slot: { max, accept } } }
    paramSpec: v.string(), // niz kontrola, `convex/studioParamSpec.ts`
    priceRule: v.string(), // cenovno pravilo, `convex/studioPricing.ts`
    capabilities: v.string(), // { audio: true, maxDurationS: 15, maxRefImages: 9 }

    badge: v.optional(modelCatalogBadge),
    isEnabled: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_kind_enabled", ["kind", "isEnabled", "sortOrder"])
    .index("by_family", ["family", "sortOrder"]),

  // ── STUDIO: POSLOVI ──────────────────────────────────────────────────
  generationJobs: defineTable({
    userId: v.id("users"),
    modelSlug: v.string(),
    kind: studioModelKind,
    params: v.string(),
    promptHash: v.string(),
    status: generationJobStatus,
    creditCost: v.number(),
    // Provajder OVOG posla (STUDIO-CATALOG-V4 sekcija 7), upisan pri kreiranju
    // (`studio.ts`: v4 model nosi `models.provider`, stari katalog je uvek
    // "fal"). Nalaz W7-6: bez ovog polja Google poller mora da skenira SVE
    // "running" poslove kroz `by_status_created` i za svaki učita model da bi
    // znao da li je google - zaostatak od 200+ fal poslova bi izgurao google
    // posao iz prozora, pa bi ga reaper refundirao iako je uspeo i naplaćen.
    // Poslovi upisani pre ovog polja ga nemaju dok ih ne popuni
    // `migrations.backfillGenerationJobProvider`.
    provider: v.optional(studioModelProvider),
    falRequestId: v.optional(v.string()),
    // Isti podatak kao `falRequestId`, samo pod imenom koje važi za sva tri
    // provajdera (STUDIO-CATALOG-V4 sekcija 7). Faza je namerno "prošireno pa
    // preseljeno": `markJobRunning` upisuje OBA polja, fal webhook i dalje
    // gleda `by_fal_request`, a BytePlus callback `by_provider_request`.
    // Gašenje `falRequestId`-ja je zaseban korak, posle backfill-a
    // (`migrations.backfillProviderRequestId`).
    providerRequestId: v.optional(v.string()),
    // Koji ulazni režim je posao naručio (STUDIO-CATALOG-V4 sekcija 5). Bira
    // endpoint kod provajdera (`models.endpoints[inputMode]`) i ulazi u cenu
    // preko `modeMultipliers`. Poslovi iz starog kataloga ga nemaju.
    inputMode: v.optional(v.string()),
    // JSON: slot -> lista `_storage` ID-jeva koje je korisnik okačio za taj
    // slot ("image", "video", "audio"). Redosled je značajan - prompt citira
    // reference po broju ("slika 2").
    inputs: v.optional(v.string()),
    // Nabavna cena koju je katalog OBEĆAO u trenutku rezervacije
    // (`studioPricing.computeCostUsd`). Ista cifra ulazi u `studioUsageDaily`,
    // ali tamo je već sabrana po korisniku i danu, pa se iz nje ne može reći
    // koliko je koštao JEDAN posao - a to je jedini broj sa kojim `actualCostUsd`
    // ima smisla porediti. Poslovi upisani pre W6 je nemaju.
    estimatedCostUsd: v.optional(v.number()),
    // Šta je provajder STVARNO naplatio. Puni ga `studioActualCost`: Google i
    // BytePlus iz tokena u odgovoru, fal iz noćne rekonsilijacije po
    // `providerRequestId`-ju. Provajder koji podatak ne vrati ostavlja polje
    // prazno - izmišljen broj bi popravio maržu koja je u stvari loša.
    actualCostUsd: v.optional(v.number()),
    // fal URL iz webhook-a; kratko živi kod fal-a, pa ga `persistOutput`
    // preuzima u Convex storage (`outputStorageId`) čim posao stigne.
    falOutputUrl: v.optional(v.string()),
    outputStorageId: v.optional(v.id("_storage")),
    posterStorageId: v.optional(v.id("_storage")),
    labOutputId: v.optional(v.id("labOutputs")),
    lessonId: v.optional(v.id("lessons")),
    taskId: v.optional(v.id("lessonTasks")),
    error: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_fal_request", ["falRequestId"])
    .index("by_provider_request", ["providerRequestId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_expiry", ["expiresAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_provider_status", ["provider", "status", "createdAt"]),

  // Ko je koji ulazni fajl okačio. `createInputUploadUrl` vraća gol Convex
  // upload URL i ne zna ishod uploada, pa vezu `storageId` -> korisnik pravi
  // `studio.registerInputUpload`, koju klijent zove POSLE uploada.
  // `createJob` bez ovog reda ne prima nijedan `storageId`: bez njega je jedina
  // odbrana bila nepogodivost ID-ja, a to nije kontrola pristupa - tuđi fajl bi
  // ušao u tuđi posao i galerija bi ga potpisala (`ctx.storage.getUrl`).
  studioUploads: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    slot: v.string(),
    // Veličina i tip se čitaju iz `_storage` u trenutku prijave, ne iz onoga
    // što je klijent rekao.
    bytes: v.number(),
    mimeType: v.optional(v.string()),
    // Trajanje snimka u sekundama, pročitano iz ZAGLAVLJA fajla
    // (`studioActions.measureInputUpload`, W5). Polja nema dok se ne izmeri, i
    // dok ga nema `createJob` odbija svaki posao koji se po trajanju naplaćuje
    // - klijentov broj se ne uzima u obzir (nalaz R3).
    durationS: v.optional(v.number()),
    createdAt: v.number(),
    // Postoji samo dok upload nije ušao ni u jedan posao: nevezan fajl briše
    // `crons.expireGenerationFiles` posle 24 h. `createJob` polje sklanja, pa
    // ulaz posla živi koliko i posao.
    expiresAt: v.optional(v.number()),
  })
    .index("by_storage", ["storageId"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_expiry", ["expiresAt"]),

  studioUsageDaily: defineTable({
    userId: v.id("users"),
    day: v.string(),
    generations: v.number(),
    creditsSpent: v.number(),
    costUsd: v.number(),
  })
    .index("by_user_day", ["userId", "day"])
    .index("by_day", ["day"]),

  // ── PLATFORMA: SKLOPKE ───────────────────────────────────────────────
  // Kill switch iz STUDIO-PLAN 4.4. `studio.createJob` čita "studio_enabled"
  // pre svake druge provere; `enabled: false` gasi Studio bez deploy-a.
  platformFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
  }).index("by_key", ["key"]),

  // Zapamćeno stanje globalnog dnevnog alarma (STUDIO-PLAN 4.4). Jedan red po
  // UTC danu za koji je alarm od 50 $ već poslat - cron se vrti na 15 min, a
  // bez ovog reda bi isti mejl stizao svakih 15 minuta do ponoći. Namerno
  // odvojeno od `platformFlags`: `enabled` boolean gasi Studio, a "alarm
  // poslat" nije isto stanje i ne sme da se pomeša sa kill switch-om.
  // Kill (100 $) ne treba svoj red - on gasi `platformFlags.studio_enabled`,
  // pa je već ugašen Studio sam sebi pamćenje.
  studioCostAlarms: defineTable({
    day: v.string(),
  }).index("by_day", ["day"]),

  // Zbir izmerenog troška po modelu (W6). Jedan red na ceo model, održava ga
  // `studioActualCost.recordActualCost` u istoj transakciji u kojoj posao dobija
  // `actualCostUsd`. Postoji iz dva razloga:
  //
  // 1. admin ekran iz njega crta STVARNU maržu i broj poslova iz kojih je
  //    izračunata - bez broja merenja admin veruje cifri koja nije merenje;
  // 2. niz uzastopnih odstupanja preko 30% se broji ovde umesto da se pri
  //    svakom upisu skenira istorija poslova tog modela.
  //
  // `modelSlug`, a ne `Id<"models">`: poslovi iz starog `modelCatalog`-a nemaju
  // red u `models`, a i njihov trošak se meri.
  studioModelCost: defineTable({
    modelSlug: v.string(),
    measuredJobs: v.number(),
    actualCostUsd: v.number(),
    estimatedCostUsd: v.number(),
    creditCost: v.number(),
    deviationStreak: v.number(),
    // Postoji dok traje niz zbog kojeg je alarm poslat; prvi posao ispod praga
    // ga sklanja, pa sledeći niz od pet ponovo javlja.
    alarmSentAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_modelSlug", ["modelSlug"]),
});
