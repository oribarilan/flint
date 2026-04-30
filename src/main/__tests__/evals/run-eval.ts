/**
 * Eval harness for Flint's chat system prompt.
 *
 * An eval is a single behavioral assertion about how the model responds
 * given the real CHAT_SYSTEM_PROMPT and a fixed user prompt. Evals exist
 * because a 600-character prose system prompt is load-bearing
 * infrastructure: a model update or a careless prompt edit can silently
 * break "no tables", "no emojis", "always populate the attention panel",
 * etc. Unit tests only catch what we can assert about the prompt string.
 * Evals catch what we can assert about the model's behavior under that
 * prompt.
 *
 * **How to run:** `just eval` (uses vitest.eval.config.ts). Requires
 * `copilot auth` on the host machine. Each eval may take 10-30s and
 * costs API credits, so this suite is excluded from `just check`.
 *
 * **Flakiness handling:** each eval runs `EVAL_REPS` times (default 3)
 * and passes if ≥ ceil(REPS * 2/3) passes. LLMs are nondeterministic —
 * dampen single-run noise without hiding genuine regressions.
 *
 * **Results:** every run writes `eval-results/<ISO-timestamp>.json` with
 * per-eval pass/fail, response samples, and tool-call counts so you can
 * inspect drift over time.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { CopilotClient, Tool } from "@github/copilot-sdk";
import { CHAT_SYSTEM_PROMPT } from "../../copilot/system-prompt";
import { getChatTools } from "../../copilot/tools";
import { createPermissionPolicy } from "../../copilot/permissions";
import type { AttentionItem } from "../../types";

export interface EvalSample {
  /** Full assistant response text (concatenated message_delta events). */
  response: string;
  /** Names of every tool the model called, in order. */
  toolCalls: string[];
  /** Items the model passed to set_attention_items (valid items only). */
  attentionItems: AttentionItem[];
  /** Whether the assertion passed for this single sample. */
  passed: boolean;
  /** Optional message explaining a failure. */
  failureReason?: string;
}

export interface EvalResult {
  name: string;
  prompt: string;
  reps: number;
  passes: number;
  failures: number;
  passed: boolean;
  samples: EvalSample[];
}

export type EvalAssertion = (
  sample: Pick<EvalSample, "response" | "toolCalls" | "attentionItems">,
) => true | string;

export interface EvalSpec {
  name: string;
  prompt: string;
  assertion: EvalAssertion;
}

const REPS = Number(process.env.EVAL_REPS ?? 3);
const MODEL = process.env.EVAL_MODEL ?? "gpt-4.1";
const RESULTS_DIR = resolve(process.cwd(), "eval-results");

/**
 * Run a single sample: spin up a Copilot session with the real chat
 * system prompt + a stub set_attention_items tool, send the user prompt,
 * collect the response and tool-call traces.
 */
async function runOneSample(spec: EvalSpec, client: CopilotClient): Promise<EvalSample> {
  const toolCalls: string[] = [];
  const attentionItems: AttentionItem[] = [];

  // Stub the side-effect callbacks so the eval observes intent without
  // mutating any real store.
  const tools: Tool[] = getChatTools({
    onShowOverlay: () => {
      toolCalls.push("show_overlay");
    },
    onAttentionUpdate: (items) => {
      toolCalls.push("set_attention_items");
      attentionItems.push(...items);
    },
  });

  // Session per sample — fresh context, no cross-sample contamination.
  const session = await client.createSession({
    sessionId: `flint-eval-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    model: MODEL,
    onPermissionRequest: createPermissionPolicy(),
    streaming: true,
    systemMessage: { content: CHAT_SYSTEM_PROMPT },
    tools,
  });

  let response = "";
  session.on("assistant.message_delta", (event) => {
    response += event.data.deltaContent;
  });

  try {
    await session.sendAndWait({ prompt: spec.prompt }, 60_000);
  } finally {
    // Best-effort cleanup; ignore errors here so one cleanup hiccup
    // doesn't fail an otherwise-successful sample.
    try {
      await client.deleteSession(session.sessionId);
    } catch {
      /* ignore */
    }
  }

  const verdict = spec.assertion({ response, toolCalls, attentionItems });
  if (verdict === true) {
    return { response, toolCalls, attentionItems, passed: true };
  }
  return { response, toolCalls, attentionItems, passed: false, failureReason: verdict };
}

/**
 * Run an eval spec `EVAL_REPS` times, return the aggregate result.
 * Passes if at least ceil(REPS * 2/3) samples pass.
 */
export async function runEval(spec: EvalSpec, client: CopilotClient): Promise<EvalResult> {
  const samples: EvalSample[] = [];
  for (let i = 0; i < REPS; i++) {
    // eslint-disable-next-line no-await-in-loop -- serial by design
    const sample = await runOneSample(spec, client);
    samples.push(sample);
  }
  const passes = samples.filter((s) => s.passed).length;
  const failures = samples.length - passes;
  const threshold = Math.ceil(samples.length * (2 / 3));
  return {
    name: spec.name,
    prompt: spec.prompt,
    reps: samples.length,
    passes,
    failures,
    passed: passes >= threshold,
    samples,
  };
}

/** Write one results file per `just eval` invocation. */
export function writeResults(results: EvalResult[]): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(RESULTS_DIR, `${stamp}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: MODEL,
        reps: REPS,
        results,
      },
      null,
      2,
    ),
  );
  return path;
}
