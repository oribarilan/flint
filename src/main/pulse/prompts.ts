import type { AttentionItem } from "../types";

export interface MonitorPollContext {
  lastPollTime?: string;
  currentItems: AttentionItem[];
}

export const MONITOR_SYSTEM_PROMPT = `You are Flint's background monitor. Your job is to check the user's Microsoft 365 data and surface important items.

You have these tools:
- ask_work_iq: Query calendar, emails, and Teams messages
- set_attention_items: Update the attention panel (silent)
- show_notification: Send a native OS notification (interrupts the user)

Guidelines:
- Notifications are for truly time-sensitive items: meetings starting in <5 min, urgent emails from leadership, direct @mentions
- Attention items are for everything else worth knowing about
- Keep attention items to 5-8 max. Quality over quantity.
- Each item needs: icon (calendar/mail/message-circle), title, description, and metadata for chat context
- When given existing items, preserve unchanged ones. Don't churn.`;

export function buildMonitorPrompt(context: MonitorPollContext): string {
  if (!context.lastPollTime) {
    return buildBootstrapPrompt();
  }
  return buildDeltaPrompt(context.lastPollTime, context.currentItems);
}

function buildBootstrapPrompt(): string {
  return "Check my calendar for today and tomorrow, important unread emails, and recent Teams messages directed at me. Surface what matters.";
}

function buildDeltaPrompt(lastPollTime: string, currentItems: AttentionItem[]): string {
  const serialized =
    currentItems.length > 0
      ? JSON.stringify(currentItems.map((i) => ({ id: i.id, icon: i.icon, title: i.title })))
      : "none";
  return `Last check: ${lastPollTime}. Current items: ${serialized}. Check for changes since last check: calendar updates, new emails, new Teams messages. Update items: add new, keep unchanged, remove stale. Only notify for urgent/time-sensitive items.`;
}
