/**
 * Queensland Rail's Citytrain network in Brisbane and South East Queensland: every line's stations and where
 * they sit on one schematic, laid out after Translink's network map. Each line runs from the city (Bowen Hills
 * or Roma Street) out to its end; most trains run through the city from one line to another, so their trips
 * are on both lines.
 */
import { createLayout, type LineDef } from "./layout";
import type { LineConfig, SchematicStation } from "./types";

const layout = createLayout();
const { at, relabel, walk } = layout.ns();

// The city, north to south: Bowen Hills, Fortitude Valley, Central and Roma Street.
at("Roma Street", 0, 0, "r");
walk("Roma Street", { dir: "N", step: 50, label: "r", names: ["Central", "Fortitude Valley", "Bowen Hills"] });

// North: up to Eagle Junction, where the Airport and Doomben lines leave, and on to Northgate.
walk("Bowen Hills", { dir: "N", step: 40, label: ["r", "r", "l"], names: ["Albion", "Wooloowin", "Eagle Junction"] });
walk("Eagle Junction", { dir: "NE", step: 60, label: "r", names: ["International Airport", "Domestic Airport"] });
walk("Eagle Junction", { dir: "E", step: 90, label: "b", names: ["Clayfield"] }, { dir: "E", step: 60, label: "b", names: ["Hendra", "Ascot", "Doomben"] });
walk("Eagle Junction", { dir: "N", step: 40, label: "l", names: ["Toombul", "Nundah", "Northgate"] });
walk("Northgate", { dir: "NE", step: 45, label: "r", names: ["Bindha"] }, {
  dir: "NE",
  step: 28,
  label: "r",
  names: ["Banyo", "Nudgee", "Boondall", "North Boondall", "Deagon", "Sandgate", "Shorncliffe"],
});
walk("Northgate", {
  dir: "N",
  step: 26,
  label: "l",
  names: ["Virginia", "Sunshine", "Geebung", "Zillmere", "Carseldine", "Bald Hills", "Strathpine", "Bray Park", "Lawnton", "Petrie"],
});
walk("Petrie", { dir: "NE", step: 30, label: "r", names: ["Kallangur", "Murrumba Downs", "Mango Hill", "Mango Hill East", "Rothwell", "Kippa-Ring"] });
walk("Petrie", { dir: "N", step: 26, label: "l", names: ["Dakabin", "Narangba", "Burpengary", "Morayfield", "Caboolture"] });
walk("Caboolture", {
  dir: "N",
  step: 22,
  label: "l",
  names: [
    "Elimbah", "Beerburrum", "Glass House Mountains", "Beerwah", "Landsborough", "Mooloolah", "Eudlo", "Palmwoods", "Woombye",
    "Nambour", "Yandina", "Eumundi", "Cooroy", "Pomona", "Cooran", "Traveston", "Gympie North",
  ],
});

// Ferny Grove, north-west from Bowen Hills.
walk("Bowen Hills", { dir: "W", step: 70, label: "b", names: ["Windsor"] }, {
  dir: "NW",
  step: 30,
  label: "l",
  turn: 0,
  names: ["Wilston", "Newmarket", "Alderley", "Enoggera", "Gaythorne", "Mitchelton", "Oxford Park", "Grovely", "Keperra", "Ferny Grove"],
});

// West: along the river to Darra, then Ipswich and Rosewood, and Springfield.
walk(
  "Roma Street",
  { dir: "W", step: 44, label: "tb", names: ["Milton", "Auchenflower", "Toowong", "Taringa", "Indooroopilly"] },
  { dir: "SW", step: 30, label: "l", names: ["Chelmer", "Graceville", "Sherwood", "Corinda", "Oxley", "Darra"] },
);
walk(
  "Darra",
  {
    dir: "W",
    step: 50,
    label: "bt",
    names: ["Wacol", "Gailes", "Goodna", "Redbank", "Riverview", "Dinmore", "Ebbw Vale", "Bundamba", "Booval", "East Ipswich", "Ipswich"],
  },
  { dir: "W", step: 50, label: "tb", names: ["Thomas Street", "Wulkuraka", "Karrabin", "Walloon", "Thagoona", "Rosewood"] },
);
relabel("Darra", "r", [0, -4]);
walk("Darra", { dir: "S", step: 40, label: "r", names: ["Richlands", "Springfield", "Springfield Central"] });

