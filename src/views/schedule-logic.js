export function getDayCountdownLabel(gameDateStr, now = new Date()) {
  const gameDate = new Date(gameDateStr);
  const baseDate = new Date(now);
  baseDate.setHours(0, 0, 0, 0);
  gameDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((gameDate - baseDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}
