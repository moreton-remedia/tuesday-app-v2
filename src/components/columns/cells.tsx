import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { orpcUtils, orpcClient } from '@/rpc/react';
import { getColor } from './colors';
import type { columnTable } from '@/database/schema';

type Column = typeof columnTable.$inferSelect;

// ── Portal popover helper ─────────────────────────────────────────────────────

interface CellPopoverProps {
  anchorRect: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

function CellPopover({ anchorRect, onClose, children, width = 200 }: CellPopoverProps) {
  const left = Math.min(anchorRect.left, window.innerWidth - width - 8);
  const top = anchorRect.bottom + 4;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onMouseDown={onClose} />
      <div
        className="fixed z-[101] bg-gray-800 border border-gray-700 rounded-lg shadow-xl"
        style={{ top, left, width }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// ── CellRenderer ─────────────────────────────────────────────────────────────

interface CellProps {
  col: Column;
  value: string;
  onChange: (value: string) => void;
  /** All columns on this board — required for formula cells to resolve references. */
  allColumns?: Column[];
  /** All field values for the current row — required for formula cells. */
  rowFields?: Record<string, string>;
  /** Location cells only: called when user wants to set the street address as the task title. */
  onSetTaskName?: (name: string) => void;
}

export function CellRenderer({ col, value, onChange, allColumns, rowFields, onSetTaskName }: CellProps) {
  switch (col.type) {
    case 'notes':    return <NotesCell value={value} onChange={onChange} />;
    case 'dropdown': return <DropdownCell value={value} options={col.options ?? []} onChange={onChange} />;
    case 'date':     return <DateCell value={value} onChange={onChange} />;
    case 'status':   return <StatusCell value={value} statusOptions={col.statusOptions ?? []} onChange={onChange} />;
    case 'link':     return <LinkCell col={col} value={value} onChange={onChange} />;
    case 'formula':  return <FormulaCell col={col} allColumns={allColumns ?? []} rowFields={rowFields ?? {}} />;
    case 'location': return <LocationCell value={value} onChange={onChange} onSetTaskName={onSetTaskName} />;
    default:         return null;
  }
}

// ── NotesCell ─────────────────────────────────────────────────────────────────

function NotesCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState(value);
  const triggerRef = useRef<HTMLDivElement>(null);

  function open() {
    setDraft(value);
    setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null);
  }

  function close() {
    setAnchorRect(null);
    if (draft !== value) onChange(draft);
  }

  return (
    <div className="w-full h-full">
      <div
        ref={triggerRef}
        onClick={open}
        className="px-2 py-1.5 text-xs text-gray-300 truncate cursor-pointer hover:bg-gray-700/50 rounded min-h-[30px]"
      >
        {value || <span className="text-gray-600">Note…</span>}
      </div>
      {anchorRect && (
        <CellPopover anchorRect={anchorRect} onClose={close} width={256}>
          <div className="p-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') close(); }}
              autoFocus
              rows={4}
              className="w-full bg-transparent text-sm text-white outline-none resize-none placeholder-gray-600"
              placeholder="Add a note…"
            />
          </div>
        </CellPopover>
      )}
    </div>
  );
}

// ── DropdownCell ──────────────────────────────────────────────────────────────

type DropdownOption = { label: string; colorKey?: string };

function DropdownCell({
  value,
  options,
  onChange,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
}) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(o => o.label === value);

  return (
    <div className="w-full h-full">
      <button
        ref={triggerRef}
        onClick={() => setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null)}
        className="w-full h-full min-h-[30px] flex items-center justify-center px-1 py-0.5"
      >
        {selected ? (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded w-full text-center text-white"
            style={{ backgroundColor: getColor(selected.colorKey) }}
          >
            {selected.label}
          </span>
        ) : (
          <span className="text-gray-700 text-xs">—</span>
        )}
      </button>
      {anchorRect && (
        <CellPopover anchorRect={anchorRect} onClose={() => setAnchorRect(null)} width={160}>
          <div className="py-1">
            {value && (
              <button
                onClick={() => { onChange(''); setAnchorRect(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-700 hover:text-gray-300"
              >
                Clear
              </button>
            )}
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-600">No options yet</p>
            )}
            {options.map(opt => (
              <button
                key={opt.label}
                onClick={() => { onChange(opt.label); setAnchorRect(null); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getColor(opt.colorKey) }}
                />
                <span className="text-gray-200">{opt.label}</span>
              </button>
            ))}
          </div>
        </CellPopover>
      )}
    </div>
  );
}

