import type { PermissionHandler, PermissionRequestResult } from "@github/copilot-sdk";
import { parseHost } from "../lib/url";

/**
 * Hosts allowed for the `join_meeting` custom tool. Subdomains of these are also accepted
 * (e.g. `subdomain.teams.microsoft.com`).
 */
const JOIN_MEETING_ALLOWLIST = [
  "teams.microsoft.com",
  "teams.live.com",
  "meet.google.com",
  "zoom.us",
] as const;

/**
 * Custom Flint tools that are auto-approved. Read-only / UI-only effects with no
 * external side effect — the worst case is a misleading notification the user can dismiss.
 *
 * Note: `ask_work_iq` is no longer a custom tool (V1 wires Work IQ via real MCP).
 * Work IQ MCP tools are approved via the `kind: "mcp"` branch below.
 */
const AUTO_APPROVE_CUSTOM_TOOLS = new Set<string>([
  "set_attention_items",
  "show_overlay",
  "show_notification",
]);

/**
 * Custom tools subject to per-call gating. Currently only `join_meeting` (URL allowlist).
 */
const GATED_CUSTOM_TOOLS = new Set<string>(["join_meeting"]);

/**
 * Built-in tool name fragments that are always denied (defence in depth — the SDK
 * `availableTools` allow-list should already prevent these from being callable).
 */
const DANGEROUS_BUILTIN_FRAGMENTS = ["bash", "shell", "exec", "read_file", "write_file", "git"];

const APPROVED: PermissionRequestResult = { kind: "approved" };
const DENIED: PermissionRequestResult = {
  kind: "denied-no-approval-rule-and-could-not-request-from-user",
};

function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function looksDangerous(name: string): boolean {
  const lower = name.toLowerCase();
  return DANGEROUS_BUILTIN_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Evaluate a custom-tool permission request against Flint's policy.
 * Exported so it can be unit-tested directly without constructing the full handler closure.
 */
export function evaluateCustomTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
): PermissionRequestResult {
  if (AUTO_APPROVE_CUSTOM_TOOLS.has(toolName)) {
    return APPROVED;
  }

  if (GATED_CUSTOM_TOOLS.has(toolName)) {
    if (toolName === "join_meeting") {
      const url = typeof args?.joinUrl === "string" ? args.joinUrl : null;
      if (!url) {
        console.warn("[permissions] denied join_meeting: missing or non-string joinUrl");
        return DENIED;
      }
      const host = parseHost(url);
      if (!host) {
        console.warn("[permissions] denied join_meeting: malformed url");
        return DENIED;
      }
      // parseHost only succeeds for well-formed URLs; check protocol explicitly.
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          console.warn("[permissions] denied join_meeting: non-http scheme", {
            protocol: parsed.protocol,
          });
          return DENIED;
        }
      } catch {
        console.warn("[permissions] denied join_meeting: malformed url");
        return DENIED;
      }
      if (!hostAllowed(host, JOIN_MEETING_ALLOWLIST)) {
        console.warn("[permissions] denied join_meeting: host not allowed", { host });
        return DENIED;
      }
      return APPROVED;
    }
  }

  console.warn("[permissions] denied unknown tool", { name: toolName });
  return DENIED;
}

/**
 * Create the `onPermissionRequest` handler for Copilot SDK sessions.
 *
 * Policy:
 *  - Custom tools on the auto-approve list → approved.
 *  - `join_meeting` → host allowlist check.
 *  - Unknown custom tools → denied (fail-closed).
 *  - MCP tools (Work IQ) → auto-approved unless the tool name looks dangerous.
 *    Work IQ exposes read-only M365 data access (calendar/mail/Teams/people/docs);
 *    auto-approval is acceptable for V1. Defence in depth: dangerous-looking tool
 *    names (bash/shell/exec/read_file/write_file/git) are denied even from MCP.
 *  - Any other permission kind (shell/write/read/url/memory/hook) → denied.
 *    These should be unreachable thanks to `availableTools`, but we fail-closed.
 */
export function createPermissionPolicy(): PermissionHandler {
  return (request) => {
    if (request.kind === "custom-tool") {
      const toolName = typeof request.toolName === "string" ? request.toolName : "";
      const args =
        typeof request.args === "object" && request.args !== null
          ? (request.args as Record<string, unknown>)
          : undefined;
      return evaluateCustomTool(toolName, args);
    }

    if (request.kind === "mcp") {
      // Work IQ MCP exposes read-only M365 data access. Auto-approve unless the
      // tool name looks dangerous (defence in depth — should be unreachable but
      // we fail-closed on suspicious names).
      const toolName = typeof request.toolName === "string" ? request.toolName : "";
      if (looksDangerous(toolName)) {
        console.warn("[permissions] denied dangerous-looking MCP tool", { name: toolName });
        return DENIED;
      }
      return APPROVED;
    }

    // shell / write / read / url / memory / hook — deny.
    console.warn("[permissions] denied non-custom-tool permission", { kind: request.kind });
    return DENIED;
  };
}
