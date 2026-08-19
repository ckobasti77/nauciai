import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireCourseAccess, requireUserId } from "./helpers";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { adjustProfileActivity } from "./profileActivityCore";
import { canUseProLesson } from "../lib/lesson-access";

const outputKind = v.union(v.literal("text"), v.literal("image"), v.literal("audio"), v.literal("video"), v.literal("file"));
const outputStatus = v.union(v.literal("draft"), v.literal("ready"), v.literal("failed"));
const completionMode = v.union(v.literal("manual"), v.literal("automatic"), v.literal("hybrid"));

const stepInput = {
  stepId: v.optional(v.id("lessonSteps")),
  courseId: v.id("courses"),
  lessonId: v.id("lessons"),
  slug: v.string(),
  titleSr: v.string(),
  titleEn: v.string(),
  bodySr: v.string(),
  bodyEn: v.string(),
  outputKind,
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
};

const taskInput = {
  taskId: v.optional(v.id("lessonTasks")),
  courseId: v.id("courses"),
  lessonId: v.id("lessons"),
  stepId: v.id("lessonSteps"),
  promptSr: v.string(),
  promptEn: v.string(),
  hintSr: v.optional(v.string()),
  hintEn: v.optional(v.string()),
  required: v.boolean(),
  completionMode,
  isPublished: v.boolean(),
  sortOrder: v.number(),
};

function optionalFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function getCourseAndLesson(ctx: QueryCtx | MutationCtx, courseSlug: string, lessonSlug: string) {
  const course = await ctx.db
    .query("courses")
    .withIndex("by_slug", (q) => q.eq("slug", courseSlug))
    .unique();
  if (!course) return null;

  const lesson = await ctx.db
    .query("lessons")
    .withIndex("by_course_slug", (q) => q.eq("courseId", course._id).eq("slug", lessonSlug))
    .unique();
  if (!lesson) return null;

  return { course, lesson };
}

async function assertLessonAccess(ctx: QueryCtx | MutationCtx, lessonId: Id<"lessons">) {
  const lesson = await ctx.db.get(lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const profile = await requireCourseAccess(ctx, lesson.courseId);
  const isAdmin = profile.role === "admin";
  if (!isAdmin && !lesson.isPublished) {
    throw new Error("Lesson not found");
  }

  return { lesson, profile, isAdmin };
}

async function outputWithUrl(ctx: QueryCtx, output: {
  storageId?: Id<"_storage">;
  [key: string]: unknown;
}) {
  return {
    ...output,
    storageUrl: output.storageId ? await ctx.storage.getUrl(output.storageId) : null,
  };
}

export const getLessonLab = query({
  args: {
    courseSlug: v.string(),
    lessonSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const match = await getCourseAndLesson(ctx, args.courseSlug, args.lessonSlug);
    if (!match) return null;

    const profile = await requireCourseAccess(ctx, match.course._id);
    const isAdmin = profile.role === "admin";
    if (!isAdmin && !match.lesson.isPublished) return null;
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", match.course._id))
      .unique();
    const canUsePro = canUseProLesson(enrollment?.plan, profile.role, match.lesson.proEnabled !== false);
    if (!canUsePro) {
      return {
        course: match.course,
        lesson: match.lesson,
        profile: { role: profile.role },
        isAdmin,
        canUsePro: false,
        steps: [],
        outputs: [],
        conversations: [],
        activeConversation: null,
        messages: [],
      };
    }

    const stepRows = await ctx.db
      .query("lessonSteps")
      .withIndex("by_lesson", (q) => q.eq("lessonId", match.lesson._id))
      .collect();
    const visibleSteps = (isAdmin ? stepRows : stepRows.filter((step) => step.isPublished)).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    const taskProgressRows = await ctx.db
      .query("taskProgress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", match.lesson._id))
      .collect();
    const stepProgressRows = await ctx.db
      .query("lessonStepProgress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", match.lesson._id))
      .collect();

    const steps = await Promise.all(
      visibleSteps.map(async (step) => {
        const taskRows = await ctx.db
          .query("lessonTasks")
          .withIndex("by_step", (q) => q.eq("stepId", step._id))
          .collect();
        const visibleTasks = (isAdmin ? taskRows : taskRows.filter((task) => task.isPublished)).sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );

        return {
          ...step,
          progress: stepProgressRows.find((item) => item.stepId === step._id) ?? null,
          tasks: visibleTasks.map((task) => ({
            ...task,
            progress: taskProgressRows.find((item) => item.taskId === task._id) ?? null,
          })),
        };
      }),
    );

    const outputs = await Promise.all(
      (
        await ctx.db
          .query("labOutputs")
          .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", match.lesson._id))
          .order("desc")
          .take(30)
      ).map((output) => outputWithUrl(ctx, output)),
    );

    const conversations = await ctx.db
      .query("aiConversations")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", match.lesson._id))
      .order("desc")
      .take(5);
    const activeConversation = conversations[0] ?? null;
    const messages = activeConversation
      ? await ctx.db
          .query("aiMessages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", activeConversation._id))
          .take(60)
      : [];

    return {
      course: match.course,
      lesson: match.lesson,
      profile,
      isAdmin,
      canUsePro: true,
      steps,
      outputs,
      conversations,
      activeConversation,
      messages,
    };
  },
});

