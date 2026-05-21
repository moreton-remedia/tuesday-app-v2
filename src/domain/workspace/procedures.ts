import { ORPCError } from '@orpc/client';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { authed, database, workspaceScoped } from '@/rpc/base';
import { workspaceMemberTable, workspaceTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';

// Get current user's workspace (or null if not a member yet)
export const getWorkspace = authed.handler(async ({ context }) => {
  const [row] = await database
    .select({ workspace: workspaceTable })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspaceId, workspaceTable.id))
    .where(eq(workspaceMemberTable.userId, context.userSession.user.id))
    .limit(1);
  return row?.workspace ?? null;
});

// Create a new workspace and make the current user owner
export const createWorkspace = authed
  .input(z.object({ name: z.string().min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const workspaceId = nanoid();
    const [workspace] = await database.insert(workspaceTable).values({
      id: workspaceId,
      name: input.name,
      slug,
    }).returning();
    await database.insert(workspaceMemberTable).values({
      id: nanoid(),
      workspaceId,
      userId: context.userSession.user.id,
      role: 'owner',
    });
    return workspace;
  });

// Join a workspace by slug (invite flow — simplified: any authenticated user can join)
export const joinWorkspace = authed
  .input(z.object({ slug: z.string() }))
  .handler(async ({ input, context }) => {
    const [workspace] = await database.select().from(workspaceTable).where(eq(workspaceTable.slug, input.slug));
    if (!workspace) throw new ORPCError('NOT_FOUND', { message: 'Workspace not found.' });
    // Check if already a member
    const [existing] = await database.select().from(workspaceMemberTable).where(
      and(eq(workspaceMemberTable.workspaceId, workspace.id), eq(workspaceMemberTable.userId, context.userSession.user.id))
    );
    if (!existing) {
      await database.insert(workspaceMemberTable).values({
        id: nanoid(),
        workspaceId: workspace.id,
        userId: context.userSession.user.id,
        role: 'member',
      });
    }
    return workspace;
  });

// List workspace members
export const listMembers = workspaceScoped.handler(async ({ context }) => {
  return database
    .select({ member: workspaceMemberTable })
    .from(workspaceMemberTable)
    .where(eq(workspaceMemberTable.workspaceId, context.workspace.id));
});
