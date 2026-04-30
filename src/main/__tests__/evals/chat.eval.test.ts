/**
 * Behavioral evals for the chat system prompt.
 *
 * Run via `just eval`. Skipped unless `RUN_EVALS=1`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CopilotClient } from "@github/copilot-sdk";
import { runEval, writeResults, type EvalResult, type EvalSpec } from "./run-eval";

const SHOULD_RUN = process.env.RUN_EVALS === "1";

// Common emoji unicode ranges. Not exhaustive (Unicode is vast) but covers
// the categories the prompt is most likely to be tempted to use: pictographs,
// dingbats, transport/map symbols, regional indicators, supplemental
// arrows/symbols, and the variation selector that often follows them.
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|\uFE0F/u;

const SPECS: EvalSpec[] = [
  {
    name: "no-markdown-tables",
    prompt: "List my next 3 meetings as a markdown table with columns Time and Title.",
    assertion: ({ response }) => {
      // The "table separator" line `|---|` is the unambiguous signature
      // of a real markdown table; matching just `|` would catch inline pipes.
      if (/\|\s*-{3,}/.test(response)) {
        return "response contains markdown table separator (`|---`)";
      }
      return true;
    },
  },
  {
    name: "no-emojis",
    prompt: "Summarize my day in a friendly upbeat tone.",
    assertion: ({ response }) => {
      const match = EMOJI_REGEX.exec(response);
      if (match)
        return `response contains emoji at index ${String(match.index)}: ${JSON.stringify(match[0])}`;
      return true;
    },
  },
  {
    name: "calls-set-attention-items-for-calendar-questions",
    prompt: "What's on my calendar today? Show me my meetings.",
    assertion: ({ toolCalls }) => {
      if (!toolCalls.includes("set_attention_items")) {
        return `expected set_attention_items to be called; observed tool calls: ${JSON.stringify(toolCalls)}`;
      }
      return true;
    },
  },
  {
    name: "uses-inline-code-for-paths",
    prompt: "Where does the Flint app store its config file? Mention the path.",
    assertion: ({ response }) => {
      // Look for any inline-code span. We don't enforce that the path is
      // correct (the model may not know); we only enforce that the prompt's
      // formatting rule ("file paths use inline code") is honored.
      if (!/`[^`\n]+`/.test(response)) {
        return "response contains no inline-code spans (\\`...\\`)";
      }
      return true;
    },
  },
];

describe.skipIf(!SHOULD_RUN)("chat prompt evals", () => {
  let client: CopilotClient | null = null;
  const collected: EvalResult[] = [];

  beforeAll(async () => {
    client = new CopilotClient();
    await client.start();
  }, 60_000);

  afterAll(async () => {
    if (collected.length > 0) {
      const path = writeResults(collected);
      console.log(`[eval] Results written to ${path}`);
    }
    if (client) {
      await client.stop();
    }
  });

  for (const spec of SPECS) {
    it(spec.name, async () => {
      if (!client) throw new Error("Copilot client not initialized");
      const result = await runEval(spec, client);
      collected.push(result);

      if (!result.passed) {
        const summary = result.samples
          .map((s, i) =>
            s.passed
              ? `  [${String(i)}] PASS`
              : `  [${String(i)}] FAIL — ${s.failureReason ?? "(no reason)"}\n    response: ${s.response.slice(0, 200)}…`,
          )
          .join("\n");
        throw new Error(
          `eval "${spec.name}" failed (${String(result.passes)}/${String(result.reps)} passed)\n${summary}`,
        );
      }
      expect(result.passed).toBe(true);
    });
  }
});

// When evals are gated off, surface a single skip-marker test so the
// suite isn't completely empty (vitest treats empty suites as a fail).
describe.skipIf(SHOULD_RUN)("chat prompt evals (skipped)", () => {
  it("set RUN_EVALS=1 (or use `just eval`) to run real-Copilot evals", () => {
    expect(true).toBe(true);
  });
});
