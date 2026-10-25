import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ColWidthsState {
  widths: Record<string, number>;
  setWidth: (colId: string, width: number) => void;
}

export const useColWidthsStore = create<ColWidthsState>()(
  persist(
    set => ({
      widths: {},
      setWidth: (colId, width) =>
        set(state => ({ widths: { ...state.widths, [colId]: width } })),
    }),
    { name: 'col-widths' },
  ),
);
