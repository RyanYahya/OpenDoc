const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
const relative = new Intl.RelativeTimeFormat(undefined, { style: 'narrow' });
const recent = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A compact local age such as "2h ago", or a short date after a week, with the full date and time as its tooltip. */
export function CommentTime({ value, now = Date.now() }: { value: string; now?: number }) {
  const date = new Date(value);
  const seconds = (date.getTime() - now) / 1000;
  if (!Number.isFinite(seconds)) return null;
  const elapsed = Math.abs(seconds);
  const [unit, size] = units.find(([, size]) => elapsed >= size) ?? ['second', 1];
  const label = elapsed < 60 ? recent.format(0, 'second')
    : elapsed < 7 * 86400 ? relative.format(Math.trunc(seconds / size), unit)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }) });
  return <time className="comment-time" dateTime={value} title={full.format(date)}>{label}</time>;
}
