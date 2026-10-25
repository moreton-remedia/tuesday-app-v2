import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { orpcUtils, orpcClient } from '@/rpc/react';
import { signOut, useSession } from '@/common/auth-client';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Sidebar } from '@/components/board/Sidebar';

export const Route = createFileRoute('/_authenticated/app/')({
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.prefetchQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} })),
    ]);
  },
  component: AppPage,
});

function AppPage() {
  const { data: workspace } = useSuspenseQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
  const { data: workspaces } = useSuspenseQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} }));
  const session = useSession();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    await router.navigate({ to: '/login' });
  }

  // No workspaces at all — show first-time setup
  if (!workspace || !workspaces?.length) return <WorkspaceSetup />;

  return (
    <WorkspaceHome
      workspace={workspace}
      workspaces={workspaces}
      userName={session.data?.user.name ?? ''}
      onSignOut={handleSignOut}
    />
  );
}

// First-time setup (only shown when user has zero workspaces)
function WorkspaceSetup() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await orpcClient.workspace.createWorkspace({ name });
      await qc.invalidateQueries();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create workspace.');
    } finally { setLoading(false); }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const token = inviteInput.trim().split('/join/').pop()?.trim() ?? '';
    if (!token) {
      setError('Please paste a valid invite link.');
      setLoading(false);
      return;
    }
    try {
      await orpcClient.workspace.joinWorkspaceByToken({ token });
      await qc.invalidateQueries();
    } catch (err: any) {
      setError(err?.message ?? 'Invite link is invalid or has expired.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Tuesday</h1>
          <p className="text-gray-400 mt-1">Set up your workspace</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode('create')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'create' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Create workspace</button>
            <button onClick={() => setMode('join')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'join' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Join workspace</button>
          </div>
          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Workspace name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Acme Corp" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">{loading ? 'Creating…' : 'Create workspace'}</button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Invite link</label>
                <input
                  type="text"
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value)}
                  required
                  placeholder="Paste your invite link here"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                />
                <p className="text-xs text-gray-600 mt-1">Ask your workspace owner for an invite link.</p>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">{loading ? 'Joining…' : 'Join workspace'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceHome({
  workspace,
  workspaces,
  userName,
  onSignOut,
}: {
  workspace: { id: string; name: string; inviteToken: string };
  workspaces: { workspace: { id: string; name: string }; role: string }[];
  userName: string;
  onSignOut: () => void;
}) {
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar
        boards={boards ?? []}
        workspaces={workspaces}
        activeWorkspaceId={workspace.id}
        inviteToken={workspace.inviteToken}
        workspaceName={workspace.name}
        userName={userName}
        onSignOut={onSignOut}
      />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-600">
          <p className="text-lg">Select a board from the sidebar</p>
          <p className="text-sm mt-1">or create a new one</p>
        </div>
      </main>
    </div>
  );
}
