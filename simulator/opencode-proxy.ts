/**
 * OpenCode proxy handlers — used in dev mode for real backend communication.
 *
 * Proxies chat commands to a running OpenCode server via HTTP API and bridges
 * SSE events to the Tauri event mock system for real streaming responses.
 *
 * Requires the Vite dev server proxy to forward /opencode/* to the real
 * OpenCode server (configured in vite.config.simulator.ts).
 */

import type { EmitFn, CommandHandlerMap } from "./types";

const API_BASE = "/opencode";

// ---------------------------------------------------------------------------
// Proxy state
// ---------------------------------------------------------------------------

interface ProxyState {
  sessionId: string | null;
  connected: boolean;
  repoPath: string | null;
  sseController: AbortController | null;
  projectModelConfig: {
    exists: boolean;
    has_model: boolean;
    model: string | null;
    path: string;
  };
}

const proxyState: ProxyState = {
  sessionId: null,
  connected: false,
  repoPath: null,
  sseController: null,
  projectModelConfig: {
    exists: false,
    has_model: false,
    model: null,
    path: "",
  },
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status}`);
  return resp.json();
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body != null ? { "Content-Type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`POST ${path}: ${resp.status}`);
  const text = await resp.text();
  return text ? JSON.parse(text) : (undefined as T);
}

// ---------------------------------------------------------------------------
// SSE bridge — mirrors src-tauri/src/providers/opencode/events.rs
// ---------------------------------------------------------------------------

function startSSEBridge(emit: EmitFn): void {
  stopSSEBridge();

  const controller = new AbortController();
  proxyState.sseController = controller;

  (async () => {
    while (!controller.signal.aborted) {
      try {
        await connectAndProcess(emit, controller.signal);
        if (controller.signal.aborted) break;
        console.log("[proxy] SSE stream ended, reconnecting...");
      } catch (e) {
        if (controller.signal.aborted) break;
        console.warn("[proxy] SSE error, reconnecting in 2s:", e);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
}

async function connectAndProcess(emit: EmitFn, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${API_BASE}/global/event`, {
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`SSE endpoint returned ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const eventText = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const data = extractSSEData(eventText);
        if (data) processEvent(data, emit);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractSSEData(eventText: string): string | null {
  for (const line of eventText.split("\n")) {
    if (line.startsWith("data: ")) return line.slice(6);
    if (line.startsWith("data:")) return line.slice(5).trimStart();
  }
  return null;
}

function processEvent(data: string, emit: EmitFn): void {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(data);
  } catch {
    return;
  }

  const payload = envelope.payload as Record<string, unknown> | undefined;
  if (!payload) return;

  const eventType = (payload.type as string) ?? "";
  const properties = (payload.properties as Record<string, unknown>) ?? {};

  switch (eventType) {
    case "message.part.updated":
      handlePartUpdated(properties, emit);
      break;

    case "message.updated": {
      const info = properties.info as Record<string, unknown> | undefined;
      const time = info?.time as Record<string, unknown> | undefined;
      if (time?.completed != null) {
        emit("chat:done", null);
      }
      break;
    }

    case "session.status": {
      const status = properties.status as Record<string, unknown> | undefined;
      if ((status?.type as string) === "idle") {
        emit("chat:done", null);
      }
      break;
    }

    case "server.heartbeat":
    case "server.connected":
      break;

    default:
      break;
  }
}

function handlePartUpdated(properties: Record<string, unknown>, emit: EmitFn): void {
  const part = properties.part as Record<string, unknown> | undefined;
  if (!part) return;

  const partType = (part.type as string) ?? "";

  switch (partType) {
    case "text": {
      const delta = properties.delta as string | undefined;
      if (delta) emit("chat:token", delta);
      break;
    }
    case "tool": {
      const toolName = (part.tool as string) ?? "unknown";
      const stateObj = part.state as Record<string, unknown> | undefined;
      const stateType = (stateObj?.type as string) ?? "";
      if (stateType === "running" || stateType === "pending") {
        emit("chat:tool_start", toolName);
      } else if (stateType === "completed" || stateType === "error") {
        emit("chat:tool_end", toolName);
      }
      break;
    }
  }
}

function stopSSEBridge(): void {
  if (proxyState.sseController) {
    proxyState.sseController.abort();
    proxyState.sseController = null;
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

async function ensureSession(): Promise<string> {
  if (proxyState.sessionId) return proxyState.sessionId;

  const session = await apiPost<{ id: string }>("/session", {
    title: "Flint chat",
  });
  proxyState.sessionId = session.id;
  console.log(`[proxy] created session: ${session.id}`);
  return session.id;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createProxyHandlers(emit: EmitFn): CommandHandlerMap {
  return {
    get_chat_status: () => ({
      connected: proxyState.connected,
      session_id: proxyState.sessionId,
      repo_path: proxyState.repoPath,
    }),

    send_chat_message: async (args) => {
      const message = (args?.message as string) ?? "";
      const providerId = (args?.providerId as string) ?? undefined;
      const modelId = (args?.modelId as string) ?? undefined;
      console.log(`[proxy] send_chat_message: ${message}`);

      const sessionId = await ensureSession();
      const body: Record<string, unknown> = {
        parts: [{ type: "text", text: message }],
      };
      if (providerId && modelId) {
        body.model = { providerID: providerId, modelID: modelId };
      }

      await apiPost(`/session/${sessionId}/message`, body);
    },

    get_available_models: async () => {
      try {
        const data = await apiGet<{
          providers: Array<{
            id: string;
            name: string;
            models: Array<{ id: string; name: string }>;
          }>;
          default: Record<string, string>;
        }>("/config/providers");

        const models = data.providers.flatMap((provider) =>
          provider.models.map((model) => ({
            id: `${provider.id}/${model.id}`,
            name: model.name,
            provider_id: provider.id,
            provider_name: provider.name,
          })),
        );

        let defaultModel: string | null = null;
        try {
          const cfg = await apiGet<{ model?: string }>("/config");
          defaultModel = typeof cfg.model === "string" && cfg.model.length > 0 ? cfg.model : null;
        } catch {
          defaultModel = Object.values(data.default)[0] ?? null;
        }
        return [models, defaultModel];
      } catch (e) {
        console.warn("[proxy] get_available_models failed:", e);
        return [[], null];
      }
    },

    get_project_model_config_status: async () => {
      if (proxyState.projectModelConfig.path.length > 0) {
        return structuredClone(proxyState.projectModelConfig);
      }

      // Dev simulator cannot safely inspect local project files in browser mode.
      // Return an optimistic status so the required-default gate is only enforced
      // in real app/runtime, not in browser simulator dev mode.
      return {
        exists: false,
        has_model: true,
        model: null,
        path: "",
      };
    },

    set_project_default_model: async (args) => {
      const model = ((args?.model as string) ?? "").trim();
      if (!model) return;
      proxyState.projectModelConfig = {
        exists: true,
        has_model: true,
        model,
        path: proxyState.repoPath ? `${proxyState.repoPath}/opencode.jsonc` : "opencode.jsonc",
      };
    },

    abort_chat: async () => {
      if (!proxyState.sessionId) return;
      try {
        await apiPost(`/session/${proxyState.sessionId}/abort`);
      } catch (e) {
        console.warn("[proxy] abort failed:", e);
      }
    },

    clear_chat: async () => {
      try {
        const session = await apiPost<{ id: string }>("/session", {
          title: "Flint chat",
        });
        proxyState.sessionId = session.id;
        console.log(`[proxy] new session: ${session.id}`);
      } catch (e) {
        console.warn("[proxy] clear_chat failed:", e);
      }
    },

    init_opencode: async () => {
      try {
        const health = await apiGet<{ healthy: boolean }>("/global/health");
        proxyState.connected = health.healthy;

        if (proxyState.connected) {
          startSSEBridge(emit);
          await ensureSession();
          return;
        }

        // Keep disconnected state explicit when health check reports down.
        stopSSEBridge();
        proxyState.sessionId = null;
      } catch (e) {
        console.warn("[proxy] init_opencode failed — is the OpenCode server running?", e);
        stopSSEBridge();
        proxyState.connected = false;
        proxyState.sessionId = null;
      }
    },

    get_provider_auth: async () => {
      try {
        const data = await apiGet<{
          providers: Array<{ id: string; name: string }>;
        }>("/config/providers");

        return data.providers.map((p) => ({
          id: p.id,
          name: p.name,
          connected: true,
        }));
      } catch {
        return [];
      }
    },

    start_provider_auth: async (args) => {
      const providerId = (args?.providerId as string) ?? "";
      return apiPost<{ url: string; method: string; instructions: string }>(
        `/provider/${providerId}/oauth/authorize`,
        { method: 0 },
      );
    },

    complete_provider_auth: async (args) => {
      const providerId = (args?.providerId as string) ?? "";
      const code = (args?.code as string) ?? "";
      await apiPost(`/provider/${providerId}/oauth/callback`, {
        method: 0,
        code,
      });
    },

    check_provider_connected: async (args) => {
      const providerId = (args?.providerId as string) ?? "";
      try {
        const data = await apiGet<{
          providers: Array<{ id: string }>;
        }>("/config/providers");
        return data.providers.some((p) => p.id === providerId);
      } catch {
        return false;
      }
    },
  };
}

/** Clean up proxy resources (SSE connection). */
export function shutdownProxy(): void {
  stopSSEBridge();
}
