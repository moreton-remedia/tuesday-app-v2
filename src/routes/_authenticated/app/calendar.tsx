import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { orpcUtils, orpcClient } from '@/rpc/react';
import { signOut, useSession } from '@/common/auth-client';
import { Sidebar } from '@/components/board/Sidebar';
import { getColor } from '@/components/columns/colors';


// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day';

type CalEvent = {
  taskId: string;
  taskName: string;
  date: string; // YYYY-MM-DD
  boardId: string;
  boardName: string;
  color: string;
};

type BoardInfo = { id: string; name: string; color: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const BOARD_COLORS = [
  '#4263eb', '#37b24d', '#f76707', '#e03131',
  '#ae3ec9', '#1098ad', '#f59f00', '#0ca678',
  '#74c0fc', '#ffa94d',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekStart(d: Date): Date {
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/app/calendar')({
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.prefetchQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.board.listBoards.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.board.getCalendarData.queryOptions({ input: {} })),
    ]);
  },
  component: CalendarPage,
});

// ── Page ──────────────────────────────────────────────────────────────────────

function CalendarPage() {
  const session = useSession();
  const router = useRouter();
  const { data: workspace } = useSuspenseQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
  const { data: workspaces } = useSuspenseQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} }));
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const { data: calData } = useSuspenseQuery(orpcUtils.board.getCalendarData.queryOptions({ input: {} }));

  async function handleSignOut() {
    await signOut();
    await router.navigate({ to: '/login' });
  }

  const boardInfos = useMemo<BoardInfo[]>(
    () => (calData?.boards ?? []).map((b, i) => ({
      id: b.id,
      name: b.name,
      color: BOARD_COLORS[i % BOARD_COLORS.length]!,
    })),
    [calData],
  );

  // firstDateColByBoard: boardId → colId (first date column by position)
  const firstDateColByBoard = useMemo(() => {
    const m = new Map<string, string>();
    for (const col of calData?.columns ?? []) {
      if (col.type === 'date' && !m.has(col.boardId)) m.set(col.boardId, col.id);
    }
    return m;
  }, [calData]);

  const events = useMemo<CalEvent[]>(() => {
    if (!calData) return [];
    const { tasks, groupBoardMap } = calData;
    const colorByBoard = new Map(boardInfos.map(b => [b.id, b.color]));
    const nameByBoard = new Map(boardInfos.map(b => [b.id, b.name]));
    const result: CalEvent[] = [];
    for (const task of tasks) {
      const boardId = groupBoardMap[task.groupId];
      if (!boardId) continue;
      const colId = firstDateColByBoard.get(boardId);
      if (!colId) continue;
      const rawDate = (task.fields as Record<string, string> | null)?.[colId];
      if (!rawDate) continue;
      // Slice to YYYY-MM-DD so datetime values (YYYY-MM-DDTHH:mm) still match calendar cells
      const date = rawDate.slice(0, 10);
      if (!date) continue;
      result.push({
        taskId: task.id,
        taskName: task.name || '(unnamed)',
        date,
        boardId,
        boardName: nameByBoard.get(boardId) ?? '',
        color: colorByBoard.get(boardId) ?? BOARD_COLORS[0]!,
      });
    }
    return result;
  }, [calData, boardInfos, firstDateColByBoard]);

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar
        boards={boards ?? []}
        workspaces={workspaces ?? []}
        activeWorkspaceId={workspace?.id ?? ''}
        inviteToken={workspace?.inviteToken ?? ''}
        workspaceName={workspace?.name ?? ''}
        userName={session.data?.user.name ?? ''}
        onSignOut={handleSignOut}
      />
      <main className="flex-1 flex overflow-hidden">
        <CalendarView
          events={events}
          boards={boardInfos}
          calData={calData}
          firstDateColByBoard={firstDateColByBoard}
        />
      </main>
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

type CalData = Awaited<ReturnType<typeof orpcClient.board.getCalendarData>>;

