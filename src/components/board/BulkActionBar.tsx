import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import { useSelectionStore } from '@/store/selection';
import type { groupTable, boardTable } from '@/database/schema';

type Group = typeof groupTable.$inferSelect;
type Board = typeof boardTable.$inferSelect;

interface BulkActionBarProps {
  boardId: string;
  groups: Group[];
  boards: Board[];
}

export function BulkActionBar({ boardId, groups, boards }: BulkActionBarProps) {
  const qc = useQueryClient();
  const { selectedTaskIds, selectedSubitemIds, clearSelection } = useSelectionStore();
  const [showMoveModal, setShowMoveModal] = useState(false);
  const taskCount = selectedTaskIds.size;
  const subitemCount = selectedSubitemIds.size;
  const total = taskCount + subitemCount;

  if (total === 0) return null;

  function invalidate(targetBoardId?: string) {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
    if (targetBoardId && targetBoardId !== boardId) {
      qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId: targetBoardId } }));
    }
  }

  function buildLabel() {
    const parts: string[] = [];
    if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''}`);
    if (subitemCount > 0) parts.push(`${subitemCount} subitem${subitemCount !== 1 ? 's' : ''}`);
    return parts.join(', ') + ' selected';
  }

  async function handleDelete() {
    if (!confirm(`Delete ${buildLabel()}?`)) return;
    await Promise.all([
      taskCount > 0 ? orpcClient.task.deleteTasks({ taskIds: [...selectedTaskIds] }) : Promise.resolve(),
      subitemCount > 0 ? orpcClient.task.deleteSubitems({ subitemIds: [...selectedSubitemIds] }) : Promise.resolve(),
    ]);
    invalidate();
    clearSelection();
  }

  async function handleMove(targetGroupId: string, targetBoardId: string) {
    await Promise.all([...selectedTaskIds].map(taskId =>
      orpcClient.task.updateTask({ taskId, groupId: targetGroupId }),
    ));
    invalidate(targetBoardId);
    clearSelection();
    setShowMoveModal(false);
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-app-s2 border border-app-ln rounded-xl shadow-2xl px-5 py-3">
        <span className="text-sm font-medium text-app-t1">{buildLabel()}</span>
        <div className="w-px h-4 bg-app-ln" />
        {taskCount > 0 && (
          <>
            <button
              onClick={() => setShowMoveModal(true)}
              className="text-sm text-app-t2 hover:text-app-t1 transition-colors"
            >
              Move to…
            </button>
            <div className="w-px h-4 bg-app-ln" />
          </>
        )}
        <button onClick={handleDelete} className="text-sm text-app-dg hover:text-app-dg/80 transition-colors">
          Delete
        </button>
        <div className="w-px h-4 bg-app-ln" />
        <button onClick={clearSelection} className="text-sm text-app-t3 hover:text-app-t1 transition-colors flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          Clear
        </button>
      </div>

      {showMoveModal && createPortal(
        <MoveModal
          currentBoardId={boardId}
          currentGroups={groups}
          boards={boards}
          onMove={handleMove}
          onClose={() => setShowMoveModal(false)}
        />,
        document.body,
      )}
    </>
  );
}

// ── Move modal ────────────────────────────────────────────────────────────────

function MoveModal({ currentBoardId, currentGroups, boards, onMove, onClose }: {
  currentBoardId: string;
  currentGroups: Group[];
  boards: Board[];
  onMove: (groupId: string, boardId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [moving, setMoving] = useState(false);

  const isCurrent = selectedBoardId === currentBoardId;

  // Lazily fetch groups for a different board
  const { data: remoteBoardData, isFetching } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: selectedBoardId } }),
    enabled: !isCurrent,
  });

  const availableGroups: Group[] = isCurrent ? currentGroups : (remoteBoardData?.groups ?? []);

  async function handleConfirm() {
    if (!selectedGroupId) return;
    setMoving(true);
    try { await onMove(selectedGroupId, selectedBoardId); }
    finally { setMoving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onMouseDown={onClose} />
      <div
        className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-app-s1 border border-app-ln rounded-xl shadow-2xl p-5"
        onMouseDown={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-app-t1 mb-4">Move to group</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-app-t3 mb-1">Board</label>
            <select
              value={selectedBoardId}
              onChange={e => { setSelectedBoardId(e.target.value); setSelectedGroupId(''); }}
              className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-sm text-app-t1 outline-none focus:border-app-ac"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.id === currentBoardId ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-app-t3 mb-1">Group</label>
            <select
              value={selectedGroupId}
              onChange={e => setSelectedGroupId(e.target.value)}
              disabled={isFetching || (!isCurrent && !remoteBoardData)}
              className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-sm text-app-t1 outline-none focus:border-app-ac disabled:opacity-50"
            >
              <option value="">{isFetching ? 'Loading…' : 'Select group…'}</option>
              {availableGroups.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={!selectedGroupId || moving}
            className="flex-1 bg-app-ac hover:bg-app-ac/90 disabled:opacity-50 text-app-ac-tx text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {moving ? 'Moving…' : 'Move'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-app-s2 hover:bg-app-s3 text-app-t2 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
