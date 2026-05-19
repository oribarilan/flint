# Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background AI heartbeat that generates meeting prep and proactive notifications alongside the deterministic MeetingScheduler.

**Architecture:** A `Heartbeat` module owns a `flint-monitor` Copilot session, beats every 10 minutes, generates prep via `cache_meeting_prep` tool, and fires native notifications for proactive alerts. The existing `MeetingScheduler` handles timing; the heartbeat handles content. A shared `prepCache` module bridges them.

**Tech Stack:** Copilot SDK (`@github/copilot-sdk`), Electron Notification API, Vitest, Work IQ MCP

---

### Task 1: Extract Prep Cache Module

**Files:**
- Create: `src/main/heartbeat/prep-cache.ts`
- Create: `src/main/__tests__/prep-cache.test.ts`
- Modify: `src/main/window/spotlight-window.ts:9-14` (remove inline cache, import from prep-cache)
- Modify: `src/main/index.ts:10` (update import path for cachePrepData)

- [ ] **Step 1: Write failing tests for prep-cache**

```typescript
// src/main/__tests__/prep-cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  cachePrepData,
  getPrepData,
  hasPrepData,
  clearPrepData,
  cleanupExpiredPrep,
} from "../heartbeat/prep-cache";

describe("prep-cache", () => {
  beforeEach(() => {
    clearPrepData();
  });

  it("returns null for unknown meeting", () => {
    expect(getPrepData("unknown")).toBeNull();
  });

  it("stores and retrieves prep data", () => {
    cachePrepData("m1", ["bullet 1", "bullet 2"]);
    expect(getPrepData("m1")).toEqual(["bullet 1", "bullet 2"]);
    expect(hasPrepData("m1")).toBe(true);
  });

  it("overwrites existing prep data", () => {
    cachePrepData("m1", ["old"]);
    cachePrepData("m1", ["new"]);
    expect(getPrepData("m1")).toEqual(["new"]);
  });

  it("clears all data", () => {
    cachePrepData("m1", ["a"]);
    cachePrepData("m2", ["b"]);
    clearPrepData();
    expect(hasPrepData("m1")).toBe(false);
    expect(hasPrepData("m2")).toBe(false);
  });

  it("cleanupExpiredPrep removes entries not in active set", () => {
    cachePrepData("m1", ["a"]);
    cachePrepData("m2", ["b"]);
    cachePrepData("m3", ["c"]);
    const removed = cleanupExpiredPrep(new Set(["m1", "m3"]));
    expect(removed).toBe(1);
    expect(hasPrepData("m1")).toBe(true);
    expect(hasPrepData("m2")).toBe(false);
    expect(hasPrepData("m3")).toBe(true);
  });

  it("cleanupExpiredPrep returns 0 when all entries are active", () => {
    cachePrepData("m1", ["a"]);
    const removed = cleanupExpiredPrep(new Set(["m1"]));
    expect(removed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/prep-cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement prep-cache module**

```typescript
// src/main/heartbeat/prep-cache.ts

const cache = new Map<string, string[]>();

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/prep-cache.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Update spotlight-window.ts to use prep-cache**

In `src/main/window/spotlight-window.ts`, remove the inline cache and import from prep-cache:

Remove lines 9-14 (the `prepCache` Map and `cachePrepData` function):
```typescript
// REMOVE these lines:
const prepCache = new Map<string, string[]>();
export function cachePrepData(meetingId: string, items: string[]): void {
  prepCache.set(meetingId, items);
}
```

Add import at top:
```typescript
import { getPrepData } from "../heartbeat/prep-cache";
```

Update line 64 to use `getPrepData` instead of `prepCache.get`:
```typescript
// Change:
const prepItems = options.showPrep ? (prepCache.get(meeting.id) ?? null) : null;
// To:
const prepItems = options.showPrep ? getPrepData(meeting.id) : null;
```

Remove the `cachePrepData` export from this file entirely — it now comes from `prep-cache.ts`.