function CalendarView({
  events,
  boards,
  calData,
  firstDateColByBoard,
}: {
  events: CalEvent[];
  boards: BoardInfo[];
  calData: CalData | null | undefined;
  firstDateColByBoard: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [createDate, setCreateDate] = useState<string | null>(null); // non-null = modal open
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  // Per-user board visibility — persisted in localStorage
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('calendar-hidden-boards');
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });

  function toggleBoard(id: string) {
    setHiddenBoards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem('calendar-hidden-boards', JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const visibleEvents = useMemo(
    () => events.filter(e => !hiddenBoards.has(e.boardId)),
    [events, hiddenBoards],
  );

  function openCreate(dateStr: string) { setCreateDate(dateStr); }

  // Navigation
  function goPrev() {
    setCurrentDate(d => {
      const n = new Date(d);
      if (view === 'month') n.setMonth(n.getMonth() - 1);
      else if (view === 'week') n.setDate(n.getDate() - 7);
      else n.setDate(n.getDate() - 1);
      return n;
    });
  }
  function goNext() {
    setCurrentDate(d => {
      const n = new Date(d);
      if (view === 'month') n.setMonth(n.getMonth() + 1);
      else if (view === 'week') n.setDate(n.getDate() + 7);
      else n.setDate(n.getDate() + 1);
      return n;
    });
  }
  function goToday() { setCurrentDate(new Date()); }

  const title = useMemo(() => {
    if (view === 'month')
      return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (view === 'week') {
      const start = weekStart(currentDate);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [view, currentDate]);

  function switchToDay(d: Date) { setCurrentDate(d); setView('day'); }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      {/* ── Board filter panel ── */}
      <div className="w-44 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-gray-800">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Boards</p>
        </div>
        <div className="p-2 space-y-0.5">
          {boards.length === 0 && <p className="text-xs text-gray-600 px-1 py-2">No boards yet</p>}
          {boards.map(board => {
            const visible = !hiddenBoards.has(board.id);
            return (
              <button
                key={board.id}
                onClick={() => toggleBoard(board.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors text-left group"
              >
                <span
                  className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center transition-colors border"
                  style={{ backgroundColor: visible ? board.color : 'transparent', borderColor: visible ? board.color : '#4b5563' }}
                >
                  {visible && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4l2 2 4-4" />
                    </svg>
                  )}
                </span>
                <span className={`text-xs truncate transition-colors ${visible ? 'text-gray-200 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-400'}`}>
                  {board.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main calendar area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
          {/* New event button */}
          <button
            onClick={() => openCreate(toDateStr(new Date()))}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex-shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 1v8M1 5h8" />
            </svg>
            New
          </button>

          <button onClick={goToday} className="px-3 py-1 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors">
            Today
          </button>
          <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-white flex-1 select-none">{title}</h2>

          <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {(['month', 'week', 'day'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar body */}
        <div className="flex-1 overflow-auto">
          {view === 'month' && (
            <MonthView date={currentDate} events={visibleEvents} onTaskClick={setSelectedEvent} onDayClick={switchToDay} onCreateEvent={openCreate} />
          )}
          {view === 'week' && (
            <WeekView date={currentDate} events={visibleEvents} onTaskClick={setSelectedEvent} onDayClick={switchToDay} onCreateEvent={openCreate} />
          )}
          {view === 'day' && (
            <DayView date={currentDate} events={visibleEvents} onTaskClick={setSelectedEvent} onCreateEvent={openCreate} />
          )}
        </div>
      </div>

      {/* New event modal */}
      {createDate !== null && (
        <NewEventModal
          initialDate={createDate}
          boards={boards}
          calData={calData}
          firstDateColByBoard={firstDateColByBoard}
          onClose={() => setCreateDate(null)}
          onCreated={() => {
            qc.invalidateQueries(orpcUtils.board.getCalendarData.queryOptions({ input: {} }));
          }}
        />
      )}

      {/* Event detail / edit modal */}
      {selectedEvent !== null && (
        <EventDetailModal
          event={selectedEvent}
          calData={calData}
          boards={boards}
          firstDateColByBoard={firstDateColByBoard}
          onClose={() => setSelectedEvent(null)}
          onUpdated={() => {
            qc.invalidateQueries(orpcUtils.board.getCalendarData.queryOptions({ input: {} }));
          }}
        />
      )}
    </div>
  );
}

// ── New event modal ───────────────────────────────────────────────────────────

type CalColumn = NonNullable<CalData>['columns'][number];

function applyColOrder(cols: CalColumn[], boardId: string, order: Record<string, string[]>): CalColumn[] {
  const ids = order[boardId];
  if (!ids || ids.length === 0) return cols;
  const map = new Map(cols.map(c => [c.id, c]));
  const ordered = ids.map(id => map.get(id)).filter(Boolean) as CalColumn[];
  const inOrder = new Set(ids);
  cols.forEach(c => { if (!inOrder.has(c.id)) ordered.push(c); });
  return ordered;
}

function NewEventModal({
  initialDate,
  boards,
  calData,
  firstDateColByBoard,
  onClose,
  onCreated,
}: {
  initialDate: string;
  boards: BoardInfo[];
  calData: CalData | null | undefined;
  firstDateColByBoard: Map<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [groupId, setGroupId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<{ id: string; name: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Per-board hidden column IDs — persisted in localStorage
  const [hiddenCols, setHiddenCols] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('calendar-col-visibility');
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch { return {}; }
  });

  // Per-board column order — persisted in localStorage
  const [colOrder, setColOrder] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('calendar-col-order');
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch { return {}; }
  });

  const dragColRef = useRef<string | null>(null);

  function toggleCol(colId: string) {
    setHiddenCols(prev => {
      const current = new Set(prev[boardId] ?? []);
      current.has(colId) ? current.delete(colId) : current.add(colId);
      const next = { ...prev, [boardId]: [...current] };
      try { localStorage.setItem('calendar-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function reorderCol(targetColId: string, ordered: CalColumn[]) {
    const fromId = dragColRef.current;
    if (!fromId || fromId === targetColId) return;
    const ids = ordered.map(c => c.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(targetColId);
    if (fromIdx < 0 || toIdx < 0) return;
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, fromId);
    setColOrder(prev => {
      const next = { ...prev, [boardId]: newIds };
      try { localStorage.setItem('calendar-col-order', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const allGroups = calData?.groups ?? [];
  const allColumns = calData?.columns ?? [];

  // Groups for the selected board
  const boardGroups = useMemo(() => allGroups.filter(g => g.boardId === boardId), [allGroups, boardId]);

  // Columns for the selected board — skip formula (computed) and status (not in modal)
  const boardColumns = useMemo<CalColumn[]>(
    () => allColumns.filter(c => c.boardId === boardId && c.type !== 'formula' && c.type !== 'status'),
    [allColumns, boardId],
  );

  const orderedBoardColumns = useMemo(
    () => applyColOrder(boardColumns, boardId, colOrder),
    [boardColumns, boardId, colOrder],
  );

  // When board changes: reset groupId, fields, and close customize panel
  useEffect(() => {
    setGroupId(allGroups.find(g => g.boardId === boardId)?.id ?? '');
    const dateColId = firstDateColByBoard.get(boardId);
    setFields(dateColId ? { [dateColId]: initialDate } : {});
    setShowCustomize(false);
  }, [boardId]);

  // Focus name on open
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function setField(colId: string, value: string) {
    setFields(prev => ({ ...prev, [colId]: value }));
  }

  const canCreate = name.trim().length > 0 && !!groupId;

  async function doCreate() {
    setCreating(true);
    setDuplicateOf(null);
    try {
      const task = await orpcClient.task.createTask({ groupId, name: name.trim() });
      if (task) {
        const nonEmptyFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ''));
        // Always call updateTaskFields — even with an empty map — so that
        // runTaskAutomations is triggered and can evaluate text-contains / notes
        // conditions against the freshly created task.
        await orpcClient.task.updateTaskFields({ taskId: task.id, fields: nonEmptyFields });
      }
      onCreated();
      onClose();
    } catch {
      setCreating(false);
    }
  }

  async function handleUpdateOld() {
    if (!duplicateOf || creating) return;
    setCreating(true);
    setDuplicateOf(null);
    try {
      // Move existing task into the target group (and board)
      await orpcClient.task.updateTask({ taskId: duplicateOf.id, groupId });
      // Merge entered fields on top of the existing task's fields
      const nonEmptyFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ''));
      if (Object.keys(nonEmptyFields).length > 0) {
        const existingTask = (calData?.tasks ?? []).find(t => t.id === duplicateOf.id);
        const existingFields = ((existingTask?.fields ?? {}) as Record<string, string>);
        await orpcClient.task.updateTaskFields({ taskId: duplicateOf.id, fields: { ...existingFields, ...nonEmptyFields } });
      }
      onCreated();
      onClose();
    } catch {
      setCreating(false);
    }
  }

  async function handleCreate() {
    if (!canCreate || creating) return;
    const trimmed = name.trim();
    const groupBoardMap = calData?.groupBoardMap ?? {};
    const dup = (calData?.tasks ?? []).find(
      t => groupBoardMap[t.groupId] === boardId && (t.name ?? '').trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (dup) { setDuplicateOf({ id: dup.id, name: dup.name ?? '' }); return; }
    await doCreate();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <h3 className="text-sm font-semibold text-white">New task</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors text-xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 pb-2 space-y-3 flex-1">
          {/* Task name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Task name <span className="text-violet-500">*</span></label>
              {(() => {
                const locCol = orderedBoardColumns.find(c => c.type === 'location' && fields[c.id]);
                const locVal = locCol ? fields[locCol.id] : '';
                return locVal && locVal !== name ? (
                  <button
                    type="button"
                    onClick={() => setName(locVal)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    ← Use address as title
                  </button>
                ) : null;
              })()}
            </div>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder="What needs to be done?"
              className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
          </div>

          {/* Board */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Board</label>
            {boards.length === 0 ? (
              <p className="text-xs text-gray-600">No boards available</p>
            ) : (
              <select
                value={boardId}
                onChange={e => setBoardId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
              >
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>

          {/* Group — only shown when board has >1 group */}
          {boardGroups.length > 1 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Group</label>
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
              >
                {boardGroups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
          )}

          {/* ── Per-column fields ── */}
          {orderedBoardColumns.length > 0 && (() => {
            const hiddenSet = new Set(hiddenCols[boardId] ?? []);
            const visibleCols = orderedBoardColumns.filter(c => !hiddenSet.has(c.id));
            const typeLabel: Record<string, string> = {
              notes: 'Notes', date: 'Date', dropdown: 'Dropdown', link: 'Link', location: 'Location',
            };
            return (
              <div className="border-t border-gray-800 pt-3">
                {/* Section header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                    Column details
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomize(s => !s)}
                    className={`flex items-center gap-1 text-[10px] font-medium transition-colors rounded px-1.5 py-0.5 ${
                      showCustomize
                        ? 'bg-violet-600/20 text-violet-400'
                        : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800'
                    }`}
                    title="Choose which columns appear here"
                  >
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    {showCustomize ? 'Done' : 'Customize'}
                  </button>
                </div>

                {showCustomize ? (
                  /* ── Customize mode: drag-to-reorder + visibility toggles ── */
                  <div className="space-y-1 bg-gray-800/50 rounded-lg p-2">
                    {orderedBoardColumns.map(col => {
                      const visible = !hiddenSet.has(col.id);
                      return (
                        <div
                          key={col.id}
                          draggable
                          onDragStart={() => { dragColRef.current = col.id; }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => reorderCol(col.id, orderedBoardColumns)}
                          className="flex items-center gap-2.5 px-1 py-1.5 rounded-md hover:bg-gray-800 group"
                        >
                          <span className="cursor-grab text-gray-700 group-hover:text-gray-500 flex-shrink-0" title="Drag to reorder">
                            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                              <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
                              <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                            </svg>
                          </span>
                          <span
                            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors cursor-pointer"
                            style={{
                              backgroundColor: visible ? '#7c3aed' : 'transparent',
                              borderColor: visible ? '#7c3aed' : '#4b5563',
                            }}
                            onClick={() => toggleCol(col.id)}
                          >
                            {visible && (
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 4l2 2 4-4" />
                              </svg>
                            )}
                          </span>
                          <span
                            className={`text-xs flex-1 transition-colors cursor-pointer ${visible ? 'text-gray-200' : 'text-gray-600'}`}
                            onClick={() => toggleCol(col.id)}
                          >
                            {col.label}
                          </span>
                          <span className="text-[10px] text-gray-700 group-hover:text-gray-600 flex-shrink-0">
                            {typeLabel[col.type] ?? col.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : visibleCols.length === 0 ? (
                  /* ── All hidden hint ── */
                  <button
                    type="button"
                    onClick={() => setShowCustomize(true)}
                    className="w-full text-xs text-gray-700 hover:text-gray-500 transition-colors py-2 text-center"
                  >
                    All columns hidden — click <span className="text-violet-500">Customize</span> to show some
                  </button>
                ) : (
                  /* ── Normal mode: visible column inputs in saved order ── */
                  <div className="space-y-3">
                    {visibleCols.map(col => (
                      <ColumnField
                        key={col.id}
                        col={col}
                        value={fields[col.id] ?? ''}
                        onChange={v => setField(col.id, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer — duplicate prompt or normal actions */}
        {duplicateOf ? (
          <div className="px-5 py-4 border-t border-gray-800 flex-shrink-0 space-y-2.5">
            <p className="text-xs text-gray-400">
              A task named <span className="text-white font-medium">"{duplicateOf.name}"</span> already exists in this board. Click away to cancel.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUpdateOld}
                disabled={creating}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors"
              >
                {creating ? 'Updating…' : 'Update Old'}
              </button>
              <button
                onClick={doCreate}
                disabled={creating}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create New'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="px-4 py-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {creating ? 'Creating…' : 'Create task'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventDetailModal({
  event,
  calData,
  boards,
  firstDateColByBoard,
  onClose,
  onUpdated,
}: {
  event: CalEvent;
  calData: CalData | null | undefined;
  boards: BoardInfo[];
  firstDateColByBoard: Map<string, string>;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const allColumns = calData?.columns ?? [];
  const allGroups = calData?.groups ?? [];
  const allTasks = calData?.tasks ?? [];

  // The actual task record
  const task = allTasks.find(t => t.id === event.taskId);
  const taskFields = (task?.fields ?? {}) as Record<string, string>;

  // Columns for this board (task scope), excluding formula
  const boardColumns = useMemo<CalColumn[]>(
    () => allColumns.filter(c => c.boardId === event.boardId && c.type !== 'formula'),
    [allColumns, event.boardId],
  );

  // Groups for this board
  const boardGroups = useMemo(() => allGroups.filter(g => g.boardId === event.boardId), [allGroups, event.boardId]);

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editName, setEditName] = useState(event.taskName);
  const [editGroupId, setEditGroupId] = useState(task?.groupId ?? '');
  const [editFields, setEditFields] = useState<Record<string, string>>(taskFields);
  const [showCustomize, setShowCustomize] = useState(false);

  // Per-board hidden column IDs — shared with NewEventModal via same localStorage key
  const [hiddenCols, setHiddenCols] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('calendar-col-visibility');
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch { return {}; }
  });

  // Per-board column order — shared with NewEventModal via same localStorage key
  const [colOrder, setColOrder] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('calendar-col-order');
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch { return {}; }
  });

  const dragColRef = useRef<string | null>(null);

  function toggleCol(colId: string) {
    setHiddenCols(prev => {
      const current = new Set(prev[event.boardId] ?? []);
      current.has(colId) ? current.delete(colId) : current.add(colId);
      const next = { ...prev, [event.boardId]: [...current] };
      try { localStorage.setItem('calendar-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function reorderCol(targetColId: string, ordered: CalColumn[]) {
    const fromId = dragColRef.current;
    if (!fromId || fromId === targetColId) return;
    const ids = ordered.map(c => c.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(targetColId);
    if (fromIdx < 0 || toIdx < 0) return;
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, fromId);
    setColOrder(prev => {
      const next = { ...prev, [event.boardId]: newIds };
      try { localStorage.setItem('calendar-col-order', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const orderedBoardColumns = useMemo(
    () => applyColOrder(boardColumns, event.boardId, colOrder),
    [boardColumns, event.boardId, colOrder],
  );

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (isEditing) setIsEditing(false); else onClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isEditing, onClose]);

  async function handleSave() {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      const nonEmptyFields = Object.fromEntries(Object.entries(editFields).filter(([, v]) => v !== ''));
      await orpcClient.task.updateTask({
        taskId: event.taskId,
        name: editName.trim(),
        groupId: editGroupId !== task?.groupId ? editGroupId : undefined,
        fields: nonEmptyFields,
      });
      onUpdated();
      setIsEditing(false);
    } catch {
      // leave in edit mode on error
    } finally {
      setSaving(false);
    }
  }

  // ── Helpers for view mode ──────────────────────────────────────────────────

  function formatDateValue(iso: string) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (iso.includes('T') && iso.slice(11, 16)) {
      return `${dateStr} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    return dateStr;
  }

  function resolveLinkedTaskName(taskId: string): string {
    const found = allTasks.find(t => t.id === taskId);
    return found?.name || '(unnamed)';
  }

  // Columns that have a non-empty value to show in view mode
  const populatedCols = allColumns.filter(
    c => c.boardId === event.boardId && taskFields[c.id],
  );

  const hiddenSet = new Set(hiddenCols[event.boardId] ?? []);
  const visibleEditCols = orderedBoardColumns.filter(c => !hiddenSet.has(c.id));

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 flex-shrink-0">
          {/* Color accent bar */}
          <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: event.color }} />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                className="w-full text-base font-semibold text-white bg-transparent outline-none border-b border-gray-600 focus:border-violet-500 pb-0.5 transition-colors"
              />
            ) : (
              <h3 className="text-base font-semibold text-white leading-snug break-words">{event.taskName}</h3>
            )}
            <p className="text-xs text-gray-500 mt-0.5">{event.boardName}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isEditing && (
              <button
                onClick={() => {
                  setEditName(event.taskName);
                  setEditGroupId(task?.groupId ?? '');
                  setEditFields(taskFields);
                  setShowCustomize(false);
                  setIsEditing(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                title="Edit this task"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z"/>
                </svg>
                Edit
              </button>
            )}
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-300 transition-colors text-xl leading-none rounded">×</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto px-5 pb-2 flex-1">
          {isEditing ? (
            /* ── Edit mode body ── */
            <div className="space-y-3">
              {/* Group selector (only if >1 group) */}
              {boardGroups.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Group</label>
                  <select
                    value={editGroupId}
                    onChange={e => setEditGroupId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
                  >
                    {boardGroups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </div>
              )}

              {/* Column fields */}
              {orderedBoardColumns.length > 0 && (
                <div className="border-t border-gray-800 pt-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Column details</span>
                    <button
                      type="button"
                      onClick={() => setShowCustomize(s => !s)}
                      className={`flex items-center gap-1 text-[10px] font-medium transition-colors rounded px-1.5 py-0.5 ${
                        showCustomize ? 'bg-violet-600/20 text-violet-400' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                      {showCustomize ? 'Done' : 'Customize'}
                    </button>
                  </div>

                  {showCustomize ? (
                    <div className="space-y-1 bg-gray-800/50 rounded-lg p-2">
                      {(() => {
                        const typeLabel: Record<string, string> = { notes: 'Notes', date: 'Date', dropdown: 'Dropdown', status: 'Status', link: 'Link', location: 'Location' };
                        return orderedBoardColumns.map(col => {
                          const visible = !hiddenSet.has(col.id);
                          return (
                            <div
                              key={col.id}
                              draggable
                              onDragStart={() => { dragColRef.current = col.id; }}
                              onDragOver={e => e.preventDefault()}
                              onDrop={() => reorderCol(col.id, orderedBoardColumns)}
                              className="flex items-center gap-2.5 px-1 py-1.5 rounded-md hover:bg-gray-800 group"
                            >
                              <span className="cursor-grab text-gray-700 group-hover:text-gray-500 flex-shrink-0" title="Drag to reorder">
                                <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                                  <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                                  <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
                                  <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                                </svg>
                              </span>
                              <span
                                className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors cursor-pointer"
                                style={{ backgroundColor: visible ? '#7c3aed' : 'transparent', borderColor: visible ? '#7c3aed' : '#4b5563' }}
                                onClick={() => toggleCol(col.id)}
                              >
                                {visible && (
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 4l2 2 4-4" />
                                  </svg>
                                )}
                              </span>
                              <span className={`text-xs flex-1 transition-colors cursor-pointer ${visible ? 'text-gray-200' : 'text-gray-600'}`} onClick={() => toggleCol(col.id)}>
                                {col.label}
                              </span>
                              <span className="text-[10px] text-gray-700 flex-shrink-0">{typeLabel[col.type] ?? col.type}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : visibleEditCols.length === 0 ? (
                    <button type="button" onClick={() => setShowCustomize(true)} className="w-full text-xs text-gray-700 hover:text-gray-500 transition-colors py-2 text-center">
                      All columns hidden — click <span className="text-violet-500">Customize</span> to show some
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {visibleEditCols.map(col => (
                        <ColumnField
                          key={col.id}
                          col={col}
                          value={editFields[col.id] ?? ''}
                          onChange={v => setEditFields(prev => ({ ...prev, [col.id]: v }))}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── View mode body ── */
            <div className="space-y-2.5">
              {populatedCols.length === 0 ? (
                <p className="text-xs text-gray-600 py-2">No field values set for this task.</p>
              ) : (
                populatedCols.map(col => {
                  const raw = taskFields[col.id] ?? '';
                  return (
                    <div key={col.id} className="flex items-start gap-3">
                      <span className="text-xs text-gray-600 w-24 flex-shrink-0 pt-0.5">{col.label}</span>
                      <div className="flex-1 min-w-0">
                        {col.type === 'date' && (
                          <span className="text-xs text-gray-200">{formatDateValue(raw)}</span>
                        )}
                        {col.type === 'notes' && (
                          <span className="text-xs text-gray-300 whitespace-pre-wrap break-words">{raw}</span>
                        )}
                        {col.type === 'dropdown' && (() => {
                          const opt = (col.options as { label: string; colorKey?: string }[] ?? []).find(o => o.label === raw);
                          return (
                            <span
                              className="inline-block text-[11px] font-medium text-white px-2 py-0.5 rounded"
                              style={{ backgroundColor: getColor(opt?.colorKey) }}
                            >
                              {raw}
                            </span>
                          );
                        })()}
                        {col.type === 'status' && (() => {
                          const opt = (col.statusOptions as { key: string; label: string; colorKey: string }[] ?? []).find(o => o.key === raw);
                          return opt ? (
                            <span
                              className="inline-block text-[11px] font-medium text-white px-2 py-0.5 rounded"
                              style={{ backgroundColor: getColor(opt.colorKey) }}
                            >
                              {opt.label}
                            </span>
                          ) : null;
                        })()}
                        {col.type === 'link' && raw && (
                          <span className="text-xs text-blue-400 flex items-center gap-1">
                            <span>↗</span>
                            <span className="truncate">{resolveLinkedTaskName(raw)}</span>
                          </span>
                        )}
                        {col.type === 'location' && raw && (
                          <span className="text-xs text-gray-300 flex items-center gap-1">
                            <svg width="9" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-gray-500 flex-shrink-0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                            <span className="truncate">{raw}</span>
                          </span>
                        )}
                        {col.type === 'formula' && (
                          <span className="text-xs text-gray-400 font-mono">{raw}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center px-5 py-3.5 border-t border-gray-800 flex-shrink-0 gap-2">
          {/* Go to board — always visible */}
          <button
            onClick={() => navigate({ to: '/app/board/$boardId', params: { boardId: event.boardId } })}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-400 transition-colors"
            title="Open this board"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/><path d="M13 1h2v2"/><path d="M8 8L15 1"/>
            </svg>
            Open in board
          </button>

          {isEditing && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editName.trim() || saving}
                className="px-4 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}

// ── Maps autocomplete for calendar ───────────────────────────────────────────

const CAL_MAPS_KEY = (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY;

let _calMapsReady = false;
let _calMapsLoading = false;
const _calMapsCallbacks: (() => void)[] = [];

function loadCalMapsScript(onReady: () => void) {
  if (_calMapsReady) { onReady(); return; }
  _calMapsCallbacks.push(onReady);
  if (_calMapsLoading) return;
  _calMapsLoading = true;
  const existing = document.querySelector('script[src*="maps.googleapis.com"]');
  if (existing) {
    // Script already loading from board page — wait for it
    const check = setInterval(() => {
      if ((window as any).google?.maps?.importLibrary) { // eslint-disable-line @typescript-eslint/no-explicit-any
        clearInterval(check);
        _calMapsReady = true;
        _calMapsLoading = false;
        _calMapsCallbacks.splice(0).forEach(cb => cb());
      }
    }, 100);
    return;
  }
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${CAL_MAPS_KEY}&v=weekly&loading=async`;
  s.async = true;
  s.onload = () => { _calMapsReady = true; _calMapsLoading = false; _calMapsCallbacks.splice(0).forEach(cb => cb()); };
  document.head.appendChild(s);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalMapsSuggestion = { placePrediction: { text: { text: string }; toPlace: () => any } };

function LocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<CalMapsSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    if (CAL_MAPS_KEY && !_calMapsReady && !_calMapsLoading) loadCalMapsScript(() => {});
  }, []);

  async function fetchSuggestions(text: string) {
    if (!text.trim() || !CAL_MAPS_KEY) { setSuggestions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.maps?.importLibrary) { setSuggestions([]); return; }
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary('places');
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
      const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: sessionTokenRef.current });
      setSuggestions(result.suggestions ?? []);
    } catch { setSuggestions([]); }
  }

  function handleInput(text: string) {
    setDraft(text);
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 300);
  }

  async function selectSuggestion(s: CalMapsSuggestion) {
    const place = s.placePrediction.toPlace();
    await place.fetchFields({ fields: ['formattedAddress'] });
    const addr: string = place.formattedAddress ?? '';
    if (addr) { setDraft(addr); onChange(addr); }
    setSuggestions([]);
    sessionTokenRef.current = null;
  }

  return (
    <div className="relative">
      <input
        value={draft}
        onChange={e => handleInput(e.target.value)}
        placeholder={CAL_MAPS_KEY ? 'Search for an address…' : 'Enter an address…'}
        className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
        onKeyDown={e => {
          if (e.key === 'Enter' && suggestions.length > 0) { e.preventDefault(); selectSuggestion(suggestions[0]); }
          if (e.key === 'Escape') setSuggestions([]);
        }}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
      />
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
            >
              <span className="text-gray-500 flex-shrink-0">
                <svg width="9" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              </span>
              <span className="truncate">{s.placePrediction.text.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column field — renders the right input for each column type ───────────────

function ColumnField({ col, value, onChange }: { col: CalColumn; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{col.label}</label>
      {col.type === 'notes' && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors resize-none"
        />
      )}
      {col.type === 'date' && (
        <DateTimeField value={value} onChange={onChange} />
      )}
      {col.type === 'dropdown' && (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
        >
          <option value="">— None —</option>
          {(col.options as { label: string }[] ?? []).map(opt => (
            <option key={opt.label} value={opt.label}>{opt.label}</option>
          ))}
        </select>
      )}
      {col.type === 'status' && (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
        >
          <option value="">— None —</option>
          {(col.statusOptions as { key: string; label: string }[] ?? []).map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      )}
      {col.type === 'link' && (
        <LinkColumnField col={col} value={value} onChange={onChange} />
      )}
      {col.type === 'location' && (
        <LocationField value={value} onChange={onChange} />
      )}
    </div>
  );
}

// ── Link column field — collapsed trigger, expands on click ──────────────────

function LinkColumnField({ col, value, onChange }: { col: CalColumn; value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Focus search when opening
  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 0);
  }, [isOpen]);

  // Fetch only when the dropdown has been opened at least once
  const { data: sourceData, isLoading } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: col.sourceBoardId! } }),
    enabled: !!col.sourceBoardId && isOpen,
    staleTime: 30_000,
  });

  const tasks = sourceData?.tasks ?? [];
  const filtered = search.trim()
    ? tasks.filter(t => (t.name || '').toLowerCase().includes(search.toLowerCase()))
    : tasks;
  const selectedTask = tasks.find(t => t.id === value);

  if (!col.sourceBoardId) {
    return (
      <p className="text-xs text-amber-500/70 italic">
        No source board configured — edit this column's settings on the board first.
      </p>
    );
  }

  function select(taskId: string) {
    onChange(taskId === value ? '' : taskId);
    setSearch('');
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center gap-2 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-left transition-colors ${
          isOpen ? 'border-violet-500' : 'border-gray-700 hover:border-gray-600'
        }`}
      >
        {selectedTask ? (
          <>
            <span className="text-blue-400 flex-shrink-0 text-xs">↗</span>
            <span className="text-gray-200 truncate flex-1 text-xs">{selectedTask.name || '(unnamed)'}</span>
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="text-gray-600 hover:text-red-400 transition-colors text-base leading-none flex-shrink-0 cursor-pointer"
              title="Clear"
            >×</span>
          </>
        ) : (
          <>
            <span className="text-gray-600 flex-1 text-xs">Link item…</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-600 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3"/>
            </svg>
          </>
        )}
      </button>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-700">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-600 flex-shrink-0">
              <circle cx="7" cy="7" r="5"/><path d="M12 12l3 3"/>
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }}
              placeholder="Search items…"
              className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
            />
          </div>
          {/* Items */}
          <div className="max-h-40 overflow-y-auto">
            {isLoading && <p className="text-xs text-gray-600 px-3 py-2 text-center">Loading…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-gray-600 px-3 py-2 text-center">
                {search ? 'No items match' : 'No items in this board'}
              </p>
            )}
            {filtered.map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => select(task.id)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  task.id === value ? 'bg-violet-600/20 text-violet-300' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {task.id === value
                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M1 5l3 3 5-6"/></svg>
                  : <span className="w-[10px] flex-shrink-0" />
                }
                <span className="truncate">{task.name || '(unnamed)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date + time field ─────────────────────────────────────────────────────────

function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Value is stored as YYYY-MM-DD or YYYY-MM-DDTHH:mm
  const datePart = value.includes('T') ? value.slice(0, 10) : value;
  const timePart = value.includes('T') ? value.slice(11, 16) : '';

  function update(d: string, t: string) {
    if (d && t) onChange(`${d}T${t}`);
    else onChange(d);
  }

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={datePart}
        onChange={e => update(e.target.value, timePart)}
        className="flex-1 bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
      />
      <input
        type="time"
        value={timePart}
        onChange={e => update(datePart, e.target.value)}
        placeholder="--:--"
        className="w-28 bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
      />
    </div>
  );
}


// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ date, events, onTaskClick, onDayClick, onCreateEvent }: {
  date: Date;
  events: CalEvent[];
  onTaskClick: (e: CalEvent) => void;
  onDayClick: (d: Date) => void;
  onCreateEvent: (dateStr: string) => void;
}) {
  const todayStr = toDateStr(new Date());

  const cells = useMemo(() => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(year, month, 1 - startOffset + i);
      const str = toDateStr(d);
      return { date: d, str, isCurrentMonth: d.getMonth() === month, isToday: str === todayStr, events: events.filter(e => e.date === str) };
    });
  }, [date, events, todayStr]);

  return (
    <div className="h-full flex flex-col p-3 gap-1">
      <div className="grid grid-cols-7">
        {DAY_NAMES.map(n => (
          <div key={n} className="text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider py-1">{n}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1 gap-px bg-gray-800 rounded-lg overflow-hidden">
        {cells.map(cell => (
          <MonthCell
            key={cell.str}
            cell={cell}
            onTaskClick={onTaskClick}
            onDayClick={() => onDayClick(cell.date)}
            onCreateEvent={() => onCreateEvent(cell.str)}
          />
        ))}
      </div>
    </div>
  );
}

const MAX_PILLS = 3;

function MonthCell({ cell, onTaskClick, onDayClick, onCreateEvent }: {
  cell: { str: string; date: Date; isCurrentMonth: boolean; isToday: boolean; events: CalEvent[] };
  onTaskClick: (e: CalEvent) => void;
  onDayClick: () => void;
  onCreateEvent: () => void;
}) {
  const visible = cell.events.slice(0, MAX_PILLS);
  const overflow = cell.events.length - MAX_PILLS;

  return (
    <div
      className={`group/cell bg-gray-950 p-1.5 flex flex-col gap-0.5 overflow-hidden min-h-0 cursor-pointer ${cell.isCurrentMonth ? '' : 'opacity-25'}`}
      onClick={onCreateEvent}
    >
      {/* Date row: number (navigates to day) + hover "+" button */}
      <div className="flex items-center justify-between flex-shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onCreateEvent(); }}
          className="opacity-0 group-hover/cell:opacity-100 w-4 h-4 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-700 transition-all text-xs leading-none"
          title="Add task"
        >
          +
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDayClick(); }}
          className={`text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium transition-colors ${
            cell.isToday ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
          }`}
        >
          {cell.date.getDate()}
        </button>
      </div>
      {/* Event pills */}
      {visible.map(evt => (
        <EventPill key={evt.taskId} event={evt} onClick={e => { e.stopPropagation(); onTaskClick(evt); }} />
      ))}
      {overflow > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onDayClick(); }}
          className="text-[10px] text-gray-600 hover:text-gray-400 text-left px-1 leading-tight transition-colors"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

function WeekView({ date, events, onTaskClick, onDayClick, onCreateEvent }: {
  date: Date;
  events: CalEvent[];
  onTaskClick: (e: CalEvent) => void;
  onDayClick: (d: Date) => void;
  onCreateEvent: (dateStr: string) => void;
}) {
  const todayStr = toDateStr(new Date());

  const days = useMemo(() => {
    const start = weekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const str = toDateStr(d);
      return { date: d, str, isToday: str === todayStr, events: events.filter(e => e.date === str) };
    });
  }, [date, events, todayStr]);

  return (
    <div className="h-full p-3">
      <div className="grid grid-cols-7 gap-px bg-gray-800 rounded-lg overflow-hidden h-full">
        {days.map(day => (
          <div
            key={day.str}
            className="group/col bg-gray-950 flex flex-col overflow-hidden cursor-pointer"
            onClick={() => onCreateEvent(day.str)}
          >
            {/* Column header */}
            <div className="px-2 py-2 border-b border-gray-800 flex-shrink-0 text-center" onClick={e => e.stopPropagation()}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                {day.date.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <button
                onClick={() => onDayClick(day.date)}
                className={`text-base font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full transition-colors ${
                  day.isToday ? 'bg-violet-600 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'
                }`}
              >
                {day.date.getDate()}
              </button>
            </div>
            {/* Events + add hint */}
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5 relative">
              {day.events.map(evt => (
                <EventPill key={evt.taskId} event={evt} onClick={e => { e.stopPropagation(); onTaskClick(evt); }} />
              ))}
              {/* Hover add hint */}
              <div className="opacity-0 group-hover/col:opacity-100 transition-opacity absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                <span className="text-[10px] text-gray-700 flex items-center gap-0.5">
                  <span className="text-xs">+</span> Add task
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ date, events, onTaskClick, onCreateEvent }: {
  date: Date;
  events: CalEvent[];
  onTaskClick: (e: CalEvent) => void;
  onCreateEvent: (dateStr: string) => void;
}) {
  const dateStr = toDateStr(date);
  const dayEvents = events.filter(e => e.date === dateStr);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-xl mx-auto">
        {/* Add task button at the top */}
        <button
          onClick={() => onCreateEvent(dateStr)}
          className="w-full flex items-center gap-2 px-4 py-3 mb-3 rounded-xl border border-dashed border-gray-700 hover:border-violet-500/50 hover:bg-violet-950/20 text-gray-600 hover:text-violet-400 transition-colors text-sm group"
        >
          <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs flex-shrink-0 group-hover:border-violet-400">+</span>
          Add task for this day
        </button>

        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-700">
            <p className="text-sm">No tasks scheduled</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayEvents.map(evt => (
              <button
                key={evt.taskId}
                onClick={() => onTaskClick(evt)}
                className="w-full flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl text-left transition-colors group"
              >
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: evt.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{evt.taskName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{evt.boardName}</p>
                </div>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700 group-hover:text-gray-400 flex-shrink-0">
                  <path d="M6 3l5 5-5 5" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Event pill ────────────────────────────────────────────────────────────────

function EventPill({ event, onClick }: { event: CalEvent; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title={`${event.taskName} — ${event.boardName}`}
      className="w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate hover:opacity-80 transition-opacity text-white leading-tight"
      style={{ backgroundColor: event.color }}
    >
      {event.taskName}
    </button>
  );
}
