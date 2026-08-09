export function exportSlug(value: string | null | undefined, fallback: string): string {
  const normalized = value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return normalized || fallback;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = typeof value === "string" && (
    /^[\u0000-\u0020]*[=+\-@]/.test(raw)
    || /^[\t\r]/.test(raw)
  )
    ? `'${raw}`
    : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function isoDate(value: number): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "unknown-date" : date.toISOString().slice(0, 10);
}
