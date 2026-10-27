import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import { CellRenderer } from '@/components/columns/cells';
import { ColumnHeader } from '@/components/columns/ColumnHeader';
import { ColumnPicker } from '@/components/columns/ColumnPicker';
import { useSelectionStore } from '@/store/selection';
import { useColWidthsStore } from '@/store/columnWidths';
import type { taskTable, subitemTable, columnTable } from '@/database/schema';

type Task = typeof taskTable.$inferSelect;
type Subitem = typeof subitemTable.$inferSelect;
type Column = typeof columnTable.$inferSelect;

interface SubitemTableProps {
  task: Task;
  subitems: Subitem[];
  columns: Column[];
  boardId: string;
  groupColor: string;
}

export function SubitemTable({ task, subitems, columns = [], boardId, groupColor }: SubitemTableProps) {
  const qc = useQueryClient();
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [showColPicker, setShowColPicker] = useState(false);
  const [colPickerRect, setColPickerRect] = useState<DOMRect | null>(null);
  const addColBtnRef = useRef<HTMLButtonElement>(null);
  const { selectedSubitemIds, selectAllSubitems } = useSelectionStore();
  const { widths: colWidths, setWidth: setColWidth } = useColWidthsStore();

  // ── Subitem name column resize ─────────────────────────────────────────────
  const SUBITEM_NAME_KEY = '__subitem_name__';
  const subitemNameWidth = colWidths[SUBITEM_NAME_KEY] ?? 200;
  const subitemNameResizingRef = useRef(false);
  const [subitemResizeHovered, setSubitemResizeHovered] = useState(false);
  function handleSubitemNameResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    subitemNameResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = subitemNameWidth;
    function onMouseMove(ev: MouseEvent) {
      setColWidth(SUBITEM_NAME_KEY, Math.max(100, startWidth + ev.clientX - startX));
    }
    function onMouseUp() {
      subitemNameResizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  const handleFocused = useCallback(() => setPendingFocusId(null), []);

  // Local copies for optimistic reorder
  const [localSubs, setLocalSubs] = useState(subitems);
  const [localCols, setLocalCols] = useState(columns);
  useEffect(() => setLocalSubs(subitems), [subitems]);
  useEffect(() => setLocalCols(columns), [columns]);

  function invalidate() {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  async function handleAddSubitem() {
    const sub = await orpcClient.task.createSubitem({ taskId: task.id });
    if (sub) setPendingFocusId(sub.id);
    invalidate();
  }

  // ── Subitem drag state ─────────────────────────────────────────────────────
  const [subDragIdx, setSubDragIdx] = useState<number | null>(null);
  const [subDragOver, setSubDragOver] = useState<number | null>(null);

  function onSubDragStart(e: React.DragEvent, i: number) {
    e.stopPropagation();
    setSubDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'subitem');
  }
  function onSubDragOver(e: React.DragEvent, i: number) {
    if (subDragIdx === null) return;
    e.preventDefault(); e.stopPropagation();
    setSubDragOver(i);
  }
  async function onSubDrop(e: React.DragEvent, toIdx: number) {
    e.stopPropagation();
    const fromIdx = subDragIdx;
    setSubDragIdx(null); setSubDragOver(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...localSubs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setLocalSubs(next);
    await orpcClient.task.reorderSubitems({ subitemIds: next.map(s => s.id) });
    invalidate();
  }
  function onSubDragEnd() { setSubDragIdx(null); setSubDragOver(null); }

  // ── Column drag state ──────────────────────────────────────────────────────
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const [colDragOver, setColDragOver] = useState<number | null>(null);

  function onColDragStart(e: React.DragEvent, i: number) {
    e.stopPropagation();
    setColDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'column');
  }
  function onColDragOver(e: React.DragEvent, i: number) {
    if (colDragIdx === null) return;
    e.preventDefault(); e.stopPropagation();
    setColDragOver(i);
  }
  async function onColDrop(e: React.DragEvent, toIdx: number) {
    e.stopPropagation();
    const fromIdx = colDragIdx;
    setColDragIdx(null); setColDragOver(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...localCols];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setLocalCols(next);
    await orpcClient.column.reorderColumns({ columnIds: next.map(c => c.id) });
    invalidate();
  }
  function onColDragEnd() { setColDragIdx(null); setColDragOver(null); }

  const subIds = localSubs.map(s => s.id);
  const allSubsSelected = subIds.length > 0 && subIds.every(id => selectedSubitemIds.has(id));
  const someSubsSelected = subIds.some(id => selectedSubitemIds.has(id));

  return (
    <div
      className="pl-10"
      style={{ borderLeft: `3px solid ${groupColor}73` }}
    >
      <div className="bg-app-s2/25 border-l border-app-ln/50">
      <table className="border-collapse table-fixed w-full">
        <thead>
          <tr className="border-b border-app-ln/70 bg-app-s2/70">
            <th className="px-3 py-1.5" style={{ width: 40 }}>
              <button
                onClick={() => selectAllSubitems(subIds, boardId)}
                className={`w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${
                  allSubsSelected ? 'bg-app-ac border-app-ac' :
                  someSubsSelected ? 'border-app-ac bg-transparent' :
                  'border-app-ln hover:border-app-t3'
                }`}
                aria-label="Select all subitems"
              >
                {allSubsSelected && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {someSubsSelected && !allSubsSelected && <span className="w-1.5 h-0.5 bg-violet-400 rounded" />}
              </button>
            </th>
            <th
              className="relative px-3 py-1.5 text-left text-xs text-app-t3 font-medium pl-10 border-r border-app-ln select-none"
              style={{ width: subitemNameWidth }}
            >
              Subitem
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors z-10"
                style={{ backgroundColor: subitemResizeHovered ? `${groupColor}66` : undefined }}
                onMouseEnter={() => setSubitemResizeHovered(true)}
                onMouseLeave={() => setSubitemResizeHovered(false)}
                onMouseDown={handleSubitemNameResizeStart}
                onDragStart={e => e.preventDefault()}
              />
            </th>
            {localCols.map((col, colIdx) => (
              <ColumnHeader
                key={col.id}
                col={col}
                boardId={boardId}
                groupColor={groupColor}
                isDragging={colDragIdx === colIdx}
                isDragTarget={colDragOver === colIdx && colDragIdx !== colIdx}
                onDragStart={e => onColDragStart(e, colIdx)}
                onDragOver={e => onColDragOver(e, colIdx)}
                onDragLeave={() => setColDragOver(null)}
                onDrop={e => onColDrop(e, colIdx)}
                onDragEnd={onColDragEnd}
              />
            ))}
            <th className="px-2 py-1.5 relative border-l border-app-ln">
              <button
                ref={addColBtnRef}
                onClick={() => {
                  setColPickerRect(addColBtnRef.current?.getBoundingClientRect() ?? null);
                  setShowColPicker(s => !s);
                }}
                className="text-app-t3/40 hover:text-app-t2 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-app-s3 transition-colors"
                title="Add subitem column"
              >
                +
              </button>
              {showColPicker && (
                <SubitemColumnPicker
                  boardId={boardId}
                  onClose={() => setShowColPicker(false)}
                  anchorRect={colPickerRect}
                />
              )}
            </th>
            <th className="px-2 py-1.5" style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {localSubs.map((sub, subIdx) => (
            <SubitemRow
              key={sub.id}
              subitem={sub}
              columns={localCols}
              boardId={boardId}
              autoFocus={sub.id === pendingFocusId}
              onFocused={handleFocused}
              isDragging={subDragIdx === subIdx}
              isDragTarget={subDragOver === subIdx && subDragIdx !== subIdx}
              onDragStart={e => onSubDragStart(e, subIdx)}
              onDragOver={e => onSubDragOver(e, subIdx)}
              onDragLeave={() => setSubDragOver(null)}
              onDrop={e => onSubDrop(e, subIdx)}
              onDragEnd={onSubDragEnd}
            />
          ))}
        </tbody>
      </table>
      <button
        onClick={handleAddSubitem}
        className="w-full text-left px-[58px] py-1.5 text-xs text-app-t3/50 hover:text-app-t2 hover:bg-app-s2/30 transition-colors"
      >
        + Add subitem
      </button>
      </div>
    </div>
  );
}

// ── SubitemRow ────────────────────────────────────────────────────────────────

interface SubitemRowProps {
  subitem: Subitem;
  columns: Column[];
  boardId: string;
  autoFocus?: boolean;
  onFocused?: () => void;
  isDragging?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

function SubitemRow({ subitem, columns, boardId, autoFocus, onFocused,
  isDragging, isDragTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: SubitemRowProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toggleSubitem, isSubitemSelected } = useSelectionStore();
  const selected = isSubitemSelected(subitem.id);

  function invalidate() {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      onFocused?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  function handleNameChange(name: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await orpcClient.task.updateSubitem({ subitemId: subitem.id, name });
      invalidate();
    }, 500);
  }

  async function handleFieldChange(colId: string, value: string) {
    const newFields = { ...subitem.fields, [colId]: value };
    await orpcClient.task.updateSubitem({ subitemId: subitem.id, fields: newFields });
    invalidate();
  }

  async function handleDelete() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await orpcClient.task.deleteSubitem({ subitemId: subitem.id });
    invalidate();
  }

  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group/subrow border-b border-app-ln/30 transition-colors ${
        isDragging ? 'opacity-40' :
        isDragTarget ? 'bg-app-ac/10' :
        selected ? 'bg-app-ac/10' :
        'hover:bg-app-s2/20'
      }`}
    >
      {/* Grip handle + selection checkbox */}
      <td className="px-3 py-1.5 w-10 relative">
        <span className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/subrow:opacity-40 cursor-grab active:cursor-grabbing text-app-t3 select-none pointer-events-none flex items-center">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/></svg>
        </span>
        <button
          onClick={() => toggleSubitem(subitem.id, boardId)}
          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
            selected
              ? 'bg-app-ac border-app-ac opacity-100'
              : 'border-app-ln opacity-0 group-hover/subrow:opacity-100'
          }`}
          aria-label={selected ? 'Deselect subitem' : 'Select subitem'}
        >
          {selected && (
            <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </td>

      {/* Subitem name (indented) */}
      <td className="px-3 py-1.5 pl-10 overflow-hidden">
        <input
          ref={inputRef}
          defaultValue={subitem.name}
          onChange={e => handleNameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Backspace' && e.currentTarget.value === '') {
              e.preventDefault();
              handleDelete();
            }
          }}
          className="bg-transparent text-xs w-full outline-none placeholder-app-t3/40 text-app-t2"
          placeholder="Subitem name"
        />
      </td>

      {/* Custom column cells */}
      {columns.map((col, colIdx) => (
        <td key={col.id} className={`border-l p-0 ${colIdx === 0 ? 'border-app-ln' : 'border-app-ln/30'}`}>
          <CellRenderer
            col={col}
            value={subitem.fields?.[col.id] ?? ''}
            onChange={value => handleFieldChange(col.id, value)}
            allColumns={columns}
            rowFields={(subitem.fields as Record<string, string>) ?? {}}
          />
        </td>
      ))}

      {/* Add col spacer */}
      <td className="px-2 py-1.5 border-l border-app-ln" />

      {/* Delete */}
      <td className="px-2 py-1.5 w-8">
        <button
          onClick={handleDelete}
          className="text-app-t3/30 hover:text-app-dg transition-colors opacity-0 group-hover/subrow:opacity-100 flex items-center justify-center"
          aria-label="Delete subitem"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
        </button>
      </td>
    </tr>
  );
}

