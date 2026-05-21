import { ORPCError } from '@orpc/client';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { columnTable, boardTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';

const columnTypeSchema = z.enum(['notes', 'dropdown', 'date', 'status', 'link']);
const columnScopeSchema = z.enum(['task', 'subitem']);

export const createColumn = workspaceScoped
  .input(z.object({
    boardId: z.string(),
    scope: columnScopeSchema.default('task'),
    type: columnTypeSchema,
    label: z.string().min(1).max(100),
    options: z.array(z.object({ label: z.string(), colorKey: z.string().optional() })).optional(),
    statusOptions: z.array(z.object({ key: z.string(), label: z.string(), colorKey: z.string() })).optional(),
    sourceBoardId: z.string().optional(),
    linkedTaskId: z.string().optional(),
    importCols: z.array(z.string()).optional(),
  }))
  .handler(async ({ input, context }) => {
    const [board] = await database.select().from(boardTable)
      .where(and(eq(boardTable.id, input.boardId), eq(boardTable.workspaceId, context.workspace.id)));
    if (!board) throw new ORPCError('NOT_FOUND', { message: 'Board not found.' });
    const [col] = await database.insert(columnTable).values({
      id: nanoid(),
      boardId: input.boardId,
      scope: input.scope,
      type: input.type,
      label: input.label,
      position: Date.now(),
      options: input.options ?? [],
      statusOptions: input.statusOptions ?? null,
      sourceBoardId: input.sourceBoardId ?? null,
      linkedTaskId: input.linkedTaskId ?? null,
      importCols: input.importCols ?? [],
    }).returning();
    return col;
  });

export const updateColumn = workspaceScoped
  .input(z.object({
    columnId: z.string(),
    label: z.string().optional(),
    options: z.array(z.object({ label: z.string(), colorKey: z.string().optional() })).optional(),
    statusOptions: z.array(z.object({ key: z.string(), label: z.string(), colorKey: z.string() })).optional(),
    sourceBoardId: z.string().nullable().optional(),
    linkedTaskId: z.string().nullable().optional(),
    importCols: z.array(z.string()).optional(),
  }))
  .handler(async ({ input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.options !== undefined) patch.options = input.options;
    if (input.statusOptions !== undefined) patch.statusOptions = input.statusOptions;
    if (input.sourceBoardId !== undefined) patch.sourceBoardId = input.sourceBoardId;
    if (input.linkedTaskId !== undefined) patch.linkedTaskId = input.linkedTaskId;
    if (input.importCols !== undefined) patch.importCols = input.importCols;
    const [col] = await database.update(columnTable).set(patch).where(eq(columnTable.id, input.columnId)).returning();
    if (!col) throw new ORPCError('NOT_FOUND', { message: 'Column not found.' });
    return col;
  });

export const deleteColumn = workspaceScoped
  .input(z.object({ columnId: z.string() }))
  .handler(async ({ input }) => {
    await database.delete(columnTable).where(eq(columnTable.id, input.columnId));
    return { success: true };
  });
