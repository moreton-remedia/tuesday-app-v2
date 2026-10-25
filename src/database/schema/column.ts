import { jsonb, pgEnum, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { boardTable } from './board';

export const ColumnScopes = ['task', 'subitem'] as const;
export const columnScopeEnum = pgEnum('column_scope', ColumnScopes);
export type ColumnScope = (typeof ColumnScopes)[number];

export const ColumnTypes = ['notes', 'dropdown', 'date', 'status', 'link', 'formula', 'location'] as const;
export const columnTypeEnum = pgEnum('column_type', ColumnTypes);
export type ColumnType = (typeof ColumnTypes)[number];

export type DropdownOption = { label: string; colorKey?: string };
export type StatusOption = { key: string; label: string; colorKey: string };

export const columnTable = pgTable('column', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => boardTable.id, { onDelete: 'cascade' }),
  scope: columnScopeEnum('scope').notNull().default('task'),
  type: columnTypeEnum('type').notNull(),
  label: text('label').notNull(),
  position: real('position').notNull().default(0),
  // For dropdown/status: list of options
  options: jsonb('options').$type<DropdownOption[]>().default([]),
  statusOptions: jsonb('status_options').$type<StatusOption[] | null>(),
  // For link columns
  sourceBoardId: text('source_board_id'),
  linkedTaskId: text('linked_task_id'),
  importCols: jsonb('import_cols').$type<string[]>().default([]),
  // For formula columns
  formula: text('formula'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