- [ ] **Step 6: Update index.ts import**

In `src/main/index.ts`, change the import:
```typescript
// Change:
import { showSpotlight, registerSpotlightHandlers, getSpotlightWindow, cachePrepData } from "./window/spotlight-window";
// To:
import { showSpotlight, registerSpotlightHandlers, getSpotlightWindow } from "./window/spotlight-window";
import { cachePrepData, hasPrepData } from "./heartbeat/prep-cache";
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions from the import change)

- [ ] **Step 8: Commit**

```bash
git add src/main/heartbeat/prep-cache.ts src/main/__tests__/prep-cache.test.ts src/main/window/spotlight-window.ts src/main/index.ts
git commit -m "refactor: extract prep cache to shared module"
```

---

### Task 2: Config Changes

**Files:**
- Modify: `src/main/types.ts:19-34` (add heartbeatEnabled to FlintConfig)
- Modify: `src/main/types.ts:36-51` (add to DEFAULT_CONFIG)
- Modify: `src/main/config.ts:42-53` (add migration 0.8.0)
- Modify: `src/main/config.ts:60-87` (add to getAll)

- [ ] **Step 1: Add heartbeatEnabled to FlintConfig and DEFAULT_CONFIG**

In `src/main/types.ts`, add to the `FlintConfig` interface after `spotlightPrep`:
```typescript
  heartbeatEnabled: boolean;
```

In `DEFAULT_CONFIG`, add after `spotlightPrep: true`:
```typescript
  heartbeatEnabled: true,
```

- [ ] **Step 2: Add config migration 0.8.0**

In `src/main/config.ts`, add after the `"0.7.0"` migration:
```typescript
      "0.8.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety
        if (s.get("heartbeatEnabled") === undefined) {
          s.set("heartbeatEnabled", DEFAULT_CONFIG.heartbeatEnabled);
        }
      },
```

- [ ] **Step 3: Add heartbeatEnabled to getAll()**

In `src/main/config.ts` `getAll()`, add after `spotlightPrep`:
```typescript
        heartbeatEnabled: store.get("heartbeatEnabled", DEFAULT_CONFIG.heartbeatEnabled),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/main/types.ts src/main/config.ts
git commit -m "feat: add heartbeatEnabled config field"
```

---

### Task 3: Heartbeat System Prompt and Prompt Builder

**Files:**
- Create: `src/main/copilot/prompts/heartbeat.md`
- Modify: `src/main/copilot/system-prompt.ts:1,8-10` (add heartbeat prompt import + registry)
- Create: `src/main/heartbeat/prompt-builder.ts`
- Create: `src/main/__tests__/heartbeat-prompt-builder.test.ts`

- [ ] **Step 1: Create heartbeat system prompt**

```markdown
<!-- src/main/copilot/prompts/heartbeat.md -->
# Role

You are Flint's background monitor. You run periodically to help the user stay prepared for their work day.

# Tools

- **cache_meeting_prep** (custom tool). Save prep notes for an upcoming meeting. Call with the meeting ID and an array of 3-5 concise bullet strings.
- **show_notification** (custom tool). Send a native OS notification. Use sparingly: only for genuinely time-sensitive or actionable items.
- **Work IQ** (`@microsoft/workiq` MCP). Read-only access to the user's M365 data: calendar, email, Teams messages, documents, people. Use this for context when generating prep.

# Meeting prep

For any meeting starting within the next 30 minutes that has not already been prepped:

1. Query Work IQ for relevant context: recent emails about the topic, related Teams messages, attendee info
2. Generate 3-5 concise bullet points covering:
   - What the meeting is about (agenda, topic, purpose)
   - Who is attending and any relevant context about them
   - Anything the user should prepare or be aware of
   - Recent related activity (emails, messages) if available
3. Call `cache_meeting_prep` with the meeting ID and your bullets

If Work IQ is unavailable, generate prep from the meeting metadata alone (title, attendees, agenda field).

# Proactive alerts

