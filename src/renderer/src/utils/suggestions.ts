import type { AttentionItem } from "../../../main/types";

export interface Suggestion {
  icon: string;
  title: string;
  description: string;
  category?: string;
}

export const STATIC_SUGGESTIONS: Suggestion[] = [
  {
    icon: "calendar",
    title: "What are my next meetings?",
    description: "See upcoming meetings, times, and attendees",
    category: "schedule",
  },
  {
    icon: "clipboard-list",
    title: "Prepare me for my next meeting",
    description: "Get agenda, attendee context, and talking points",
    category: "meeting-prep",
  },
  {
    icon: "alert-triangle",
    title: "Any conflicts this week?",
    description: "Find overlapping or back-to-back meetings",
    category: "conflicts",
  },
  {
    icon: "bar-chart-3",
    title: "Summarize today's schedule",
    description: "Quick overview of your day at a glance",
    category: "summary",
  },
];

const MAX_CONTEXTUAL = 3;
const TARGET_TOTAL = 4;

function mapItemToSuggestion(
  item: AttentionItem,
): { suggestion: Suggestion; replacesCategory: string } | null {
  switch (item.icon) {
    case "calendar":
      return {
        suggestion: {
          icon: "calendar",
          title: `Prepare me for ${item.title}`,
          description: item.description,
          category: "meeting-prep",
        },
        replacesCategory: "meeting-prep",
      };
    case "mail":
      return {
        suggestion: {
          icon: "mail",
          title: `Summarize email from ${item.description}`,
          description: item.title,
          category: "email",
        },
        replacesCategory: "email",
      };
    case "message-circle":
      return {
        suggestion: {
          icon: "message-circle",
          title: `Catch up on ${item.title}`,
          description: item.description,
          category: "teams",
        },
        replacesCategory: "teams",
      };
    default:
      return null;
  }
}

export function buildSuggestions(items: AttentionItem[]): Suggestion[] {
  const contextual: Suggestion[] = [];
  const coveredCategories = new Set<string>();

  for (const item of items) {
    if (contextual.length >= MAX_CONTEXTUAL) break;
    const mapped = mapItemToSuggestion(item);
    if (!mapped) continue;
    contextual.push(mapped.suggestion);
    coveredCategories.add(mapped.replacesCategory);
  }

  const remaining = TARGET_TOTAL - contextual.length;
  const fillers: Suggestion[] = [];
  for (const s of STATIC_SUGGESTIONS) {
    if (fillers.length >= remaining) break;
    if (s.category && coveredCategories.has(s.category)) continue;
    fillers.push(s);
  }

  return [...contextual, ...fillers];
}
