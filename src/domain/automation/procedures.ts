import { ORPCError } from '@orpc/client';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { automationTable, boardTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';
import { broadcastBoardUpdate } from '@/lib/board-events';

const triggerSchema = z.object({
  type: z.enum(['status-changes-to', 'dropdown-changes-to', 'text-contains', 'link-changes']),
  colId: z.string(),
  value: z.string(),
  automationName: z.string().optional(),
  linkedColId: z.string().optional(),
  linkedValue: z.string().optional(),
  linkedOp: z.enum(['eq', 'contains']).optional(),
  extraConditions: z.array(z.object({
    colId: z.string(),
    value: z.string(),
    op: z.enum(['eq', 'contains']).optional(),
    connector: z.enum(['and', 'or']).optional(),
  })).optional(),
  scope: z.enum(['any', 'all']).optional(),
});

const actionSchema = z.object({
  type: z.enum(['set-status', 'set-dropdown', 'move-to-group', 'copy-to', 'create-task', 'create-subitem']),
  colId: z.string().optional(),
  value: z.string().optional(),
  groupId: z.string().optional(),
  destBoardId: z.string().optional(),
  destGroupId: z.string().optional(),
  name: z.string().optional(),
});

export const listAutomations = workspaceScoped
  .input(z.object({ boardId: z.string() }))
  .handler(async ({ input, context }) => {
    const [board] = await database.select().from(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });
    return database.select().from(automationTable).where(eq(automationTable.boardId, input.boardId));
  });

export const createAutomation = workspaceScoped
  .input(z.object({
    boardId: z.string(),
    trigger: triggerSchema,
    actions: z.array(actionSchema).min(1),
  }))
  .handler(async ({ input, context }) => {
    const [board] = await database.select().from(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });
    const [auto] = await database.insert(automationTable).values({
      id: nanoid(),
      boardId: input.boardId,
      trigger: input.trigger,
      actions: input.actions,
    }).returning();
    broadcastBoardUpdate(input.boardId);
    return auto;
  });

export const updateAutomation = workspaceScoped
  .input(z.object({
    automationId: z.string(),
    enabled: z.boolean().optional(),
    trigger: triggerSchema.optional(),
    actions: z.array(actionSchema).optional(),
  }))
  .handler(async ({ input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;
    if (input.trigger !== undefined) patch.trigger = input.trigger;
    if (input.actions !== undefined) patch.actions = input.actions;
    const [auto] = await database.update(automationTable).set(patch).where(eq(automationTable.id, input.automationId)).returning();
    if (!auto) throw new ORPCError('NOT_FOUND', { message: 'Automation not found.' });
    broadcastBoardUpdate(auto.boardId);
    return auto;
  });

export const deleteAutomation = workspaceScoped
  .input(z.object({ automationId: z.string() }))
  .handler(async ({ input }) => {
    const [auto] = await database.select({ boardId: automationTable.boardId })
      .from(automationTable).where(eq(automationTable.id, input.automationId));
    await database.delete(automationTable).where(eq(automationTable.id, input.automationId));
    if (auto?.boardId) broadcastBoardUpdate(auto.boardId);
    return { success: true };
  });
