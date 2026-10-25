import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import { PALETTE, getColor, slugify } from './colors';
import { useColWidthsStore } from '@/store/columnWidths';
import type { columnTable } from '@/database/schema';

type Column = typeof columnTable.$inferSelect;
type DropdownOption = { label: string; colorKey?: string };
type StatusOption = { key: string; label: string; colorKey: string };

/** Measures the rendered pixel width of an input's current text using a canvas. */
function getTextWidth(input: HTMLInputElement): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = window.getComputedStyle(input).font;
  return Math.ceil(ctx.measureText(input.value).width);
}

interface ColumnHeaderProps {
  col: Column;
  boardId: string;
  groupColor?: string;
  isDragging?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function ColumnHeader({ col, boardId, groupColor, isDragging, isDragTarget,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: ColumnHeaderProps) {
  const qc = useQueryClient();
  const accentColor = groupColor ?? '#4263eb';
  const [showConfig, setShowConfig] = useState(false);
  const [configRect, setConfigRect] = useState<DOMRect | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHovered, setResizeHovered] = useState(false);
  const configBtnRef = useRef<HTMLButtonElement>(null);
  const actionButtonsRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const isResizingRef = useRef(false);
  const { widths, setWidth } = useColWidthsStore();
  const colWidth = widths[col.id] ?? 140;

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = colWidth;
    // Hard stop: stop just before buttons would reach the title.
    // inputLeft = where the label input starts inside the <th> (accounts for drag icon + padding).
    // titleWidth = actual rendered text width measured via canvas.
    // 8px gap between title end and buttons left edge; 8px = right-2 offset of buttons from th right.
    const inputLeft = labelInputRef.current?.offsetLeft ?? 26;
    const titleWidth = labelInputRef.current ? getTextWidth(labelInputRef.current) : 0;
    const buttonsW = actionButtonsRef.current?.offsetWidth ?? 0;
    const minWidth = Math.max(80, inputLeft + titleWidth + 8 + 8 + buttonsW);
    function onMouseMove(ev: MouseEvent) {
      setWidth(col.id, Math.max(minWidth, startWidth + ev.clientX - startX));
    }
    function onMouseUp() {
      isResizingRef.current = false;
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function invalidate() {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  async function handleDelete() {
    if (!confirm(`Delete column "${col.label}"?`)) return;
    await orpcClient.column.deleteColumn({ columnId: col.id });
    invalidate();
  }

  async function handleLabelSave(label: string) {
    if (!label.trim() || label === col.label) return;
    await orpcClient.column.updateColumn({ columnId: col.id, label: label.trim() });
    invalidate();
  }

  const hasConfig = col.type === 'dropdown' || col.type === 'status' || col.type === 'link' || col.type === 'formula';

  return (
    <th
      draggable
      onDragStart={e => {
        if (isResizingRef.current) { e.preventDefault(); return; }
        onDragStart?.(e);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{ width: colWidth, minWidth: colWidth }}
      className={`group/col relative px-2 py-2 text-left transition-colors select-none border-r border-gray-700/60 ${isDragging ? 'opacity-40' : isDragTarget ? 'bg-violet-900/20' : ''}`}
    >
      {/* Label row — no action buttons in flow, so input gets full width */}
      <div className="flex items-center gap-0.5 overflow-hidden">
        <span className="opacity-0 group-hover/col:opacity-30 cursor-grab active:cursor-grabbing text-gray-400 select-none leading-none text-xs mr-0.5 flex-shrink-0">⠿</span>
        <ColLabelInput value={col.label} onSave={handleLabelSave} inputRef={labelInputRef} />
      </div>

      {/* Action buttons — absolute so they don't consume label width; stay visible while resizing */}
      <div ref={actionButtonsRef} className={`absolute right-2 top-0 h-full flex items-center gap-0.5 transition-opacity ${isResizing ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-100'}`}>
        {hasConfig && (
          <button
            ref={configBtnRef}
            onClick={() => {
              setConfigRect(configBtnRef.current?.getBoundingClientRect() ?? null);
              setShowConfig(s => !s);
            }}
            className="w-4 h-4 text-gray-500 hover:text-gray-300 flex items-center justify-center"
            title="Configure column"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          onClick={handleDelete}
          className="w-4 h-4 text-gray-600 hover:text-red-400 text-sm leading-none flex items-center justify-center"
          title="Delete column"
        >
          ×
        </button>
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors z-10"
        style={{ backgroundColor: (resizeHovered || isResizing) ? `${accentColor}66` : undefined }}
        onMouseEnter={() => setResizeHovered(true)}
        onMouseLeave={() => setResizeHovered(false)}
        onMouseDown={handleResizeStart}
        onDragStart={e => e.preventDefault()}
      />

      {showConfig && configRect && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onMouseDown={() => setShowConfig(false)} />
          <div
            className="fixed z-[101] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3 w-72"
            style={{ top: configRect.bottom + 4, left: configRect.left }}
          >
            {col.type === 'dropdown' && (
              <DropdownOptionEditor col={col} boardId={boardId} onClose={() => setShowConfig(false)} />
            )}
            {col.type === 'status' && (
              <StatusOptionEditor col={col} boardId={boardId} onClose={() => setShowConfig(false)} />
            )}
            {col.type === 'link' && (
              <LinkConfigPanel col={col} boardId={boardId} onClose={() => setShowConfig(false)} />
            )}
            {col.type === 'formula' && (
              <FormulaConfigPanel col={col} boardId={boardId} onClose={() => setShowConfig(false)} />
            )}
          </div>
        </>,
        document.body,
      )}
    </th>
  );
}

// ── Label input ───────────────────────────────────────────────────────────────

function ColLabelInput({ value, onSave, inputRef }: {
  value: string;
  onSave: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ref.current && ref.current !== document.activeElement) {
      ref.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={el => {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }}
      defaultValue={value}
      onChange={e => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSave(e.target.value), 500);
      }}
      onBlur={e => {
        if (timerRef.current) clearTimeout(timerRef.current);
        onSave(e.target.value);
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="text-sm text-gray-400 font-medium bg-transparent outline-none min-w-0 flex-1 w-full"
    />
  );
}

// ── Color picker row ──────────────────────────────────────────────────────────

function ColorPicker({ selected, onChange }: { selected?: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {PALETTE.map(({ key, hex }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`w-4 h-4 rounded-full transition-transform ${selected === key ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800 scale-110' : 'hover:scale-110'}`}
          style={{ backgroundColor: hex }}
          title={key}
        />
      ))}
    </div>
  );
}

// ── Dropdown option editor ────────────────────────────────────────────────────

function DropdownOptionEditor({
  col,
  boardId,
  onClose,
}: {
  col: Column;
  boardId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [options, setOptions] = useState<DropdownOption[]>(col.options ?? []);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fromHandle = useRef(false);

  async function handleSave(newOptions: DropdownOption[]) {
    await orpcClient.column.updateColumn({ columnId: col.id, options: newOptions });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  function updateOption(i: number, patch: Partial<DropdownOption>) {
    const next = options.map((o, idx) => (idx === i ? { ...o, ...patch } : o));
    setOptions(next);
    handleSave(next);
  }

  function addOption() {
    const next = [...options, { label: 'Option', colorKey: 'blue' }];
    setOptions(next);
    handleSave(next);
  }

  function removeOption(i: number) {
    const next = options.filter((_, idx) => idx !== i);
    setOptions(next);
    handleSave(next);
  }

  function handleDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex) return;
    const reordered = [...options];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    setOptions(reordered);
    handleSave(reordered);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dropdown options</p>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {options.map((opt, i) => (
          <div
            key={`${i}-${opt.label}-${opt.colorKey}`}
            draggable
            onDragStart={e => {
              if (!fromHandle.current) { e.preventDefault(); return; }
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={e => { e.preventDefault(); setDragOverIndex(i); }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={e => { e.preventDefault(); handleDrop(i); setDragOverIndex(null); }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); fromHandle.current = false; }}
            className={[
              'flex items-start gap-2 bg-gray-900 rounded-lg p-2 transition-opacity',
              dragIndex === i ? 'opacity-40' : '',
              dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-violet-500 ring-inset' : '',
            ].join(' ')}
          >
            {/* Drag handle */}
            <div
              onMouseDown={() => { fromHandle.current = true; }}
              onMouseUp={() => { fromHandle.current = false; }}
              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 select-none pt-0.5 flex-shrink-0 text-xs"
              title="Drag to reorder"
            >
              ⠿
            </div>
            <div className="flex-1 min-w-0">
              <input
                defaultValue={opt.label}
                onBlur={e => updateOption(i, { label: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="text-xs text-white bg-transparent outline-none w-full border-b border-gray-700 pb-0.5 focus:border-gray-500"
                placeholder="Option label"
              />
              <ColorPicker
                selected={opt.colorKey}
                onChange={colorKey => updateOption(i, { colorKey })}
              />
            </div>
            <button
              onClick={() => removeOption(i)}
              className="text-gray-600 hover:text-red-400 text-sm leading-none flex-shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addOption}
        className="mt-2 w-full text-xs text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg py-1.5 transition-colors"
      >
        + Add option
      </button>
    </div>
  );
}

// ── Status option editor ──────────────────────────────────────────────────────

function StatusOptionEditor({
  col,
  boardId,
  onClose,
}: {
  col: Column;
  boardId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [options, setOptions] = useState<StatusOption[]>(col.statusOptions ?? []);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fromHandle = useRef(false);

  async function handleSave(newOptions: StatusOption[]) {
    await orpcClient.column.updateColumn({ columnId: col.id, statusOptions: newOptions });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  function updateOption(i: number, patch: Partial<StatusOption>) {
    const next = options.map((o, idx) => {
      if (idx !== i) return o;
      const updated = { ...o, ...patch };
      if (patch.label !== undefined) updated.key = slugify(patch.label) || `status-${i}`;
      return updated;
    });
    setOptions(next);
    handleSave(next);
  }

  function addOption() {
    const next = [...options, { key: `status-${Date.now()}`, label: 'Status', colorKey: 'blue' }];
    setOptions(next);
    handleSave(next);
  }

  function removeOption(i: number) {
    const next = options.filter((_, idx) => idx !== i);
    setOptions(next);
    handleSave(next);
  }

  function handleDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex) return;
    const reordered = [...options];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    setOptions(reordered);
    handleSave(reordered);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status options</p>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {options.map((opt, i) => (
          <div
            key={`${i}-${opt.key}`}
            draggable
            onDragStart={e => {
              if (!fromHandle.current) { e.preventDefault(); return; }
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={e => { e.preventDefault(); setDragOverIndex(i); }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={e => { e.preventDefault(); handleDrop(i); setDragOverIndex(null); }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); fromHandle.current = false; }}
            className={[
              'flex items-start gap-2 bg-gray-900 rounded-lg p-2 transition-opacity',
              dragIndex === i ? 'opacity-40' : '',
              dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-violet-500 ring-inset' : '',
            ].join(' ')}
          >
            {/* Drag handle */}
            <div
              onMouseDown={() => { fromHandle.current = true; }}
              onMouseUp={() => { fromHandle.current = false; }}
              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 select-none pt-0.5 flex-shrink-0 text-xs"
              title="Drag to reorder"
            >
              ⠿
            </div>
            <div className="flex-1 min-w-0">
              <input
                defaultValue={opt.label}
                onBlur={e => updateOption(i, { label: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="text-xs text-white bg-transparent outline-none w-full border-b border-gray-700 pb-0.5 focus:border-gray-500"
                placeholder="Status label"
              />
              <ColorPicker
                selected={opt.colorKey}
                onChange={colorKey => updateOption(i, { colorKey })}
              />
            </div>
            <button
              onClick={() => removeOption(i)}
              className="text-gray-600 hover:text-red-400 text-sm leading-none flex-shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addOption}
        className="mt-2 w-full text-xs text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg py-1.5 transition-colors"
      >
        + Add status
      </button>
    </div>
  );
}

// ── Link config panel ─────────────────────────────────────────────────────────

function LinkConfigPanel({
  col,
  boardId,
  onClose,
}: {
  col: Column;
  boardId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const [sourceBoardId, setSourceBoardId] = useState(col.sourceBoardId ?? '');
  const [importCols, setImportCols] = useState<string[]>(col.importCols ?? []);

  const { data: sourceBoardData, isFetching: loadingCols } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: sourceBoardId } }),
    enabled: !!sourceBoardId,
  });

  function toggleImportCol(colId: string, checked: boolean) {
    setImportCols(prev => checked ? [...prev, colId] : prev.filter(id => id !== colId));
  }

  async function handleSave() {
    await orpcClient.column.updateColumn({
      columnId: col.id,
      sourceBoardId: sourceBoardId || undefined,
      importCols,
    });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
    onClose();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Link configuration</p>

      {/* Source board */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Source board</label>
        <select
          value={sourceBoardId}
          onChange={e => { setSourceBoardId(e.target.value); setImportCols([]); }}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none"
        >
          <option value="">— none —</option>
          {boards?.filter(b => b.id !== boardId).map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Import columns */}
      {sourceBoardId && (
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Copy these columns</label>
          {loadingCols && <p className="text-xs text-gray-600">Loading…</p>}
          {!loadingCols && sourceBoardData && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {sourceBoardData.columns.length === 0 && (
                <p className="text-xs text-gray-600">No columns on this board</p>
              )}
              {sourceBoardData.columns.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={importCols.includes(c.id)}
                    onChange={e => toggleImportCol(c.id, e.target.checked)}
                    className="accent-violet-500 w-3 h-3 flex-shrink-0"
                  />
                  <span className="text-xs text-gray-300 group-hover:text-white transition-colors truncate">
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
      >
        Save
      </button>
    </div>
  );
}

// ── Formula config panel ──────────────────────────────────────────────────────

function FormulaConfigPanel({ col, boardId, onClose }: { col: Column; boardId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [formula, setFormula] = useState(col.formula ?? '');

  // Fetch current board columns to show clickable reference chips
  const { data: boardData } = useQuery(
    orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }),
  );
  const refCols = (boardData?.columns ?? []).filter(c => c.id !== col.id && c.type !== 'formula');

  async function handleSave() {
    await orpcClient.column.updateColumn({ columnId: col.id, formula: formula.trim() || null });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
    onClose();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formula</p>

      {/* Expression input */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Expression</label>
        <input
          autoFocus
          value={formula}
          onChange={e => setFormula(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          placeholder={`"Notes" / 3`}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white font-mono outline-none placeholder-gray-600 focus:border-violet-500 transition-colors"
        />
      </div>

      {/* Clickable column chips — clicking inserts the reference at cursor */}
      {refCols.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Insert column reference:</p>
          <div className="flex flex-wrap gap-1">
            {refCols.map(c => (
              <button
                key={c.id}
                onClick={() => setFormula(f => f + `"${c.label}"`)}
                className="text-[10px] font-mono bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 hover:border-violet-500 hover:text-violet-300 transition-colors"
              >
                "{c.label}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Syntax hint */}
      <p className="text-[10px] text-gray-600 leading-relaxed">
        Wrap column names in quotes: <span className="font-mono text-gray-500">"Notes"</span>.{' '}
        Supports <span className="font-mono text-gray-500">+ − * / ( )</span>
      </p>

      <button
        onClick={handleSave}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
      >
        Save
      </button>
    </div>
  );
}