export const markTaskProgress = mutation({
  args: {
    taskId: v.id("lessonTasks"),
    completed: v.boolean(),
    evidenceOutputId: v.optional(v.id("labOutputs")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    await assertLessonAccess(ctx, task.lessonId);

    if (args.evidenceOutputId) {
      const output = await ctx.db.get(args.evidenceOutputId);
      if (!output || output.userId !== userId || output.lessonId !== task.lessonId) {
        throw new Error("Evidence output not found");
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("taskProgress")
      .withIndex("by_user_task", (q) => q.eq("userId", userId).eq("taskId", args.taskId))
      .unique();
    const patch = {
      userId,
      courseId: task.courseId,
      lessonId: task.lessonId,
      stepId: task.stepId,
      taskId: args.taskId,
      completed: args.completed,
      ...optionalFields({
        evidenceOutputId: args.evidenceOutputId,
        completedAt: args.completed ? now : undefined,
      }),
      updatedAt: now,
    };

    const progressId = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("taskProgress", patch);

    if (task.required && Boolean(existing?.completed) !== args.completed) {
      const leaderboardEvent = await ctx.db
        .query("leaderboardEvents")
        .withIndex("by_userId_and_sourceType_and_sourceId", (q) =>
          q.eq("userId", userId).eq("sourceType", "required_task").eq("sourceId", String(args.taskId)),
        )
        .unique();
      await syncLeaderboardSourceEvent(ctx, {
        userId,
        sourceType: "required_task",
        sourceId: String(args.taskId),
        active: args.completed,
        occurredAt: now,
        courseId: task.courseId,
      });
      await adjustProfileActivity(ctx, {
        userId,
        kind: "tasks",
        delta: args.completed ? 1 : -1,
        timestamp: leaderboardEvent?.occurredAt
          ?? (args.completed ? now : existing?.completedAt ?? existing?.updatedAt ?? now),
      });
    }

    return progressId;
  },
});

export const markStepProgress = mutation({
  args: {
    stepId: v.id("lessonSteps"),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const step = await ctx.db.get(args.stepId);
    if (!step) {
      throw new Error("Step not found");
    }
    await assertLessonAccess(ctx, step.lessonId);

    const now = Date.now();
    const existing = await ctx.db
      .query("lessonStepProgress")
      .withIndex("by_user_step", (q) => q.eq("userId", userId).eq("stepId", args.stepId))
      .unique();
    const patch = {
      userId,
      courseId: step.courseId,
      lessonId: step.lessonId,
      stepId: args.stepId,
      completed: args.completed,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("lessonStepProgress", patch);
  },
});

export const saveLabOutput = mutation({
  args: {
    outputId: v.optional(v.id("labOutputs")),
    lessonId: v.id("lessons"),
    stepId: v.optional(v.id("lessonSteps")),
    taskId: v.optional(v.id("lessonTasks")),
    conversationId: v.optional(v.id("aiConversations")),
    messageId: v.optional(v.id("aiMessages")),
    kind: outputKind,
    status: outputStatus,
    title: v.string(),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { lesson } = await assertLessonAccess(ctx, args.lessonId);
    const now = Date.now();

    if (args.stepId) {
      const step = await ctx.db.get(args.stepId);
      if (!step || step.lessonId !== args.lessonId) {
        throw new Error("Step not found for lesson");
      }
    }
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.lessonId !== args.lessonId) {
        throw new Error("Task not found for lesson");
      }
    }

    const patch = {
      userId,
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      kind: args.kind,
      status: args.status,
      title: args.title,
      ...optionalFields({
        stepId: args.stepId,
        taskId: args.taskId,
        conversationId: args.conversationId,
        messageId: args.messageId,
        text: args.text,
        storageId: args.storageId,
        fileName: args.fileName,
        mimeType: args.mimeType,
        byteSize: args.byteSize,
        url: args.url,
      }),
      updatedAt: now,
    };

    if (args.outputId) {
      const existing = await ctx.db.get(args.outputId);
      if (!existing || existing.userId !== userId || existing.lessonId !== args.lessonId) {
        throw new Error("Output not found");
      }
      await ctx.db.patch(args.outputId, patch);
      return args.outputId;
    }

    return ctx.db.insert("labOutputs", {
      ...patch,
      createdAt: now,
    });
  },
});

export const createLabOutputUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const recordAiExchange = mutation({
  args: {
    conversationId: v.optional(v.id("aiConversations")),
    lessonId: v.id("lessons"),
    stepId: v.optional(v.id("lessonSteps")),
    taskId: v.optional(v.id("lessonTasks")),
    model: v.string(),
    userMessage: v.string(),
    assistantMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { lesson } = await assertLessonAccess(ctx, args.lessonId);
    const now = Date.now();

    let conversationId = args.conversationId;
    if (conversationId) {
      const existingConversation = await ctx.db.get(conversationId);
      if (!existingConversation || existingConversation.userId !== userId || existingConversation.lessonId !== args.lessonId) {
        throw new Error("Conversation not found");
      }
      await ctx.db.patch(conversationId, { model: args.model, updatedAt: now });
    } else {
      conversationId = await ctx.db.insert("aiConversations", {
        userId,
        courseId: lesson.courseId,
        lessonId: args.lessonId,
        ...optionalFields({
          stepId: args.stepId,
          taskId: args.taskId,
        }),
        title: args.userMessage.slice(0, 80),
        model: args.model,
        createdAt: now,
        updatedAt: now,
      });
    }

    const userMessageId = await ctx.db.insert("aiMessages", {
      conversationId,
      userId,
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      role: "user",
      content: args.userMessage,
      model: args.model,
      createdAt: now,
    });
    const assistantMessageId = await ctx.db.insert("aiMessages", {
      conversationId,
      userId,
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      role: "assistant",
      content: args.assistantMessage,
      model: args.model,
      createdAt: now + 1,
    });

    return { conversationId, userMessageId, assistantMessageId };
  },
});

export const upsertLessonStep = mutation({
  args: stepInput,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new Error("Lesson not found for course");
    }

    const slugMatches = await ctx.db
      .query("lessonSteps")
      .withIndex("by_lesson_slug", (q) => q.eq("lessonId", args.lessonId).eq("slug", args.slug))
      .take(2);
    const slugConflict = slugMatches.find((step) => step._id !== args.stepId);
    if (slugConflict) {
      throw new Error("Step slug already exists for this lesson");
    }

    const patch = {
      courseId: args.courseId,
      lessonId: args.lessonId,
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      bodySr: args.bodySr,
      bodyEn: args.bodyEn,
      outputKind: args.outputKind,
      ...optionalFields({
        layout: args.layout,
        prompts: args.prompts,
        systemInstruction: args.systemInstruction,
      }),
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.stepId) {
      const existing = await ctx.db.get(args.stepId);
      if (!existing || existing.lessonId !== args.lessonId) {
        throw new Error("Step not found for lesson");
      }
      await ctx.db.patch(args.stepId, patch);
      return args.stepId;
    }

    return ctx.db.insert("lessonSteps", { ...patch, createdBy: admin.userId as Id<"users"> });
  },
});

