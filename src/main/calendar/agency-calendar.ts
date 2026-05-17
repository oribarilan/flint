import { execSync, spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { z } from "zod";
import type { Meeting } from "../types";

const PREFIX = "[agency-calendar]";
const AGENCY_PREFIX = "[agency]";
const PORT_TIMEOUT_MS = 5_000;
const FETCH_TIMEOUT_MS = 10_000;

// ── Zod schema for Graph API calendar events ──

const GraphAttendeeSchema = z.object({
  emailAddress: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
  }),
  status: z
    .object({
      response: z.string().optional(),
    })
    .optional(),
});

const GraphEventSchema = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string(),
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string(),
  }),
  attendees: z.array(GraphAttendeeSchema).optional(),
  organizer: z
    .object({
      emailAddress: z.object({
        name: z.string().optional(),
        address: z.string().optional(),
      }),
    })
    .optional(),
  joinUrl: z.string().nullish(),
  onlineMeeting: z
    .object({
      joinUrl: z.string().nullish(),
    })
    .nullish(),
  isAllDay: z.boolean().optional(),
  isCancelled: z.boolean().optional(),
  bodyPreview: z.string().optional(),
  responseStatus: z
    .object({
      response: z.string().optional(),
    })
    .optional(),
});

type GraphEvent = z.infer<typeof GraphEventSchema>;

// ── Timezone conversion ──

// ── Windows-to-IANA timezone mapping ──
// Graph API sends Windows timezone IDs for calendars that haven't migrated to IANA.
// Source: Unicode CLDR windowsZones.xml (subset covering all production Windows zones).
const WINDOWS_TO_IANA: Record<string, string> = {
  "Afghanistan Standard Time": "Asia/Kabul",
  "Alaskan Standard Time": "America/Anchorage",
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "Arabic Standard Time": "Asia/Baghdad",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "Atlantic Standard Time": "America/Halifax",
  "AUS Central Standard Time": "Australia/Darwin",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "Azerbaijan Standard Time": "Asia/Baku",
  "Azores Standard Time": "Atlantic/Azores",
  "Bangladesh Standard Time": "Asia/Dhaka",
  "Belarus Standard Time": "Europe/Minsk",
  "Canada Central Standard Time": "America/Regina",
  "Cape Verde Standard Time": "Atlantic/Cape_Verde",
  "Caucasus Standard Time": "Asia/Yerevan",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "Central America Standard Time": "America/Guatemala",
  "Central Asia Standard Time": "Asia/Almaty",
  "Central Brazilian Standard Time": "America/Cuiaba",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Central Pacific Standard Time": "Pacific/Guadalcanal",
  "Central Standard Time": "America/Chicago",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "China Standard Time": "Asia/Shanghai",
  "E. Africa Standard Time": "Africa/Nairobi",
  "E. Australia Standard Time": "Australia/Brisbane",
  "E. Europe Standard Time": "Europe/Chisinau",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Eastern Standard Time": "America/New_York",
  "Eastern Standard Time (Mexico)": "America/Cancun",
  "Egypt Standard Time": "Africa/Cairo",
  "Ekaterinburg Standard Time": "Asia/Yekaterinburg",
  "Fiji Standard Time": "Pacific/Fiji",
  "FLE Standard Time": "Europe/Kiev",
  "Georgian Standard Time": "Asia/Tbilisi",
  "GMT Standard Time": "Europe/London",
  "Greenland Standard Time": "America/Godthab",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "GTB Standard Time": "Europe/Bucharest",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "India Standard Time": "Asia/Kolkata",
  "Iran Standard Time": "Asia/Tehran",
  "Israel Standard Time": "Asia/Jerusalem",
  "Jordan Standard Time": "Asia/Amman",
  "Korea Standard Time": "Asia/Seoul",
  "Mauritius Standard Time": "Indian/Mauritius",
  "Middle East Standard Time": "Asia/Beirut",
  "Mountain Standard Time": "America/Denver",
  "Mountain Standard Time (Mexico)": "America/Chihuahua",
  "Myanmar Standard Time": "Asia/Rangoon",
  "N. Central Asia Standard Time": "Asia/Novosibirsk",
  "Namibia Standard Time": "Africa/Windhoek",
  "Nepal Standard Time": "Asia/Kathmandu",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Newfoundland Standard Time": "America/St_Johns",
  "North Asia East Standard Time": "Asia/Irkutsk",
  "North Asia Standard Time": "Asia/Krasnoyarsk",
  "Pacific SA Standard Time": "America/Santiago",
  "Pacific Standard Time": "America/Los_Angeles",
  "Pacific Standard Time (Mexico)": "America/Tijuana",
  "Pakistan Standard Time": "Asia/Karachi",
  "Paraguay Standard Time": "America/Asuncion",
  "Romance Standard Time": "Europe/Paris",
  "Russian Standard Time": "Europe/Moscow",
  "SA Eastern Standard Time": "America/Cayenne",
  "SA Pacific Standard Time": "America/Bogota",
  "SA Western Standard Time": "America/La_Paz",
  "SE Asia Standard Time": "Asia/Bangkok",
  "Singapore Standard Time": "Asia/Singapore",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Sri Lanka Standard Time": "Asia/Colombo",
  "Taipei Standard Time": "Asia/Taipei",
  "Tasmania Standard Time": "Australia/Hobart",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Turkey Standard Time": "Europe/Istanbul",
  "US Eastern Standard Time": "America/Indianapolis",
  "US Mountain Standard Time": "America/Phoenix",
  UTC: "Etc/UTC",
  "Venezuela Standard Time": "America/Caracas",
  "Vladivostok Standard Time": "Asia/Vladivostok",
  "W. Australia Standard Time": "Australia/Perth",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "W. Europe Standard Time": "Europe/Berlin",
  "West Asia Standard Time": "Asia/Tashkent",
  "West Pacific Standard Time": "Pacific/Port_Moresby",
  "Yakutsk Standard Time": "Asia/Yakutsk",
};

