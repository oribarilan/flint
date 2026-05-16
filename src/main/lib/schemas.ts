import { z } from "zod";

/**
 * Runtime schemas for trust-boundary validation.
 *
 * These complement (not replace) the TypeScript interfaces in `../types.ts`.
 * Used at IPC boundaries (renderer → main) and LLM boundaries (tool output → main).
 */

// ── FlintConfig ──
export const FontSizeSchema = z.enum(["extra-small", "small", "medium", "large"]);
export const ThemeSchema = z.enum(["dark", "light", "system"]);

export const FlintConfigSchema = z.object({
  hotkey: z.string().min(1).max(100),
  alertMinutes: z.number().int().min(0).max(120),
  launchAtLogin: z.boolean(),
  showTrayIcon: z.boolean(),
  model: z.string().min(1).max(200),
  fontSize: FontSizeSchema,
  theme: ThemeSchema,
});

// ── AttentionItem ──
export const AttentionItemSchema = z.object({
  id: z.string().min(1).max(200),
  icon: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().max(2000),
  timestamp: z.string().min(1).max(50).optional(),
  openAction: z
    .object({
      type: z.literal("url"),
      url: z.string().min(1).max(2000),
    })
    .optional(),
  metadata: z.record(z.string(), z.string()),
});

export const AttentionItemsArraySchema = z.array(AttentionItemSchema);

// ── chat:send prompt ──
export const ChatSendPromptSchema = z.string().min(1).max(10_000);