export const upsertLessonTask = mutation({
  args: taskInput,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const step = await ctx.db.get(args.stepId);
    if (!step || step.lessonId !== args.lessonId || step.courseId !== args.courseId) {
      throw new Error("Step not found for lesson");
    }

    const patch = {
      courseId: args.courseId,
      lessonId: args.lessonId,
      stepId: args.stepId,
      promptSr: args.promptSr,
      promptEn: args.promptEn,
      ...optionalFields({
        hintSr: args.hintSr,
        hintEn: args.hintEn,
      }),
      required: args.required,
      completionMode: args.completionMode,
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.taskId) {
      const existing = await ctx.db.get(args.taskId);
      if (!existing || existing.stepId !== args.stepId) {
        throw new Error("Task not found for step");
      }
      await ctx.db.patch(args.taskId, patch);
      return args.taskId;
    }

    return ctx.db.insert("lessonTasks", { ...patch, createdBy: admin.userId as Id<"users"> });
  },
});

export const deleteLessonStep = mutation({
  args: {
    stepId: v.id("lessonSteps"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const step = await ctx.db.get(args.stepId);
    if (!step) throw new Error("Step not found");

    const tasks = await ctx.db
      .query("lessonTasks")
      .withIndex("by_step", (q) => q.eq("stepId", args.stepId))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    const progresses = await ctx.db
      .query("lessonStepProgress")
      .withIndex("by_step", (q) => q.eq("stepId", args.stepId))
      .collect();
    for (const prog of progresses) {
      await ctx.db.delete(prog._id);
    }

    for (const task of tasks) {
      const taskProgs = await ctx.db
        .query("taskProgress")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const tp of taskProgs) {
        await ctx.db.delete(tp._id);
      }
    }

    await ctx.db.delete(args.stepId);
    return true;
  },
});

