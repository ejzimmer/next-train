/**
 * The Metro train network: every line's stations (city end first) and where they sit on one schematic,
 * laid out after Metro's network map. Positions are written as walks from a station in one of eight
 * directions, so a branch can be moved by changing where it starts.
 */
import { createLayout, type LineDef } from "./layout";
import type { LineConfig, SchematicStation } from "./types";

export { stationId } from "./layout";

/** GTFS stop names that differ from the name on the map. */
const layout = createLayout({ Jolimont: "Jolimont-MCG" });
const { at, relabel, bend, walk } = layout.ns();
const places = layout.places;

// The city: the City Loop with Flinders Street at the bottom, and the Metro Tunnel running through it.
at("Flinders Street", 0, 0, "b");
at("Southern Cross", -150, 0, "b");
at("Flagstaff", -200, -100, "r");
at("Melbourne Central", -130, -200, "b");
relabel("Melbourne Central", "b", [0, 4]);
at("Parliament", 60, -120, "l");
at("Jolimont", 120, -120, "r");
at("Richmond", 180, 0, "b");
at("North Melbourne", -360, -100, "b");
at("Town Hall", -60, -50, "l");
at("State Library", -60, -150, "l");
at("Parkville", -60, -232, "t");
at("Arden", -430, -232, "t");
at("Anzac", -60, 67, "l");
bend("Southern Cross", "Flagstaff", [[-200, -50]]);
bend("Flagstaff", "Melbourne Central", [[-200, -170], [-170, -200]]);
bend("Melbourne Central", "Parliament", [[-20, -200]]);
bend("Flinders Street", "Jolimont", []);
bend("Southern Cross", "North Melbourne", [[-180, 0], [-280, -100]]);
// Northern group trains run between Parliament and Flinders Street round the east side.
bend("Parliament", "Flinders Street", [[60, -40], [20, 0]]);
bend("Parkville", "Arden", []);

// Clifton Hill group.
walk("Jolimont", {
  dir: "NE",
  step: 24,
  label: "r",
  names: ["West Richmond", "North Richmond", "Collingwood", "Victoria Park", "Clifton Hill"],
});
walk(
  "Clifton Hill",
  {
    dir: "NE",
    step: 24,
    label: "r",
    names: ["Westgarth", "Dennis", "Fairfield", "Alphington", "Darebin", "Ivanhoe", "Eaglemont", "Heidelberg"],
  },
  {
    dir: "E",
    step: 50,
    label: "tb",
    turn: 20,
    names: ["Rosanna", "Macleod", "Watsonia", "Greensborough", "Montmorency", "Eltham", "Diamond Creek", "Wattle Glen", "Hurstbridge"],
  },
);
relabel("Heidelberg", "l");
walk("Clifton Hill", {
  dir: "N",
  step: 24,
  label: "l",
  names: [
    "Rushall", "Merri", "Northcote", "Croxton", "Thornbury", "Bell", "Preston", "Regent", "Reservoir", "Ruthven",
    "Keon Park", "Thomastown", "Lalor", "Epping", "South Morang", "Middle Gorge", "Hawkstowe", "Mernda",
  ],
});

// Burnley group.
walk("Richmond", {
  dir: "E",
  step: 60,
  label: ["t", "b", "t", "b", "b", "t"],
  names: ["East Richmond", "Burnley", "Hawthorn", "Glenferrie", "Auburn", "Camberwell"],
});
relabel("Richmond", "b", [-24, 0]);
relabel("Burnley", "b", [-20, 0]);
walk(
  "Camberwell",
  { dir: "E", step: 90, label: "t", names: ["East Camberwell"] },
  {
    dir: "E",
    step: 50,
    label: "bt",
    names: ["Canterbury", "Chatham", "Union", "Box Hill", "Laburnum", "Blackburn", "Nunawading", "Mitcham", "Heatherdale", "Ringwood"],
  },
);
relabel("Ringwood", "t", [-20, 0]);
walk("Ringwood", { dir: "NE", step: 24, label: "r", names: ["Ringwood East", "Croydon", "Mooroolbark", "Lilydale"] });
walk("Ringwood", {
  dir: "SE",
  step: 24,
  label: "r",
  names: ["Heathmont", "Bayswater", "Boronia", "Ferntree Gully", "Upper Ferntree Gully", "Upwey", "Tecoma", "Belgrave"],
});
walk("Burnley", {
  dir: "SE",
  step: 24,
  label: "r",
  names: [
    "Heyington", "Kooyong", "Tooronga", "Gardiner", "Glen Iris", "Darling", "East Malvern", "Holmesglen",
    "Jordanville", "Mount Waverley", "Syndal", "Glen Waverley",
  ],
});
walk("Camberwell", { dir: "SE", step: 24, label: "r", names: ["Riversdale", "Willison", "Hartwell", "Burwood", "Ashburton", "Alamein"] });

