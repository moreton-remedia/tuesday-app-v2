import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { orpcUtils, orpcClient } from '@/rpc/react';
import { signOut, useSession } from '@/common/auth-client';
import { useRouter } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/app/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
  },
  component: AppPage,
});

function AppPage() {
  const { data: workspace } = useSuspenseQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
  const session = useSession();
  const router = useRouter();
  const qc = useQueryClient();

  async function handleSignOut() {
    await signOut();
    await router.navigate({ to: '/login' });
  }

  if (!workspace) return <WorkspaceSetup />;

  return <WorkspaceHome workspaceId={workspace.id} workspaceName={workspace.name} userName={session.data?.user.name ?? ''} onSignOut={handleSignOut} />;
}

function WorkspaceSetup() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
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
    try {
      await orpcClient.workspace.joinWorkspace({ slug });
      await qc.invalidateQueries();
    } catch (err: any) {
      setError(err?.message ?? 'Workspace not found.');
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
                <label className="block text-sm text-gray-400 mb-1">Workspace slug</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} required placeholder="e.g. acme-corp" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
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

import { useState } from 'react';

function WorkspaceHome({ workspaceId, workspaceName, userName, onSignOut }: { workspaceId: string; workspaceName: string; userName: string; onSignOut: () => void }) {
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  async function handleCreateBoard() {
    setCreating(true);
    try {
      const board = await orpcClient.board.createBoard({ name: 'New Board' });
      await qc.invalidateQueries();
    } finally { setCreating(false); }
  }

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">Tuesday</h1>
          <p className="text-xs text-gray-500 mt-0.5">{workspaceName}</p>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          <p className="text-xs text-gray-500 font-semibold px-2 py-1 uppercase tracking-wider">Boards</p>
          {boards?.map(board => (
            <Link
              key={board.id}
              to="/app/board/$boardId"
              params={{ boardId: board.id }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors [&.active]:bg-gray-800 [&.active]:text-white"
            >
              <span className="w-2 h-2 rounded-sm bg-violet-500 flex-shrink-0" />
              {board.name}
            </Link>
          ))}
          <button
            onClick={handleCreateBoard}
            disabled={creating}
            className="mt-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 w-full text-left transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Add board
          </button>
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-400 truncate mb-2">{userName}</p>
          <button onClick={onSignOut} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-600">
          <p className="text-lg">Select a board from the sidebar</p>
          <p className="text-sm mt-1">or create a new one</p>
        </div>
      </main>
    </div>
  );
}
