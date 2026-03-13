/** Detect whether the current platform is macOS. */
export function isMac(): boolean {
  return navigator.userAgent.includes("Mac");
}
