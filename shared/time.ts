import type { City } from "./types";

/** Each city's time zone. Brisbane has no daylight saving, so it's an hour behind the others in summer. */
export const TIME_ZONES: Record<City, string> = {
  melbourne: "Australia/Melbourne",
  sydney: "Australia/Sydney",
  brisbane: "Australia/Brisbane",
};

const cache = new Map<string, Intl.DateTimeFormat>();

/** An Intl.DateTimeFormat, made once for each locale, time zone and set of options. */
export function dateFormat(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify([locale, timeZone, options]);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale, { ...options, timeZone })));
  return f;
}
