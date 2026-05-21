import { ORPCError } from '@orpc/client';
import { os } from '@orpc/server';
import { auth } from '@/common/auth';
import { database } from '@/database/database';
import { workspaceMemberTable, workspaceTable } from '@/database/schema';
import { eq } from 'drizzle-orm';

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

// Resolve the user's workspace (first membership found)
const workspaceMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.userSession) return next({ context: { workspace: null } });
  const [membership] = await database
    .select({ workspace: workspaceTable })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspaceId, workspaceTable.id))
    .where(eq(workspaceMemberTable.userId, context.userSession.user.id))
    .limit(1);
  return next({ context: { workspace: membership?.workspace ?? null } });
});

const requireWorkspaceMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.workspace) {
    throw new ORPCError('FORBIDDEN', { message: 'No workspace found.' });
  }
  return next({ context: { workspace: context.workspace } });
});

export const pub = o.use(authMiddleware);
export const authed = pub.use(requireAuthMiddleware);
export const workspaceScoped = authed.use(workspaceMiddleware).use(requireWorkspaceMiddleware);
export { database };
