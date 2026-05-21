import { integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { groupTable } from './board';

export const taskTable = pgTable('task', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => groupTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  done: integer('done').notNull().default(0),
  position: real('position').notNull().default(0),
  expanded: integer('expanded').notNull().default(0),
  // Column field values stored as { [columnId]: value }
  fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const subitemTable = pgTable('subitem', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => taskTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  done: integer('done').notNull().default(0),
  position: real('position').notNull().default(0),
  // Column field values stored as { [columnId]: value }
  fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
