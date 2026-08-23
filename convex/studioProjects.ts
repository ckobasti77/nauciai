import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./helpers";
import { canCreateStudioProject, validateProjectName } from "../lib/studio-projects";

/**
 * Spisak svih projekata prijavljenog korisnika.
 * Nearhivirani projekti dolaze prvi (noviji prvo), a uz svaki projekat
 * se vraća i ukupan broj generacija koje mu pripadaju.
 */
export const listMyProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const allProjects = await ctx.db
      .query("studioProjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Sort: nearhivirani prvi (noviji prvo), arhivirani na kraju (noviji prvo)
    const sorted = [...allProjects].sort((a, b) => {
      const aArchived = a.archivedAt !== undefined;
      const bArchived = b.archivedAt !== undefined;
      if (aArchived !== bArchived) {
        return aArchived ? 1 : -1;
      }
      return b.createdAt - a.createdAt;
    });

    const results = await Promise.all(
      sorted.map(async (project) => {
        const jobs = await ctx.db
          .query("generationJobs")
          .withIndex("by_user_project", (q) =>
            q.eq("userId", userId).eq("projectId", project._id),
          )
          .collect();

        return {
          _id: project._id,
          _creationTime: project._creationTime,
          userId: project.userId,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          archivedAt: project.archivedAt,
          generationCount: jobs.length,
        };
      }),
    );

    return results;
  },
});

/**
 * Pravljenje novog projekta.
 * - Proverava gornju granicu od 50 nearhiviranih projekata
 * - Validira ime (trim, dužina 1-60, case-insensitive provera duplikata)
 */
export const createProject = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const userProjects = await ctx.db
      .query("studioProjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const activeProjects = userProjects.filter((p) => p.archivedAt === undefined);

    if (!canCreateStudioProject(activeProjects.length)) {
      throw new Error("PREVISE_PROJEKATA");
    }

    const validation = validateProjectName(
      args.name,
      activeProjects.map((p) => p.name),
    );

    if (!validation.ok) {
      throw new Error(validation.code);
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("studioProjects", {
      userId,
      name: validation.name,
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
  },
});

/**
 * Preimenovanje postojećeg projekta.
 * - Proverava vlasništvo (userId mora da se poklapa)
 * - Zabranjuje promenu arhiviranog projekta
 * - Validira novo ime i proverava duplikate kod ostalih aktivnih projekata
 */
export const renameProject = mutation({
  args: {
    projectId: v.id("studioProjects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("NEMA_PRISTUPA");
    }

    if (project.archivedAt !== undefined) {
      throw new Error("NEMA_PRISTUPA");
    }

    const userProjects = await ctx.db
      .query("studioProjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const otherActiveProjects = userProjects.filter(
      (p) => p._id !== args.projectId && p.archivedAt === undefined,
    );

    const validation = validateProjectName(
      args.name,
      otherActiveProjects.map((p) => p.name),
    );

    if (!validation.ok) {
      throw new Error(validation.code);
    }

    const now = Date.now();
    await ctx.db.patch(args.projectId, {
      name: validation.name,
      updatedAt: now,
    });

    return args.projectId;
  },
});

/**
 * Arhiviranje projekta.
 * - Proverava vlasništvo
 * - Postavlja `archivedAt` timestamp
 * - NE briše poslove i NE dira `projectId` na njima
 */
export const archiveProject = mutation({
  args: {
    projectId: v.id("studioProjects"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("NEMA_PRISTUPA");
    }

    if (project.archivedAt === undefined) {
      const now = Date.now();
      await ctx.db.patch(args.projectId, {
        archivedAt: now,
        updatedAt: now,
      });
    }

    return args.projectId;
  },
});
