import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import type { ColumnType } from '@/database/schema';

const COLUMN_TYPES: { type: ColumnType; label: string; icon: ReactNode; desc: string }[] = [
  {
    type: 'notes', label: 'Notes', desc: 'Free-form text notes',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  },
  {
    type: 'dropdown', label: 'Dropdown', desc: 'Pick from a list',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  },
  {
    type: 'date', label: 'Date', desc: 'Date field',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  },
  {
    type: 'status', label: 'Status', desc: 'Colored status pill',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>,
  },
  {
    type: 'link', label: 'Link', desc: 'Link to another item',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  },
  {
    type: 'formula', label: 'Formula', desc: 'Calculate from other columns',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7H6l6 5-6 5h12"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
  },
  {
    type: 'location', label: 'Location', desc: 'Address with map lookup',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  },
];

const DEFAULT_STATUS_OPTIONS = [
  { key: 'todo',        label: 'To Do',      colorKey: 'gray'   },
  { key: 'inprogress',  label: 'In Progress', colorKey: 'blue'   },
  { key: 'done',        label: 'Done',        colorKey: 'green'  },
];

interface ColumnPickerProps {
  boardId: string;
  onCreated: () => void;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

export function ColumnPicker({ boardId, onCreated, onClose, anchorRect }: ColumnPickerProps) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  async function handleCreate(type: ColumnType) {
    if (creating) return;
    setCreating(true);
    try {
      const entry = COLUMN_TYPES.find(t => t.type === type)!;
      await orpcClient.column.createColumn({
        boardId,
        scope: 'task',
        type,
        label: entry.label,
        ...(type === 'status' ? { statusOptions: DEFAULT_STATUS_OPTIONS } : {}),
        ...(type === 'dropdown' ? { options: [] } : {}),
      });
      qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
      onCreated();
      onClose();
    } finally {
      setCreating(false);
    }
  }

  const style = anchorRect
    ? { top: anchorRect.bottom + 4, right: window.innerWidth - anchorRect.right }
    : { top: 0, right: 0 };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onMouseDown={onClose} />
      <div
        className="fixed z-[101] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3 w-56"
        style={style}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Add column</p>
        <div className="space-y-0.5">
          {COLUMN_TYPES.map(({ type, label, icon, desc }) => (
            <button
              key={type}
              onClick={() => handleCreate(type)}
              disabled={creating}
              className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <span className="w-5 flex-shrink-0 flex items-center justify-center text-gray-400">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm text-white font-medium leading-tight">{label}</p>
                <p className="text-xs text-gray-500 leading-tight">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
