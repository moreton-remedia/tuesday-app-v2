import { createPortal } from 'react-dom';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import { WorkspaceSettings } from './WorkspaceSettings';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240; // w-60

function useSidebarWidth() {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    return Number(localStorage.getItem('sidebar-width') || SIDEBAR_DEFAULT);
  });

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    function onMove(ev: MouseEvent) {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX));
      setWidth(next);
    }

    function onUp(ev: MouseEvent) {
      const final = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX));
      localStorage.setItem('sidebar-width', String(final));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return { width, startResize };
}

type Board = { id: string; name: string; position: number };
type WorkspaceEntry = { workspace: { id: string; name: string }; role: string };

interface SidebarProps {
  boards: Board[];
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string;
  inviteToken: string;
  workspaceName: string;
  userName: string;
  onSignOut: () => void;
}

export function Sidebar({ boards, workspaces, activeWorkspaceId, inviteToken, workspaceName, userName, onSignOut }: SidebarProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { width, startResize } = useSidebarWidth();

  async function handleCreateBoard() {
    if (creating) return;
    setCreating(true);
    try {
      const board = await orpcClient.board.createBoard({ name: 'New Board' });
      await qc.invalidateQueries(orpcUtils.board.listBoards.queryOptions({ input: {} }));
      navigate({ to: '/app/board/$boardId', params: { boardId: board.id } });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <aside
        className="relative bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 h-full"
        style={{ width }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-violet-500/40 transition-colors"
          title="Drag to resize"
        />
        <div className="px-4 py-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Tuesday</h1>
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
            <button
              onClick={() => setShowSettings(true)}
              title="Workspace settings"
              className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors p-0.5 rounded ml-auto"
              aria-label="Workspace settings"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {/* Calendar link */}
          <Link
            to="/app/calendar"
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 [&.active]:text-white [&.active]:bg-gray-800 transition-colors w-full mb-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </Link>

          <p className="text-xs text-gray-500 font-semibold px-2 py-1.5 uppercase tracking-wider">Boards</p>
          <BoardList boards={boards} />
          <button
            onClick={handleCreateBoard}
            disabled={creating}
            className="mt-1 flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 w-full text-left transition-colors disabled:opacity-50"
          >
            <span className="text-lg leading-none">+</span>
            Add board
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-400 truncate mb-2">{userName}</p>
          <button onClick={onSignOut} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {showSettings && (
        <WorkspaceSettings
          workspaceName={workspaceName}
          inviteToken={inviteToken}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

// ── Board list with drag-to-reorder, inline rename, and ⋯ context menu ────────

function BoardList({ boards: propBoards }: { boards: Board[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();

  // Local copy for optimistic reorder + rename
  const [boards, setBoards] = useState(propBoards);
  useEffect(() => setBoards(propBoards), [propBoards]);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingId) editInputRef.current?.select(); }, [editingId]);

  // ⋯ menu
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Prevent the drag ghost from showing the whole link blue
    e.dataTransfer.setData('text/plain', boards[index]!.id);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDragLeave() {
    setDragOverIndex(null);
  }

  async function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === toIndex) return;

    const reordered = [...boards];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    setBoards(reordered);

    await orpcClient.board.reorderBoards({ boardIds: reordered.map(b => b.id) });
    await qc.invalidateQueries(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  async function commitRename(boardId: string, newName: string) {
    const trimmed = newName.trim();
    setEditingId(null);
    if (!trimmed) return;
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name: trimmed } : b));
    await orpcClient.board.updateBoard({ boardId, name: trimmed });
    await qc.invalidateQueries(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      setBoards(prev => prev.filter(b => b.id !== deleteId));
      await orpcClient.board.deleteBoard({ boardId: deleteId });
      await qc.invalidateQueries(orpcUtils.board.listBoards.queryOptions({ input: {} }));
      // Navigate away if we were viewing the deleted board
      if (router.state.location.pathname.includes(deleteId)) {
        navigate({ to: '/app' });
      }
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  // ── ⋯ menu ──────────────────────────────────────────────────────────────────

  function openMenu(boardId: string) {
    const btn = menuBtnRefs.current.get(boardId);
    if (btn) {
      const r = btn.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.right - 120 });
    }
    setMenuId(boardId);
  }

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuId) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuId(null); }
    function onDown(e: MouseEvent) {
      const btn = menuId ? menuBtnRefs.current.get(menuId) : null;
      if (btn && btn.contains(e.target as Node)) return;
      setMenuId(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [menuId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {boards.map((board, index) => (
        <div
          key={board.id}
          draggable
          onDragStart={e => handleDragStart(e, index)}
          onDragOver={e => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={[
            'group relative flex items-center rounded-lg transition-colors',
            dragIndex === index ? 'opacity-40' : '',
            dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-violet-500' : '',
          ].join(' ')}
        >
          {/* Drag handle */}
          <span className="absolute left-1 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-gray-400 select-none text-xs leading-none">
            ⠿
          </span>

          {editingId === board.id ? (
            // ── Inline rename input ──────────────────────────────────────────
            <input
              ref={editInputRef}
              defaultValue={board.name}
              onBlur={e => commitRename(board.id, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setEditingId(null); }
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 ml-5 mr-1 px-2 py-1 bg-gray-800 border border-violet-500 rounded text-sm text-white outline-none"
            />
          ) : (
            // ── Normal board link ────────────────────────────────────────────
            <Link
              to="/app/board/$boardId"
              params={{ boardId: board.id }}
              className="flex-1 flex items-center gap-2 pl-5 pr-1 py-2 text-sm text-gray-300 hover:text-white [&.active]:text-white rounded-lg hover:bg-gray-800 [&.active]:bg-gray-800 transition-colors min-w-0"
              draggable={false}
            >
              <span className="w-2 h-2 rounded-sm bg-violet-500 flex-shrink-0" />
              <span className="truncate">{board.name}</span>
            </Link>
          )}

          {/* ⋯ menu button */}
          {editingId !== board.id && (
            <button
              ref={el => { if (el) menuBtnRefs.current.set(board.id, el); else menuBtnRefs.current.delete(board.id); }}
              onClick={e => { e.stopPropagation(); openMenu(board.id); }}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-all mr-0.5"
              title="Board options"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* ⋯ dropdown menu — portal */}
      {menuId && createPortal(
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 w-32"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => { setEditingId(menuId); setMenuId(null); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => { setDeleteId(menuId); setMenuId(null); }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors"
          >
            Delete
          </button>
        </div>,
        document.body,
      )}

      {/* Delete confirmation modal — portal */}
      {deleteId && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}
        >
          <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 mx-4">
            <h3 className="text-base font-semibold text-white mb-2">Delete board?</h3>
            <p className="text-sm text-gray-400 mb-6">
              <span className="text-white font-medium">"{boards.find(b => b.id === deleteId)?.name}"</span> and all its
              tasks will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
