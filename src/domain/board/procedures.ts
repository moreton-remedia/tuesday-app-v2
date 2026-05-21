import { ORPCError } from '@orpc/client';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { boardTable, groupTable, taskTable, subitemTable, columnTable, automationTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';

// ── Boards ────────────────────────────────────────────────────────────────────

export const listBoards = workspaceScoped.handler(async ({ context }) => {
  return database.select().from(boardTable)
    .where(eq(boardTable.workspaceId, context.workspace.id))
    .orderBy(asc(boardTable.position));
});

export const createBoard = workspaceScoped
  .input(z.object({ name: z.string().min(1).max(200).default('New Board') }))
  .handler(async ({ input, context }) => {
    const [board] = await database.insert(boardTable).values({
      id: nanoid(),
      workspaceId: context.workspace.id,
      name: input.name,
      position: Date.now(),
    }).returning();
    if (!board) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create board.' });
    await database.insert(groupTable).values({
      id: nanoid(),
      boardId: board.id,
      title: 'Group 1',
      color: '#4263eb',
      position: 0,
    });
    return board;
  });

export const updateBoard = workspaceScoped
  .input(z.object({ boardId: z.string(), name: z.string().min(1).max(200) }))
  .handler(async ({ input, context }) => {
    const [board] = await database.update(boardTable)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)))
      .returning();
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });
    return board;
  });

export const deleteBoard = workspaceScoped
  .input(z.object({ boardId: z.string() }))
  .handler(async ({ input, context }) => {
    await database.delete(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    return { success: true };
  });

// ── Full board data (groups + tasks + subitems + columns + automations) ────────

export const getBoardData = workspaceScoped
  .input(z.object({ boardId: z.string() }))
  .handler(async ({ input, context }) => {
    const [board] = await database.select().from(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });

    const [groups, columns, automations] = await Promise.all([
      database.select().from(groupTable).where(eq(groupTable.boardId, board.id)).orderBy(asc(groupTable.position)),
      database.select().from(columnTable).where(eq(columnTable.boardId, board.id)).orderBy(asc(columnTable.position)),
      database.select().from(automationTable).where(eq(automationTable.boardId, board.id)),
    ]);

    const groupIds = groups.map(g => g.id);
    const allTasks = groupIds.length
      ? await database.select().from(taskTable)
          .where(inArray(taskTable.groupId, groupIds))
          .orderBy(asc(taskTable.position))
      : [];

    const taskIds = allTasks.map(t => t.id);
    const allSubitems = taskIds.length
      ? await database.select().from(subitemTable)
          .where(inArray(subitemTable.taskId, taskIds))
          .orderBy(asc(subitemTable.position))
      : [];

    return { board, groups, tasks: allTasks, subitems: allSubitems, columns, automations };
  });

// ── Groups ────────────────────────────────────────────────────────────────────

export const createGroup = workspaceScoped
  .input(z.object({ boardId: z.string(), title: z.string().default('New Group'), color: z.string().default('#4263eb') }))
  .handler(async ({ input, context }) => {
    const [board] = await database.select().from(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });
    const [group] = await database.insert(groupTable).values({
      id: nanoid(),
      boardId: input.boardId,
      title: input.title,
      color: input.color,
      position: Date.now(),
    }).returning();
    if (!group) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create group.' });
    return group;
  });

export const updateGroup = workspaceScoped
  .input(z.object({ groupId: z.string(), title: z.string().optional(), color: z.string().optional(), collapsed: z.boolean().optional() }))
  .handler(async ({ input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.color !== undefined) patch.color = input.color;
    if (input.collapsed !== undefined) patch.collapsed = input.collapsed ? 1 : 0;
    const [group] = await database.update(groupTable).set(patch).where(eq(groupTable.id, input.groupId)).returning();
    if (!group) throw new ORPCError('NOT_FOUND', { message: 'Group not found.' });
    return group;
  });

export const deleteGroup = workspaceScoped
  .input(z.object({ groupId: z.string() }))
  .handler(async ({ input }) => {
    await database.delete(groupTable).where(eq(groupTable.id, input.groupId));
    return { success: true };
  });
