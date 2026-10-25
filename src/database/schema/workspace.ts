import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { userTable } from './auth';

export const workspaceTable = pgTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  inviteToken: text('invite_token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workspaceMemberTable = pgTable('workspace_member', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaceTable.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Stores per-user preferences such as which workspace is currently active
export const userPreferencesTable = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => userTable.id, { onDelete: 'cascade' }),
  activeWorkspaceId: text('active_workspace_id').references(() => workspaceTable.id, { onDelete: 'set null' }),
});
