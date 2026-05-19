import type { PermissionHandler, PermissionRequestResult } from "@github/copilot-sdk";

/**
 * Custom Flint tools that are auto-approved. These are either read-only (show_meeting)
 * or have their own validation (join_meeting validates meeting ID against cache before
 * opening URLs — the security check lives in the tool handler, not the permission layer).
 *
 * Note: Work IQ MCP tools are approved via the `kind: "mcp"` branch below.
 */
const AUTO_APPROVE_CUSTOM_TOOLS = new Set<string>([
  "set_attention_items",
  "show_overlay",
  "show_notification",
  "show_meeting",
  "join_meeting",
  "cache_meeting_prep",
]);

/**
 * Built-in tool name fragments that are always denied (defence in depth — the SDK
 * `availableTools` allow-list should already prevent these from being callable).
 */
const DANGEROUS_BUILTIN_FRAGMENTS = ["bash", "shell", "exec", "read_file", "write_file", "git"];

const APPROVED: PermissionRequestResult = { kind: "approved" };
const DENIED: PermissionRequestResult = {
  kind: "denied-no-approval-rule-and-could-not-request-from-user",
};

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
): PermissionRequestResult {
  if (AUTO_APPROVE_CUSTOM_TOOLS.has(toolName)) {
    return APPROVED;
  }

  console.warn("[permissions] denied unknown tool", { name: toolName });
  return DENIED;
}

/**
 * Create the `onPermissionRequest` handler for Copilot SDK sessions.
 *
 * Policy:
 *  - Custom tools on the auto-approve list → approved.
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
      return evaluateCustomTool(toolName);
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
