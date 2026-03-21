/**
 * Shared types for the simulator module.
 */

import type { FlintConfig, ChatStatus } from "../src/lib/commands";

export type MonitorSessionStatus = "idle" | "working" | "waiting" | "error";

export interface MonitorSession {
  sessionId: string;
  title: string;
  status: MonitorSessionStatus;
  updatedAt: number;
}

export interface MonitoredServerState {
  id: string;
  host: string;
  port: number;
  label?: string | null;
  sessions: MonitorSession[];
}

export interface SimState {
  config: FlintConfig;
  chatStatus: ChatStatus;
  isStreaming: boolean;
  opencode: {
    autoReconnectOnInit: boolean;
    nextSessionIndex: number;
  };
  projectModelConfig: {
    exists: boolean;
    has_model: boolean;
    model: string | null;
    path: string;
  };
  monitoredServers: MonitoredServerState[];
}

export type EmitFn = (event: string, payload: unknown) => void;

export type CommandHandler = (args?: Record<string, unknown>) => unknown | Promise<unknown>;

export type CommandHandlerMap = Record<string, CommandHandler>;
