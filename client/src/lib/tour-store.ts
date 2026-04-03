import { create } from 'zustand';

interface TourStore {
  activeTourHighlight: string | null;
  isTourActive: boolean;
  setTourHighlight: (id: string | null) => void;
  setTourActive: (active: boolean) => void;
}

export const useTourStore = create<TourStore>((set) => ({
  activeTourHighlight: null,
  isTourActive: false,
  setTourHighlight: (id) => set({ activeTourHighlight: id }),
  setTourActive: (active) => set({ isTourActive: active }),
}));
