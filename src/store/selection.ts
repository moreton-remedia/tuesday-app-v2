import { create } from 'zustand';

interface SelectionState {
  selectedTaskIds: Set<string>;
  selectedSubitemIds: Set<string>;
  boardId: string | null;
  toggleTask: (taskId: string, boardId: string) => void;
  toggleSubitem: (subitemId: string, boardId: string) => void;
  selectAllTasks: (taskIds: string[], boardId: string) => void;
  selectAllSubitems: (subitemIds: string[], boardId: string) => void;
  clearSelection: () => void;
  deselectItems: (taskIds: string[], subitemIds: string[]) => void;
  isTaskSelected: (taskId: string) => boolean;
  isSubitemSelected: (subitemId: string) => boolean;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedTaskIds: new Set(),
  selectedSubitemIds: new Set(),
  boardId: null,

  toggleTask: (taskId, boardId) => {
    set(state => {
      const ids = state.boardId === boardId ? new Set(state.selectedTaskIds) : new Set<string>();
      if (ids.has(taskId)) ids.delete(taskId);
      else ids.add(taskId);
      return { selectedTaskIds: ids, boardId };
    });
  },

  toggleSubitem: (subitemId, boardId) => {
    set(state => {
      const ids = state.boardId === boardId ? new Set(state.selectedSubitemIds) : new Set<string>();
      if (ids.has(subitemId)) ids.delete(subitemId);
      else ids.add(subitemId);
      return { selectedSubitemIds: ids, boardId };
    });
  },

  selectAllTasks: (taskIds, boardId) => {
    set(state => {
      const current = state.boardId === boardId ? state.selectedTaskIds : new Set<string>();
      const allSelected = taskIds.every(id => current.has(id));
      const next = new Set(current);
      if (allSelected) taskIds.forEach(id => next.delete(id));
      else taskIds.forEach(id => next.add(id));
      return { selectedTaskIds: next, boardId };
    });
  },

  selectAllSubitems: (subitemIds, boardId) => {
    set(state => {
      const current = state.boardId === boardId ? state.selectedSubitemIds : new Set<string>();
      const allSelected = subitemIds.every(id => current.has(id));
      const next = new Set(current);
      if (allSelected) subitemIds.forEach(id => next.delete(id));
      else subitemIds.forEach(id => next.add(id));
      return { selectedSubitemIds: next, boardId };
    });
  },

  clearSelection: () => set({ selectedTaskIds: new Set(), selectedSubitemIds: new Set(), boardId: null }),

  deselectItems: (taskIds, subitemIds) => {
    set(state => {
      const nextTaskIds = new Set(state.selectedTaskIds);
      const nextSubitemIds = new Set(state.selectedSubitemIds);
      taskIds.forEach(id => nextTaskIds.delete(id));
      subitemIds.forEach(id => nextSubitemIds.delete(id));
      return { selectedTaskIds: nextTaskIds, selectedSubitemIds: nextSubitemIds };
    });
  },

  isTaskSelected: (taskId) => get().selectedTaskIds.has(taskId),
  isSubitemSelected: (subitemId) => get().selectedSubitemIds.has(subitemId),
}));