// South: across the river to Boggo Road, then Cleveland to the east and Beenleigh and the Gold Coast to the south.
walk("Roma Street", { dir: "S", step: 44, label: ["r", "r", "l"], names: ["South Brisbane", "South Bank", "Boggo Road"] });
walk(
  "Boggo Road",
  { dir: "E", step: 80, label: "t", names: ["Buranda"] },
  { dir: "E", step: 44, label: "bt", names: ["Coorparoo", "Norman Park", "Morningside", "Cannon Hill", "Murarrie", "Hemmant", "Lindum"] },
  {
    dir: "SE",
    step: 26,
    label: "r",
    names: ["Wynnum North", "Wynnum", "Wynnum Central", "Manly", "Lota", "Thorneside", "Birkdale", "Wellington Point", "Ormiston", "Cleveland"],
  },
);
walk("Boggo Road", {
  dir: "S",
  step: 26,
  label: "l",
  names: [
    "Dutton Park", "Fairfield", "Yeronga", "Yeerongpilly", "Rocklea", "Salisbury", "Coopers Plains", "Banoon", "Sunnybank", "Altandi", "Runcorn",
    "Fruitgrove", "Kuraby", "Trinder Park", "Woodridge", "Kingston", "Loganlea", "Bethania", "Edens Landing", "Holmview", "Beenleigh",
  ],
});
walk("Beenleigh", { dir: "SE", step: 30, label: "r", names: ["Ormeau", "Pimpama", "Coomera", "Hope Island", "Helensvale", "Nerang", "Robina", "Varsity Lakes"] });

/** Line colours from Translink's GTFS routes.txt, a colour shared by the lines paired on its network map. */
export const GROUPS = {
  // Drawn side by side where they share track, in this order (left of the direction first written).
  green: { colour: "#27855A", text: "#FFFFFF" },
  lightblue: { colour: "#6CC6E9", text: "#1D1D1D" },
  purple: { colour: "#9B60A6", text: "#FFFFFF" },
  yellow: { colour: "#FFC425", text: "#1D1D1D" },
  blue: { colour: "#4778B2", text: "#FFFFFF" },
  red: { colour: "#D53E45", text: "#FFFFFF" },
} as const;
export type Group = keyof typeof GROUPS;

/** Where the usual group order would cross lines over, the order on that stretch (ids sorted, "|"-joined). */
export const EDGE_ORDER: Record<string, Group[]> = {};

const CITY_NORTH = ["Roma Street", "Central", "Fortitude Valley", "Bowen Hills"];
const CITY_SOUTH = [...CITY_NORTH].reverse().concat("South Brisbane", "South Bank", "Boggo Road");
const CITY_WEST = [...CITY_NORTH].reverse();
const TO_EAGLE_JUNCTION = [...CITY_NORTH, "Albion", "Wooloowin", "Eagle Junction"];
const TO_NORTHGATE = [...TO_EAGLE_JUNCTION, "Toombul", "Nundah", "Northgate"];
const TO_PETRIE = [...TO_NORTHGATE, "Virginia", "Sunshine", "Geebung", "Zillmere", "Carseldine", "Bald Hills", "Strathpine", "Bray Park", "Lawnton", "Petrie"];
const TO_CABOOLTURE = [...TO_PETRIE, "Dakabin", "Narangba", "Burpengary", "Morayfield", "Caboolture"];
const TO_DARRA = [...CITY_WEST, "Milton", "Auchenflower", "Toowong", "Taringa", "Indooroopilly", "Chelmer", "Graceville", "Sherwood", "Corinda", "Oxley", "Darra"];
const TO_BEENLEIGH = [
  ...CITY_SOUTH, "Dutton Park", "Fairfield", "Yeronga", "Yeerongpilly", "Rocklea", "Salisbury", "Coopers Plains", "Banoon", "Sunnybank", "Altandi",
  "Runcorn", "Fruitgrove", "Kuraby", "Trinder Park", "Woodridge", "Kingston", "Loganlea", "Bethania", "Edens Landing", "Holmview", "Beenleigh",
];

/**
 * Translink route ids name a route's two ends ("FGBN-5212" is Ferny Grove to Beenleigh, "BR" the city),
 * so a line's routes are the ones with one of its ends' codes at either end.
 */
function ends(...codes: string[]) {
  const own = codes.join("|");
  return new RegExp(`^(?:(?:${own})[A-Z]{2}|[A-Z]{2}(?:${own}))-`).source;
}

