/**
 * One date and time vocabulary for the app: "8:42 PM" today, "Yesterday 3:10 PM",
 * then "Oct 1, 3:10 PM" (with the year when it differs). Full dates belong in tooltips.
 */
type DateInput = string | number | Date;

interface Formatters {
  time: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  dateTimeYear: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
  weekdayYear: Intl.DateTimeFormat;
  full: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
}

const cache = new Map<string, Formatters>();
function formatters(locale?: string): Formatters {
  const key = locale ?? '';
  let value = cache.get(key);
  if (!value) {
    value = {
      time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }),
      dateTime: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      dateTimeYear: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
      weekdayYear: new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      full: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    };
    cache.set(key, value);
  }
  return value;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);
const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

/** Whole calendar days from `value` to `now` in local time: 0 today, 1 yesterday. */
export function daysAgo(value: DateInput, now: DateInput = Date.now()) {
  return Math.round((startOfDay(new Date(now)) - startOfDay(new Date(value))) / 86_400_000);
}

/** A time of day, such as "8:42 PM". */
export const formatTime = (value: DateInput, locale?: string) => formatters(locale).time.format(new Date(value));

/** Two times on one day, such as "8:40 – 8:52 PM"; one time when they match. */
export function formatTimeRange(start: DateInput, end: DateInput, locale?: string) {
  const [from, to] = [new Date(start), new Date(end)].sort((a, b) => a.getTime() - b.getTime());
  const { time } = formatters(locale);
  return time.format(from) === time.format(to) ? time.format(from) : time.formatRange(from, to);
}

/** A day heading: "Today", "Yesterday", or "Wed, Sep 30" (with the year when it differs). */
export function formatDay(value: DateInput, { now = Date.now(), locale }: { now?: DateInput; locale?: string } = {}) {
  const date = new Date(value), f = formatters(locale);
  const days = daysAgo(date, now);
  if (days === 0 || days === 1) return capitalize(f.relative.format(-days, 'day'));
  return (date.getFullYear() === new Date(now).getFullYear() ? f.weekday : f.weekdayYear).format(date);
}

/** A compact moment: "8:42 PM" today, "Yesterday 3:10 PM", then "Oct 1, 3:10 PM". */
export function formatWhen(value: DateInput, { now = Date.now(), locale }: { now?: DateInput; locale?: string } = {}) {
  const date = new Date(value), f = formatters(locale);
  const days = daysAgo(date, now);
  if (days === 0) return f.time.format(date);
  if (days === 1) return `${capitalize(f.relative.format(-1, 'day'))} ${f.time.format(date)}`;
  return (date.getFullYear() === new Date(now).getFullYear() ? f.dateTime : f.dateTimeYear).format(date);
}

/** The unambiguous date and time, for tooltips and confirmations: "Oct 1, 2026, 3:10 PM". */
export const formatFull = (value: DateInput, locale?: string) => formatters(locale).full.format(new Date(value));
