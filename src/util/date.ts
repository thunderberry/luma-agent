export function isoNow(): string {
  return new Date().toISOString();
}

export function localDateStamp(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isUpcoming(isoDate: string | undefined, now = new Date()): boolean {
  if (!isoDate) {
    return true;
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }
  return parsed.getTime() >= now.getTime();
}
