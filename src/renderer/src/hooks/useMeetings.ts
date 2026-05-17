import type { Meeting } from "../../../main/types";

/**
 * Placeholder hook for meetings data.
 * Returns empty array until meetings IPC channels are wired up.
 */
export function useMeetings(): Meeting[] {
  // TODO: wire to window.flint.getMeetings() when IPC is added
  return [];
}
