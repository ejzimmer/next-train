import { createContext, useContext } from "react";
import melbourneStations from "../data/stations.json";
import sydneyStations from "../data/sydney/stations.json";
import brisbaneStations from "../data/brisbane/stations.json";
import * as melbourne from "../shared/network";
import * as sydney from "../shared/sydney";
import * as brisbane from "../shared/brisbane";
import { routeNumber, TRAM_LINES, TRAM_PLACES, TRAM_STOPS } from "../shared/trams";
import { TIME_ZONES } from "../shared/time";
import type { Cartoon } from "./Loading";
import type { City, LineConfig, SchematicStation } from "../shared/types";

/** A button above the map showing and hiding its lines. */
export interface Switch {
  id: string;
  /** On the button. */
  name: string;
  /** The page's heading when it's the only one on. */
  title: string;
  colour: string;
  textColour: string;
  /** Tram routes' switches are shown instead of the trains' when trams are chosen. */
  mode?: "tram";
}

/** Everything the page needs to draw one city's map. */
export interface Network {
  city: City;
  name: string;
  /** The page's heading when more than one switch is on. */
  title: string;
  lines: LineConfig[];
  lineById: Record<string, LineConfig>;
  stations: Record<string, Omit<SchematicStation, "via">>;
  /** Where each station is, for finding the nearest one. */
  places: Record<string, { lat: number; lon: number }>;
  /** Groups in the order they're drawn side by side, and stretches where that order changes. */
  groupOrder: string[];
  edgeOrder: Record<string, string[]>;
  switches: Switch[];
  /** Switched on until the viewer chooses. */
  defaultSwitches: string[];
  /** Trains on this line keep the usual colours; trains on other lines are white. Null for none. */
  homeLine: string | null;
  attribution: string;
  /** The cartoon train on the loading and "Trip finished" screens. */
  cartoon: { model: Cartoon; cars: number };
  /** Where an alert's link goes, for its "More on ..." text. */
  alertsSite: string;
  /** Times are shown in the city's own time. */
  timeZone: string;
}

/** A switch for each line, as in Melbourne and Brisbane. */
const lineSwitches = (lines: LineConfig[]): Switch[] =>
  lines.map((l) => ({ id: l.id, name: l.name, title: `${l.name} line`, colour: l.colour, textColour: l.textColour }));

/** A round button per tram route, with just its number. */
const tramSwitches = TRAM_LINES.map(
  (l): Switch => ({ id: l.id, name: routeNumber(l), title: l.name, colour: l.colour, textColour: l.textColour, mode: "tram" }),
);

export const NETWORKS: Record<City, Network> = {
  melbourne: {
    city: "melbourne",
    name: "Melbourne",
    title: "Metro trains",
    lines: [...melbourne.LINES, ...TRAM_LINES],
    lineById: { ...melbourne.LINE_BY_ID, ...Object.fromEntries(TRAM_LINES.map((l) => [l.id, l])) },
    stations: { ...melbourne.STATIONS, ...TRAM_STOPS },
    places: { ...melbourneStations.stations, ...TRAM_PLACES },
    groupOrder: [...Object.keys(melbourne.GROUPS), ...TRAM_LINES.map((l) => l.group)],
    edgeOrder: melbourne.EDGE_ORDER,
    switches: [...lineSwitches(melbourne.LINES), ...tramSwitches],
    defaultSwitches: ["hurstbridge"],
    homeLine: "hurstbridge",
    cartoon: { model: "xtrapolis", cars: 6 },
    attribution:
      "Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence. Not affiliated with PTV.",
    alertsSite: "transport.vic.gov.au",
    timeZone: TIME_ZONES.melbourne,
  },
  sydney: {
    city: "sydney",
    name: "Sydney",
    title: "Trains and light rail",
    lines: sydney.LINES,
    lineById: sydney.LINE_BY_ID,
    stations: sydney.STATIONS,
    places: sydneyStations.stations,
    groupOrder: Object.keys(sydney.GROUPS),
    edgeOrder: sydney.EDGE_ORDER,
    switches: sydney.SWITCHES.map((s) => ({ ...s, colour: sydney.GROUPS[s.id].colour, textColour: sydney.GROUPS[s.id].text })),
    defaultSwitches: ["t8"],
    homeLine: null,
    cartoon: { model: "waratah", cars: 8 },
    attribution: "Source: Transport for NSW Open Data, under a Creative Commons Attribution 4.0 International Licence. Not affiliated with Transport for NSW.",
    alertsSite: "transportnsw.info",
    timeZone: TIME_ZONES.sydney,
  },
  brisbane: {
    city: "brisbane",
    name: "Brisbane",
    title: "Trains",
    lines: brisbane.LINES,
    lineById: brisbane.LINE_BY_ID,
    stations: brisbane.STATIONS,
    places: brisbaneStations.stations,
    groupOrder: Object.keys(brisbane.GROUPS),
    edgeOrder: brisbane.EDGE_ORDER,
    switches: lineSwitches(brisbane.LINES),
    defaultSwitches: ["airport"],
    homeLine: null,
    cartoon: { model: "ngr", cars: 6 },
    attribution:
      "Source: Translink, Department of Transport and Main Roads, under a Creative Commons Attribution 4.0 International Licence. Not affiliated with Translink.",
    alertsSite: "translink.com.au",
    timeZone: TIME_ZONES.brisbane,
  },
};

export const CITIES = Object.values(NETWORKS);

export const NetworkContext = createContext<Network>(NETWORKS.melbourne);

/** The network of the city being shown. */
export const useNetwork = () => useContext(NetworkContext);
