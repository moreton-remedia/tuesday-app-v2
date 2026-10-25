import { ORPCError } from '@orpc/client';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { boardTable, groupTable, taskTable, subitemTable, columnTable, automationTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';
import { broadcastBoardUpdate } from '@/lib/board-events';

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
    broadcastBoardUpdate(input.boardId);
    return board;
  });

export const deleteBoard = workspaceScoped
  .input(z.object({ boardId: z.string() }))
  .handler(async ({ input, context }) => {
    await database.delete(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    return { success: true };
  });

export const reorderBoards = workspaceScoped
  .input(z.object({ boardIds: z.array(z.string()) }))
  .handler(async ({ input, context }) => {
    await Promise.all(
      input.boardIds.map((id, index) =>
        database.update(boardTable)
          .set({ position: index, updatedAt: new Date() })
          .where(and(eq(boardTable.id, id), eq(boardTable.workspaceId, context.workspace.id))),
      ),
    );
    return { success: true };
  });

export const reorderGroups = workspaceScoped
  .input(z.object({ groupIds: z.array(z.string()) }))
  .handler(async ({ input }) => {
    if (!input.groupIds.length) return { success: true };
    await Promise.all(
      input.groupIds.map((id, index) =>
        database.update(groupTable)
          .set({ position: index, updatedAt: new Date() })
          .where(eq(groupTable.id, id)),
      ),
    );
    const [g] = await database.select({ boardId: groupTable.boardId })
      .from(groupTable).where(eq(groupTable.id, input.groupIds[0]!));
    if (g?.boardId) broadcastBoardUpdate(g.boardId);
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
          .orderBy(asc(taskTable.position), asc(taskTable.createdAt))
      : [];

    const taskIds = allTasks.map(t => t.id);
    const allSubitems = taskIds.length
      ? await database.select().from(subitemTable)
          .where(inArray(subitemTable.taskId, taskIds))
          .orderBy(asc(subitemTable.position), asc(subitemTable.createdAt))
      : [];

    return { board, groups, tasks: allTasks, subitems: allSubitems, columns, automations };
  });

// ── Calendar data (all boards + first date column + tasks) ────────────────────

export const getCalendarData = workspaceScoped
  .handler(async ({ context }) => {
    const boards = await database.select()
      .from(boardTable)
      .where(eq(boardTable.workspaceId, context.workspace.id))
      .orderBy(asc(boardTable.position));

    if (!boards.length) return { boards: [], columns: [], groups: [], tasks: [], groupBoardMap: {} };

    const boardIds = boards.map(b => b.id);

    const [columns, groups] = await Promise.all([
      database.select({
        id: columnTable.id,
        boardId: columnTable.boardId,
        type: columnTable.type,
        position: columnTable.position,
        label: columnTable.label,
        options: columnTable.options,
        statusOptions: columnTable.statusOptions,
        sourceBoardId: columnTable.sourceBoardId,
      })
        .from(columnTable)
        .where(and(inArray(columnTable.boardId, boardIds), eq(columnTable.scope, 'task')))
        .orderBy(asc(columnTable.position)),
      database.select({ id: groupTable.id, boardId: groupTable.boardId, title: groupTable.title, position: groupTable.position })
        .from(groupTable)
        .where(inArray(groupTable.boardId, boardIds))
        .orderBy(asc(groupTable.position)),
    ]);

    const groupIds = groups.map(g => g.id);
    const tasks = groupIds.length
      ? await database.select({ id: taskTable.id, name: taskTable.name, groupId: taskTable.groupId, fields: taskTable.fields })
          .from(taskTable)
          .where(inArray(taskTable.groupId, groupIds))
      : [];

    const groupBoardMap = Object.fromEntries(groups.map(g => [g.id, g.boardId]));

    return { boards, columns, groups, tasks, groupBoardMap };
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
    broadcastBoardUpdate(input.boardId);
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
    broadcastBoardUpdate(group.boardId);
    return group;
  });

export const deleteGroup = workspaceScoped
  .input(z.object({ groupId: z.string() }))
  .handler(async ({ input }) => {
    const [grp] = await database.select({ boardId: groupTable.boardId })
      .from(groupTable).where(eq(groupTable.id, input.groupId));
    await database.delete(groupTable).where(eq(groupTable.id, input.groupId));
    if (grp?.boardId) broadcastBoardUpdate(grp.boardId);
    return { success: true };
  });
