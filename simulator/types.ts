/**
 * Shared types for the simulator module.
 */

import type { FlintConfig, ChatStatus } from "../src/lib/commands";

export interface SimState {
  config: FlintConfig;
  chatStatus: ChatStatus;
  isStreaming: boolean;
  providerConnected: boolean;
}

export type EmitFn = (event: string, payload: unknown) => void;

export type CommandHandler = (args?: Record<string, unknown>) => unknown | Promise<unknown>;

export type CommandHandlerMap = Record<string, CommandHandler>;