Check for situations worth notifying the user about:

- Meeting conflicts or double-bookings
- An important meeting with no agenda set
- Back-to-back meetings with no breaks
- A meeting starting very soon (< 5 min) that the user might not be ready for

Only fire `show_notification` for items that are actionable and time-sensitive. When in doubt, do not notify. The user's focus is sacred.

# Constraints

- Never send more than 2 notifications per beat.
- Never generate prep for meetings in the `already_prepped` list.
- Be concise. Bullet points, not paragraphs.
- If there is nothing to prep and nothing to flag, do nothing. A quiet beat is a good beat.
- Never use emojis.
```

- [ ] **Step 2: Register heartbeat prompt in system-prompt.ts**

In `src/main/copilot/system-prompt.ts`, add the import:
```typescript
import heartbeatPromptRaw from "./prompts/heartbeat.md?raw";
```

Update the `PROMPTS` registry:
```typescript
const PROMPTS = {
  chat: chatPromptRaw,
  heartbeat: heartbeatPromptRaw,
} as const;
```

- [ ] **Step 3: Write failing tests for prompt builder**

```typescript
// src/main/__tests__/heartbeat-prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildBeatPrompt, buildPrepPrompt } from "../heartbeat/prompt-builder";
import type { Meeting } from "../types";

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    title: "Design Review",
    startTime: "2026-05-19T14:00:00Z",
    endTime: "2026-05-19T15:00:00Z",
    attendees: ["Alice", "Bob"],
    organizer: "Alice",
    ...overrides,
  };
}

describe("buildBeatPrompt", () => {
  const now = new Date("2026-05-19T13:45:00Z");

  it("includes current time", () => {
    const prompt = buildBeatPrompt([], new Set(), now);
    expect(prompt).toContain("2026-05-19T13:45:00");
  });

  it("shows 'none' when no meetings are prepped", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(), now);
    expect(prompt).toContain("Already prepped: none");
  });

  it("lists prepped meeting IDs", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(["m1"]), now);
    expect(prompt).toContain("Already prepped: m1");
  });

  it("includes meeting details", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(), now);
    expect(prompt).toContain('"m1"');
    expect(prompt).toContain('"Design Review"');
    expect(prompt).toContain("2 attendees");
  });

  it("filters out all-day meetings", () => {
    const meeting = makeMeeting({ isAllDay: true, title: "Holiday" });
    const prompt = buildBeatPrompt([meeting], new Set(), now);
    expect(prompt).not.toContain("Holiday");
  });

  it("handles empty meeting list", () => {
    const prompt = buildBeatPrompt([], new Set(), now);
    expect(prompt).toContain("No meetings today");
  });

  it("pluralizes attendee count correctly for singular", () => {
    const meeting = makeMeeting({ attendees: ["Alice"] });
    const prompt = buildBeatPrompt([meeting], new Set(), now);
    expect(prompt).toContain("1 attendee");
    expect(prompt).not.toContain("1 attendees");
  });
});

describe("buildPrepPrompt", () => {
  const now = new Date("2026-05-19T13:45:00Z");

  it("includes meeting ID and title", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain('"m1"');
    expect(prompt).toContain('"Design Review"');
  });

  it("includes current time", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain("2026-05-19T13:45:00");
  });

  it("instructs to call cache_meeting_prep", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain("cache_meeting_prep");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/heartbeat-prompt-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement prompt builder**

```typescript
// src/main/heartbeat/prompt-builder.ts
import type { Meeting } from "../types";

/** Build the user prompt for a periodic heartbeat beat. */
export function buildBeatPrompt(meetings: Meeting[], preppedIds: Set<string>, now: Date): string {
  const timeStr = now.toISOString();
  const preppedList = preppedIds.size > 0 ? [...preppedIds].join(", ") : "none";

  if (meetings.length === 0) {
    return [
      `Current time: ${timeStr}`,
      `Already prepped: ${preppedList}`,
      "",
      "No meetings today. Check if there is anything else the user should know about.",
    ].join("\n");
  }

  const meetingLines = meetings
    .filter((m) => !m.isAllDay)
    .map((m) => {
      const start = new Date(m.startTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const end = new Date(m.endTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const n = m.attendees.length;
      return `- ID: "${m.id}" | "${m.title}" | ${start} – ${end} | ${String(n)} attendee${n !== 1 ? "s" : ""}`;
    })
    .join("\n");

  return [
    `Current time: ${timeStr}`,
    `Already prepped: ${preppedList}`,
    "",
    `Today's meetings:`,
    meetingLines,
    "",
    "Check for meetings needing prep. Flag anything the user should know about.",
  ].join("\n");
}

