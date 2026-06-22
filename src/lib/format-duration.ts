/**
 * Human-readable duration formatter.
 *
 * Rules:
 *   - < 1 minute  -> "Xs"        e.g. "42s"
 *   - < 1 hour    -> "X min"     e.g. "36 min"
 *   - >= 1 hour   -> "Xh Ym"     e.g. "1h 12m"
 *
 * Never returns decimal hours like "0.6h" or "0.21".
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return `${total}s`;
  const totalMin = Math.floor(total / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** HH:MM:SS clock-style format (for live tickers). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
