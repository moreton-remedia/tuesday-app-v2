import { ORPCError } from '@orpc/client';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { authed, database, workspaceOptional, workspaceScoped } from '@/rpc/base';
import { workspaceMemberTable, workspaceTable, userPreferencesTable } from '@/database/schema';
import { nanoid } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setActive(userId: string, workspaceId: string) {
  await database
    .insert(userPreferencesTable)
    .values({ userId, activeWorkspaceId: workspaceId })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { activeWorkspaceId: workspaceId },
    });
}

// ── Queries ───────────────────────────────────────────────────────────────────

// Active workspace — resolved by workspaceMiddleware via the preference table.
// Returns null for new users who haven't created or joined a workspace yet.
export const getWorkspace = workspaceOptional.handler(async ({ context }) => {
  return context.workspace ?? null;
});

// All workspaces the current user belongs to
export const listWorkspaces = authed.handler(async ({ context }) => {
  const rows = await database
    .select({ workspace: workspaceTable, role: workspaceMemberTable.role })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspaceId, workspaceTable.id))
    .where(eq(workspaceMemberTable.userId, context.userSession.user.id))
    .orderBy(asc(workspaceMemberTable.createdAt));
  return rows;
});

// ── Mutations ─────────────────────────────────────────────────────────────────

// Create a new workspace and activate it
export const createWorkspace = authed
  .input(z.object({ name: z.string().min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';

    // Find a unique slug — append -2, -3, … if the base is already taken
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const [existing] = await database
        .select({ id: workspaceTable.id })
        .from(workspaceTable)
        .where(eq(workspaceTable.slug, slug));
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const workspaceId = nanoid();
    const [workspace] = await database.insert(workspaceTable).values({
      id: workspaceId,
      name: input.name,
      slug,
      inviteToken: nanoid(32),
    }).returning();
    await database.insert(workspaceMemberTable).values({
      id: nanoid(),
      workspaceId,
      userId: context.userSession.user.id,
      role: 'owner',
    });
    await setActive(context.userSession.user.id, workspaceId);
    return workspace;
  });

// Return workspace info for a token without joining (used for the join confirmation screen)
export const previewInvite = authed
  .input(z.object({ token: z.string() }))
  .handler(async ({ input }) => {
    const [workspace] = await database
      .select({ id: workspaceTable.id, name: workspaceTable.name })
      .from(workspaceTable)
      .where(eq(workspaceTable.inviteToken, input.token));
    if (!workspace) throw new ORPCError('NOT_FOUND', { message: 'Invite link is invalid or has expired.' });
    return workspace;
  });

// Join a workspace by invite token and activate it
export const joinWorkspaceByToken = authed
  .input(z.object({ token: z.string() }))
  .handler(async ({ input, context }) => {
    const [workspace] = await database
      .select()
      .from(workspaceTable)
      .where(eq(workspaceTable.inviteToken, input.token));
    if (!workspace) throw new ORPCError('NOT_FOUND', { message: 'Invite link is invalid or has expired.' });

    // Idempotent — re-joining is fine
    const [existing] = await database.select().from(workspaceMemberTable).where(
      and(
        eq(workspaceMemberTable.workspaceId, workspace.id),
        eq(workspaceMemberTable.userId, context.userSession.user.id),
      ),
    );
    if (!existing) {
      await database.insert(workspaceMemberTable).values({
        id: nanoid(),
        workspaceId: workspace.id,
        userId: context.userSession.user.id,
        role: 'member',
      });
    }
    await setActive(context.userSession.user.id, workspace.id);
    return workspace;
  });

// Switch the active workspace (must already be a member)
export const setActiveWorkspace = authed
  .input(z.object({ workspaceId: z.string() }))
  .handler(async ({ input, context }) => {
    const [membership] = await database
      .select()
      .from(workspaceMemberTable)
      .where(
        and(
          eq(workspaceMemberTable.userId, context.userSession.user.id),
          eq(workspaceMemberTable.workspaceId, input.workspaceId),
        ),
      );
    if (!membership) throw new ORPCError('FORBIDDEN', { message: 'You are not a member of this workspace.' });
    await setActive(context.userSession.user.id, input.workspaceId);
    return { success: true };
  });

// Rename the active workspace
export const updateWorkspace = workspaceScoped
  .input(z.object({ name: z.string().min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const [workspace] = await database
      .update(workspaceTable)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(workspaceTable.id, context.workspace.id))
      .returning();
    return workspace!;
  });

// Regenerate invite token — invalidates the current link
export const regenerateInviteToken = workspaceScoped
  .handler(async ({ context }) => {
    const [workspace] = await database
      .update(workspaceTable)
      .set({ inviteToken: nanoid(32), updatedAt: new Date() })
      .where(eq(workspaceTable.id, context.workspace.id))
      .returning();
    return workspace!;
  });

// List workspace members
export const listMembers = workspaceScoped.handler(async ({ context }) => {
  return database
    .select({ member: workspaceMemberTable })
    .from(workspaceMemberTable)
    .where(eq(workspaceMemberTable.workspaceId, context.workspace.id));
});