// ── SubitemColumnPicker ───────────────────────────────────────────────────────
// Wraps ColumnPicker but forces scope='subitem'

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
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
];

const DEFAULT_STATUS_OPTIONS = [
  { key: 'todo',        label: 'To Do',      colorKey: 'gray'  },
  { key: 'inprogress',  label: 'In Progress', colorKey: 'blue'  },
  { key: 'done',        label: 'Done',        colorKey: 'green' },
];

function SubitemColumnPicker({
  boardId,
  onClose,
  anchorRect,
}: {
  boardId: string;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  async function handleCreate(type: ColumnType) {
    if (creating) return;
    setCreating(true);
    try {
      const entry = COLUMN_TYPES.find(t => t.type === type)!;
      await orpcClient.column.createColumn({
        boardId,
        scope: 'subitem',
        type,
        label: `Sub ${entry.label}`,
        ...(type === 'status' ? { statusOptions: DEFAULT_STATUS_OPTIONS } : {}),
        ...(type === 'dropdown' ? { options: [] } : {}),
      });
      qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
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
        className="fixed z-[101] bg-app-s2 border border-app-ln rounded-xl shadow-xl p-3 w-56"
        style={style}
      >
        <p className="text-xs font-semibold text-app-t3 uppercase tracking-wider mb-2">Add subitem column</p>
        <div className="space-y-0.5">
          {COLUMN_TYPES.map(({ type, label, icon, desc }) => (
            <button
              key={type}
              onClick={() => handleCreate(type)}
              disabled={creating}
              className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-app-s3 transition-colors disabled:opacity-50"
            >
              <span className="w-5 flex-shrink-0 flex items-center justify-center text-app-t3">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm text-app-t1 font-medium leading-tight">{label}</p>
                <p className="text-xs text-app-t3 leading-tight">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
