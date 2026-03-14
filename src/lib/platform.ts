/** Detect whether the current platform is macOS. */
export function isMac(): boolean {
  return navigator.userAgent.includes("Mac");
}

/** Detect whether the current platform is Windows. */
export function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}
