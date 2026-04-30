import { defineConfig } from "vitest/config";

/**
 * Vitest config dedicated to the eval suite. Loaded by `just eval`.
 *
 * Evals invoke a real Copilot session, which is slow, costs API credits,
 * and requires `copilot auth` on the host machine. They are excluded from
 * the default suite (`vitest.config.ts`) and only run on demand.
 */
export default defineConfig({
  test: {
    include: ["src/main/__tests__/evals/**/*.eval.test.ts"],
    // Each eval call to the Copilot API can take 10-30s. Allow generous timeouts.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Evals must be serial — running them in parallel hits rate limits and
    // produces interleaved log output that's hard to debug.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
