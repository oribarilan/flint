import { shell } from "electron";

export type OpenExternalResult = { ok: true } | { ok: false; reason: string };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Validate a URL and open it in the default browser.
 *
 * Rejects:
 * - Malformed URLs
 * - URLs with whitespace
 * - Non-http(s) schemes (file://, javascript:, data:, mailto:, custom schemes, …)
 * - URLs with embedded credentials (user:pass@host)
 *
 * On rejection, logs a structured warning WITHOUT the full URL (it may contain
 * credentials or phishing query strings). Only the host is included.
 */
export function openExternalUrl(url: string): OpenExternalResult {
  if (/\s/.test(url)) {
    return reject(url, "whitespace in URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return reject(url, "malformed");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return reject(url, `non-http scheme: ${parsed.protocol}`);
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return reject(url, "embedded credentials");
  }

  void shell.openExternal(url);
  return { ok: true };
}

/** Extract a lowercased hostname from a URL string, or null if it doesn't parse. */
export function parseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function reject(url: string, reason: string): OpenExternalResult {
  console.warn("[url] blocked open:", reason, "host:", parseHost(url) ?? "n/a");
  return { ok: false, reason };
}