// ── DateCell ──────────────────────────────────────────────────────────────────

function DateCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  // Controlled editing state so both inputs stay in sync
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  function openEdit() {
    setEditDate(value.includes('T') ? value.slice(0, 10) : value);
    setEditTime(value.includes('T') ? value.slice(11, 16) : '');
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const combined = editDate && editTime ? `${editDate}T${editTime}` : editDate;
    if (combined !== value) onChange(combined);
  }

  function formatDisplay(iso: string) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    // Show time only when it was explicitly set (value contains 'T')
    if (iso.includes('T') && iso.slice(11, 16)) {
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} · ${timeStr}`;
    }
    return dateStr;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <input
          type="date"
          value={editDate}
          onChange={e => setEditDate(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') commitEdit(); }}
          autoFocus
          className="bg-gray-800 text-xs text-white border border-gray-600 rounded px-1 py-0.5 outline-none flex-1 min-w-0"
        />
        <input
          type="time"
          value={editTime}
          onChange={e => setEditTime(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') commitEdit(); }}
          className="bg-gray-800 text-xs text-white border border-gray-600 rounded px-1 py-0.5 outline-none w-20 flex-shrink-0"
        />
      </div>
    );
  }

  return (
    <div
      onClick={openEdit}
      className="px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-700/50 rounded min-h-[30px] flex items-center text-gray-300"
    >
      {formatDisplay(value) ?? <span className="text-gray-700">—</span>}
    </div>
  );
}

// ── StatusCell ────────────────────────────────────────────────────────────────

type StatusOption = { key: string; label: string; colorKey: string };

function StatusCell({
  value,
  statusOptions,
  onChange,
}: {
  value: string;
  statusOptions: StatusOption[];
  onChange: (v: string) => void;
}) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = statusOptions.find(o => o.key === value);

  return (
    <div className="w-full h-full">
      <button
        ref={triggerRef}
        onClick={() => setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null)}
        className="w-full h-full min-h-[30px] flex items-center justify-center px-1 py-0.5"
      >
        {current ? (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded w-full text-center text-white"
            style={{ backgroundColor: getColor(current.colorKey) }}
          >
            {current.label}
          </span>
        ) : (
          <span className="text-gray-700 text-xs">—</span>
        )}
      </button>
      {anchorRect && (
        <CellPopover anchorRect={anchorRect} onClose={() => setAnchorRect(null)} width={160}>
          <div className="py-1">
            {value && (
              <button
                onClick={() => { onChange(''); setAnchorRect(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-700 hover:text-gray-300"
              >
                Clear
              </button>
            )}
            {statusOptions.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-600">No statuses yet</p>
            )}
            {statusOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => { onChange(opt.key); setAnchorRect(null); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700"
              >
                <span
                  className="inline-block text-white text-xs font-medium px-2 py-0.5 rounded w-full text-center"
                  style={{ backgroundColor: getColor(opt.colorKey) }}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </CellPopover>
      )}
    </div>
  );
}

// ── LinkCell ──────────────────────────────────────────────────────────────────

function LinkCell({ col, value, onChange }: { col: Column; value: string; onChange: (v: string) => void }) {
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const [notesRect, setNotesRect] = useState<DOMRect | null>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  const { data: sourceBoards } = useQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const sourceBoard = sourceBoards?.find(b => b.id === col.sourceBoardId);

  // Always fetch source data when there's a linked task (not just when picker is open)
  const { data: sourceData } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: col.sourceBoardId! } }),
    enabled: !!col.sourceBoardId && (!!value || !!pickerRect),
  });

  const linkedTask = sourceData?.tasks.find(t => t.id === value);

  // Build imported column values for this specific linked task
  const importedRows = (col.importCols ?? []).flatMap(colId => {
    const srcCol = sourceData?.columns.find(c => c.id === colId);
    if (!srcCol || !linkedTask) return [];
    const raw = (linkedTask.fields as Record<string, string> | null)?.[colId] ?? '';
    let display = raw;
    if (srcCol.type === 'status') {
      display = srcCol.statusOptions?.find(o => o.key === raw)?.label ?? raw;
    }
    if (!display) return [];
    return [{ label: srcCol.label, value: display }];
  });

  const hasImported = importedRows.length > 0;

  return (
    <div className="w-full h-full flex flex-col">
      {/* ── Link row: click to pick / change the linked task ── */}
      <div
        ref={linkRef}
        onClick={() => col.sourceBoardId && setPickerRect(linkRef.current?.getBoundingClientRect() ?? null)}
        className="px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-700/50 flex items-center gap-1 min-h-[30px]"
      >
        {linkedTask ? (
          <>
            <span className="text-blue-400 flex-shrink-0">↗</span>
            <span className="text-gray-300 truncate">{linkedTask.name || '(unnamed)'}</span>
          </>
        ) : col.sourceBoardId ? (
          <span className="text-gray-600">Link item…</span>
        ) : (
          <span className="text-gray-700">—</span>
        )}
      </div>

      {/* ── Imported-data row: collapsible notes cell ── */}
      {linkedTask && hasImported && (
        <div
          ref={notesRef}
          onClick={e => { e.stopPropagation(); setNotesRect(notesRef.current?.getBoundingClientRect() ?? null); }}
          className="px-2 pb-1.5 text-[11px] text-gray-500 cursor-pointer hover:text-gray-300 border-t border-gray-700/40 transition-colors"
        >
          <span className="line-clamp-1">
            {importedRows.map(r => `${r.label}: ${r.value}`).join('  ·  ')}
          </span>
        </div>
      )}

      {/* ── Task picker popup ── */}
      {pickerRect && (
        <CellPopover anchorRect={pickerRect} onClose={() => setPickerRect(null)} width={256}>
          <div className="p-3">
            {!col.sourceBoardId ? (
              <p className="text-xs text-gray-400 text-center py-2">
                Configure this column's source board via the settings icon in the column header.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  From: <span className="text-gray-300">{sourceBoard?.name ?? '…'}</span>
                </p>
                {value && (
                  <button
                    onClick={() => { onChange(''); setPickerRect(null); }}
                    className="w-full text-left px-2 py-1 text-xs text-gray-500 hover:bg-gray-700 rounded mb-1"
                  >
                    Clear link
                  </button>
                )}
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {!sourceData && <p className="text-xs text-gray-600 py-2 text-center">Loading…</p>}
                  {sourceData?.tasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => { onChange(task.id); setPickerRect(null); }}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-700 ${task.id === value ? 'bg-gray-700 text-white' : 'text-gray-300'}`}
                    >
                      {task.name || '(unnamed)'}
                    </button>
                  ))}
                  {sourceData?.tasks.length === 0 && (
                    <p className="text-xs text-gray-600 py-2 text-center">No tasks in source board</p>
                  )}
                </div>
              </>
            )}
          </div>
        </CellPopover>
      )}

      {/* ── Imported data expanded popup ── */}
      {notesRect && (
        <CellPopover anchorRect={notesRect} onClose={() => setNotesRect(null)} width={280}>
          <div className="p-3 space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              From: {linkedTask.name || '(unnamed)'}
            </p>
            {importedRows.map((row, i) => (
              <div key={i}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{row.label}</p>
                <p className="text-xs text-gray-200 whitespace-pre-wrap">{row.value}</p>
              </div>
            ))}
          </div>
        </CellPopover>
      )}
    </div>
  );
}