/** Build a focused prompt for on-demand prep of a single meeting. */
export function buildPrepPrompt(meeting: Meeting, now: Date): string {
  const start = new Date(meeting.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(meeting.endTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const n = meeting.attendees.length;

  return [
    `Current time: ${now.toISOString()}`,
    "",
    "Prepare the user for this meeting:",
    `- ID: "${meeting.id}" | "${meeting.title}" | ${start} – ${end} | ${String(n)} attendee${n !== 1 ? "s" : ""}`,
    "",
    "Generate 3-5 prep bullets and call cache_meeting_prep.",
  ].join("\n");
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/heartbeat-prompt-builder.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/copilot/prompts/heartbeat.md src/main/copilot/system-prompt.ts src/main/heartbeat/prompt-builder.ts src/main/__tests__/heartbeat-prompt-builder.test.ts
git commit -m "feat: add heartbeat system prompt and prompt builder"
```

---

### Task 4: Monitor Tools and Permissions

**Files:**
- Create: `src/main/heartbeat/tools.ts`
- Create: `src/main/__tests__/heartbeat-tools.test.ts`
- Modify: `src/main/copilot/permissions.ts:10-16` (add cache_meeting_prep to allow-list)

- [ ] **Step 1: Write failing tests for heartbeat tools**

```typescript
// src/main/__tests__/heartbeat-tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation((opts: { title: string; body: string }) => ({
    title: opts.title,
    body: opts.body,
    show: vi.fn(),
  })),
}));

import { createHeartbeatTools } from "../heartbeat/tools";
import { getPrepData, clearPrepData } from "../heartbeat/prep-cache";