// Frankston and Sandringham, then the Dandenong lines from Caulfield.
walk("Richmond", { dir: "SE", step: 30, label: "r", names: ["South Yarra", "Hawksburn", "Toorak", "Armadale", "Malvern", "Caulfield"] });
walk("South Yarra", {
  dir: "S",
  step: 24,
  label: "l",
  names: ["Prahran", "Windsor", "Balaclava", "Ripponlea", "Elsternwick", "Gardenvale", "North Brighton", "Middle Brighton", "Brighton Beach", "Hampton", "Sandringham"],
});
walk("Caulfield", {
  dir: "S",
  step: 24,
  label: "l",
  names: [
    "Glen Huntly", "Ormond", "McKinnon", "Bentleigh", "Patterson", "Moorabbin", "Highett", "Southland", "Cheltenham",
    "Mentone", "Parkdale", "Mordialloc", "Aspendale", "Edithvale", "Chelsea", "Bonbeach", "Carrum", "Seaford", "Kananook", "Frankston",
  ],
});
walk("Frankston", {
  dir: "S",
  step: 24,
  label: "l",
  names: ["Leawarra", "Baxter", "Somerville", "Tyabb", "Hastings", "Bittern", "Morradoo", "Crib Point", "Stony Point"],
});
walk("Caulfield", {
  dir: "SE",
  step: 24,
  label: "r",
  names: ["Carnegie", "Murrumbeena", "Hughesdale", "Oakleigh", "Huntingdale", "Clayton", "Westall", "Springvale", "Sandown Park", "Noble Park", "Yarraman", "Dandenong"],
});
walk("Dandenong", {
  dir: "E",
  step: 50,
  label: "tb",
  turn: 20,
  names: ["Hallam", "Narre Warren", "Berwick", "Beaconsfield", "Officer", "Cardinia Road", "Pakenham", "East Pakenham"],
});
walk("Dandenong", { dir: "S", step: 24, label: "l", names: ["Lynbrook", "Merinda Park", "Cranbourne"] });
relabel("Dandenong", "l");
// Metro Tunnel trains run express alongside the Frankston line from South Yarra to Malvern.
bend("Anzac", "Malvern", [[217, 67], [300, 150], [322, 150]]);

// Northern group.
walk("North Melbourne", {
  dir: "N",
  step: 24,
  label: "r",
  names: ["Macaulay", "Flemington Bridge", "Royal Park", "Jewell", "Brunswick", "Anstey", "Moreland", "Coburg", "Batman", "Merlynston", "Fawkner", "Gowrie", "Upfield"],
});
walk(
  "North Melbourne",
  { dir: "NW", step: 40, label: "l", names: ["Kensington"] },
  {
    dir: "NW",
    step: 24,
    label: "l",
    names: [
      "Newmarket", "Ascot Vale", "Moonee Ponds", "Essendon", "Glenbervie", "Strathmore", "Pascoe Vale",
      "Oak Park", "Glenroy", "Jacana", "Broadmeadows", "Coolaroo", "Roxburgh Park", "Craigieburn",
    ],
  },
);

// Werribee and Williamstown, then Sunbury from Footscray.
walk("North Melbourne", { dir: "W", step: 60, label: "t", names: ["South Kensington"] });
at("Footscray", -480, -100, "b");
relabel("Footscray", "b", [24, 0]);
bend("Arden", "Footscray", [[-480, -182]]);
walk("Footscray", { dir: "SW", step: 24, label: ["l", "r", "r", "r"], names: ["Seddon", "Yarraville", "Spotswood", "Newport"] });
walk("Newport", { dir: "S", step: 24, label: "r", names: ["North Williamstown", "Williamstown Beach", "Williamstown"] });
// The Altona loop, with Werribee trains that skip it running straight across to Laverton.
{
  const [nx, ny] = [places.newport.x, places.newport.y];
  at("Seaholme", nx - 40, ny + 40, "b");
  at("Altona", nx - 100, ny + 40, "b");
  at("Westona", nx - 160, ny + 40, "b");
  at("Laverton", nx - 240, ny, "t");
  bend("Westona", "Laverton", [[nx - 200, ny + 40]]);
}
walk("Laverton", { dir: "W", step: 70, label: "bt", names: ["Aircraft", "Williams Landing", "Hoppers Crossing", "Werribee"] });
walk(
  "Footscray",
  { dir: "W", step: 70, label: "tb", names: ["Middle Footscray", "West Footscray", "Tottenham", "Sunshine"] },
  { dir: "NW", step: 24, label: "r", names: ["Albion", "Ginifer", "St Albans", "Keilor Plains", "Watergardens", "Diggers Rest", "Sunbury"] },
);

