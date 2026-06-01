/**
 * Parse optional `from` / `to` ISO-8601 datetimes from query string.
 * Either boundary may be omitted. Both may be omitted (no time filter).
 */
export function parseOptionalDateRange(searchParams: URLSearchParams):
  | { ok: true; from: string | null; to: string | null }
  | { ok: false; error: string } {
  const fromRaw = searchParams.get("from")?.trim();
  const toRaw = searchParams.get("to")?.trim();

  let from: string | null = null;
  let to: string | null = null;

  if (fromRaw) {
    const d = new Date(fromRaw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Invalid from datetime" };
    }
    from = d.toISOString();
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Invalid to datetime" };
    }
    to = d.toISOString();
  }
  if (from && to && from > to) {
    return { ok: false, error: "from must be before or equal to to" };
  }
  return { ok: true, from, to };
}
