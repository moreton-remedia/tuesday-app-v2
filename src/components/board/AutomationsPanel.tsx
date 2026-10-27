import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';
import type { automationTable, columnTable, groupTable, boardTable } from '@/database/schema';
import type { AutomationTrigger, AutomationAction } from '@/database/schema';

type Automation = typeof automationTable.$inferSelect;
type Column = typeof columnTable.$inferSelect;
type Group = typeof groupTable.$inferSelect;
type Board = typeof boardTable.$inferSelect;

interface AutomationsPanelProps {
  boardId: string;
  automations: Automation[];
  columns: Column[];
  groups: Group[];
  allBoards: Board[];
  onClose: () => void;
}

export function AutomationsPanel({ boardId, automations, columns, groups, allBoards, onClose }: AutomationsPanelProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);

  function invalidate() {
    qc.invalidateQueries(orpcUtils.board.getBoardData.queryOptions({ input: { boardId } }));
  }

  async function handleDelete(autoId: string) {
    if (!confirm('Delete this automation?')) return;
    await orpcClient.automation.deleteAutomation({ automationId: autoId });
    invalidate();
  }

  async function handleToggleEnabled(auto: Automation) {
    await orpcClient.automation.updateAutomation({ automationId: auto.id, enabled: auto.enabled !== 1 });
    invalidate();
  }

  async function handleDuplicate(auto: Automation) {
    const trigger = auto.trigger as AutomationTrigger;
    const name = trigger.automationName ? `Copy of ${trigger.automationName}` : undefined;
    await orpcClient.automation.createAutomation({
      boardId,
      trigger: { ...trigger, automationName: name },
      actions: auto.actions as AutomationAction[],
    });
    invalidate();
  }

  const triggerCols = columns.filter(c => c.type === 'status' || c.type === 'dropdown' || c.type === 'notes' || c.type === 'link');

  return (
    <>
      {createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onMouseDown={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-[201] w-96 bg-app-s1 border-l border-app-ln flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-ln">
          <h2 className="text-base font-semibold text-app-t1 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Automations
          </h2>
          <button onClick={onClose} className="text-app-t3 hover:text-app-t2 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {automations.length === 0 && (
            <p className="text-sm text-app-t3 text-center py-8">No automations yet. Add one to get started.</p>
          )}

          {automations.map(auto => (
            <AutomationCard
              key={auto.id}
              auto={auto}
              columns={columns}
              groups={groups}
              allBoards={allBoards}
              onEdit={() => setEditing(auto)}
              onDelete={() => handleDelete(auto.id)}
              onToggle={() => handleToggleEnabled(auto)}
              onDuplicate={() => handleDuplicate(auto)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <button
            onClick={() => setEditing('new')}
            className="w-full bg-app-ac hover:bg-app-ac/90 text-app-ac-tx text-sm font-medium py-2 rounded-lg transition-colors"
          >
            + Add automation
          </button>
        </div>
      </div>
    </>,
    document.body,
      )}
      <AutomationEditorModal
        editing={editing}
        boardId={boardId}
        triggerCols={triggerCols}
        columns={columns}
        groups={groups}
        allBoards={allBoards}
        onSave={() => { setEditing(null); invalidate(); }}
        onCancel={() => setEditing(null)}
      />
    </>
  );
}

// ── AutomationEditorModal ─────────────────────────────────────────────────────

function AutomationEditorModal({
  editing, boardId, triggerCols, columns, groups, allBoards, onSave, onCancel,
}: {
  editing: Automation | 'new' | null;
  boardId: string;
  triggerCols: Column[];
  columns: Column[];
  groups: Group[];
  allBoards: Board[];
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!editing) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[300] bg-black/50" onMouseDown={onCancel} />
      <div className="fixed inset-0 z-[301] flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-md mx-4 pointer-events-auto max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl bg-app-s1">
          <AutomationEditor
            automation={editing === 'new' ? null : editing}
            boardId={boardId}
            columns={triggerCols}
            allColumns={columns}
            groups={groups}
            allBoards={allBoards}
            onSave={onSave}
            onCancel={onCancel}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Inline token helpers ──────────────────────────────────────────────────────

/** A custom inline dropdown that matches the app's dark theme. */
function Token({
  value, onChange, options, variant = 'default', placeholder = '…', disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
  variant?: 'default' | 'accent';
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.key === value);
  const displayLabel = selected?.label ?? <span className="opacity-50">{placeholder}</span>;

  const textCls = variant === 'accent' ? 'text-app-ac' : 'text-app-t1';
  const borderCls = variant === 'accent'
    ? 'border-app-ac/60 hover:border-app-ac'
    : 'border-app-ln hover:border-app-t3';
  const arrowCls = variant === 'accent' ? 'text-app-ac/70' : 'text-app-t3';

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  function handleClick() {
    if (disabled) return;
    setRect(btnRef.current?.getBoundingClientRect() ?? null);
    setSearch('');
    setOpen(s => !s);
  }

  function handleClose() {
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={disabled}
        className={`inline-flex items-center gap-0.5 border-b pb-px mx-0.5 text-sm font-medium transition-colors align-baseline disabled:opacity-40 disabled:cursor-default ${textCls} ${borderCls}`}
      >
        {displayLabel}
        <span className={`text-[7px] leading-none ml-0.5 ${arrowCls}`}>▾</span>
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[300]" onMouseDown={handleClose} />
          <div
            className="fixed z-[301] bg-app-s1 border border-app-ln rounded-lg shadow-xl overflow-hidden"
            style={{ top: rect.bottom + 6, left: rect.left, minWidth: 160 }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="px-2 pt-2 pb-1 border-b border-app-ln">
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-app-s2 text-xs text-app-t1 rounded px-2 py-1 outline-none placeholder-app-t3/50 border border-app-ln focus:border-app-t3"
              />
            </div>
            {/* Options list */}
            <div className="py-1 max-h-52 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-app-t3/50">No matches</p>
              )}
              {filtered.map(opt => (
                <button
                  key={opt.key}
                  onMouseDown={() => { onChange(opt.key); handleClose(); }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-app-s2 ${
                    opt.key === value
                      ? variant === 'accent' ? 'text-app-ac font-medium' : 'text-app-t1 font-medium'
                      : 'text-app-t2'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** A plain text input styled as an underlined inline word inside a sentence. */
function TextToken({ value, onChange, placeholder = '…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent border-b border-app-ln text-app-t1 text-sm font-medium outline-none pb-px mx-0.5 w-28 placeholder-app-t3/50 hover:border-app-t3 transition-colors align-baseline"
    />
  );
}

// ── AutomationCard ────────────────────────────────────────────────────────────

function AutomationCard({
  auto, columns, groups, allBoards, onEdit, onDelete, onToggle, onDuplicate,
}: {
  auto: Automation;
  columns: Column[];
  groups: Group[];
  allBoards: Board[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const triggerCol = columns.find(c => c.id === auto.trigger.colId);
  function valueLabel(col: Column | undefined, val: string) {
    if (col?.type === 'status') return col.statusOptions?.find(o => o.key === val)?.label ?? val;
    return val;
  }

  // For link-changes triggers: resolve the linked column's human-readable label
  // by lazily fetching the source board's column list.
  const isLinkTrigger = auto.trigger.type === 'link-changes';
  const { data: srcBoardData } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({
      input: { boardId: triggerCol?.sourceBoardId ?? '' },
    }),
    enabled: isLinkTrigger && !!triggerCol?.sourceBoardId,
  });
  const linkedColLabel = isLinkTrigger
    ? (srcBoardData?.columns.find(c => c.id === auto.trigger.linkedColId)?.label
        ?? auto.trigger.linkedColId
        ?? '…')
    : null;

  // For extra conditions with link columns: fetch the source board to resolve linked col labels.
  const extraConditions = auto.trigger.extraConditions ?? [];
  const firstExtraLinkCol = (() => {
    for (const cond of extraConditions) {
      if (cond.linkedColId !== undefined) {
        const col = columns.find(c => c.id === cond.colId);
        if (col?.sourceBoardId) return col;
      }
    }
    return null;
  })();
  const { data: extraSrcBoardData } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({
      input: { boardId: firstExtraLinkCol?.sourceBoardId ?? '' },
    }),
    enabled: !!firstExtraLinkCol?.sourceBoardId,
  });

  function describeAction(action: AutomationAction) {
    switch (action.type) {
      case 'set-status':
      case 'set-dropdown': {
        const col = columns.find(c => c.id === action.colId);
        return `set ${col?.label ?? '…'} to "${action.value}"`;
      }
      case 'move-to-group': {
        const group = groups.find(g => g.id === action.groupId);
        const board = action.destBoardId ? allBoards.find(b => b.id === action.destBoardId) : null;
        return board
          ? `move to "${group?.title ?? '…'}" on "${board.name}"`
          : `move to "${group?.title ?? '…'}"`;
      }
      case 'copy-to': {
        const group = groups.find(g => g.id === action.groupId);
        const board = action.destBoardId ? allBoards.find(b => b.id === action.destBoardId) : null;
        return board
          ? `copy item to "${group?.title ?? '…'}" on "${board.name}"`
          : `copy item to "${group?.title ?? '…'}"`;
      }
      case 'create-subitem':
        return `create subitem${action.name ? ` "${action.name}"` : ''}`;
      default:
        return action.type;
    }
  }

  const scope = auto.trigger.scope ?? 'all';

  return (
    <div className={`rounded-xl border overflow-hidden ${auto.enabled === 1 ? 'bg-app-s2/60 border-app-ln' : 'bg-app-s2/30 border-app-ln/50 opacity-50'}`}>
      {/* Card header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-app-ln/50">
        <span className="text-xs font-semibold text-app-t2 truncate">
          {auto.trigger.automationName || 'Automation'}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={onToggle}
            className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${auto.enabled === 1 ? 'bg-app-ac' : 'bg-app-s3'}`}
            title={auto.enabled === 1 ? 'Disable' : 'Enable'}
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${auto.enabled === 1 ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          <button onClick={onDuplicate} className="text-app-t3 hover:text-app-t2 p-1 transition-colors" title="Duplicate">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button onClick={onEdit} className="text-app-t3 hover:text-app-t2 p-1" title="Edit">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={onDelete} className="text-app-t3/30 hover:text-app-dg p-1 transition-colors" title="Delete">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>
      </div>
      {/* Card body */}
      <div className="px-3 py-2.5 space-y-0.5">
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 text-[9px] font-bold tracking-widest text-app-ac bg-app-ac/15 px-1.5 py-0.5 rounded mt-0.5 uppercase">IF</span>
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm text-app-t3 leading-relaxed">
              <span className="text-app-t1 font-medium">{scope} </span>
              <span className="text-app-t1 font-medium">{triggerCol?.label ?? '…'}</span>
              {auto.trigger.type === 'link-changes' ? (
                <>
                  {' linked item '}
                  <span className="text-app-t2">{linkedColLabel ?? '…'} </span>
                  <span className="text-app-t3">{auto.trigger.linkedOp === 'contains' ? 'contains ' : 'is '}</span>
                  <span className="text-app-ac font-medium">{auto.trigger.linkedValue ?? '…'}</span>
                </>
              ) : (
                <>
                  {auto.trigger.type === 'text-contains' ? ' contains ' : ' changes to '}
                  <span className="text-app-ac font-medium">{auto.trigger.value}</span>
                </>
              )}
            </p>
            {extraConditions.map((cond, i) => {
              const col = columns.find(c => c.id === cond.colId);
              // Use the saved per-condition connector; fall back to scope for old automations
              const connLabel = cond.connector
                ? (cond.connector === 'or' ? 'Or' : 'And')
                : (scope === 'any' ? 'Or' : 'And');
              if (cond.linkedColId !== undefined) {
                const srcData = (col?.sourceBoardId === firstExtraLinkCol?.sourceBoardId)
                  ? extraSrcBoardData
                  : undefined;
                const lbl = srcData?.columns.find(c => c.id === cond.linkedColId)?.label
                  ?? cond.linkedColId ?? '…';
                return (
                  <p key={i} className="text-sm text-app-t3">
                    <span className="text-app-t2 font-medium">{connLabel}</span>{' '}
                    <span className="text-app-t2">{col?.label ?? '…'}</span>
                    {' linked item '}
                    <span className="text-app-t2">{lbl} </span>
                    <span className="text-app-t3">{(cond.linkedOp ?? 'eq') === 'contains' ? 'contains ' : 'is '}</span>
                    <span className="text-app-ac/70">{cond.linkedValue ?? '…'}</span>
                  </p>
                );
              }
              return (
                <p key={i} className="text-sm text-app-t3">
                  <span className="text-app-t2 font-medium">{connLabel}</span>{' '}
                  <span className="text-app-t2">{col?.label ?? '…'}</span>
                  {cond.op === 'contains' ? ' contains ' : ' is '}
                  <span className="text-app-ac/70">{cond.value}</span>
                </p>
              );
            })}
          </div>
        </div>
        <div className="pl-[26px] text-app-t3/40 text-xs leading-none py-0.5">↓</div>
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 text-[9px] font-bold tracking-widest text-app-ac bg-app-ac/15 px-1 py-0.5 rounded mt-0.5 uppercase">THEN</span>
          <div className="space-y-0.5 min-w-0">
            {auto.actions.map((a, i) => (
              <p key={i} className="text-sm text-app-t3">{describeAction(a)}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AutomationEditor ──────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { type: 'set-status',     label: 'set status' },
  { type: 'set-dropdown',   label: 'set dropdown' },
  { type: 'move-to-group',  label: 'move to group' },
  { type: 'copy-to',        label: 'copy item to' },
  { type: 'create-subitem', label: 'create subitem' },
] as const;

type ConditionDraft = {
  colId: string;
  value: string;
  // For extra conditions loaded from DB:
  op?: 'eq' | 'contains';
  /** How this condition joins the previous one (idx > 0 only). */
  connector?: 'and' | 'or';
  // For link-changes triggers:
  linkedColId?: string;
  linkedValue?: string;
  linkedOp?: 'eq' | 'contains';
};
type ActionDraft = {
  type: AutomationAction['type'];
  colId: string; value: string;
  groupId: string; boardId: string; name: string;
};

function emptyAction(boardId: string): ActionDraft {
  return { type: 'set-status', colId: '', value: '', groupId: '', boardId, name: '' };
}

function AutomationEditor({
  automation, boardId, columns, allColumns, groups, allBoards, onSave, onCancel,
}: {
  automation: Automation | null;
  boardId: string;
  columns: Column[];
  allColumns: Column[];
  groups: Group[];
  allBoards: Board[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const initial = automation;

  const [autoName, setAutoName] = useState(() => initial?.trigger.automationName ?? '');

  const [scope, setScope] = useState<'any' | 'all'>(() => initial?.trigger.scope ?? 'all');

  const [conditions, setConditions] = useState<ConditionDraft[]>(() => {
    if (!initial) return [{ colId: columns[0]?.id ?? '', value: '' }];
    const savedScope = initial.trigger.scope ?? 'all';
    return [
      {
        colId: initial.trigger.colId,
        value: initial.trigger.value,
        linkedColId: initial.trigger.linkedColId,
        linkedValue: initial.trigger.linkedValue,
        linkedOp: initial.trigger.linkedOp,
      },
      // Restore per-condition connectors; fall back to scope for old automations
      ...(initial.trigger.extraConditions ?? []).map(c => ({
        colId: c.colId,
        value: c.value,
        op: c.op,
        connector: (c.connector ?? (savedScope === 'any' ? 'or' : 'and')) as 'and' | 'or',
        linkedColId: c.linkedColId,
        linkedValue: c.linkedValue,
        linkedOp: c.linkedOp,
      })),
    ];
  });

  const [actions, setActions] = useState<ActionDraft[]>(() =>
    initial?.actions.length
      ? initial.actions.map(a => ({
          type: a.type,
          colId: a.colId ?? '',
          value: a.value ?? '',
          groupId: a.groupId ?? '',
          boardId: a.destBoardId ?? boardId,
          name: a.name ?? '',
        }))
      : [emptyAction(boardId)],
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateCondition(idx: number, patch: Partial<ConditionDraft>) {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function removeCondition(idx: number) {
    setConditions(prev => prev.filter((_, i) => i !== idx));
  }
  function addCondition() {
    // New condition defaults to the connector implied by the current scope,
    // but can be toggled independently afterwards.
    const connector: 'and' | 'or' = scope === 'any' ? 'or' : 'and';
    setConditions(prev => [...prev, { colId: columns[0]?.id ?? '', value: '', connector }]);
  }

  function updateAction(idx: number, patch: Partial<ActionDraft>) {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
  }
  function removeAction(idx: number) {
    setActions(prev => prev.filter((_, i) => i !== idx));
  }
  function addAction() {
    setActions(prev => [...prev, emptyAction(boardId)]);
  }

  const canSave =
    conditions.every(c => {
      const col = allColumns.find(col => col.id === c.colId);
      if (col?.type === 'link') return !!(c.colId && c.linkedColId && c.linkedValue);
      return !!(c.colId && c.value);
    }) &&
    actions.every(a => {
      if (a.type === 'set-status' || a.type === 'set-dropdown') return !!(a.colId && a.value);
      if (a.type === 'move-to-group' || a.type === 'copy-to') return !!a.groupId;
      return true; // create-subitem, create-task: name can be empty
    });

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const [primary, ...extras] = conditions;
      const primaryCol = allColumns.find(c => c.id === primary!.colId);
      const triggerType: AutomationTrigger['type'] =
        primaryCol?.type === 'status' ? 'status-changes-to' :
        primaryCol?.type === 'notes'  ? 'text-contains' :
        primaryCol?.type === 'link'   ? 'link-changes' :
        'dropdown-changes-to';
      const trigger: AutomationTrigger = {
        type: triggerType,
        colId: primary!.colId,
        value: primaryCol?.type === 'link' ? '' : (primary!.value ?? ''),
        ...(autoName ? { automationName: autoName } : {}),
        ...(primaryCol?.type === 'link' ? {
          linkedColId: primary!.linkedColId,
          linkedValue: primary!.linkedValue,
          linkedOp: primary!.linkedOp ?? 'eq',
        } : {}),
        ...(extras.length > 0 ? {
          extraConditions: extras.map(e => {
            const eCol = allColumns.find(c => c.id === e.colId);
            const isLinkExtra = eCol?.type === 'link';
            const op: 'eq' | 'contains' = eCol?.type === 'notes' ? 'contains' : 'eq';
            const connector: 'and' | 'or' = e.connector ?? (scope === 'any' ? 'or' : 'and');
            return {
              colId: e.colId,
              value: isLinkExtra ? '' : (e.value ?? ''),
              op,
              connector,
              ...(isLinkExtra ? {
                linkedColId: e.linkedColId,
                linkedValue: e.linkedValue,
                linkedOp: e.linkedOp ?? 'eq',
              } : {}),
            };
          }),
        } : {}),
        scope,
      };
      const builtActions: AutomationAction[] = actions.map(a =>
        a.type === 'set-status' || a.type === 'set-dropdown'
          ? { type: a.type, colId: a.colId, value: a.value }
          : (a.type === 'move-to-group' || a.type === 'copy-to')
          ? { type: a.type, groupId: a.groupId, destBoardId: a.boardId }
          : { type: a.type, name: a.name },
      );

      if (initial) {
        await orpcClient.automation.updateAutomation({ automationId: initial.id, trigger, actions: builtActions });
      } else {
        await orpcClient.automation.createAutomation({ boardId, trigger, actions: builtActions });
      }
      onSave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save automation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-app-ac/30 overflow-hidden">
      {/* ── Title ── */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-app-ln/60 bg-app-s2/80">
        <p className="text-sm font-semibold text-app-ac">
          {initial ? 'Edit Automation' : 'New Automation'}
        </p>
      </div>

      {/* ── Name ── */}
      <div className="px-4 py-2.5 flex items-center gap-3 border-b border-app-ln/40 bg-app-s2/60">
        <span className="text-xs text-app-t3 w-9 flex-shrink-0">Name</span>
        <input
          value={autoName}
          onChange={e => setAutoName(e.target.value)}
          placeholder="Automation name…"
          className="flex-1 bg-transparent text-sm text-app-t1 outline-none placeholder-app-t3/50 border-b border-transparent focus:border-app-t3 pb-0.5 transition-colors"
        />
      </div>

      {/* ── IF ── */}
      <div className="px-4 py-3.5 flex items-start gap-3 bg-app-s2/40">
        <span className="flex-shrink-0 bg-app-ac text-app-ac-tx text-[10px] font-bold tracking-widest px-2.5 py-1 rounded mt-1 uppercase">
          IF
        </span>
        <div className="flex-1 min-w-0">
          <div className="space-y-1.5">
            {conditions.map((cond, idx) => (
              <ConditionRow
                key={idx}
                cond={cond}
                idx={idx}
                scope={scope}
                showScope={idx === 0}
                onScopeChange={setScope}
                columns={columns}
                allColumns={allColumns}
                canRemove={conditions.length > 1}
                onChange={patch => updateCondition(idx, patch)}
                onRemove={() => removeCondition(idx)}
              />
            ))}
          </div>
          <button
            onClick={addCondition}
            className="mt-2.5 flex items-center gap-1 text-xs text-app-t3/60 hover:text-app-t2 transition-colors"
          >
            <span className="text-sm leading-none">+</span> Add condition
          </button>
        </div>
      </div>

      {/* ── Arrow ── */}
      <div className="text-center text-app-t3/50 text-base leading-none py-1 bg-app-s2/40">↓</div>

      {/* ── THEN ── */}
      <div className="px-4 py-3.5 flex items-start gap-3 bg-app-s2/40">
        <span className="flex-shrink-0 bg-app-ac text-app-ac-tx text-[10px] font-bold tracking-widest px-1.5 py-1 rounded mt-1 uppercase">
          THEN
        </span>
        <div className="flex-1 min-w-0">
          <div className="space-y-1.5">
            {actions.map((action, idx) => (
              <ActionRow
                key={idx}
                action={action}
                boardId={boardId}
                allColumns={allColumns}
                groups={groups}
                allBoards={allBoards}
                canRemove={actions.length > 1}
                onChange={patch => updateAction(idx, patch)}
                onRemove={() => removeAction(idx)}
              />
            ))}
          </div>
          <button
            onClick={addAction}
            className="mt-2.5 flex items-center gap-1 text-xs text-app-t3/60 hover:text-app-t2 transition-colors"
          >
            <span className="text-sm leading-none">+</span> Add step
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      {saveError && (
        <div className="px-4 py-2.5 bg-app-dg/10 border-t border-app-dg/40 text-sm text-app-dg flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5">⚠</span>
          <span>{saveError}</span>
        </div>
      )}
      <div className="px-4 py-3 flex justify-end gap-2 border-t border-app-ln/60 bg-app-s2/80">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm text-app-t3 hover:text-app-t1 bg-app-s3 hover:bg-app-s3/80 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="px-4 py-1.5 text-sm text-app-ac-tx font-medium bg-app-ac hover:bg-app-ac/90 disabled:opacity-40 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── ConditionRow ──────────────────────────────────────────────────────────────

function ConditionRow({ cond, idx, scope = 'all', showScope = false, onScopeChange, columns, allColumns, canRemove, onChange, onRemove }: {
  cond: ConditionDraft;
  idx: number;
  /** Only used for the scope Token on the first row and as a fallback for display. */
  scope?: 'any' | 'all';
  showScope?: boolean;
  onScopeChange?: (s: 'any' | 'all') => void;
  columns: Column[];
  allColumns: Column[];
  canRemove: boolean;
  onChange: (patch: Partial<ConditionDraft>) => void;
  onRemove: () => void;
}) {
  const col = allColumns.find(c => c.id === cond.colId);
  const isLink = col?.type === 'link';
  const isText = col?.type === 'notes';
  const valueOptions =
    col?.type === 'status'   ? (col.statusOptions ?? []).map(o => ({ key: o.key,   label: o.label })) :
    col?.type === 'dropdown' ? (col.options ?? []).map(o => ({ key: o.label, label: o.label })) : [];

  // For link columns: lazily fetch imported columns from the source board
  const { data: srcBoardData } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: col?.sourceBoardId! } }),
    enabled: isLink && !!col?.sourceBoardId,
  });
  const importedCols = isLink
    ? (srcBoardData?.columns ?? []).filter(c => (col?.importCols ?? []).includes(c.id))
    : [];
  const linkedCol = srcBoardData?.columns.find(c => c.id === cond.linkedColId);
  const linkedValueOptions =
    linkedCol?.type === 'status'   ? (linkedCol.statusOptions ?? []).map(o => ({ key: o.key,   label: o.label })) :
    linkedCol?.type === 'dropdown' ? (linkedCol.options ?? []).map(o => ({ key: o.label, label: o.label })) : [];
  // Only determine text-vs-dropdown AFTER linkedCol has loaded.
  // If we check before loading, linkedValueOptions is [] for ALL column types,
  // which would wrongly show a TextToken with the raw saved key (e.g. "k1") for
  // status/dropdown columns — the user clears it thinking it's broken, then after
  // data loads the dropdown can't find their typed label, and appears blank.
  const linkedIsText = !!linkedCol && (
    linkedCol.type === 'notes' ||
    cond.linkedOp === 'contains' ||
    linkedValueOptions.length === 0   // date, link, or any type with no discrete options
  );

  const fieldOptions = importedCols.map(c => ({ key: c.id, label: c.label }));

  // The connector for this condition: use saved value, fall back to scope for display
  const connector = idx > 0 ? (cond.connector ?? (scope === 'any' ? 'or' : 'and')) : null;

  return (
    <div className="flex items-baseline gap-1">
      {idx > 0 && (
        <button
          onClick={() => onChange({ connector: connector === 'or' ? 'and' : 'or' })}
          className="text-xs font-semibold mr-1 flex-shrink-0 px-1.5 py-0.5 rounded border transition-colors cursor-pointer select-none border-app-ln text-app-t2 hover:border-app-ac hover:text-app-ac hover:bg-app-ac/10"
          title="Click to toggle And / Or"
        >
          {connector === 'or' ? 'Or' : 'And'}
        </button>
      )}
      <p className="text-sm text-app-t3 leading-8 flex-1 flex flex-wrap items-baseline">
        {showScope && (
          <Token
            value={scope}
            onChange={v => onScopeChange?.(v as 'any' | 'all')}
            options={[{ key: 'all', label: 'all' }, { key: 'any', label: 'any' }]}
          />
        )}{showScope && ' '}
        <Token
          value={cond.colId}
          onChange={v => onChange({ colId: v, value: '', linkedColId: undefined, linkedValue: undefined, linkedOp: undefined })}
          options={columns.map(c => ({ key: c.id, label: c.label }))}
          placeholder="column"
        />

        {/* ── Link column ── */}
        {isLink && !col?.sourceBoardId && (
          <span className="text-xs text-amber-500/80 mx-1">
            (configure source board in column settings)
          </span>
        )}
        {isLink && col?.sourceBoardId && (col?.importCols ?? []).length === 0 && (
          <span className="text-xs text-amber-500/80 mx-1">
            (no import columns selected — edit column settings)
          </span>
        )}
        {isLink && col?.sourceBoardId && (col?.importCols ?? []).length > 0 && (
          <>
            <span className="mx-0.5">linked item</span>
            {/* Hide interactive tokens until source board data has loaded.
                Showing them while loading would display raw saved keys (e.g. "k1")
                in the TextToken, which users edit thinking something is wrong,
                causing the saved value to be lost when the dropdown loads. */}
            {!srcBoardData ? (
              <span className="text-xs text-gray-500 italic mx-1">loading…</span>
            ) : (
              <>
                <Token
                  value={cond.linkedColId ?? ''}
                  onChange={v => onChange({ linkedColId: v, linkedValue: '', linkedOp: 'eq' })}
                  options={fieldOptions}
                  placeholder="field"
                />
                <Token
                  value={cond.linkedOp ?? 'eq'}
                  onChange={v => onChange({ linkedOp: v as 'eq' | 'contains' })}
                  options={[{ key: 'eq', label: 'is' }, { key: 'contains', label: 'contains' }]}
                />
                {linkedIsText ? (
                  <TextToken
                    value={cond.linkedValue ?? ''}
                    onChange={v => onChange({ linkedValue: v })}
                    placeholder="text…"
                  />
                ) : (
                  <Token
                    value={cond.linkedValue ?? ''}
                    onChange={v => onChange({ linkedValue: v })}
                    options={linkedValueOptions}
                    variant="accent"
                    placeholder="value"
                    disabled={!cond.linkedColId}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* ── Non-link columns ── */}
        {!isLink && (
          <>
            {isText ? ' contains ' : ' changes to '}
            {isText ? (
              <TextToken value={cond.value} onChange={v => onChange({ value: v })} placeholder="text…" />
            ) : (
              <Token
                value={cond.value}
                onChange={v => onChange({ value: v })}
                options={valueOptions}
                variant="accent"
                placeholder="value"
                disabled={!cond.colId || valueOptions.length === 0}
              />
            )}
          </>
        )}
      </p>
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-app-t3/40 hover:text-app-dg flex-shrink-0 ml-1 transition-colors"
          title="Remove condition"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
        </button>
      )}
    </div>
  );
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({ action, boardId, allColumns, groups, allBoards, canRemove, onChange, onRemove }: {
  action: ActionDraft;
  boardId: string;
  allColumns: Column[];
  groups: Group[];
  allBoards: Board[];
  canRemove: boolean;
  onChange: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
}) {
  const isMoveToCurrentBoard = action.boardId === boardId;

  const { data: remoteBoardData, isFetching: fetchingGroups } = useQuery({
    ...orpcUtils.board.getBoardData.queryOptions({ input: { boardId: action.boardId } }),
    enabled: (action.type === 'move-to-group' || action.type === 'copy-to') && !isMoveToCurrentBoard,
  });

  const moveTargetGroups: Group[] = isMoveToCurrentBoard ? groups : (remoteBoardData?.groups ?? []);

  const actionCol = allColumns.find(c => c.id === action.colId);
  const actionValueOptions =
    actionCol?.type === 'status'   ? (actionCol.statusOptions ?? []).map(o => ({ key: o.key,   label: o.label })) :
    actionCol?.type === 'dropdown' ? (actionCol.options ?? []).map(o => ({ key: o.label, label: o.label })) : [];

  return (
    <div className="flex items-baseline gap-1">
      <p className="text-sm text-app-t3 leading-8 flex-1 flex flex-wrap items-baseline">
        <Token
          value={action.type}
          onChange={v => onChange({ type: v as ActionDraft['type'], colId: '', value: '', groupId: '' })}
          options={ACTION_TYPES.map(a => ({ key: a.type, label: a.label }))}
        />

        {(action.type === 'set-status' || action.type === 'set-dropdown') && (
          <>
            <span className="mx-0.5">of</span>
            <Token
              value={action.colId}
              onChange={v => onChange({ colId: v, value: '' })}
              options={allColumns
                .filter(c => c.type === (action.type === 'set-status' ? 'status' : 'dropdown'))
                .map(c => ({ key: c.id, label: c.label }))}
              placeholder="column"
            />
            <span className="mx-0.5">to</span>
            <Token
              value={action.value}
              onChange={v => onChange({ value: v })}
              options={actionValueOptions}
              variant="accent"
              placeholder="value"
              disabled={!action.colId}
            />
          </>
        )}

        {(action.type === 'move-to-group' || action.type === 'copy-to') && (
          <>
            <span className="mx-0.5">to</span>
            <Token
              value={action.groupId}
              onChange={v => onChange({ groupId: v })}
              options={moveTargetGroups.map(g => ({ key: g.id, label: g.title }))}
              variant="accent"
              placeholder={fetchingGroups ? 'loading…' : 'group'}
              disabled={fetchingGroups}
            />
            <span className="mx-0.5">on</span>
            <Token
              value={action.boardId}
              onChange={v => onChange({ boardId: v, groupId: '' })}
              options={allBoards.map(b => ({ key: b.id, label: b.id === boardId ? `${b.name} (this board)` : b.name }))}
            />
          </>
        )}

        {action.type === 'create-subitem' && (
          <>
            <span className="mx-0.5">named</span>
            <TextToken value={action.name} onChange={v => onChange({ name: v })} placeholder="subitem name" />
          </>
        )}
      </p>
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-app-t3/40 hover:text-app-dg flex-shrink-0 ml-1 transition-colors"
          title="Remove action"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
        </button>
      )}
    </div>
  );
}
