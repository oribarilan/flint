import { z } from "zod";
import type { Meeting, AttentionItem } from "../types";
import { AttentionItemSchema } from "./schemas";

// ── PillState ──

export type PillState = "briefing" | "meeting-focus" | "action-confirm" | "chat";

// ── Block data interfaces ──

export interface MeetingCardData extends Meeting {
  aiPrep?: string[];
}

export interface ActionConfirmData {
  action: string;
  label: string;
  status: "pending" | "done";
}

export interface SuggestionChip {
  label: string;
  prompt: string;
}

// ── FlintBlock discriminated union ──

export type FlintBlock =
  | { type: "meeting-list"; data: Meeting[] }
  | { type: "meeting-card"; data: MeetingCardData }
  | { type: "attention-list"; data: AttentionItem[] }
  | { type: "action-confirmation"; data: ActionConfirmData }
  | { type: "chat-message"; data: { role: "assistant"; content: string } }
  | { type: "suggestion-chips"; data: SuggestionChip[] };

// ── derivePillState ──

export function derivePillState(activeBlock: FlintBlock | null, isStreaming: boolean): PillState {
  if (isStreaming && !activeBlock) return "chat";
  if (!activeBlock) return "briefing";
  switch (activeBlock.type) {
    case "meeting-card":
      return "meeting-focus";
    case "action-confirmation":
      return "action-confirm";
    case "chat-message":
      return "chat";
    default:
      return "briefing";
  }
}

// ── Zod schemas ──

export const MeetingCardDataSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  attendees: z.array(z.string()),
  organizer: z.string(),
  joinUrl: z.string().max(2000).optional(),
  agenda: z.string().max(5000).optional(),
  isAllDay: z.boolean().optional(),
  aiPrep: z.array(z.string().max(2000)).optional(),
});

export const ActionConfirmDataSchema = z.object({
  action: z.string().min(1).max(100),
  label: z.string().min(1).max(500),
  status: z.enum(["pending", "done"]),
});

export const SuggestionChipSchema = z.object({
  label: z.string().min(1).max(100),
  prompt: z.string().min(1).max(1000),
});

export const ChatMessageDataSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().min(1).max(50_000),
});

const MeetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  attendees: z.array(z.string()),
  organizer: z.string(),
  joinUrl: z.string().optional(),
  agenda: z.string().optional(),
  isAllDay: z.boolean().optional(),
});

export const FlintBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meeting-list"), data: z.array(MeetingSchema) }),
  z.object({ type: z.literal("meeting-card"), data: MeetingCardDataSchema }),
  z.object({ type: z.literal("attention-list"), data: z.array(AttentionItemSchema) }),
  z.object({ type: z.literal("action-confirmation"), data: ActionConfirmDataSchema }),
  z.object({ type: z.literal("chat-message"), data: ChatMessageDataSchema }),
  z.object({ type: z.literal("suggestion-chips"), data: z.array(SuggestionChipSchema) }),
]);

// ── blocks:action validation ──

const BLOCKS_ACTION_TYPES = ["join", "dismiss", "open"] as const;
export type BlocksActionType = (typeof BLOCKS_ACTION_TYPES)[number];

export const BlocksActionSchema = z.object({
  type: z.enum(BLOCKS_ACTION_TYPES),
  payload: z.record(z.string(), z.string()),
});

export type BlocksAction = z.infer<typeof BlocksActionSchema>;
