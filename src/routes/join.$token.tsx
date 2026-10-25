import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { orpcClient } from '@/rpc/react';
import { useSession } from '@/common/auth-client';

export const Route = createFileRoute('/join/$token')({
  component: JoinPage,
});

type Stage =
  | { type: 'loading' }
  | { type: 'confirm'; workspaceName: string }
  | { type: 'joining' }
  | { type: 'done' }
  | { type: 'error'; message: string };

function JoinPage() {
  const { token } = Route.useParams();
  const session = useSession();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ type: 'loading' });

  // Once we know the auth state, preview the invite
  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      // Not logged in — send to login, then come back here
      router.navigate({ to: '/login', search: { redirect: `/join/${token}` } as any });
      return;
    }

    // Fetch workspace name without joining
    orpcClient.workspace.previewInvite({ token })
      .then(ws => setStage({ type: 'confirm', workspaceName: ws.name }))
      .catch((err: any) => setStage({ type: 'error', message: err?.message ?? 'This invite link is invalid or has expired.' }));
  }, [session.isPending, session.data]);

  async function handleJoin() {
    if (stage.type !== 'confirm') return;
    setStage({ type: 'joining' });
    try {
      await orpcClient.workspace.joinWorkspaceByToken({ token });
      setStage({ type: 'done' });
      router.navigate({ to: '/app' });
    } catch (err: any) {
      setStage({ type: 'error', message: err?.message ?? 'Something went wrong. Please try again.' });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm px-4">
        <h1 className="text-3xl font-bold text-white text-center mb-8">Tuesday</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {stage.type === 'loading' && (
            <p className="text-gray-400 text-sm text-center">Checking invite link…</p>
          )}

          {stage.type === 'confirm' && (
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">You've been invited to join</p>
              <p className="text-white text-xl font-semibold mb-6">{stage.workspaceName}</p>
              <button
                onClick={handleJoin}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Join workspace
              </button>
              <button
                onClick={() => router.navigate({ to: '/app' })}
                className="mt-3 w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                No thanks, go to my workspace
              </button>
            </div>
          )}

          {stage.type === 'joining' && (
            <p className="text-gray-400 text-sm text-center">Joining…</p>
          )}

          {stage.type === 'done' && (
            <p className="text-gray-400 text-sm text-center">Joined! Redirecting…</p>
          )}

          {stage.type === 'error' && (
            <div className="text-center">
              <p className="text-red-400 text-sm mb-4">{stage.message}</p>
              <a
                href="/app"
                className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Go to your workspace
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
