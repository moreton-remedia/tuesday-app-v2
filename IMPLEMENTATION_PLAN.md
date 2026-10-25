# Tuesday App — Migration Implementation Plan

Porting the original single-file `index.html` app to a full TanStack Start application with auth, database, and multi-user sync.

**Current status:** Scaffold complete — auth, workspace setup, board list, full DB schema, and all oRPC procedures are working. The board *view* (groups + tasks + columns + interactions) is the remaining work.

---

## Phase 0 — Foundation (DONE)

- [x] TanStack Start scaffold
- [x] Better Auth (email/password)
- [x] Drizzle schema: `user`, `session`, `account`, `workspace`, `workspace_member`, `board`, `group`, `task`, `subitem`, `column`, `automation`
- [x] oRPC procedures for all CRUD operations
- [x] Login / Register / Workspace setup pages
- [x] Board sidebar with create-board flow
- [x] PGlite local DB with auto-migration
- [x] Production build passes, zero type errors

---

## Phase 1 — Board View Skeleton (~2-3h)

The minimum to see a board on screen and add/edit tasks. No custom columns yet.

### 1.1 Layout components (`src/components/board/`)
- `BoardHeader.tsx` — board name (editable), workspace name, sign out
- `Sidebar.tsx` — extract from `_authenticated/app/index.tsx`, reusable across board pages
- `GroupSection.tsx` — collapsible group with color stripe, title, delete button
- `TaskTable.tsx` — table with checkbox/name columns, "Add task" row
- `TaskRow.tsx` — task row with checkbox, expand toggle, editable name

### 1.2 Wire CRUD with React Query mutations
For each entity:
- `useCreateTask`, `useUpdateTask`, `useDeleteTask` hooks
- On mutation success: `qc.invalidateQueries(['board.getBoardData', boardId])`
- Optimistic updates for fast UI feel (name edits, checkbox toggles)

### 1.3 Real-time sync (basic — polling)
- `useQuery` with `refetchInterval: 5000` on board data
- Disable refetch while user is actively typing (track `isFocused` state)
- This is a placeholder — Phase 6 swaps to WebSockets

### 1.4 Inline editing
- `contentEditable` spans for task/group names (matches original behavior)
- Debounce save by 500ms
- Enter blurs, Shift+Enter inserts new row below
- Backspace on empty name deletes row

**Deliverable:** Click a board → see groups with tasks → add/rename/delete groups and tasks → changes persist across page reloads.

---

## Phase 2 — Custom Columns (~4-5h)

The most complex feature. Five column types, each with its own header UI and cell renderer.

### 2.1 Column infrastructure
- `ColumnPickerPopover.tsx` — "+" button at right of header opens picker with 5 type cards
- `ColumnHeader.tsx` — editable label, delete (×) button, gear icon for type-specific config
- Column drag-to-reorder (using `position` field)
- `useCreateColumn`, `useUpdateColumn`, `useDeleteColumn` mutations

### 2.2 Cell renderers (`src/components/columns/`)
| Type | Component | Interaction |
|---|---|---|
| `notes` | `NotesCell.tsx` | Click → expandable textarea, blur → save |
| `dropdown` | `DropdownCell.tsx` | Click → popover with options |
| `date` | `DateCell.tsx` | Click → `<input type="date">` |
| `status` | `StatusCell.tsx` | Click → status picker, cycles through configured statuses |
| `link` | `LinkCell.tsx` | Click → 3-step config modal (board → item → import cols) |

### 2.3 Config popovers
- `DropdownOptionEditor.tsx` — list of options, add/delete, drag-to-reorder, color picker per option
- `StatusOptionEditor.tsx` — same shape as dropdown but with required color per option
- `LinkConfigModal.tsx` — 3 steps:
  1. Pick source board
  2. Pick item from that board (searchable list)
  3. Pick columns to import (with preview from selected item)

### 2.4 Link column virtual columns
- For each `importCols` entry, render an additional read-only `<th>` after the link column
- Read-only cells display the imported value from the linked item
- Pull data from `getBoardData` for the source board (additional query)
- Match the `↗ Label` styling from the original

**Deliverable:** Full column system at feature parity with the original app.

---

## Phase 3 — Subitems & Nested Tables (~2-3h)

### 3.1 Expand/collapse
- `task.expanded` field already in schema
- Toggle button in task name cell
- When expanded, render `SubitemTable` nested below the task row

### 3.2 `SubitemTable.tsx`
- Mirror of `TaskTable` but for subitems
- Uses `board.subitemColumns` for its own column set
- Its own "+" button for adding subitem columns
- Independent column picker targeting `subitemColumns`

### 3.3 Subitem CRUD
- Add/edit/delete subitem rows (mutations already exist)
- Custom column cells work the same as task cells (shared cell components)

**Deliverable:** Tasks can be expanded to show nested subitem tables, each with their own columns.

---

## Phase 4 — Bulk Selection & Actions (~2h)

### 4.1 Selection state
- Global Zustand store or React context: `selectedIds: Set<string>`
- Header checkbox: select all / indeterminate / none
- Per-row checkboxes
- Cleared when switching boards

