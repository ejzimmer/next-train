/**
 * The Metro train network: every line's stations (city end first) and where they sit on one schematic,
 * laid out after Metro's network map. Positions are written as walks from a station in one of eight
 * directions, so a branch can be moved by changing where it starts.
 */
import type { LineConfig, SchematicStation } from "./types";

type Pt = [number, number];
type Label = SchematicStation["label"];
type Dir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const STEP: Record<Dir, Pt> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
};

/** GTFS stop names that differ from the name on the map. */
const GTFS_NAMES: Record<string, string> = { Jolimont: "Jolimont-MCG" };

export const stationId = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "-");

const places: Record<string, Omit<SchematicStation, "via">> = {};
/** Bends in the drawn track between two stations, keyed "from>to" in the order written. */
const bends = new Map<string, Pt[]>();

function at(name: string, x: number, y: number, label: Label) {
  const id = stationId(name);
  places[id] = { id, name, ...(GTFS_NAMES[name] && { gtfsName: GTFS_NAMES[name] }), x, y, label };
}

/** Moves a station's label, e.g. off a line that leaves at an angle; `nudge` shifts it a few px further. */
function relabel(name: string, label: Label, nudge?: Pt) {
  const s = places[stationId(name)];
  s.label = label;
  if (nudge) s.nudge = nudge;
}

function bend(from: string, to: string, via: Pt[]) {
  bends.set(`${stationId(from)}>${stationId(to)}`, via);
}

/** Labels for a horizontal run take turns above and below; an array gives each station's. */
type LegLabel = Label | "tb" | "bt" | Label[];

/**
 * Places `names` one after another from station `from`, `step` px apart along `dir`
 * (diagonal steps are `step` px on each axis). `turn` px past the previous station the track
 * bends, so a leg can start at an angle to the one before it.
 */
function walk(from: string, ...legs: { dir: Dir; step: number; label: LegLabel; names: string[]; turn?: number }[]) {
  let prev = stationId(from);
  let [x, y] = [places[prev].x, places[prev].y];
  let lastDir: Dir | null = null;
  for (const { dir, step, label, names, turn } of legs) {
    const [dx, dy] = STEP[dir];
    names.forEach((name, i) => {
      let via: Pt[] | undefined;
      if (i === 0 && lastDir && lastDir !== dir) {
        const [lx, ly] = STEP[lastDir];
        const t = turn ?? step / 2;
        const corner: Pt = [x + lx * t, y + ly * t];
        via = [corner];
        [x, y] = [corner[0] + dx * (step - t), corner[1] + dy * (step - t)];
      } else {
        [x, y] = [x + dx * step, y + dy * step];
      }
      const l: Label = Array.isArray(label)
        ? label[i]
        : label === "tb"
          ? i % 2 ? "b" : "t"
          : label === "bt"
            ? i % 2 ? "t" : "b"
            : label;
      at(name, x, y, l);
      if (via) bend(places[prev].name, name, via);
      prev = stationId(name);
    });
    lastDir = dir;
  }
}

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

interface LineDef {
  name: string;
  code: string;
  group: Group;
  stations: string[];
  /** Track between stations that aren't next to each other in `stations`, e.g. trains running direct, not via the City Loop. */
  track?: [string, string][];
  cityLoop?: [string, string];
}

/** In the order the switches are shown, by group. */
const LINE_DEFS: LineDef[] = [
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

/** Bends between two stations, whichever way round they were written. */
function bendsBetween(a: string, b: string): Pt[] {
  const forward = bends.get(`${a}>${b}`);
  if (forward) return forward;
  return [...(bends.get(`${b}>${a}`) ?? [])].reverse();
}

function station(name: string): SchematicStation {
  const s = places[stationId(name)];
  if (!s) throw new Error(`${name} isn't on the map`);
  return { ...s };
}

/** Departures show a platform number at stations on more than one line. */
const lineCount = new Map<string, number>();
for (const def of LINE_DEFS) for (const name of def.stations) lineCount.set(stationId(name), (lineCount.get(stationId(name)) ?? 0) + 1);

export const LINES: LineConfig[] = LINE_DEFS.map((def) => {
  const stations = def.stations.map(station);
  stations.forEach((s, i) => {
    const via = i > 0 ? bendsBetween(stations[i - 1].id, s.id) : [];
    if (via.length) s.via = via;
  });
  return {
    id: stationId(def.name),
    mode: "metro-train",
    name: def.name,
    colour: GROUPS[def.group].colour,
    textColour: GROUPS[def.group].text,
    group: def.group,
    routeIdMatch: `-${def.code}:`,
    cityLoop: def.cityLoop && [stationId(def.cityLoop[0]), stationId(def.cityLoop[1])],
    platformStations: stations.filter((s) => lineCount.get(s.id)! > 1).map((s) => s.id),
    stations,
    track: (def.track ?? []).map(([from, to]) => ({
      from: stationId(from),
      to: stationId(to),
      via: bendsBetween(stationId(from), stationId(to)),
    })),
  };
});

export const LINE_BY_ID: Record<string, LineConfig> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** Every station on the map, by id. */
export const STATIONS: Record<string, Omit<SchematicStation, "via">> = places;
