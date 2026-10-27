import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'react';
import { orpcUtils, orpcClient } from '@/rpc/react';
import { signOut, useSession } from '@/common/auth-client';
import { Sidebar } from '@/components/board/Sidebar';
import { GroupSection } from '@/components/board/GroupSection';
import { BulkActionBar } from '@/components/board/BulkActionBar';
import { AutomationsPanel } from '@/components/board/AutomationsPanel';
import { useSelectionStore } from '@/store/selection';
import type { boardTable, groupTable, taskTable, subitemTable, columnTable, automationTable } from '@/database/schema';

type BoardData = {
  board: typeof boardTable.$inferSelect;
  groups: Array<typeof groupTable.$inferSelect>;
  tasks: Array<typeof taskTable.$inferSelect>;
  subitems: Array<typeof subitemTable.$inferSelect>;
  columns: Array<typeof columnTable.$inferSelect>;
  automations: Array<typeof automationTable.$inferSelect>;
};

export const Route = createFileRoute('/_authenticated/app/board/$boardId')({
  loader: async ({ context, params }) => {
    // prefetchQuery silently ignores auth failures during SSR; client re-fetches on hydration
    await Promise.allSettled([
      context.queryClient.prefetchQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(orpcUtils.board.listBoards.queryOptions({ input: {} })),
      context.queryClient.prefetchQuery(
        orpcUtils.board.getBoardData.queryOptions({ input: { boardId: params.boardId } }),
      ),
    ]);
  },
  component: BoardPage,
});

const GROUP_COLORS = ['#4263eb', '#37b24d', '#f76707', '#e03131', '#ae3ec9', '#1098ad'];

function BoardPage() {
  const { boardId } = Route.useParams();
  const { data } = useSuspenseQuery(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  const { data: boards } = useSuspenseQuery(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  const { data: workspace } = useSuspenseQuery(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
  const { data: workspaces } = useSuspenseQuery(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} }));
  const session = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const [showAutomations, setShowAutomations] = useState(false);

  // Clear selection when switching boards
  useEffect(() => { clearSelection(); }, [boardId]);

  // On load (and board switch), check whether any tasks already satisfy an
  // automation's trigger condition and fire pending actions (e.g. create missing
  // subitems, copy items that were added while the app was closed).
  useEffect(() => {
    orpcClient.task.checkBoardAutomations({ boardId }).catch(() => {});
  }, [boardId]);

  // Real-time sync via SSE
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1_000;

    function connect() {
      es = new EventSource(`/api/board-events/${boardId}`);
      es.onopen = () => { retryDelay = 1_000; };
      es.addEventListener('update', () => {
        qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
      });
      es.onerror = () => {
        es?.close();
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          connect();
        }, retryDelay);
      };
    }

    connect();
    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [boardId]);

  async function handleSignOut() {
    await signOut();
    await router.navigate({ to: '/login' });
  }

  async function handleAddGroup() {
    const color = GROUP_COLORS[data.groups.length % GROUP_COLORS.length];
    await orpcClient.board.createGroup({ boardId, title: 'New Group', color });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  async function handleUpdateBoardName(name: string) {
    if (name === data.board.name) return;
    await orpcClient.board.updateBoard({ boardId, name });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
    qc.invalidateQueries(orpcUtils.board.listBoards.queryOptions({ input: {} }));
  }

  return (
    <div className="flex h-screen bg-app-bg overflow-hidden">
      <Sidebar
        boards={boards ?? []}
        workspaces={workspaces ?? []}
        activeWorkspaceId={workspace?.id ?? ''}
        workspaceName={workspace?.name ?? ''}
        inviteToken={workspace?.inviteToken ?? ''}
        userName={session.data?.user.name ?? ''}
        onSignOut={handleSignOut}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Board header */}
        <div className="border-b border-app-ln px-6 py-4 bg-app-bg flex items-center gap-3 flex-shrink-0">
          <BoardNameInput key={boardId} value={data.board.name} onSave={handleUpdateBoardName} />
          <button
            onClick={() => setShowAutomations(true)}
            className="ml-auto flex items-center gap-1.5 text-[13px] text-app-t3 hover:text-app-t1 px-3 py-1.5 rounded-lg hover:bg-app-ln-s"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Automations</span>
            {data.automations.length > 0 && (
              <span className="bg-app-ac text-app-ac-tx text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {data.automations.length}
              </span>
            )}
          </button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <GroupList data={data} boardId={boardId} />
          <button
            onClick={handleAddGroup}
            className="flex items-center gap-2 text-[13px] text-app-t3 hover:text-app-t2 py-1.5 px-2.5 rounded-lg hover:bg-app-ln-s"
          >
            <span className="text-base leading-none font-light">+</span>
            Add group
          </button>
        </div>
      </div>
      <BulkActionBar boardId={boardId} groups={data.groups} boards={boards ?? []} />
      {showAutomations && (
        <AutomationsPanel
          boardId={boardId}
          automations={data.automations}
          columns={data.columns}
          groups={data.groups}
          allBoards={boards ?? []}
          onClose={() => setShowAutomations(false)}
        />
      )}
    </div>
  );
}

// ── GroupList — group-level drag-to-reorder ───────────────────────────────────

function GroupList({ data, boardId }: { data: BoardData; boardId: string }) {
  const qc = useQueryClient();
  const [localGroups, setLocalGroups] = useState(data.groups);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => setLocalGroups(data.groups), [data.groups]);

  const taskColumns = data.columns.filter(c => c.scope === 'task');
  const subitemColumns = data.columns.filter(c => c.scope === 'subitem');

  function handleDragStart(e: React.DragEvent, i: number) {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'group');
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    if (dragIdx === null) return;
    e.preventDefault();
    setDragOver(i);
  }

  async function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDragOver(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...localGroups];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setLocalGroups(next);
    await orpcClient.board.reorderGroups({ groupIds: next.map(g => g.id) });
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  function handleDragEnd() { setDragIdx(null); setDragOver(null); }

  return (
    <>
      {localGroups.map((group, i) => {
        const groupTasks = data.tasks.filter(t => t.groupId === group.id);
        const taskIds = new Set(groupTasks.map(t => t.id));
        return (
          <div
            key={group.id}
            onDragOver={e => handleDragOver(e, i)}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={dragOver === i && dragIdx !== i ? 'ring-2 ring-app-ac rounded-xl' : undefined}
          >
            <GroupSection
              group={group}
              tasks={groupTasks}
              subitems={data.subitems.filter(s => taskIds.has(s.taskId))}
              columns={taskColumns}
              subitemColumns={subitemColumns}
              boardId={boardId}
              allBoardTasks={data.tasks}
              isDragging={dragIdx === i}
              onGroupDragStart={e => handleDragStart(e, i)}
            />
          </div>
        );
      })}
    </>
  );
}

function BoardNameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => onSave(e.target.value), 500);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (e.target.value.trim()) onSave(e.target.value.trim());
    else if (inputRef.current) inputRef.current.value = value; // revert if empty
  }

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          if (inputRef.current) inputRef.current.value = value;
          e.currentTarget.blur();
        }
      }}
      className="text-xl font-semibold bg-transparent outline-none min-w-0 flex-1 max-w-lg text-app-t1 placeholder:text-app-t3"
      aria-label="Board name"
    />
  );
}
