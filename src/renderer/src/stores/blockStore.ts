import { create } from "zustand";
import type { FlintBlock, PillState } from "../../../main/lib/blocks";
import { derivePillState } from "../../../main/lib/blocks";

interface BlockState {
  activeBlock: FlintBlock | null;
  previousPillState: PillState;
  setActiveBlock: (block: FlintBlock) => void;
  clearActiveBlock: () => void;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  activeBlock: null,
  previousPillState: "briefing",
  setActiveBlock: (block) => {
    const current = get();
    const currentPillState = derivePillState(current.activeBlock, false);
    set({
      activeBlock: block,
      previousPillState: currentPillState,
    });
  },
  clearActiveBlock: () => {
    set({ activeBlock: null });
  },
}));
