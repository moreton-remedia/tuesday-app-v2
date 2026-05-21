import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { boardTable } from './board';

export type AutomationTrigger = {
  type: 'status-changes-to' | 'dropdown-changes-to';
  colId: string;
  value: string;
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
