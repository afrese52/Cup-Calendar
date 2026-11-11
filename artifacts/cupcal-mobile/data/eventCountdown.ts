const minuteInMs = 60_000;
const hourInMinutes = 60;
const dayInMinutes = 24 * hourInMinutes;

export function getEventCountdownLabel(
  startTime: string,
  endTime: string,
  now = Date.now(),
): string {
  const startMs = Date.parse(startTime);
  if (!Number.isFinite(startMs)) return 'Zeit unbekannt';

  const minutesUntilStart = Math.ceil((startMs - now) / minuteInMs);
  if (minutesUntilStart > 0) {
    if (minutesUntilStart < hourInMinutes) {
      return `in ${minutesUntilStart} Min.`;
    }

    if (minutesUntilStart < dayInMinutes) {
      const hours = Math.floor(minutesUntilStart / hourInMinutes);
      const minutes = minutesUntilStart % hourInMinutes;
      return `in ${hours} Std. ${minutes} Min.`;
    }

    const days = Math.floor(minutesUntilStart / dayInMinutes);
    const hours = Math.floor((minutesUntilStart % dayInMinutes) / hourInMinutes);
    const minutes = minutesUntilStart % hourInMinutes;
    return `in ${days} ${days === 1 ? 'Tag' : 'Tagen'} ${hours} Std. ${minutes} Min.`;
  }

  const endMs = Date.parse(endTime);
  if (!Number.isFinite(endMs) || now < endMs) return 'Läuft';
  return 'Beendet';
}