### 4.2 Selection bar (fixed bottom)
- Appears when `selectedIds.size > 0`
- Shows count
- Actions: Mark done, Move to group, Move to board, Duplicate, Delete, Clear selection
- Uses `deleteTasks` / `deleteSubitems` bulk procedures

### 4.3 Bulk field edits
- When changing a status/dropdown/date on a selected row, apply to all selected
- Needs a new bulk procedure: `updateTaskFieldsBulk({ taskIds, colId, value })`
- Trigger automations once per affected task (preserving the "ALL subitems" fix from the original)

**Deliverable:** Multi-select rows and bulk-edit fields, matching the original.

---

## Phase 5 — Automations (~3-4h)

### 5.1 Automation editor UI
- `AutomationsPanel.tsx` — slide-in panel from right, lists existing automations
- "Add automation" button opens sentence builder
- Sentence builder: tokens for "When [trigger column] changes to [value]" + "[action]"
- Token components: dropdown selects styled as inline pills

### 5.2 Automation engine (server-side)
- After any field update on a task/subitem, run automations on the server
- Move `_processSingleAutomation` logic into oRPC procedures
- Recursive queue (same pattern as original) for chain reactions
- The "ALL subitems" scope check runs against the current DB state — easier on the server since updates are transactional

### 5.3 Action types to support
- `set-status` / `set-dropdown` — set a field on parent task or subitem
- `move-to-group` — change `task.groupId`
- `copy-to` — clone task to another board/group
- `create-task` / `create-subitem` — insert new row

**Deliverable:** Automations fire on field changes, including bulk updates and the "ALL subitems" case.

---

## Phase 6 — Real-Time Sync (~3-4h)

Replace polling with proper push.

### 6.1 Server-Sent Events (recommended)
- New oRPC procedure: `board.subscribe({ boardId })` returns a stream
- Server keeps a per-board Map of active subscriber controllers
- On any mutation, broadcast `{ type: 'invalidate', boardId }` to all subscribers
- Client connects on board mount, disconnects on unmount
- Received event → `qc.invalidateQueries(['board.getBoardData', boardId])`

### 6.2 Connection management
- Reconnect with exponential backoff on drop
- Show "Reconnecting…" indicator
- Cleanup on unmount

### 6.3 Presence (optional polish)
- Broadcast cursor positions / who's viewing the board
- Small avatar stack in board header

**Deliverable:** When user A changes a status, user B sees it within 100ms without refreshing.

---

## Phase 7 — Polish & Parity (~2-3h)

### 7.1 Drag-and-drop
- `@dnd-kit/sortable` for groups, tasks within group, subitems
- Update `position` field on drop
- Visual drop indicator matching original

### 7.2 Themes
- Move CSS variables from original into Tailwind v4 config
- Theme switcher with preset themes (Indigo Nights, etc.)
- Store user theme preference in DB (`user.theme` column)

### 7.3 Group/board colors
- Color picker popover (reuse `GroupColorPicker.tsx` pattern from original)
- Apply to `--group-color` CSS variable per group

### 7.4 Column resizing
- Mouse-down on column edge → drag to resize
- Persist `taskColWidth`, `checkColWidth`, `subitemNameColWidth` per group in `group.settings`

### 7.5 Keyboard shortcuts
- Cmd/Ctrl+K — quick board switcher
- Esc — clear selection / close popover
- Cmd/Ctrl+A — select all in current group

**Deliverable:** Full visual and interaction parity with the original.

---

## Phase 8 — Deployment (~1-2h)

### 8.1 Production database
- Provision Postgres (Neon, Supabase, or Railway — Neon has best free tier)
- Set `DATABASE_URL` in production env
- Run `bun run drizzle:migrate` against prod DB

### 8.2 Hosting
- Vercel or Railway for Bun-compatible TanStack Start apps
- Set env vars: `BETTER_AUTH_SECRET`, `BASE_URL`, `TRUSTED_ORIGINS`, `DATABASE_URL`
- Configure custom domain (optional)

### 8.3 CI/CD
- GitHub Action: on push to `main` → lint → type-check → build → deploy
- Auto-deploy preview for PRs

**Deliverable:** Live production app at a real URL, multi-user sync, password-protected per workspace.

---

## Estimated Total: ~20-25 hours of focused work

Phases 1-3 get you to a functional clone of the original.
Phases 4-5 add the power features.
Phases 6-7 deliver the multi-user dream.
Phase 8 ships it.

---

## Open Questions / Future Considerations

- **Invitations:** Currently anyone authenticated can join a workspace by slug. Add proper invite codes/email invites?
- **Permissions:** All members currently have equal access. Add role-based controls (admin can delete boards, member cannot)?
- **History/undo:** The audit-logging module is enabled but not surfaced. Build an undo UI?
- **Mobile:** The original was desktop-only. Responsive design needed?
- **File attachments:** A common column type for boards like this. Worth adding?
- **Filtering / views:** Filter by status, group by column value, kanban view?

These are not blockers — they can be added incrementally after parity is reached.