export const deleteLessonTask = mutation({
  args: {
    taskId: v.id("lessonTasks"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const taskProgs = await ctx.db
      .query("taskProgress")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const tp of taskProgs) {
      await ctx.db.delete(tp._id);
    }

    await ctx.db.delete(args.taskId);
    return true;
  },
});

export const reorderLessonSteps = mutation({
  args: {
    lessonId: v.id("lessons"),
    stepIds: v.array(v.id("lessonSteps")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    for (let i = 0; i < args.stepIds.length; i++) {
      const stepId = args.stepIds[i];
      const step = await ctx.db.get(stepId);
      if (step && step.lessonId === args.lessonId) {
        await ctx.db.patch(stepId, {
          sortOrder: (i + 1) * 10,
          updatedAt: Date.now(),
        });
      }
    }
    return true;
  },
});

export const reorderLessonTasks = mutation({
  args: {
    stepId: v.id("lessonSteps"),
    taskIds: v.array(v.id("lessonTasks")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const step = await ctx.db.get(args.stepId);
    if (!step) throw new Error("Step not found");

    for (let i = 0; i < args.taskIds.length; i++) {
      const taskId = args.taskIds[i];
      const task = await ctx.db.get(taskId);
      if (task && task.stepId === args.stepId) {
        await ctx.db.patch(taskId, {
          sortOrder: (i + 1) * 10,
          updatedAt: Date.now(),
        });
      }
    }
    return true;
  },
});
