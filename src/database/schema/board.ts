import { integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { workspaceTable } from './workspace';

export const boardTable = pgTable('board', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaceTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('New Board'),
  position: real('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const groupTable = pgTable('group', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => boardTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New Group'),
  color: text('color').notNull().default('#4263eb'),
  position: real('position').notNull().default(0),
  collapsed: integer('collapsed').notNull().default(0), // 0 = open, 1 = collapsed
  // Per-group column width settings stored as JSON
  settings: jsonb('settings').$type<{
    checkColWidth?: number;
    taskColWidth?: number;
    subitemNameColWidth?: number;
  }>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