describe("heartbeat tools", () => {
  beforeEach(() => {
    clearPrepData();
  });

  describe("cache_meeting_prep", () => {
    it("caches prep items for a meeting", async () => {
      const tools = createHeartbeatTools();
      const tool = tools.find((t) => t.name === "cache_meeting_prep")!;
      const result = await tool.handler({ meetingId: "m1", items: ["bullet 1", "bullet 2"] });
      expect(result).toBe("cached");
      expect(getPrepData("m1")).toEqual(["bullet 1", "bullet 2"]);
    });

    it("caps items at 10", async () => {
      const tools = createHeartbeatTools();
      const tool = tools.find((t) => t.name === "cache_meeting_prep")!;
      const items = Array.from({ length: 15 }, (_, i) => `item ${String(i)}`);
      await tool.handler({ meetingId: "m1", items });
      expect(getPrepData("m1")).toHaveLength(10);
    });

    it("rejects empty items", async () => {
      const tools = createHeartbeatTools();
      const tool = tools.find((t) => t.name === "cache_meeting_prep")!;
      const result = await tool.handler({ meetingId: "m1", items: [] });
      expect(result).toBe("error: invalid arguments");
    });

    it("rejects missing meetingId", async () => {
      const tools = createHeartbeatTools();
      const tool = tools.find((t) => t.name === "cache_meeting_prep")!;
      const result = await tool.handler({ meetingId: "", items: ["a"] });
      expect(result).toBe("error: invalid arguments");
    });
  });

  describe("show_notification", () => {
    it("creates and shows a notification", async () => {
      const tools = createHeartbeatTools();
      const tool = tools.find((t) => t.name === "show_notification")!;
      const result = await tool.handler({ title: "Flint", body: "test" });
      expect(result).toBe("shown");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/heartbeat-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement heartbeat tools**

```typescript
// src/main/heartbeat/tools.ts
import { Notification } from "electron";
import { defineTool, type Tool } from "@github/copilot-sdk";
import { cachePrepData } from "./prep-cache";

/** Create the tools available to the heartbeat monitor session. */
export function createHeartbeatTools(): Tool[] {
  const cacheMeetingPrep = defineTool("cache_meeting_prep", {
    description: "Save AI-generated prep notes for an upcoming meeting.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to prep" },
        items: {
          type: "array",
          items: { type: "string" },
          description: "3-5 concise prep bullet points",
        },
      },
      required: ["meetingId", "items"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { meetingId, items } = args as { meetingId: string; items: unknown[] };
      if (!meetingId || !Array.isArray(items) || items.length === 0) {
        return "error: invalid arguments";
      }
      const capped = items
        .slice(0, 10)
        .map((s) => (typeof s === "string" ? s.slice(0, 2000) : ""));
      cachePrepData(meetingId, capped);
      console.log(`[heartbeat] Cached ${String(capped.length)} prep items for ${meetingId}`);
      return "cached";
    },
  });

  const showNotification = defineTool("show_notification", {
    description: "Show a native OS notification. Use sparingly — only for time-sensitive items.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title", "body"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { title, body } = args as { title: string; body: string };
      const notification = new Notification({ title, body });
      notification.show();
      return "shown";
    },
  });

  return [cacheMeetingPrep, showNotification];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/heartbeat-tools.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add cache_meeting_prep to permissions auto-approve list**

In `src/main/copilot/permissions.ts`, add `"cache_meeting_prep"` to `AUTO_APPROVE_CUSTOM_TOOLS`:

```typescript
const AUTO_APPROVE_CUSTOM_TOOLS = new Set<string>([
  "set_attention_items",
  "show_overlay",
  "show_notification",
  "show_meeting",
  "join_meeting",
  "cache_meeting_prep",
]);
```

- [ ] **Step 6: Run typecheck and existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/main/heartbeat/tools.ts src/main/__tests__/heartbeat-tools.test.ts src/main/copilot/permissions.ts
git commit -m "feat: add heartbeat monitor tools and update permissions"
```

---

### Task 5: Heartbeat Module

**Files:**
- Create: `src/main/heartbeat/heartbeat.ts`
- Create: `src/main/__tests__/heartbeat.test.ts`

- [ ] **Step 1: Write failing tests for heartbeat**

```typescript
// src/main/__tests__/heartbeat.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation((opts: { title: string; body: string }) => ({
    title: opts.title,
    body: opts.body,
    show: vi.fn(),
  })),
}));

vi.mock("@github/copilot-sdk", () => ({
  defineTool: vi.fn((_name: string, config: { handler: unknown }) => ({
    name: _name,
    handler: config.handler,
  })),
}));

import { createHeartbeat } from "../heartbeat/heartbeat";
import { cachePrepData, clearPrepData, hasPrepData } from "../heartbeat/prep-cache";
import type { Meeting } from "../types";

const NOW = new Date("2026-05-19T13:45:00Z");

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    title: "Standup",
    startTime: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    endTime: new Date(NOW.getTime() + 45 * 60_000).toISOString(),
    attendees: ["Alice"],
    organizer: "Alice",
    ...overrides,
  };
}

function createMockSession() {
  return {
    sessionId: "flint-monitor",
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    abort: vi.fn(),
  };
}

function createMockClient(session = createMockSession()) {
  return {
    createSession: vi.fn().mockResolvedValue(session),
    resumeSession: vi.fn().mockResolvedValue(session),
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clearPrepData();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends a beat on start", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [makeMeeting()],
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  it("sends periodic beats", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(2);
    heartbeat.stop();
  });

  it("prevents overlapping beats", async () => {
    let resolveFirst: (() => void) | null = null;
    const session = createMockSession();
    session.sendAndWait.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveFirst = r; }),
    );
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    // First beat is still running

    // Trigger interval tick — should skip
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);

    // Complete first beat
    resolveFirst!();
    await flush();

    // Next tick should fire
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(2);
    heartbeat.stop();
  });

  it("stops timer after maxConsecutiveFailures", async () => {
    const session = createMockSession();
    session.sendAndWait.mockRejectedValue(new Error("timeout"));
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      maxConsecutiveFailures: 3,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // beat 1 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 2 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 3 fails — should stop

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("consecutive failures"),
    );

    // No more beats after stop
    session.sendAndWait.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("resets failure count on successful beat", async () => {
    const session = createMockSession();
    session.sendAndWait
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      maxConsecutiveFailures: 3,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // beat 1 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 2 succeeds — resets counter

    // Should still be running
    session.sendAndWait.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(3);
    heartbeat.stop();
  });

  it("pauses beats when overlay focused", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // initial beat
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);

    heartbeat.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(1); // skipped

    heartbeat.resume();
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(2); // deferred beat fires
    heartbeat.stop();
  });

  it("prepMeeting does on-demand prep", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      now: () => Date.now(),
    });
    const meeting = makeMeeting();
    await heartbeat.prepMeeting(meeting);
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);
    const prompt = session.sendAndWait.mock.calls[0][0].prompt as string;
    expect(prompt).toContain(meeting.id);
    heartbeat.stop();
  });

  it("prepMeeting skips if already prepped", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      now: () => Date.now(),
    });
    cachePrepData("m1", ["already done"]);
    await heartbeat.prepMeeting(makeMeeting());
    expect(session.sendAndWait).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("stop() clears timer and resets state", () => {
    const client = createMockClient();
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
    });
    heartbeat.start();
    heartbeat.stop();
    // Double stop should be safe
    heartbeat.stop();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/heartbeat.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement heartbeat module**

```typescript
// src/main/heartbeat/heartbeat.ts
import type { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import { createPermissionPolicy } from "../copilot/permissions";
import { loadPrompt } from "../copilot/system-prompt";
import { createHeartbeatTools } from "./tools";
import { buildBeatPrompt, buildPrepPrompt } from "./prompt-builder";
import { hasPrepData, cleanupExpiredPrep } from "./prep-cache";
import type { Meeting } from "../types";

const DEFAULT_INTERVAL_MS = 10 * 60_000; // 10 minutes
const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds
const DEFAULT_MAX_FAILURES = 5;

const HEARTBEAT_AVAILABLE_TOOLS = ["cache_meeting_prep", "show_notification"] as const;

export interface Heartbeat {
  start(): void;
  stop(): void;
  /** Force an immediate beat. */
  beat(): Promise<void>;
  /** On-demand prep for a specific meeting. Skips if already prepped. */
  prepMeeting(meeting: Meeting): Promise<void>;
  /** Pause beats (e.g. overlay is focused). */
  pause(): void;
  /** Resume beats after pause. Fires a deferred beat if one was skipped. */
  resume(): void;
}

export interface HeartbeatConfig {
  client: CopilotClient;
  getModel: () => string;
  getMeetings: () => Meeting[];
  /** Beat interval in ms. Default: 10 minutes. */
  intervalMs?: number;
  /** Timeout per beat in ms. Default: 90 seconds. */
  timeoutMs?: number;
  /** Consecutive failures before stopping timer. Default: 5. */
  maxConsecutiveFailures?: number;
  /** Clock seam for testing. Default: Date.now. */
  now?: () => number;
}

export function createHeartbeat(config: HeartbeatConfig): Heartbeat {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxFailures = config.maxConsecutiveFailures ?? DEFAULT_MAX_FAILURES;
  const now = config.now ?? ((): number => Date.now());

  let session: CopilotSession | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let paused = false;
  let beating = false;
  let consecutiveFailures = 0;
  let deferredBeat = false;

  async function ensureSession(): Promise<CopilotSession> {
    if (session) return session;

    const model = config.getModel();
    console.log("[heartbeat] Creating monitor session with model:", model);

    session = await config.client.createSession({
      sessionId: "flint-monitor",
      model,
      onPermissionRequest: createPermissionPolicy(),
      streaming: false,
      systemMessage: { content: loadPrompt("heartbeat") },
      tools: createHeartbeatTools(),
      availableTools: [...HEARTBEAT_AVAILABLE_TOOLS],
      mcpServers: {
        "work-iq": {
          type: "local",
          command: "npx",
          args: ["-y", "@microsoft/workiq", "mcp"],
          tools: ["*"],
        },
      },
    });

    console.log("[heartbeat] Monitor session created:", session.sessionId);
    return session;
  }

  async function doBeat(): Promise<void> {
    if (beating) return;
    beating = true;
    try {
      const meetings = config.getMeetings();
      const preppedIds = new Set<string>();
      for (const m of meetings) {
        if (hasPrepData(m.id)) preppedIds.add(m.id);
      }

      cleanupExpiredPrep(new Set(meetings.map((m) => m.id)));

      const prompt = buildBeatPrompt(meetings, preppedIds, new Date(now()));
      const s = await ensureSession();
      await s.sendAndWait({ prompt }, timeoutMs);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error(
        "[heartbeat] beat failed:",
        err instanceof Error ? err.message : String(err),
      );
      if (consecutiveFailures >= maxFailures) {
        console.warn(
          `[heartbeat] ${String(consecutiveFailures)} consecutive failures, stopping timer`,
        );
        stopTimer();
      }
    } finally {
      beating = false;
    }
  }

  async function doPrep(meeting: Meeting): Promise<void> {
    if (hasPrepData(meeting.id)) return;
    const prompt = buildPrepPrompt(meeting, new Date(now()));
    try {
      const s = await ensureSession();
      await s.sendAndWait({ prompt }, timeoutMs);
    } catch (err) {
      console.error(
        "[heartbeat] on-demand prep failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function startTimer(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (paused) {
        deferredBeat = true;
        return;
      }
      void doBeat();
    }, intervalMs);
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      console.log("[heartbeat] starting");
      void doBeat();
      startTimer();
    },

    stop(): void {
      if (!running) return;
      running = false;
      stopTimer();
      session = null;
      paused = false;
      deferredBeat = false;
      consecutiveFailures = 0;
      console.log("[heartbeat] stopped");
    },

    async beat(): Promise<void> {
      await doBeat();
    },

    async prepMeeting(meeting: Meeting): Promise<void> {
      await doPrep(meeting);
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
      if (deferredBeat) {
        deferredBeat = false;
        void doBeat();
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/heartbeat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/heartbeat/heartbeat.ts src/main/__tests__/heartbeat.test.ts
git commit -m "feat: add heartbeat module with guardrails"
```

---

### Task 6: Wire Heartbeat in index.ts

**Files:**
- Modify: `src/main/index.ts` (add heartbeat creation, update onPrepare, power management, focus freeze)

- [ ] **Step 1: Add heartbeat import and variable**

At top of `src/main/index.ts`, add imports:
```typescript
import { createHeartbeat, type Heartbeat } from "./heartbeat/heartbeat";
import { hasPrepData } from "./heartbeat/prep-cache";
import { powerMonitor } from "electron";
```

Note: the `cachePrepData` import already exists from Task 1 step 6. Add `hasPrepData` to that import:
```typescript
import { cachePrepData, hasPrepData } from "./heartbeat/prep-cache";
```

Add to the module-level variables (after `let agencyCalendar`):
```typescript
let heartbeat: Heartbeat | null = null;
```

- [ ] **Step 2: Update onPrepare to check prepCache**

Replace the `onPrepare` callback in the `createMeetingScheduler` call:
```typescript
    onPrepare: (meeting) => {
      const cfg = configStore.getAll();
      if (!cfg.spotlightPrep) return;
      console.log("[main] Prep triggered for:", meeting.title);
      if (hasPrepData(meeting.id)) return;
      if (heartbeat) {
        void heartbeat.prepMeeting(meeting);
      } else {
        cachePrepData(meeting.id, []);
      }
    },
```

- [ ] **Step 3: Create and start heartbeat after scheduler**

After `meetingScheduler.start();` (around line 296), add:
```typescript
  // ── Heartbeat (background AI) ──
  if (config.heartbeatEnabled && client) {
    heartbeat = createHeartbeat({
      client,
      getModel: () => configStore.getAll().model,
      getMeetings: () => latestMeetings,
    });
    heartbeat.start();
  }
```

- [ ] **Step 4: Add power management**

After the heartbeat start block, add:
```typescript
  // ── Power management ──
  powerMonitor.on("resume", () => {
    console.log("[main] System resumed — triggering immediate poll and beat");
    if (meetingScheduler) void meetingScheduler.pollNow();
    if (heartbeat) void heartbeat.beat();
  });
```

- [ ] **Step 5: Add overlay focus freeze**

After the overlay `did-finish-load` handler (around line 105), add:
```typescript
  // Pause heartbeat while overlay is focused (avoid two-writer race on future AttentionStore)
  overlay.on("focus", () => heartbeat?.pause());
  overlay.on("blur", () => heartbeat?.resume());
```

- [ ] **Step 6: Add heartbeat cleanup to will-quit**

In the `app.on("will-quit", ...)` handler, add heartbeat stop:
```typescript
    if (heartbeat) {
      heartbeat.stop();
    }
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire heartbeat into app lifecycle"
```

---

### Task 7: Fix show_meeting Tool

**Files:**
- Modify: `src/main/copilot/tools.ts:8-13,82-96` (add getPrepData callback, attach aiPrep)
- Modify: `src/main/index.ts:164-184` (pass getPrepData to getChatTools)

- [ ] **Step 1: Add getPrepData to ToolCallbacks interface**

In `src/main/copilot/tools.ts`, add to the `ToolCallbacks` interface:
```typescript
interface ToolCallbacks {
  onShowOverlay: () => void;
  onAttentionUpdate: (items: AttentionItem[]) => void;
  onBlocksUpdate: (block: FlintBlock) => void;
  getMeetings: () => Meeting[];
  getPrepData?: (meetingId: string) => string[] | null;
}
```

- [ ] **Step 2: Update show_meeting handler to attach aiPrep**

In the `showMeeting` tool handler, replace:
```typescript
      const block: FlintBlock = {
        type: "meeting-card",
        data: { ...meeting },
      };
```

With:
```typescript
      const prepItems = callbacks.getPrepData?.(meetingId) ?? undefined;
      const block: FlintBlock = {
        type: "meeting-card",
        data: { ...meeting, ...(prepItems ? { aiPrep: prepItems } : {}) },
      };
```

- [ ] **Step 3: Wire getPrepData in index.ts**

In `src/main/index.ts`, in the `getChatTools` call, add after `getMeetings`:
```typescript
    getPrepData: (meetingId) => {
      const { getPrepData } = require("./heartbeat/prep-cache") as typeof import("./heartbeat/prep-cache");
      return getPrepData(meetingId);
    },
```

Wait — avoid `require` in ESM. Instead, import `getPrepData` at the top (it's already available since Task 1 added `hasPrepData`). Update the import:
```typescript
import { cachePrepData, hasPrepData, getPrepData } from "./heartbeat/prep-cache";
```

Then in the `getChatTools` call:
```typescript
    getPrepData: (meetingId) => getPrepData(meetingId),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/main/copilot/tools.ts src/main/index.ts
git commit -m "feat: attach aiPrep from prep cache to show_meeting blocks"
```
