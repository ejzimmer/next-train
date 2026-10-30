// Each line with its generated data (npm run gtfs). Used by the functions, not the page: the timetables are large.
import stations from "../data/stations.json";
import alameinTrips from "../data/alamein.trips.json";
import alameinTimes from "../data/alamein.times.json";
import belgraveTrips from "../data/belgrave.trips.json";
import belgraveTimes from "../data/belgrave.times.json";
import craigieburnTrips from "../data/craigieburn.trips.json";
import craigieburnTimes from "../data/craigieburn.times.json";
import cranbourneTrips from "../data/cranbourne.trips.json";
import cranbourneTimes from "../data/cranbourne.times.json";
import frankstonTrips from "../data/frankston.trips.json";
import frankstonTimes from "../data/frankston.times.json";
import glenWaverleyTrips from "../data/glen-waverley.trips.json";
import glenWaverleyTimes from "../data/glen-waverley.times.json";
import hurstbridgeTrips from "../data/hurstbridge.trips.json";
import hurstbridgeTimes from "../data/hurstbridge.times.json";
import lilydaleTrips from "../data/lilydale.trips.json";
import lilydaleTimes from "../data/lilydale.times.json";
import merndaTrips from "../data/mernda.trips.json";
import merndaTimes from "../data/mernda.times.json";
import pakenhamTrips from "../data/pakenham.trips.json";
import pakenhamTimes from "../data/pakenham.times.json";
import sandringhamTrips from "../data/sandringham.trips.json";
import sandringhamTimes from "../data/sandringham.times.json";
import stonyPointTrips from "../data/stony-point.trips.json";
import stonyPointTimes from "../data/stony-point.times.json";
import sunburyTrips from "../data/sunbury.trips.json";
import sunburyTimes from "../data/sunbury.times.json";
import upfieldTrips from "../data/upfield.trips.json";
import upfieldTimes from "../data/upfield.times.json";
import werribeeTrips from "../data/werribee.trips.json";
import werribeeTimes from "../data/werribee.times.json";
import williamstownTrips from "../data/williamstown.trips.json";
import williamstownTimes from "../data/williamstown.times.json";
import { LINES } from "./network";
import type { LineConfig, LineData, LineTimes } from "./types";

const TIMETABLES: Record<string, [unknown, unknown]> = {
  alamein: [alameinTrips, alameinTimes],
  belgrave: [belgraveTrips, belgraveTimes],
  craigieburn: [craigieburnTrips, craigieburnTimes],
  cranbourne: [cranbourneTrips, cranbourneTimes],
  frankston: [frankstonTrips, frankstonTimes],
  "glen-waverley": [glenWaverleyTrips, glenWaverleyTimes],
  hurstbridge: [hurstbridgeTrips, hurstbridgeTimes],
  lilydale: [lilydaleTrips, lilydaleTimes],
  mernda: [merndaTrips, merndaTimes],
  pakenham: [pakenhamTrips, pakenhamTimes],
  sandringham: [sandringhamTrips, sandringhamTimes],
  "stony-point": [stonyPointTrips, stonyPointTimes],
  sunbury: [sunburyTrips, sunburyTimes],
  upfield: [upfieldTrips, upfieldTimes],
  werribee: [werribeeTrips, werribeeTimes],
  williamstown: [williamstownTrips, williamstownTimes],
};

export const lines: Record<string, { config: LineConfig; data: LineData }> = Object.fromEntries(
  LINES.map((config) => {
    const [trips, times] = TIMETABLES[config.id] ?? [{}, undefined];
    const data: LineData = {
      generatedAt: stations.generatedAt,
      stations: stations.stations as LineData["stations"],
      trips: trips as LineData["trips"],
      times: times as LineTimes | undefined,
    };
    return [config.id, { config, data }];
  }),
);
