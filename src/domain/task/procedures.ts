import { ORPCError } from '@orpc/client';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { taskTable, subitemTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';

const fieldsSchema = z.record(z.string(), z.string());

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const createTask = workspaceScoped
  .input(z.object({ groupId: z.string(), name: z.string().default(''), position: z.number().optional() }))
  .handler(async ({ input }) => {
    const [task] = await database.insert(taskTable).values({
      id: nanoid(),
      groupId: input.groupId,
      name: input.name,
      position: input.position ?? Date.now(),
    }).returning();
    return task;
  });

export const updateTask = workspaceScoped
  .input(z.object({
    taskId: z.string(),
    name: z.string().optional(),
    done: z.boolean().optional(),
    expanded: z.boolean().optional(),
    fields: fieldsSchema.optional(),
    groupId: z.string().optional(), // for moving between groups
  }))
  .handler(async ({ input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.done !== undefined) patch.done = input.done ? 1 : 0;
    if (input.expanded !== undefined) patch.expanded = input.expanded ? 1 : 0;
    if (input.fields !== undefined) patch.fields = input.fields;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    const [task] = await database.update(taskTable).set(patch).where(eq(taskTable.id, input.taskId)).returning();
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found.' });
    return task;
  });

export const updateTaskFields = workspaceScoped
  .input(z.object({ taskId: z.string(), fields: fieldsSchema }))
  .handler(async ({ input }) => {
    const [task] = await database.update(taskTable)
      .set({ fields: input.fields, updatedAt: new Date() })
      .where(eq(taskTable.id, input.taskId))
      .returning();
    if (!task) throw new ORPCError('NOT_FOUND', { message: 'Task not found.' });
    return task;
  });

export const deleteTask = workspaceScoped
  .input(z.object({ taskId: z.string() }))
  .handler(async ({ input }) => {
    await database.delete(taskTable).where(eq(taskTable.id, input.taskId));
    return { success: true };
  });

export const deleteTasks = workspaceScoped
  .input(z.object({ taskIds: z.array(z.string()) }))
  .handler(async ({ input }) => {
    if (input.taskIds.length) await database.delete(taskTable).where(inArray(taskTable.id, input.taskIds));
    return { success: true };
  });

// ── Subitems ──────────────────────────────────────────────────────────────────

export const createSubitem = workspaceScoped
  .input(z.object({ taskId: z.string(), name: z.string().default(''), position: z.number().optional() }))
  .handler(async ({ input }) => {
    const [sub] = await database.insert(subitemTable).values({
      id: nanoid(),
      taskId: input.taskId,
      name: input.name,
      position: input.position ?? Date.now(),
    }).returning();
    return sub;
  });

export const updateSubitem = workspaceScoped
  .input(z.object({
    subitemId: z.string(),
    name: z.string().optional(),
    done: z.boolean().optional(),
    fields: fieldsSchema.optional(),
  }))
  .handler(async ({ input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.done !== undefined) patch.done = input.done ? 1 : 0;
    if (input.fields !== undefined) patch.fields = input.fields;
    const [sub] = await database.update(subitemTable).set(patch).where(eq(subitemTable.id, input.subitemId)).returning();
    if (!sub) throw new ORPCError('NOT_FOUND', { message: 'Subitem not found.' });
    return sub;
  });

export const deleteSubitem = workspaceScoped
  .input(z.object({ subitemId: z.string() }))
  .handler(async ({ input }) => {
    await database.delete(subitemTable).where(eq(subitemTable.id, input.subitemId));
    return { success: true };
  });

export const deleteSubitems = workspaceScoped
  .input(z.object({ subitemIds: z.array(z.string()) }))
  .handler(async ({ input }) => {
    if (input.subitemIds.length) await database.delete(subitemTable).where(inArray(subitemTable.id, input.subitemIds));
    return { success: true };
  });