/** Line colours and how lines are grouped, from PTV's GTFS routes.txt. */
export const GROUPS = {
  // Drawn side by side where they share track, in this order (left of the direction first written).
  pink: { colour: "#F178AF", text: "#000000" },
  northern: { colour: "#FFBE00", text: "#000000" },
  "clifton-hill": { colour: "#BE1014", text: "#FFFFFF" },
  burnley: { colour: "#152C6B", text: "#FFFFFF" },
  frankston: { colour: "#028430", text: "#FFFFFF" },
  tunnel: { colour: "#34ACE1", text: "#000000" },
} as const;
export type Group = keyof typeof GROUPS;

/** Where the usual group order would cross lines over, the order on that stretch (ids sorted, "|"-joined). */
export const EDGE_ORDER: Record<string, Group[]> = {
  "flinders-street|richmond": ["burnley", "frankston", "pink"],
  "richmond|south-yarra": ["frankston", "pink"],
};

const LOOP = ["Flinders Street", "Southern Cross", "Flagstaff", "Melbourne Central", "Parliament"];
const BURNLEY = [...LOOP, "Richmond", "East Richmond", "Burnley"];
const TO_CAMBERWELL = [...BURNLEY, "Hawthorn", "Glenferrie", "Auburn", "Camberwell"];
const TO_RINGWOOD = [
  ...TO_CAMBERWELL,
  "East Camberwell", "Canterbury", "Chatham", "Union", "Box Hill", "Laburnum", "Blackburn", "Nunawading", "Mitcham", "Heatherdale", "Ringwood",
];
const CLIFTON_HILL = [...LOOP, "Jolimont", "West Richmond", "North Richmond", "Collingwood", "Victoria Park", "Clifton Hill"];
const NORTHERN = ["Southern Cross", "Flinders Street", "Parliament", "Melbourne Central", "Flagstaff", "North Melbourne"];
const CROSS_CITY = ["Flinders Street", "Southern Cross", "North Melbourne", "South Kensington", "Footscray", "Seddon", "Yarraville", "Spotswood", "Newport"];
const CAULFIELD = ["Town Hall", "Anzac", "Malvern", "Caulfield"];
const TO_DANDENONG = [
  ...CAULFIELD,
  "Carnegie", "Murrumbeena", "Hughesdale", "Oakleigh", "Huntingdale", "Clayton", "Westall", "Springvale", "Sandown Park", "Noble Park", "Yarraman", "Dandenong",
];

/** A Metro line: `code` is its route code in GTFS route_ids, e.g. HBE in aus:vic:vic-02-HBE: */
type MetroLineDef = Omit<LineDef, "mode" | "routeIdMatch"> & { code: string; group: Group };

