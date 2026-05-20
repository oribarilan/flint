const cache = new Map<string, string[]>();

export type PrepStatus = "ready" | "empty" | "pending";

/** Cache AI prep results for a meeting. */
export function cachePrepData(meetingId: string, items: string[]): void {
  cache.set(meetingId, items);
}

/** Retrieve cached prep data. Returns null if no data cached. */
export function getPrepData(meetingId: string): string[] | null {
  return cache.get(meetingId) ?? null;
}

/** Check whether prep data exists for a meeting. */
export function hasPrepData(meetingId: string): boolean {
  return cache.has(meetingId);
}

/**
 * Get the prep status for a meeting.
 * - `"ready"` — prepped with material
 * - `"empty"` — prepped but nothing relevant found
 * - `"pending"` — not yet prepped
 */
export function getPrepStatus(meetingId: string): PrepStatus {
  const data = cache.get(meetingId);
  if (data === undefined) return "pending";
  return data.length > 0 ? "ready" : "empty";
}

/** Clear all cached prep data. */
export function clearPrepData(): void {
  cache.clear();
}

/**
 * Remove prep entries for meetings no longer in the active set.
 * Returns the number of entries removed.
 */
export function cleanupExpiredPrep(activeMeetingIds: Set<string>): number {
  let removed = 0;
  for (const id of [...cache.keys()]) {
    if (!activeMeetingIds.has(id)) {
      cache.delete(id);
      removed++;
    }
  }
  return removed;
}
