import { ORPCError } from '@orpc/client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database, workspaceScoped } from '@/rpc/base';
import { columnTable, boardTable, groupTable, taskTable, subitemTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';
import { broadcastBoardUpdate } from '@/lib/board-events';

const columnTypeSchema = z.enum(['notes', 'dropdown', 'date', 'status', 'link', 'formula', 'location']);
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
    formula: z.string().optional(),
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
      formula: input.formula ?? null,
    }).returning();
    broadcastBoardUpdate(input.boardId);
    return col;
  });

/**
 * Rewrites a single field value across all tasks (or subitems) in a board.
 * Used when a dropdown label or status key is renamed, so existing selections
 * stay in sync with the updated option definition.
 */
async function renameFieldValues(
  boardId: string,
  scope: string,
  columnId: string,
  oldValue: string,
  newValue: string,
) {
  const groups = await database.select({ id: groupTable.id })
    .from(groupTable)
    .where(eq(groupTable.boardId, boardId));
  const groupIds = groups.map(g => g.id);
  if (!groupIds.length) return;

  if (scope === 'task') {
    await database.update(taskTable)
      .set({
        fields: sql`jsonb_set(${taskTable.fields}, array[${columnId}]::text[], to_jsonb(${newValue}::text))`,
        updatedAt: new Date(),
      })
      .where(and(
        inArray(taskTable.groupId, groupIds),
        sql`${taskTable.fields}->>${columnId} = ${oldValue}`,
      ));
  } else {
    const tasks = await database.select({ id: taskTable.id })
      .from(taskTable)
      .where(inArray(taskTable.groupId, groupIds));
    const taskIds = tasks.map(t => t.id);
    if (!taskIds.length) return;
    await database.update(subitemTable)
      .set({
        fields: sql`jsonb_set(${subitemTable.fields}, array[${columnId}]::text[], to_jsonb(${newValue}::text))`,
        updatedAt: new Date(),
      })
      .where(and(
        inArray(subitemTable.taskId, taskIds),
        sql`${subitemTable.fields}->>${columnId} = ${oldValue}`,
      ));
  }
}

export const updateColumn = workspaceScoped
  .input(z.object({
    columnId: z.string(),
    label: z.string().optional(),
    options: z.array(z.object({ label: z.string(), colorKey: z.string().optional() })).optional(),
    statusOptions: z.array(z.object({ key: z.string(), label: z.string(), colorKey: z.string() })).optional(),
    sourceBoardId: z.string().nullable().optional(),
    linkedTaskId: z.string().nullable().optional(),
    importCols: z.array(z.string()).optional(),
    formula: z.string().nullable().optional(),
  }))
  .handler(async ({ input }) => {
    // Fetch current column BEFORE the update so we can detect renames.
    const [currentCol] = await database.select().from(columnTable).where(eq(columnTable.id, input.columnId));
    if (!currentCol) throw new ORPCError('NOT_FOUND', { message: 'Column not found.' });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.options !== undefined) patch.options = input.options;
    if (input.statusOptions !== undefined) patch.statusOptions = input.statusOptions;
    if (input.sourceBoardId !== undefined) patch.sourceBoardId = input.sourceBoardId;
    if (input.linkedTaskId !== undefined) patch.linkedTaskId = input.linkedTaskId;
    if (input.importCols !== undefined) patch.importCols = input.importCols;
    if (input.formula !== undefined) patch.formula = input.formula;
    const [col] = await database.update(columnTable).set(patch).where(eq(columnTable.id, input.columnId)).returning();
    if (!col) throw new ORPCError('NOT_FOUND', { message: 'Column not found.' });

    // ── Propagate dropdown label renames to task/subitem fields ──────────────
    // Strategy: pair old[i] with new[i] by position. If the label at that
    // position changed AND the old label doesn't appear anywhere in the new
    // array (i.e. it wasn't just reordered), it's a genuine rename.
    if (input.options !== undefined && currentCol.options) {
      const oldOpts = currentCol.options as { label: string; colorKey?: string }[];
      const newOpts = input.options;
      const newLabelSet = new Set(newOpts.map(o => o.label));
      for (let i = 0; i < Math.min(oldOpts.length, newOpts.length); i++) {
        const oldLabel = oldOpts[i]!.label;
        const newLabel = newOpts[i]!.label;
        if (oldLabel !== newLabel && !newLabelSet.has(oldLabel)) {
          await renameFieldValues(col.boardId, col.scope, col.id, oldLabel, newLabel);
        }
      }
    }

    // ── Propagate status key renames (key = slugify(label)) ──────────────────
    if (input.statusOptions !== undefined && currentCol.statusOptions) {
      const oldOpts = currentCol.statusOptions as { key: string; label: string; colorKey: string }[];
      const newOpts = input.statusOptions;
      const newKeySet = new Set(newOpts.map(o => o.key));
      for (let i = 0; i < Math.min(oldOpts.length, newOpts.length); i++) {
        const oldKey = oldOpts[i]!.key;
        const newKey = newOpts[i]!.key;
        if (oldKey !== newKey && !newKeySet.has(oldKey)) {
          await renameFieldValues(col.boardId, col.scope, col.id, oldKey, newKey);
        }
      }
    }

    broadcastBoardUpdate(col.boardId);
    return col;
  });

export const reorderColumns = workspaceScoped
  .input(z.object({ columnIds: z.array(z.string()) }))
  .handler(async ({ input }) => {
    if (!input.columnIds.length) return { success: true };
    await Promise.all(
      input.columnIds.map((id, index) =>
        database.update(columnTable)
          .set({ position: index, updatedAt: new Date() })
          .where(eq(columnTable.id, id)),
      ),
    );
    const [col] = await database.select({ boardId: columnTable.boardId })
      .from(columnTable).where(eq(columnTable.id, input.columnIds[0]!));
    if (col?.boardId) broadcastBoardUpdate(col.boardId);
    return { success: true };
  });

export const deleteColumn = workspaceScoped
  .input(z.object({ columnId: z.string() }))
  .handler(async ({ input }) => {
    const [col] = await database.select({ boardId: columnTable.boardId })
      .from(columnTable).where(eq(columnTable.id, input.columnId));
    await database.delete(columnTable).where(eq(columnTable.id, input.columnId));
    if (col?.boardId) broadcastBoardUpdate(col.boardId);
    return { success: true };
  });