// ── LocationCell ──────────────────────────────────────────────────────────────

const MAPS_API_KEY = (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY;

let _mapsReady = false;
let _mapsLoading = false;
const _mapsCallbacks: (() => void)[] = [];

function loadMapsScript(onReady: () => void) {
  if (_mapsReady) { onReady(); return; }
  _mapsCallbacks.push(onReady);
  if (_mapsLoading) return;
  _mapsLoading = true;
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&v=weekly&loading=async`;
  s.async = true;
  s.onload = () => {
    _mapsReady = true;
    _mapsLoading = false;
    _mapsCallbacks.splice(0).forEach(cb => cb());
  };
  s.onerror = () => {
    _mapsLoading = false;
    _mapsCallbacks.length = 0;
    console.error('[Maps] Failed to load Google Maps script. Check API key and enabled APIs.');
  };
  document.head.appendChild(s);
}

function LocationCell({ value, onChange, onSetTaskName }: { value: string; onChange: (v: string) => void; onSetTaskName?: (name: string) => void }) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    setDraft(value);
    setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null);
  }

  function close() {
    const v = draft.trim();
    if (v !== value) onChange(v);
    setAnchorRect(null);
  }

  function closeDiscard() {
    setAnchorRect(null);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!anchorRect || !inputRef.current || !MAPS_API_KEY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ac: any = null;

    function init() {
      if (!inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      ac = new g.maps.places.Autocomplete(inputRef.current, { fields: ['formatted_address'] });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace() as { formatted_address?: string };
        if (place?.formatted_address) {
          onChange(place.formatted_address);
          setAnchorRect(null);
        }
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) {
      init();
    } else {
      loadMapsScript(init);
    }

    return () => {
      if (ac) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).google.maps.event.clearInstanceListeners(ac);
        } catch {}
      }
    };
  }, [!!anchorRect]);

  return (
    <div className="w-full h-full">
      <div
        ref={triggerRef}
        onClick={open}
        className="px-2 py-1.5 text-xs text-gray-300 truncate cursor-pointer hover:bg-gray-700/50 rounded min-h-[30px] flex items-center gap-1.5"
      >
        {value ? (
          <>
            <span className="text-emerald-400 flex-shrink-0">
              <svg width="10" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </span>
            <span className="truncate">{value}</span>
          </>
        ) : (
          <span className="text-gray-600">Set location…</span>
        )}
      </div>
      {anchorRect && (
        <CellPopover anchorRect={anchorRect} onClose={close} width={300}>
          <div className="p-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
              placeholder={MAPS_API_KEY ? 'Search for an address…' : 'Enter an address…'}
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-600 px-1 py-1"
              onKeyDown={e => {
                if (e.key === 'Escape') closeDiscard();
                if (e.key === 'Enter') close();
              }}
            />
            {value && (
              <div className="mt-1 border-t border-gray-700/60 pt-1 space-y-0.5">
                {onSetTaskName && (
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      const street = value.split(',')[0].trim();
                      onSetTaskName(street);
                      setAnchorRect(null);
                    }}
                    className="w-full text-left px-1 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded flex items-center gap-1.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Use street as task title
                  </button>
                )}
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(''); setAnchorRect(null); }}
                  className="w-full text-left px-1 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded"
                >
                  Clear location
                </button>
              </div>
            )}
          </div>
        </CellPopover>
      )}
    </div>
  );
}

// ── FormulaCell ───────────────────────────────────────────────────────────────

/**
 * Evaluate a formula expression against a row's field values.
 *
 * Column references: "Column Label" (double-quoted, case-insensitive).
 * Example:  "Notes" / 3   →  resolves Notes column value, divides by 3
 */
function computeFormula(
  formula: string,
  allColumns: Column[],
  rowFields: Record<string, string>,
): string {
  if (!formula.trim()) return '';

  // Replace every "Column Label" reference with the column's numeric value
  let expression = formula.replace(/"([^"]*)"/g, (_match, label: string) => {
    const col = allColumns.find(c => c.label.toLowerCase() === label.toLowerCase());
    if (!col) return '0';
    const raw = rowFields[col.id] ?? '';
    const num = parseFloat(raw);
    return isNaN(num) ? '0' : String(num);
  });

  // Whitelist: only digits, arithmetic operators, parens, decimal points, whitespace
  if (!/^[\d\s+\-*/().]+$/.test(expression)) return '?';

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('return (' + expression + ')')() as unknown;
    if (typeof result !== 'number' || !isFinite(result)) return '?';
    // Trim floating-point noise (e.g. 0.30000000000000004 → 0.3)
    return String(parseFloat(result.toFixed(10)));
  } catch {
    return '?';
  }
}

function FormulaCell({ col, allColumns, rowFields }: {
  col: Column;
  allColumns: Column[];
  rowFields: Record<string, string>;
}) {
  const result = computeFormula(col.formula ?? '', allColumns, rowFields);
  const isEmpty = !col.formula?.trim();
  const isError = result === '?';

  return (
    <div className={`px-2 py-1.5 text-xs min-h-[30px] flex items-center tabular-nums select-none ${
      isEmpty ? 'text-gray-700' :
      isError ? 'text-amber-600/70 italic' :
      'text-gray-200'
    }`}>
      {isEmpty ? '—' : isError ? 'formula error' : result}
    </div>
  );
}
