import type { IPO } from "./types";
const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  const result: string[] = [];
  let current = "",
    bytes = 0;
  for (const c of line) {
    const length = new TextEncoder().encode(c).length;
    if (bytes + length > 75) {
      result.push(current);
      current = " ";
      bytes = 1;
    }
    current += c;
    bytes += length;
  }
  result.push(current);
  return result.join("\r\n");
}
export function ipoCalendar(issues: IPO[], now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hedgeway//IPO Research Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
  for (const issue of issues)
    for (const [label, value] of [
      ["Opens", issue.openDate],
      ["Closes", issue.closeDate],
    ]) {
      if (!value) continue;
      const date = value.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const start = new Date(`${date}T00:00:00Z`);
      if (
        Number.isNaN(start.getTime()) ||
        start.toISOString().slice(0, 10) !== date
      )
        continue;
      const end = new Date(start.getTime() + 86400000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${encodeURIComponent(issue.slug)}-${label?.toLowerCase()}@hedgeway.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeText(`${issue.name} IPO · ${label}`)}`,
        `DESCRIPTION:${escapeText(`Reported by ${issue.source}; snapshot ${issue.asOf}. Verify dates and cut-off times with your broker. This is an all-day reminder, not an application or recommendation.`)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