/** Resolve a timezone string to an IANA name. Passes through IANA names, maps Windows IDs. */
function resolveTimezone(tz: string): string {
  if (WINDOWS_TO_IANA[tz]) return WINDOWS_TO_IANA[tz];
  return tz;
}

/** Convert a wall-clock datetime string in a given timezone to UTC ISO 8601. */
export function toUtcIso(wallClock: string, timeZone: string): string {
  const tz = resolveTimezone(timeZone);
  if (tz === "UTC" || tz === "Etc/UTC") {
    return new Date(wallClock + "Z").toISOString();
  }

  // Use the wall-clock interpreted as UTC to approximate the offset at that moment.
  // For most dates this gives the correct timezone offset. The only edge case is
  // events within ~1h of a DST transition, which is acceptable for V1.
  const approx = new Date(wallClock + "Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(approx);
  const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = offsetStr.replace("GMT", "") || "+00:00";
  return new Date(`${wallClock}${offset}`).toISOString();
}

// ── Field mapping ──

function mapGraphEvent(event: GraphEvent): Meeting {
  const attendees = (event.attendees ?? []).map(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: empty strings should fall through
    (a) => a.emailAddress.name || a.emailAddress.address || "Unknown",
  );

  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- intentional: empty strings should fall through */
  const organizer =
    event.organizer?.emailAddress.name || event.organizer?.emailAddress.address || "Unknown";
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: empty strings should fall through
  const joinUrl = event.joinUrl || event.onlineMeeting?.joinUrl || undefined;

  const meeting: Meeting = {
    id: event.id,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: empty subject should fall through
    title: event.subject || "(No subject)",
    startTime: toUtcIso(event.start.dateTime, event.start.timeZone),
    endTime: toUtcIso(event.end.dateTime, event.end.timeZone),
    attendees,
    organizer,
    ...(joinUrl ? { joinUrl } : {}),
    ...(event.isAllDay != null ? { isAllDay: event.isAllDay } : {}),
    ...(event.bodyPreview ? { agenda: event.bodyPreview } : {}),
  };

  return meeting;
}

// ── Binary resolution ──

function resolveAgencyPath(): string | undefined {
  if (process.env.AGENCY_PATH) {
    console.log(PREFIX, "Using AGENCY_PATH:", process.env.AGENCY_PATH);
    return process.env.AGENCY_PATH;
  }

  try {
    const resolved = execSync("which agency", { encoding: "utf-8" }).trim();
    if (resolved) {
      console.log(PREFIX, "Found agency in PATH:", resolved);
      return resolved;
    }
  } catch {
    // not in PATH
  }

  if (process.platform === "darwin") {
    console.log(PREFIX, "Using macOS fallback: /opt/homebrew/bin/agency");
    return "/opt/homebrew/bin/agency";
  }

  return undefined;
}

// ── SSE response parsing ──

/** Extract the JSON-RPC result from an SSE response body. */
export function parseSseResponse(body: string): unknown {
  // Find lines starting with "data: " and extract the JSON
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const json = line.slice(6);
      return JSON.parse(json);
    }
  }
  throw new Error("No SSE data line found in response");
}

/** Extract the calendar events JSON from the MCP result text. */
export function parseCalendarText(text: string): unknown {
  // The text starts with "Calendar view retrieved successfully.\n" followed by JSON
  const newlineIdx = text.indexOf("\n");
  if (newlineIdx === -1) {
    return JSON.parse(text);
  }
  return JSON.parse(text.slice(newlineIdx + 1));
}

// ── Public interface ──

export interface AgencyCalendarSource {
  start(): Promise<void>;
  stop(): void;
  fetchTodayMeetings(): Promise<Meeting[]>;
}

export interface AgencyCalendarConfig {
  /** Override binary path resolution (test seam). */
  resolveAgency?: () => string | undefined;
  /** Override spawn (test seam). */
  spawnProcess?: typeof spawn;
  /** Override fetch (test seam). */
  fetchFn?: typeof globalThis.fetch;
  /** Clock seam. */
  now?: () => Date;
}

