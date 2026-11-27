import { tramData } from "../shared/lines";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Wednesday the tram timetable covers: the first one at least a day after it was built, since the timetable is
 * rebuilt from PTV's data and only runs a few weeks ahead.
 */
function findTimetabledWednesday() {
  // 22:00 UTC on a Tuesday is 9am on Wednesday in Melbourne in summer (8am in winter).
  let tuesdayNight = Math.floor(Date.parse(tramData.generatedAt) / DAY_MS + 1) * DAY_MS + 22 * 60 * 60 * 1000;
  while (new Date(tuesdayNight).getUTCDay() !== 2) tuesdayNight += DAY_MS;
  const wednesday = new Date(tuesdayNight + DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
  return { morning: tuesdayNight / 1000, serviceDate: wednesday };
}

/** Wednesday morning, in seconds, and that day's service date ("20261202"). */
export const TIMETABLED_WEDNESDAY = findTimetabledWednesday();
