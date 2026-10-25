import { ORPCError } from '@orpc/client';
import { os } from '@orpc/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/common/auth';
import { database } from '@/database/database';
import { workspaceMemberTable, workspaceTable, userPreferencesTable } from '@/database/schema';

export type UserSession = {
  session: { id: string; userId: string; impersonatedBy?: string | null };
  user: { id: string; email: string; name: string; role?: string | null };
};

export type Workspace = typeof workspaceTable.$inferSelect;

export type ORPCContext = {
  headers: Headers;
  request?: Request;
  userSession?: UserSession | null;
  workspace?: Workspace | null;
};

const o = os.$context<ORPCContext>();

// Resolve Better Auth session from headers
const authMiddleware = o.middleware(async ({ context, next }) => {
  let userSession: UserSession | null = null;
  try {
    const session = await auth.api.getSession({ headers: context.headers });
    if (session?.user && session?.session) {
      userSession = {
        session: { id: session.session.id, userId: session.session.userId },
        user: { id: session.user.id, email: session.user.email, name: session.user.name, role: (session.user as any).role ?? null },
      };
    }
  } catch {}
  return next({ context: { userSession } });
});

const requireAuthMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.userSession) {
    throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in.' });
  }
  return next({ context: { userSession: context.userSession } });
});

// Resolve the user's active workspace, falling back to first membership
const workspaceMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.userSession) return next({ context: { workspace: null } });

  const userId = context.userSession.user.id;

  // Check if user has an active workspace preference
  const [pref] = await database
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));

  if (pref?.activeWorkspaceId) {
    const [row] = await database
      .select({ workspace: workspaceTable })
      .from(workspaceMemberTable)
      .innerJoin(workspaceTable, eq(workspaceMemberTable.workspaceId, workspaceTable.id))
      .where(
        and(
          eq(workspaceMemberTable.userId, userId),
          eq(workspaceMemberTable.workspaceId, pref.activeWorkspaceId),
        ),
      );
    if (row) return next({ context: { workspace: row.workspace } });
  }

  // Fall back to first membership
  const [row] = await database
    .select({ workspace: workspaceTable })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspaceId, workspaceTable.id))
    .where(eq(workspaceMemberTable.userId, userId))
    .limit(1);

  return next({ context: { workspace: row?.workspace ?? null } });
});

const requireWorkspaceMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.workspace) {
    throw new ORPCError('FORBIDDEN', { message: 'No workspace found.' });
  }
  return next({ context: { workspace: context.workspace } });
});

export const pub = o.use(authMiddleware);
export const authed = pub.use(requireAuthMiddleware);
// Active workspace resolved but not required (workspace may be null for new users)
export const workspaceOptional = authed.use(workspaceMiddleware);
export const workspaceScoped = workspaceOptional.use(requireWorkspaceMiddleware);
export { database };
