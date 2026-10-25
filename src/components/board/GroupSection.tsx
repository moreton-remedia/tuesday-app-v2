import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import { CellRenderer } from '@/components/columns/cells';
import { ColumnHeader } from '@/components/columns/ColumnHeader';
import { ColumnPicker } from '@/components/columns/ColumnPicker';
import { SubitemTable } from '@/components/board/SubitemTable';
import { useSelectionStore } from '@/store/selection';
import { useColWidthsStore } from '@/store/columnWidths';
import { PALETTE } from '@/components/columns/colors';
import type { groupTable, taskTable, subitemTable, columnTable } from '@/database/schema';

type Group = typeof groupTable.$inferSelect;
type Task = typeof taskTable.$inferSelect;
type Subitem = typeof subitemTable.$inferSelect;
type Column = typeof columnTable.$inferSelect;

interface GroupSectionProps {
  group: Group;
  tasks: Task[];
  subitems: Subitem[];
  columns: Column[];
  subitemColumns: Column[];
  boardId: string;
  isDragging?: boolean;
  onGroupDragStart?: (e: React.DragEvent) => void;
}

export function GroupSection({ group, tasks, subitems = [], columns = [], subitemColumns = [], boardId, isDragging, onGroupDragStart }: GroupSectionProps) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(group.collapsed === 1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [showColPicker, setShowColPicker] = useState(false);
  const [colPickerRect, setColPickerRect] = useState<DOMRect | null>(null);
  const addColBtnRef = useRef<HTMLButtonElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerRect, setColorPickerRect] = useState<DOMRect | null>(null);

  const handleFocused = useCallback(() => setPendingFocusId(null), []);

  function invalidate() {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  async function handleToggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    await orpcClient.board.updateGroup({ groupId: group.id, collapsed: next });
    invalidate();
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete group "${group.title}" and all its tasks?`)) return;
    await orpcClient.board.deleteGroup({ groupId: group.id });
    invalidate();
  }

  async function handleAddTask() {
    const task = await orpcClient.task.createTask({ groupId: group.id });
    if (task) setPendingFocusId(task.id);
    invalidate();
  }

  async function handleUpdateGroupTitle(title: string) {
    if (title === group.title) return;
    await orpcClient.board.updateGroup({ groupId: group.id, title });
    invalidate();
  }

  async function handleColorChange(color: string) {
    setShowColorPicker(false);
    await orpcClient.board.updateGroup({ groupId: group.id, color });
    invalidate();
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-800 ${isDragging ? 'opacity-40' : ''}`}>
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 group/grphdr"
        style={{ borderLeft: `4px solid ${group.color}` }}
      >
        {/* Drag handle */}
        <span
          draggable
          onDragStart={onGroupDragStart}
          className="opacity-0 group-hover/grphdr:opacity-40 cursor-grab active:cursor-grabbing text-gray-400 select-none leading-none text-xs flex-shrink-0"
          title="Drag to reorder group"
        >
          ⠿
        </span>
        <button
          onClick={handleToggleCollapse}
          className="text-gray-500 hover:text-gray-300 transition-colors text-[10px] w-4 h-4 flex items-center justify-center flex-shrink-0"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        >
          {collapsed
            ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1l4 3-4 3"/></svg>
            : <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2l3 4 3-4"/></svg>
          }
        </button>
        <button
          ref={colorBtnRef}
          onClick={() => {
            setColorPickerRect(colorBtnRef.current?.getBoundingClientRect() ?? null);
            setShowColorPicker(s => !s);
          }}
          className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/10 hover:ring-white/40 transition-all"
          style={{ backgroundColor: group.color }}
          title="Change group color"
        />
        <EditableField
          value={group.title}
          onSave={handleUpdateGroupTitle}
          className="flex-1 text-sm font-semibold text-white bg-transparent outline-none min-w-0"
        />
        <span className="text-xs text-gray-500 flex-shrink-0">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleDeleteGroup}
          className="text-gray-600 hover:text-red-400 transition-colors text-base leading-none flex-shrink-0 px-1"
          aria-label="Delete group"
        >
          ×
        </button>
      </div>

      {showColorPicker && colorPickerRect && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onMouseDown={() => setShowColorPicker(false)} />
          <div
            className="fixed z-[101] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3"
            style={{ top: colorPickerRect.bottom + 6, left: colorPickerRect.left - 4 }}
          >
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Group color</p>
            <div className="flex gap-1.5 flex-wrap" style={{ width: 168 }}>
              {PALETTE.map(({ key, hex }) => (
                <button
                  key={key}
                  onClick={() => handleColorChange(hex)}
                  className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${group.color === hex ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800 scale-110' : ''}`}
                  style={{ backgroundColor: hex }}
                  title={key}
                />
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Task table */}
      {!collapsed && (
        <GroupTaskTable
          group={group}
          tasks={tasks}
          subitems={subitems}
          columns={columns}
          subitemColumns={subitemColumns}
          boardId={boardId}
          pendingFocusId={pendingFocusId}
          handleFocused={handleFocused}
          handleAddTask={handleAddTask}
          addColBtnRef={addColBtnRef}
          showColPicker={showColPicker}
          setShowColPicker={setShowColPicker}
          colPickerRect={colPickerRect}
          setColPickerRect={setColPickerRect}
        />
      )}
    </div>
  );
}

// ── GroupTaskTable ────────────────────────────────────────────────────────────
// Extracted to keep GroupSection readable; handles the task table + selection

interface GroupTaskTableProps {
  group: Group;
  tasks: Task[];
  subitems: Subitem[];
  columns: Column[];
  subitemColumns: Column[];
  boardId: string;
  pendingFocusId: string | null;
  handleFocused: () => void;
  handleAddTask: () => void;
  addColBtnRef: React.RefObject<HTMLButtonElement | null>;
  showColPicker: boolean;
  setShowColPicker: React.Dispatch<React.SetStateAction<boolean>>;
  colPickerRect: DOMRect | null;
  setColPickerRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
}

function GroupTaskTable({
  group, tasks, subitems, columns, subitemColumns, boardId,
  pendingFocusId, handleFocused, handleAddTask,
  addColBtnRef, showColPicker, setShowColPicker, colPickerRect, setColPickerRect,
}: GroupTaskTableProps) {
  const qc = useQueryClient();
  const { selectedTaskIds, selectAllTasks } = useSelectionStore();
  const { widths: colWidths, setWidth: setColWidth } = useColWidthsStore();

  // ── Task name column resize ────────────────────────────────────────────────
  const TASK_NAME_KEY = '__task_name__';
  const taskNameWidth = colWidths[TASK_NAME_KEY] ?? 200;
  const taskNameResizingRef = useRef(false);
  const [taskNameResizeHovered, setTaskNameResizeHovered] = useState(false);
  function handleTaskNameResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    taskNameResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = taskNameWidth;
    function onMouseMove(ev: MouseEvent) {
      setColWidth(TASK_NAME_KEY, Math.max(100, startWidth + ev.clientX - startX));
    }
    function onMouseUp() {
      taskNameResizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Local copies for optimistic reorder
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localCols, setLocalCols] = useState(columns);
  useEffect(() => setLocalTasks(tasks), [tasks]);
  useEffect(() => setLocalCols(columns), [columns]);

  // ── Task drag state ────────────────────────────────────────────────────────
  const [taskDragIdx, setTaskDragIdx] = useState<number | null>(null);
  const [taskDragOver, setTaskDragOver] = useState<number | null>(null);

  function onTaskDragStart(e: React.DragEvent, i: number) {
    e.stopPropagation();
    setTaskDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'task');
  }
  function onTaskDragOver(e: React.DragEvent, i: number) {
    if (taskDragIdx === null) return;
    e.preventDefault(); e.stopPropagation();
    setTaskDragOver(i);
  }
  async function onTaskDrop(e: React.DragEvent, toIdx: number) {
    e.stopPropagation();
    const fromIdx = taskDragIdx;
    setTaskDragIdx(null); setTaskDragOver(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...localTasks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setLocalTasks(next);
    await orpcClient.task.reorderTasks({ taskIds: next.map(t => t.id) });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }
  function onTaskDragEnd() { setTaskDragIdx(null); setTaskDragOver(null); }

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
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }
  function onColDragEnd() { setColDragIdx(null); setColDragOver(null); }

  const taskIds = localTasks.map(t => t.id);
  const allSelected = taskIds.length > 0 && taskIds.every(id => selectedTaskIds.has(id));
  const someSelected = taskIds.some(id => selectedTaskIds.has(id));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse table-fixed w-full min-w-full">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-800">
            <th className="px-3 py-2" style={{ width: 40 }}>
              <button
                onClick={() => selectAllTasks(taskIds, boardId)}
                className={`w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${
                  allSelected ? 'bg-violet-600 border-violet-600' :
                  someSelected ? 'border-violet-600 bg-transparent' :
                  'border-gray-700 hover:border-gray-500'
                }`}
                aria-label="Select all tasks in group"
              >
                {allSelected && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {someSelected && !allSelected && <span className="w-1.5 h-0.5 bg-violet-400 rounded" />}
              </button>
            </th>
            <th
              className="relative px-3 py-2 text-left text-sm text-gray-500 font-medium border-r border-gray-700 select-none"
              style={{ width: taskNameWidth }}
            >
              Task name
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors z-10"
                style={{ backgroundColor: taskNameResizeHovered ? `${group.color}66` : undefined }}
                onMouseEnter={() => setTaskNameResizeHovered(true)}
                onMouseLeave={() => setTaskNameResizeHovered(false)}
                onMouseDown={handleTaskNameResizeStart}
                onDragStart={e => e.preventDefault()}
              />
            </th>
            {localCols.map((col, colIdx) => (
              <ColumnHeader
                key={col.id}
                col={col}
                boardId={boardId}
                groupColor={group.color}
                isDragging={colDragIdx === colIdx}
                isDragTarget={colDragOver === colIdx && colDragIdx !== colIdx}
                onDragStart={e => onColDragStart(e, colIdx)}
                onDragOver={e => onColDragOver(e, colIdx)}
                onDragLeave={() => setColDragOver(null)}
                onDrop={e => onColDrop(e, colIdx)}
                onDragEnd={onColDragEnd}
              />
            ))}
            <th className="px-2 py-2 border-l border-gray-700">
              <button
                ref={addColBtnRef}
                onClick={() => {
                  setColPickerRect(addColBtnRef.current?.getBoundingClientRect() ?? null);
                  setShowColPicker(s => !s);
                }}
                className="text-gray-600 hover:text-gray-300 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
                title="Add column"
              >
                +
              </button>
              {showColPicker && (
                <ColumnPicker
                  boardId={boardId}
                  onCreated={() => {}}
                  onClose={() => setShowColPicker(false)}
                  anchorRect={colPickerRect}
                />
              )}
            </th>
            <th className="px-2 py-2" style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {localTasks.map((task, taskIdx) => (
            <TaskRow
              key={task.id}
              task={task}
              columns={localCols}
              subitems={subitems.filter(s => s.taskId === task.id)}
              subitemColumns={subitemColumns}
              boardId={boardId}
              groupColor={group.color}
              autoFocus={task.id === pendingFocusId}
              onFocused={handleFocused}
              isDragging={taskDragIdx === taskIdx}
              isDragTarget={taskDragOver === taskIdx && taskDragIdx !== taskIdx}
              onDragStart={e => onTaskDragStart(e, taskIdx)}
              onDragOver={e => onTaskDragOver(e, taskIdx)}
              onDragLeave={() => setTaskDragOver(null)}
              onDrop={e => onTaskDrop(e, taskIdx)}
              onDragEnd={onTaskDragEnd}
            />
          ))}
        </tbody>
      </table>
      <button
        onClick={handleAddTask}
        className="w-full text-left px-[46px] py-2 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors border-t border-gray-800/50"
      >
        + Add task
      </button>
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  columns: Column[];
  subitems: Subitem[];
  subitemColumns: Column[];
  boardId: string;
  groupColor: string;
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

function TaskRow({ task, columns, subitems, subitemColumns, boardId, groupColor, autoFocus, onFocused,
  isDragging, isDragTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: TaskRowProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExpanded = task.expanded === 1;
  const { toggleTask, isTaskSelected } = useSelectionStore();
  const selected = isTaskSelected(task.id);

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

  async function handleExpandToggle() {
    await orpcClient.task.updateTask({ taskId: task.id, expanded: !isExpanded });
    invalidate();
  }

  function handleNameChange(name: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await orpcClient.task.updateTask({ taskId: task.id, name });
      invalidate();
    }, 500);
  }

  async function handleFieldChange(colId: string, value: string) {
    const newFields = { ...task.fields, [colId]: value };
    await orpcClient.task.updateTaskFields({ taskId: task.id, fields: newFields });
    invalidate();
  }

  async function handleSetAsTitle(name: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (inputRef.current) inputRef.current.value = name;
    await orpcClient.task.updateTask({ taskId: task.id, name });
    invalidate();
  }

  async function handleDelete() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await orpcClient.task.deleteTask({ taskId: task.id });
    invalidate();
  }

  const colSpan = columns.length + 4;

  return (
    <>
      <tr
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`group/row border-b border-gray-800/50 transition-colors ${
          isDragging ? 'opacity-40' :
          isDragTarget ? 'bg-violet-900/20' :
          selected ? 'bg-violet-950/30' :
          'hover:bg-gray-800/30'
        }`}
      >
        {/* Grip handle + selection checkbox */}
        <td className="px-3 py-2 w-10 relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-30 cursor-grab active:cursor-grabbing text-gray-400 select-none leading-none text-xs pointer-events-none">⠿</span>
          <button
            onClick={() => toggleTask(task.id, boardId)}
            className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
              selected
                ? 'bg-violet-600 border-violet-600 opacity-100'
                : 'border-gray-600 opacity-0 group-hover/row:opacity-100'
            }`}
            aria-label={selected ? 'Deselect task' : 'Select task'}
          >
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </td>

        {/* Task name with expand toggle */}
        <td className="px-3 py-2 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={handleExpandToggle}
              className="text-gray-600 hover:text-gray-400 transition-colors text-[9px] w-3 h-3 flex items-center justify-center flex-shrink-0"
              aria-label={isExpanded ? 'Collapse subitems' : 'Expand subitems'}
            >
              {isExpanded
                ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2l3 4 3-4"/></svg>
                : <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1l4 3-4 3"/></svg>
              }
            </button>
            <input
              ref={inputRef}
              defaultValue={task.name}
              onChange={e => handleNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Backspace' && e.currentTarget.value === '') {
                  e.preventDefault();
                  handleDelete();
                }
              }}
              className="bg-transparent text-sm flex-1 min-w-0 outline-none placeholder-gray-600 text-white"
              placeholder="Task name"
            />
            {subitems.length > 0 && (
              <span className="flex-shrink-0 text-[10px] font-medium text-gray-500 bg-gray-800 rounded px-1.5 py-0.5 tabular-nums leading-none">
                {subitems.length}
              </span>
            )}
          </div>
        </td>

        {/* Custom column cells */}
        {columns.map((col, colIdx) => (
          <td key={col.id} className={`border-l p-0 ${colIdx === 0 ? 'border-gray-700' : 'border-gray-800/50'}`}>
            <CellRenderer
              col={col}
              value={task.fields?.[col.id] ?? ''}
              onChange={value => handleFieldChange(col.id, value)}
              allColumns={columns}
              rowFields={(task.fields as Record<string, string>) ?? {}}
              onSetTaskName={col.type === 'location' ? handleSetAsTitle : undefined}
            />
          </td>
        ))}

        {/* Add col spacer */}
        <td className="px-2 py-2 border-l border-gray-700" />

        {/* Delete */}
        <td className="px-2 py-2 w-8">
          <button
            onClick={handleDelete}
            className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover/row:opacity-100 text-base leading-none"
            aria-label="Delete task"
          >
            ×
          </button>
        </td>
      </tr>

      {/* Subitem table row */}
      {isExpanded && (
        <tr>
          <td colSpan={colSpan} className="p-0 overflow-hidden">
            <SubitemTable
              task={task}
              subitems={subitems}
              columns={subitemColumns}
              boardId={boardId}
              groupColor={groupColor}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── EditableField ─────────────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}

function EditableField({ value, onSave, className }: EditableFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.value = value;
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => onSave(e.target.value), 500);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onSave(e.target.value);
  }

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={className}
    />
  );
}
