/** Compact relative age for feeds: "5m", "3h", "2d". */
export function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}