/** Routes on the line alone, or between it and the city: what an alert about the line names. */
function ownRoutes(...codes: string[]) {
  const own = codes.join("|");
  return new RegExp(`^(?:(?:${own})(?:BR|${own})|BR(?:${own}))-`).source;
}

type BrisbaneLineDef = Omit<LineDef, "mode" | "routeIdMatch"> & { group: Group; codes: string[] };

const LINE_DEFS: BrisbaneLineDef[] = [
  { name: "Airport", group: "yellow", codes: ["BD"], stations: [...TO_EAGLE_JUNCTION, "International Airport", "Domestic Airport"] },
  { name: "Gold Coast", group: "yellow", codes: ["VL"], stations: [...TO_BEENLEIGH, "Ormeau", "Pimpama", "Coomera", "Hope Island", "Helensvale", "Nerang", "Robina", "Varsity Lakes"] },
  { name: "Beenleigh", group: "red", codes: ["BN"], stations: TO_BEENLEIGH },
  { name: "Ferny Grove", group: "red", codes: ["FG"], stations: [...CITY_NORTH, "Windsor", "Wilston", "Newmarket", "Alderley", "Enoggera", "Gaythorne", "Mitchelton", "Oxford Park", "Grovely", "Keperra", "Ferny Grove"] },
  {
    name: "Cleveland",
    group: "blue",
    codes: ["CL"],
    stations: [
      ...CITY_SOUTH, "Buranda", "Coorparoo", "Norman Park", "Morningside", "Cannon Hill", "Murarrie", "Hemmant", "Lindum", "Wynnum North", "Wynnum",
      "Wynnum Central", "Manly", "Lota", "Thorneside", "Birkdale", "Wellington Point", "Ormiston", "Cleveland",
    ],
  },
  { name: "Shorncliffe", group: "blue", codes: ["SH"], stations: [...TO_NORTHGATE, "Bindha", "Banyo", "Nudgee", "Boondall", "North Boondall", "Deagon", "Sandgate", "Shorncliffe"] },
  // Doomben trains carry on through the city to Boggo Road.
  { name: "Doomben", group: "purple", codes: ["DB"], stations: [...[...CITY_SOUTH].reverse(), ...TO_EAGLE_JUNCTION.slice(4), "Clayfield", "Hendra", "Ascot", "Doomben"] },
  { name: "Caboolture", group: "green", codes: ["CA"], stations: TO_CABOOLTURE },
  {
    name: "Sunshine Coast",
    group: "green",
    codes: ["NA", "GY"],
    stations: [
      ...TO_CABOOLTURE, "Elimbah", "Beerburrum", "Glass House Mountains", "Beerwah", "Landsborough", "Mooloolah", "Eudlo", "Palmwoods", "Woombye", "Nambour",
      "Yandina", "Eumundi", "Cooroy", "Pomona", "Cooran", "Traveston", "Gympie North",
    ],
  },
  {
    name: "Ipswich/Rosewood",
    group: "green",
    codes: ["IP", "RW"],
    stations: [
      ...TO_DARRA, "Wacol", "Gailes", "Goodna", "Redbank", "Riverview", "Dinmore", "Ebbw Vale", "Bundamba", "Booval", "East Ipswich", "Ipswich",
      "Thomas Street", "Wulkuraka", "Karrabin", "Walloon", "Thagoona", "Rosewood",
    ],
  },
  { name: "Springfield", group: "lightblue", codes: ["SP"], stations: [...TO_DARRA, "Richlands", "Springfield", "Springfield Central"] },
  { name: "Redcliffe Peninsula", group: "lightblue", codes: ["RP"], stations: [...TO_PETRIE, "Kallangur", "Murrumba Downs", "Mango Hill", "Mango Hill East", "Rothwell", "Kippa-Ring"] },
];

export const LINES: LineConfig[] = layout.lines(
  "brisbane",
  LINE_DEFS.map(({ codes, ...def }) => ({ ...def, mode: "train", routeIdMatch: [], routeIdPattern: ends(...codes), alertRoutePattern: ownRoutes(...codes) })),
  GROUPS,
);

export const LINE_BY_ID: Record<string, LineConfig> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** Every station on the map, by id. */
export const STATIONS: Record<string, Omit<SchematicStation, "via">> = layout.places;
