/** HTTP polling for browser-tab snapshots (off by default — use WS `browser-tab-events-update` instead). */
export function isBrowserTabHttpPollEnabled(): boolean {
  const raw = (
    process.env.NEXT_PUBLIC_BROWSER_TAB_HTTP_POLL ??
    process.env.BROWSER_TAB_HTTP_POLL ??
    "false"
  )
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}