export function createAgencyCalendarSource(
  config: AgencyCalendarConfig = {},
): AgencyCalendarSource {
  const resolveBinary = config.resolveAgency ?? resolveAgencyPath;
  const spawnFn = config.spawnProcess ?? spawn;
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const now = config.now ?? (() => new Date());

  let proc: ChildProcess | null = null;
  let port: number | null = null;
  let spawnFailed = false;

  async function spawnAndDiscover(): Promise<void> {
    const agencyPath = resolveBinary();
    if (!agencyPath) {
      console.warn(PREFIX, "agency binary not found — calendar disabled");
      spawnFailed = true;
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;

      try {
        proc = spawnFn(agencyPath, ["mcp", "calendar", "--transport", "http", "--port", "0"], {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(PREFIX, "Failed to spawn agency:", msg);
        spawnFailed = true;
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(PREFIX, "Port discovery timed out after 5s");
          killProcess();
          spawnFailed = true;
          resolve();
        }
      }, PORT_TIMEOUT_MS);

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.warn(PREFIX, "Failed to spawn agency:", err.message);
          spawnFailed = true;
          proc = null;
          resolve();
        }
      });

      proc.on("exit", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.warn(PREFIX, `agency exited unexpectedly with code ${String(code)}`);
          proc = null;
          spawnFailed = true;
          resolve();
        } else {
          proc = null;
          port = null;
        }
      });

      let stdoutBuffer = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        if (resolved) return;
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^\d+$/.test(trimmed)) {
            const parsed = parseInt(trimmed, 10);
            if (parsed >= 1 && parsed <= 65535) {
              resolved = true;
              clearTimeout(timeout);
              port = parsed;
              console.log(PREFIX, "Agency MCP server on port", port);
              resolve();
              return;
            }
          }
        }
        // Keep partial last line in buffer
        stdoutBuffer = lines[lines.length - 1] ?? "";
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          // Log selectively — skip lines that might contain auth tokens
          const safe = text.length > 500 ? text.slice(0, 500) + "…" : text;
          console.log(AGENCY_PREFIX, safe);
        }
      });
    });
  }

  function killProcess(): void {
    if (proc) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already dead
      }
      proc = null;
      port = null;
    }
  }

  function isProcessAlive(): boolean {
    return proc !== null && proc.exitCode === null && !proc.killed;
  }

  async function fetchTodayMeetings(): Promise<Meeting[]> {
    // Lazy respawn if subprocess died
    if (!isProcessAlive() && !spawnFailed) {
      console.log(PREFIX, "Subprocess not running, attempting respawn");
      await spawnAndDiscover();
    }

    if (port === null) {
      return [];
    }

    const today = now();
    const startOfDay = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "ListCalendarView",
        arguments: {
          startDateTime: startOfDay.toISOString(),
          endDateTime: endOfDay.toISOString(),
        },
      },
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      const response = await fetchFn(`http://127.0.0.1:${String(port)}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: rpcBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(PREFIX, `HTTP ${String(response.status)} from agency`);
        return [];
      }

      const body = await response.text();
      const rpcResult = parseSseResponse(body) as {
        jsonrpc: string;
        id: number;
        result?: { content?: { type: string; text: string }[] };
        error?: { message: string };
      };

      if (rpcResult.error) {
        console.warn(PREFIX, "JSON-RPC error:", rpcResult.error.message);
        return [];
      }

      const text = rpcResult.result?.content?.[0]?.text;
      if (!text) {
        console.warn(PREFIX, "No text content in MCP response");
        return [];
      }

      const eventsRaw = parseCalendarText(text);

      // Graph API returns { value: [...events] }; handle both wrapped and raw arrays
      const eventsArray = Array.isArray(eventsRaw)
        ? eventsRaw
        : (eventsRaw as Record<string, unknown> | null)?.value;

      if (!Array.isArray(eventsArray)) {
        console.warn(PREFIX, "Expected array of events, got", typeof eventsRaw);
        return [];
      }

      const meetings: Meeting[] = [];
      for (const raw of eventsArray) {
        const parsed = GraphEventSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn(PREFIX, "Skipping malformed event:", parsed.error.issues[0]?.message);
          continue;
        }

        const event = parsed.data;

        // Filter cancelled
        if (event.isCancelled) continue;

        // Filter declined by the user
        if (event.responseStatus?.response === "declined") continue;

        try {
          meetings.push(mapGraphEvent(event));
        } catch (mapErr) {
          console.warn(
            PREFIX,
            "Skipping event with mapping error:",
            mapErr instanceof Error ? mapErr.message : String(mapErr),
          );
        }
      }

      return meetings;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(PREFIX, "Fetch timed out after 10s");
      } else {
        console.warn(PREFIX, "Fetch failed:", err instanceof Error ? err.message : String(err));
      }
      return [];
    }
  }

  return {
    async start(): Promise<void> {
      await spawnAndDiscover();
    },

    stop(): void {
      killProcess();
      spawnFailed = false;
    },

    fetchTodayMeetings,
  };
}
