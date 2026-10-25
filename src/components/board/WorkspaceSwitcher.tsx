import { createPortal } from 'react-dom';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { orpcClient } from '@/rpc/react';

type WorkspaceEntry = { workspace: { id: string; name: string }; role: string };

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string;
}

export function WorkspaceSwitcher({ workspaces, activeWorkspaceId }: WorkspaceSwitcherProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const active = workspaces.find(w => w.workspace.id === activeWorkspaceId) ?? workspaces[0];

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
    }
  }, [open]);

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) { setOpen(false); return; }
    await orpcClient.workspace.setActiveWorkspace({ workspaceId });
    setOpen(false);
    navigate({ to: '/app' });
    await qc.invalidateQueries();
  }

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onDown(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors truncate max-w-full"
        aria-label="Switch workspace"
      >
        <span className="truncate">{active?.workspace.name ?? ''}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="flex-shrink-0 opacity-60">
          <path d="M5 7 L1 3 L9 3 Z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 overflow-hidden"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
          onMouseDown={e => e.stopPropagation()}
        >
          {workspaces.map(({ workspace }) => (
            <button
              key={workspace.id}
              onClick={() => handleSwitch(workspace.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-800 transition-colors"
            >
              <span className={`w-4 flex-shrink-0 text-violet-400 ${workspace.id === activeWorkspaceId ? '' : 'invisible'}`}>✓</span>
              <span className={`truncate ${workspace.id === activeWorkspaceId ? 'text-white font-medium' : 'text-gray-300'}`}>
                {workspace.name}
              </span>
            </button>
          ))}

          <div className="border-t border-gray-800 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); setShowModal(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-left"
            >
              <span className="w-4 text-center flex-shrink-0">+</span>
              New workspace
            </button>
          </div>
        </div>,
        document.body,
      )}

      {showModal && (
        <NewWorkspaceModal
          onClose={() => setShowModal(false)}
          onDone={async () => { setShowModal(false); navigate({ to: '/app' }); await qc.invalidateQueries(); }}
        />
      )}
    </>
  );
}

// ── New Workspace modal (create or join) ──────────────────────────────────────

function NewWorkspaceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Clear the input when switching tabs
  function handleModeChange(next: 'create' | 'join') {
    setMode(next);
    setValue('');
    setError('');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (mode === 'create') {
        await orpcClient.workspace.createWorkspace({ name: value });
      } else {
        const token = value.trim().split('/join/').pop()?.trim() ?? '';
        if (!token) { setError('Please paste a valid invite link.'); setLoading(false); return; }
        await orpcClient.workspace.joinWorkspaceByToken({ token });
      }
      onDone();
    } catch (err: any) {
      setError(err?.message ?? (mode === 'create' ? 'Failed to create workspace.' : 'Invite link is invalid or has expired.'));
    } finally { setLoading(false); }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">New workspace</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => handleModeChange('create')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'create' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('join')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'join' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            Join
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {mode === 'create' ? 'Workspace name' : 'Invite link'}
            </label>
            <input
              key={mode}
              autoFocus
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              required
              placeholder={mode === 'create' ? 'e.g. Acme Corp' : 'Paste invite link here'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
            {mode === 'join' && (
              <p className="text-xs text-gray-600 mt-1">Ask your workspace owner to share their invite link from Settings.</p>
            )}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading
                ? (mode === 'create' ? 'Creating…' : 'Joining…')
                : (mode === 'create' ? 'Create' : 'Join')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
