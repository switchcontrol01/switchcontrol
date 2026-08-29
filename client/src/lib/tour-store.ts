import { create } from 'zustand';

interface TourStore {
  activeTourHighlight: string | null;
  isTourActive: boolean;
  /** True while the tour is driving a route change and AppLayout must suppress page transitions. */
  isTourNavigating: boolean;
  setTourHighlight: (id: string | null) => void;
  setTourActive: (active: boolean) => void;
  /** Set to true before navigate(); cleared by AppLayout's onAnimationComplete. */
  setTourNavigating: (navigating: boolean) => void;
}

export const useTourStore = create<TourStore>((set, get) => ({
  activeTourHighlight: null,
  isTourActive: false,
  isTourNavigating: false,
  setTourHighlight: (id) => set({ activeTourHighlight: id }),
  setTourActive: (active) => set({ isTourActive: active }),
  setTourNavigating: (navigating) => {
    // Guard: skip the set (and the resulting re-render) if already at that value.
    if (get().isTourNavigating !== navigating) {
      set({ isTourNavigating: navigating });
    }
  },
}));

// TourShell can be removed directly by a parent flow change (for example,
// sign-out) without ever rendering once with show=false. Keep a synchronous
// reset available for those unmount paths so the sidebar cannot remain dimmed
// or locked behind an orphaned portal.
export function clearTourState() {
  useTourStore.setState({
    activeTourHighlight: null,
    isTourActive: false,
    isTourNavigating: false,
  });
}