/** In the order the switches are shown, by group. */
const LINE_DEFS: MetroLineDef[] = [
  {
    name: "Hurstbridge",
    code: "HBE",
    group: "clifton-hill",
    stations: [...CLIFTON_HILL, "Westgarth", "Dennis", "Fairfield", "Alphington", "Darebin", "Ivanhoe", "Eaglemont", "Heidelberg", "Rosanna", "Macleod", "Watsonia", "Greensborough", "Montmorency", "Eltham", "Diamond Creek", "Wattle Glen", "Hurstbridge"],
    track: [["Flinders Street", "Jolimont"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Mernda",
    code: "MDD",
    group: "clifton-hill",
    stations: [...CLIFTON_HILL, "Rushall", "Merri", "Northcote", "Croxton", "Thornbury", "Bell", "Preston", "Regent", "Reservoir", "Ruthven", "Keon Park", "Thomastown", "Lalor", "Epping", "South Morang", "Middle Gorge", "Hawkstowe", "Mernda"],
    track: [["Flinders Street", "Jolimont"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Alamein",
    code: "ALM",
    group: "burnley",
    stations: [...TO_CAMBERWELL, "Riversdale", "Willison", "Hartwell", "Burwood", "Ashburton", "Alamein"],
    track: [["Flinders Street", "Richmond"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Belgrave",
    code: "BEG",
    group: "burnley",
    stations: [...TO_RINGWOOD, "Heathmont", "Bayswater", "Boronia", "Ferntree Gully", "Upper Ferntree Gully", "Upwey", "Tecoma", "Belgrave"],
    track: [["Flinders Street", "Richmond"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Glen Waverley",
    code: "GWY",
    group: "burnley",
    stations: [...BURNLEY, "Heyington", "Kooyong", "Tooronga", "Gardiner", "Glen Iris", "Darling", "East Malvern", "Holmesglen", "Jordanville", "Mount Waverley", "Syndal", "Glen Waverley"],
    track: [["Flinders Street", "Richmond"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Lilydale",
    code: "LIL",
    group: "burnley",
    stations: [...TO_RINGWOOD, "Ringwood East", "Croydon", "Mooroolbark", "Lilydale"],
    track: [["Flinders Street", "Richmond"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Craigieburn",
    code: "CGB",
    group: "northern",
    stations: [...NORTHERN, "Kensington", "Newmarket", "Ascot Vale", "Moonee Ponds", "Essendon", "Glenbervie", "Strathmore", "Pascoe Vale", "Oak Park", "Glenroy", "Jacana", "Broadmeadows", "Coolaroo", "Roxburgh Park", "Craigieburn"],
    track: [["Southern Cross", "North Melbourne"]],
    cityLoop: ["Flinders Street", "Flagstaff"],
  },
  {
    name: "Upfield",
    code: "UFD",
    group: "northern",
    stations: [...NORTHERN, "Macaulay", "Flemington Bridge", "Royal Park", "Jewell", "Brunswick", "Anstey", "Moreland", "Coburg", "Batman", "Merlynston", "Fawkner", "Gowrie", "Upfield"],
    track: [["Southern Cross", "North Melbourne"]],
    cityLoop: ["Flinders Street", "Flagstaff"],
  },
  {
    name: "Frankston",
    code: "FKN",
    group: "frankston",
    stations: [...LOOP, "Richmond", "South Yarra", "Hawksburn", "Toorak", "Armadale", "Malvern", "Caulfield", "Glen Huntly", "Ormond", "McKinnon", "Bentleigh", "Patterson", "Moorabbin", "Highett", "Southland", "Cheltenham", "Mentone", "Parkdale", "Mordialloc", "Aspendale", "Edithvale", "Chelsea", "Bonbeach", "Carrum", "Seaford", "Kananook", "Frankston"],
    track: [["Flinders Street", "Richmond"]],
    cityLoop: ["Flinders Street", "Parliament"],
  },
  {
    name: "Stony Point",
    code: "STY",
    group: "frankston",
    stations: ["Frankston", "Leawarra", "Baxter", "Somerville", "Tyabb", "Hastings", "Bittern", "Morradoo", "Crib Point", "Stony Point"],
  },
  {
    name: "Sandringham",
    code: "SHM",
    group: "pink",
    stations: ["Flinders Street", "Richmond", "South Yarra", "Prahran", "Windsor", "Balaclava", "Ripponlea", "Elsternwick", "Gardenvale", "North Brighton", "Middle Brighton", "Brighton Beach", "Hampton", "Sandringham"],
  },
  {
    name: "Werribee",
    code: "WER",
    group: "pink",
    stations: [...CROSS_CITY, "Seaholme", "Altona", "Westona", "Laverton", "Aircraft", "Williams Landing", "Hoppers Crossing", "Werribee"],
    track: [["Newport", "Laverton"]],
  },
  {
    name: "Williamstown",
    code: "WIL",
    group: "pink",
    stations: [...CROSS_CITY, "North Williamstown", "Williamstown Beach", "Williamstown"],
  },
  {
    name: "Cranbourne",
    code: "CBE",
    group: "tunnel",
    stations: [...TO_DANDENONG, "Lynbrook", "Merinda Park", "Cranbourne"],
  },
  {
    name: "Pakenham",
    code: "PKM",
    group: "tunnel",
    stations: [...TO_DANDENONG, "Hallam", "Narre Warren", "Berwick", "Beaconsfield", "Officer", "Cardinia Road", "Pakenham", "East Pakenham"],
  },
  {
    name: "Sunbury",
    code: "SUY",
    group: "tunnel",
    stations: ["Town Hall", "State Library", "Parkville", "Arden", "Footscray", "Middle Footscray", "West Footscray", "Tottenham", "Sunshine", "Albion", "Ginifer", "St Albans", "Keilor Plains", "Watergardens", "Diggers Rest", "Sunbury"],
  },
];

export const LINES: LineConfig[] = layout.lines(
  "melbourne",
  LINE_DEFS.map(({ code, ...def }) => ({ ...def, mode: "metro-train", routeIdMatch: [`-${code}:`] })),
  GROUPS,
);

export const LINE_BY_ID: Record<string, LineConfig> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** Every station on the map, by id. */
export const STATIONS: Record<string, Omit<SchematicStation, "via">> = places;
