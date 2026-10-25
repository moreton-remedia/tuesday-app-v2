import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { boardTable } from './board';

export type AutomationTrigger = {
  type: 'status-changes-to' | 'dropdown-changes-to' | 'text-contains' | 'link-changes';
  colId: string;
  value: string;
  /** Human-readable name for this automation (stored here to avoid a migration) */
  automationName?: string;
  /** For link-changes: which imported column to check, and what to match */
  linkedColId?: string;
  linkedValue?: string;
  linkedOp?: 'eq' | 'contains';
  /** Additional conditions beyond the primary trigger.
   *  `connector` says how this condition joins the previous one:
   *  'and' → same group (both must match), 'or' → new group (either group matches).
   *  Groups are then combined with `scope` (any = some group, all = every group). */
  extraConditions?: Array<{ colId: string; value: string; op?: 'eq' | 'contains'; connector?: 'and' | 'or' }>;
  scope?: 'any' | 'all';
};

export type AutomationAction = {
  type: 'set-status' | 'set-dropdown' | 'move-to-group' | 'copy-to' | 'create-task' | 'create-subitem';
  colId?: string;
  value?: string;
  groupId?: string;
  destBoardId?: string;
  destGroupId?: string;
  name?: string;
};

export const automationTable = pgTable('automation', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => boardTable.id, { onDelete: 'cascade' }),
  enabled: integer('enabled').notNull().default(1),
  trigger: jsonb('trigger').$type<AutomationTrigger>().notNull(),
  actions: jsonb('actions').$type<AutomationAction[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
