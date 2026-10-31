/**
 * Sydney Trains and Sydney light rail: every line's stations and where they sit on one schematic, laid out
 * after Transport for NSW's network map. A line is one run of stations from end to end, so a line with
 * branches (T1 to Emu Plains and to Richmond) is several, sharing a switch and a colour.
 */
import { createLayout, type LineDef } from "./layout";
import type { LineConfig, SchematicStation } from "./types";

const layout = createLayout();
const { at, relabel, bend, walk } = layout.ns();
/** Light rail stops, which can share a name with a station (Town Hall, Central). */
const lr = layout.ns("lr-");

// The city: the City Circle with Central at the bottom, the Eastern Suburbs line through it to Bondi Junction.
at("Central", 0, 0, "r");
relabel("Central", "r", [4, 0]);
at("Museum", 150, -150, "r");
at("St James", 150, -330, "r");
at("Circular Quay", 0, -480, "t");
at("Wynyard", -150, -330, "l");
at("Town Hall", -150, -150, "l");
at("Martin Place", 30, -240, "b");
bend("Town Hall", "Martin Place", [[-60, -240]]);
walk("Martin Place", { dir: "E", step: 220, label: "t", names: ["Kings Cross"] }, { dir: "E", step: 90, label: "t", names: ["Edgecliff", "Bondi Junction"] });

// North Shore, across the bridge and up to Hornsby and Berowra.
walk(
  "Wynyard",
  { dir: "N", step: 150, label: "l", names: ["Milsons Point"] },
  {
    dir: "N",
    step: 26,
    label: "l",
    names: [
      "North Sydney", "Waverton", "Wollstonecraft", "St Leonards", "Artarmon", "Chatswood", "Roseville", "Lindfield",
      "Killara", "Gordon", "Pymble", "Turramurra", "Warrawee", "Wahroonga", "Waitara", "Hornsby",
      "Asquith", "Mount Colah", "Mount Kuring-gai", "Berowra",
    ],
  },
);
relabel("Hornsby", "r");

// Inner West to Strathfield, then west to Parramatta, Blacktown, Emu Plains and Richmond.
walk("Central", { dir: "S", step: 160, label: "r", names: ["Redfern"] });
walk("Redfern", {
  dir: "W",
  step: 70,
  label: "tb",
  turn: 20,
  names: ["Macdonaldtown", "Newtown", "Stanmore", "Petersham", "Lewisham", "Summer Hill", "Ashfield", "Croydon", "Burwood", "Strathfield", "Homebush", "Flemington"],
});
relabel("Summer Hill", "b", [-10, 0]);
relabel("Strathfield", "b", [12, 0]);
relabel("Flemington", "b");
walk("Flemington", { dir: "W", step: 64, label: "t", names: ["Lidcombe"] });
relabel("Lidcombe", "t", [-22, 0]);
walk("Lidcombe", { dir: "W", step: 56, label: ["b", "t", "t"], names: ["Auburn", "Clyde", "Granville"] });
walk(
  "Granville",
  { dir: "W", step: 80, label: "t", names: ["Harris Park"] },
  {
    dir: "W",
    step: 56,
    label: "bt",
    names: [
      "Parramatta", "Westmead", "Wentworthville", "Pendle Hill", "Toongabbie", "Seven Hills", "Blacktown",
      "Doonside", "Rooty Hill", "Mount Druitt", "St Marys", "Werrington", "Kingswood", "Penrith", "Emu Plains",
    ],
  },
);
walk("Blacktown", { dir: "NW", step: 50, label: "r", names: ["Marayong"] }, {
  dir: "NW",
  step: 26,
  label: "r",
  names: ["Quakers Hill", "Schofields", "Riverstone", "Vineyard", "Mulgrave", "Windsor", "Clarendon", "East Richmond", "Richmond"],
});
// Olympic Park, on a loop off the line between Flemington and Lidcombe.
{
  const [f, l] = [layout.places.flemington, layout.places.lidcombe];
  at("Olympic Park", (f.x + l.x) / 2, f.y - 48, "t");
}

// Northern line, from Strathfield up to Hornsby.
walk(
  "Strathfield",
  { dir: "N", step: 64, label: "r", names: ["North Strathfield"] },
  { dir: "N", step: 60, label: "r", names: ["Concord West", "Rhodes", "Meadowbank", "West Ryde", "Denistone", "Eastwood"] },
  { dir: "NE", step: 60, label: "l", names: ["Epping", "Cheltenham", "Beecroft", "Pennant Hills", "Thornleigh", "Normanhurst"] },
);
{
  // Up from Normanhurst and across to Hornsby.
  const [n, h] = [layout.places.normanhurst, layout.places.hornsby];
  bend("Normanhurst", "Hornsby", [[n.x, h.y]]);
}

// South and south-west: to Liverpool through Granville or Regents Park, then Glenfield, Leppington and Macarthur.
walk(
  "Granville",
  { dir: "S", step: 60, label: "r", names: ["Merrylands"] },
  { dir: "S", step: 40, label: "l", names: ["Guildford", "Yennora", "Fairfield", "Canley Vale", "Cabramatta", "Warwick Farm", "Liverpool", "Casula", "Glenfield"] },
);
// Cumberland line trains turn south at Harris Park.
{
  const [hp, m] = [layout.places["harris-park"], layout.places.merrylands];
  bend("Harris Park", "Merrylands", [[hp.x + (m.y - hp.y), m.y]]);
}
walk("Glenfield", { dir: "S", step: 50, label: "r", names: ["Macquarie Fields"] }, { dir: "S", step: 30, label: "r", names: ["Ingleburn", "Minto", "Leumeah", "Campbelltown", "Macarthur"] });
walk("Glenfield", { dir: "SW", step: 50, label: "l", names: ["Edmondson Park", "Leppington"] });
{
  // Lidcombe to Cabramatta through Regents Park: down, then a diagonal arriving at Cabramatta.
  const [lid, cab] = [layout.places.lidcombe, layout.places.cabramatta];
  const across = lid.x - cab.x;
  const stops = ["Sefton", "Chester Hill", "Leightonfield", "Villawood", "Carramar"];
  const step = across / (stops.length + 1);
  const rp = cab.y - across;
  at("Berala", lid.x, (lid.y + rp) / 2, "l");
  relabel("Berala", "l", [0, 10]);
  at("Regents Park", lid.x, rp, "l");
  stops.forEach((name, i) => at(name, lid.x - step * (i + 1), rp + step * (i + 1), "r"));
}
walk("Regents Park", { dir: "E", step: 60, label: "tb", names: ["Birrong", "Yagoona", "Bankstown"] });

// Airport line and the East Hills line to Glenfield.
walk(
  "Central",
  { dir: "SE", step: 100, label: "r", names: ["Green Square"] },
  { dir: "S", step: 40, label: "r", names: ["Mascot", "Domestic Airport", "International Airport"] },
);
// Illawarra line from Redfern, meeting the Airport line at Wolli Creek.
{
  const intl = layout.places["international-airport"];
  const red = layout.places.redfern;
  const wc = { x: red.x, y: intl.y + (intl.x - red.x) };
  const stops = ["Erskineville", "St Peters", "Sydenham", "Tempe"];
  stops.forEach((name, i) => at(name, red.x, red.y + ((wc.y - red.y) * (i + 1)) / (stops.length + 1), "l"));
  at("Wolli Creek", wc.x, wc.y, "r");
}
walk("Wolli Creek", {
  dir: "S",
  step: 26,
  label: "r",
  names: ["Arncliffe", "Banksia", "Rockdale", "Kogarah", "Carlton", "Allawah", "Hurstville", "Penshurst", "Mortdale", "Oatley", "Como", "Jannali", "Sutherland"],
});
walk("Sutherland", { dir: "S", step: 26, label: "r", names: ["Loftus", "Engadine", "Heathcote", "Waterfall"] });
relabel("Sutherland", "l");
walk("Sutherland", { dir: "E", step: 60, label: "tb", turn: 20, names: ["Kirrawee", "Gymea", "Miranda", "Caringbah", "Woolooware", "Cronulla"] });
relabel("Jannali", "l");
{
  // West from Wolli Creek, level with Glenfield.
  const [wc, gf] = [layout.places["wolli-creek"], layout.places.glenfield];
  const down = gf.y - wc.y;
  const stops = [
    "Bardwell Park", "Bexley North", "Kingsgrove", "Beverly Hills", "Narwee", "Riverwood", "Padstow", "Revesby", "Panania", "East Hills", "Holsworthy",
  ];
  at("Turrella", wc.x - down, gf.y, "b");
  const step = (wc.x - down - gf.x) / (stops.length + 1);
  stops.forEach((name, i) => at(name, wc.x - down - step * (i + 1), gf.y, i % 2 ? "b" : "t"));
}

// Light rail. L2 and L3 down George Street inside the City Circle, then out to Randwick and Kingsford.
lr.at("Circular Quay", -60, -380, "r");
lr.walk("Circular Quay", { dir: "S", step: 30, label: "r", names: ["Bridge Street", "Wynyard", "QVB", "Town Hall"] });
lr.walk("Town Hall", { dir: "S", step: 60, label: "r", names: ["Chinatown", "Haymarket"] });
lr.at("Central Chalmers Street", 150, -20, "b");
lr.bend("Haymarket", "Central Chalmers Street", [[-60, -110], [60, -110]]);
lr.walk("Central Chalmers Street", { dir: "E", step: 100, label: "t", names: ["Surry Hills"] }, { dir: "E", step: 70, label: "t", names: ["Moore Park"] });
lr.walk("Moore Park", { dir: "E", step: 100, label: "b", names: ["Royal Randwick"] }, { dir: "E", step: 70, label: ["t", "b", "t"], names: ["Wansey Road", "UNSW High Street", "Randwick"] });
lr.walk("Moore Park", { dir: "SE", step: 40, label: "r", names: ["ES Marks", "Kensington", "UNSW Anzac Parade", "Kingsford", "Juniors Kingsford"] });

// L1 from Central round Darling Harbour to Pyrmont, back down through Glebe, and across the Inner West line to Dulwich Hill.
{
  const iw = layout.places.redfern.y;
  // Crossing between Lewisham and Summer Hill.
  const x = (layout.places.lewisham.x + layout.places["summer-hill"].x) / 2;
  lr.at("Central Grand Concourse", -80, 40, "t");
  lr.relabel("Central Grand Concourse", "t", [-30, 0]);
  lr.at("Capitol Square", -140, 40, "b");
  lr.at("Paddy's Markets", -210, 0, "r");
  lr.bend("Capitol Square", "Paddy's Markets", [[-170, 40]]);
  lr.walk("Paddy's Markets", { dir: "NW", step: 35, label: "r", names: ["Exhibition Centre", "Convention Centre", "Pyrmont Bay", "The Star"] });
  lr.relabel("The Star", "t");
  const star = lr.place("The Star");
  lr.at("John Street Square", x, star.y, "l");
  const stops = ["Bank Street", "Wentworth Park", "Glebe", "Jubilee Park", "Rozelle Bay", "Lilyfield", "Leichhardt North", "Hawthorne", "Marion", "Taverners Hill"];
  const step = (iw - 50 - star.y) / stops.length;
  stops.forEach((name, i) => lr.at(name, x, star.y + step * (i + 1), "l"));
  lr.walk("Taverners Hill", { dir: "S", step: 100, label: "r", names: ["Lewisham West"] }, { dir: "S", step: 24, label: "r", names: ["Waratah Mills", "Arlington", "Dulwich Grove", "Dulwich Hill"] });
}

// L4 in Parramatta: Westmead to Parramatta Square north of the railway, then up to Carlingford.
{
  const wm = layout.places.westmead;
  lr.at("Westmead", wm.x - 56, wm.y - 80, "l");
}
lr.walk(
  "Westmead",
  { dir: "N", step: 28, label: "l", names: ["Westmead Hospital", "Childrens Hospital"] },
  { dir: "E", step: 56, label: "tb", names: ["Ngara", "Benaud Oval", "Fennell Street", "Prince Alfred Square", "Church Street", "Parramatta Square"] },
);
lr.walk(
  "Parramatta Square",
  { dir: "E", step: 56, label: "tb", names: ["Robin Thomas", "Tramway Avenue", "Rosehill Gardens"] },
  { dir: "N", step: 28, label: "r", names: ["Yallamundi", "Dundas", "Telopea", "Carlingford"] },
);
lr.relabel("Rosehill Gardens", "b", [50, 0]);

/** Line colours from Transport for NSW's GTFS routes.txt. */
export const GROUPS = {
  // Drawn side by side where they share track, in this order (left of the direction first written).
  t9: { colour: "#D11F2F", text: "#FFFFFF" },
  t1: { colour: "#F99D1C", text: "#FFFFFF" },
  t4: { colour: "#005AA3", text: "#FFFFFF" },
  t8: { colour: "#00954C", text: "#FFFFFF" },
  t2: { colour: "#0098CD", text: "#FFFFFF" },
  t3: { colour: "#F37021", text: "#FFFFFF" },
  t6: { colour: "#7C3E21", text: "#FFFFFF" },
  t7: { colour: "#6F818E", text: "#FFFFFF" },
  t5: { colour: "#C4258F", text: "#FFFFFF" },
  l1: { colour: "#BE1622", text: "#FFFFFF" },
  l2: { colour: "#DD1E25", text: "#FFFFFF" },
  l3: { colour: "#781140", text: "#FFFFFF" },
  l4: { colour: "#BB2043", text: "#FFFFFF" },
} as const;
export type Group = keyof typeof GROUPS;

/** Where the usual group order would cross lines over, the order on that stretch (ids sorted, "|"-joined). */
export const EDGE_ORDER: Record<string, Group[]> = {};

/** The switches above the map, each showing every line (branch) of one Sydney line. */
export const SWITCHES: { id: Group; name: string; title: string }[] = [
  { id: "t1", name: "T1", title: "T1 North Shore & Western Line" },
  { id: "t2", name: "T2", title: "T2 Leppington & Inner West Line" },
  { id: "t3", name: "T3", title: "T3 Liverpool & Inner West Line" },
  { id: "t4", name: "T4", title: "T4 Eastern Suburbs & Illawarra Line" },
  { id: "t5", name: "T5", title: "T5 Cumberland Line" },
  { id: "t6", name: "T6", title: "T6 Lidcombe & Bankstown Line" },
  { id: "t7", name: "T7", title: "T7 Olympic Park Line" },
  { id: "t8", name: "T8", title: "T8 Airport & South Line" },
  { id: "t9", name: "T9", title: "T9 Northern Line" },
  { id: "l1", name: "L1", title: "L1 Dulwich Hill Line" },
  { id: "l2", name: "L2", title: "L2 Randwick Line" },
  { id: "l3", name: "L3", title: "L3 Kingsford Line" },
  { id: "l4", name: "L4", title: "L4 Westmead & Carlingford Line" },
];

const CIRCLE = ["Town Hall", "Wynyard", "Circular Quay", "St James", "Museum", "Central"];
const INNER_WEST = ["Redfern", "Macdonaldtown", "Newtown", "Stanmore", "Petersham", "Lewisham", "Summer Hill", "Ashfield", "Croydon", "Burwood", "Strathfield", "Homebush", "Flemington", "Lidcombe"];
const TO_GRANVILLE = [...INNER_WEST, "Auburn", "Clyde", "Granville"];
const TO_BLACKTOWN = [...TO_GRANVILLE, "Harris Park", "Parramatta", "Westmead", "Wentworthville", "Pendle Hill", "Toongabbie", "Seven Hills", "Blacktown"];
const EMU_PLAINS = ["Doonside", "Rooty Hill", "Mount Druitt", "St Marys", "Werrington", "Kingswood", "Penrith", "Emu Plains"];
const RICHMOND = ["Marayong", "Quakers Hill", "Schofields", "Riverstone", "Vineyard", "Mulgrave", "Windsor", "Clarendon", "East Richmond", "Richmond"];
const NORTH_SHORE = [
  "Central", "Town Hall", "Wynyard", "Milsons Point", "North Sydney", "Waverton", "Wollstonecraft", "St Leonards", "Artarmon", "Chatswood",
  "Roseville", "Lindfield", "Killara", "Gordon", "Pymble", "Turramurra", "Warrawee", "Wahroonga", "Waitara", "Hornsby",
];
const BEROWRA = ["Asquith", "Mount Colah", "Mount Kuring-gai", "Berowra"];
const NORTHERN = ["North Strathfield", "Concord West", "Rhodes", "Meadowbank", "West Ryde", "Denistone", "Eastwood", "Epping", "Cheltenham", "Beecroft", "Pennant Hills", "Thornleigh", "Normanhurst", "Hornsby"];
const SOUTH = ["Merrylands", "Guildford", "Yennora", "Fairfield", "Canley Vale", "Cabramatta"];
const REGENTS_PARK = ["Berala", "Regents Park", "Sefton", "Chester Hill", "Leightonfield", "Villawood", "Carramar", "Cabramatta"];
const TO_GLENFIELD = ["Warwick Farm", "Liverpool", "Casula", "Glenfield"];
const LEPPINGTON = ["Edmondson Park", "Leppington"];
const MACARTHUR = ["Macquarie Fields", "Ingleburn", "Minto", "Leumeah", "Campbelltown", "Macarthur"];
const AIRPORT = ["Green Square", "Mascot", "Domestic Airport", "International Airport", "Wolli Creek"];
const SYDENHAM = ["Redfern", "Erskineville", "St Peters", "Sydenham", "Tempe", "Wolli Creek"];
const EAST_HILLS = ["Turrella", "Bardwell Park", "Bexley North", "Kingsgrove", "Beverly Hills", "Narwee", "Riverwood", "Padstow", "Revesby", "Panania", "East Hills", "Holsworthy", "Glenfield"];
const ILLAWARRA = [...SYDENHAM, "Arncliffe", "Banksia", "Rockdale", "Kogarah", "Carlton", "Allawah", "Hurstville", "Penshurst", "Mortdale", "Oatley", "Como", "Jannali", "Sutherland"];
const BLACKTOWN_TO_HARRIS_PARK = ["Blacktown", "Seven Hills", "Toongabbie", "Pendle Hill", "Wentworthville", "Westmead", "Parramatta", "Harris Park"];
/** Track round the City Circle back to Central. */
const CIRCLE_TRACK: [string, string][] = [["Town Hall", "Central"]];

type SydneyLineDef = Omit<LineDef, "mode" | "switchId" | "id"> & { group: Group; mode?: LineDef["mode"] };

/** Each switch's lines, by route_id prefix in Transport for NSW's GTFS (NSN_1a, WST_1b, ...). */
const LINE_DEFS: SydneyLineDef[] = [
  { name: "T1 North Shore", group: "t1", routeIdMatch: ["NSN_", "WST_"], stations: [...NORTH_SHORE, ...BEROWRA] },
  { name: "T1 Emu Plains", group: "t1", routeIdMatch: ["NSN_", "WST_"], stations: ["Central", ...TO_BLACKTOWN, ...EMU_PLAINS] },
  { name: "T1 Richmond", group: "t1", routeIdMatch: ["NSN_", "WST_"], stations: ["Central", ...TO_BLACKTOWN, ...RICHMOND] },
  { name: "T1 Olympic Park", group: "t1", routeIdMatch: ["NSN_", "WST_"], stations: ["Olympic Park", "Lidcombe", ...TO_BLACKTOWN.slice(TO_BLACKTOWN.indexOf("Auburn")), ...RICHMOND] },
  { name: "T2 Parramatta", group: "t2", routeIdMatch: ["IWL_"], stations: [...CIRCLE, ...TO_GRANVILLE, "Harris Park", "Parramatta"], track: CIRCLE_TRACK },
  { name: "T2 Leppington", group: "t2", routeIdMatch: ["IWL_"], stations: [...CIRCLE, ...TO_GRANVILLE, ...SOUTH, ...TO_GLENFIELD, ...LEPPINGTON], track: CIRCLE_TRACK },
  { name: "T2 Campbelltown", group: "t2", routeIdMatch: ["IWL_"], stations: [...CIRCLE, ...TO_GRANVILLE, ...SOUTH, ...TO_GLENFIELD, ...MACARTHUR], track: CIRCLE_TRACK },
  { name: "T2 Olympic Park", group: "t2", routeIdMatch: ["IWL_"], stations: ["Olympic Park", "Lidcombe", "Auburn", "Clyde", "Granville", ...SOUTH, ...TO_GLENFIELD, ...LEPPINGTON] },
  { name: "T2 Regents Park", group: "t2", routeIdMatch: ["IWL_"], stations: [...CIRCLE, ...INNER_WEST, ...REGENTS_PARK, ...TO_GLENFIELD, ...LEPPINGTON], track: CIRCLE_TRACK },
  { name: "T3 Liverpool", group: "t3", routeIdMatch: ["T3_"], stations: [...CIRCLE, ...INNER_WEST, ...REGENTS_PARK, ...TO_GLENFIELD, ...LEPPINGTON], track: CIRCLE_TRACK },
  { name: "T3 Campbelltown", group: "t3", routeIdMatch: ["T3_"], stations: [...CIRCLE, ...INNER_WEST, ...REGENTS_PARK, ...TO_GLENFIELD, ...MACARTHUR], track: CIRCLE_TRACK },
  { name: "T4 Waterfall", group: "t4", routeIdMatch: ["ESI_"], stations: ["Bondi Junction", "Edgecliff", "Kings Cross", "Martin Place", "Town Hall", "Central", ...ILLAWARRA, "Loftus", "Engadine", "Heathcote", "Waterfall"] },
  { name: "T4 Cronulla", group: "t4", routeIdMatch: ["ESI_"], stations: ["Bondi Junction", "Edgecliff", "Kings Cross", "Martin Place", "Town Hall", "Central", ...ILLAWARRA, "Kirrawee", "Gymea", "Miranda", "Caringbah", "Woolooware", "Cronulla"] },
  { name: "T5 Leppington", group: "t5", routeIdMatch: ["CMB_"], stations: [...RICHMOND].reverse().concat(BLACKTOWN_TO_HARRIS_PARK, SOUTH, TO_GLENFIELD, LEPPINGTON) },
  { name: "T5 Campbelltown", group: "t5", routeIdMatch: ["CMB_"], stations: [...RICHMOND].reverse().concat(BLACKTOWN_TO_HARRIS_PARK, SOUTH, TO_GLENFIELD, MACARTHUR) },
  { name: "T5 Emu Plains", group: "t5", routeIdMatch: ["CMB_"], stations: [...EMU_PLAINS].reverse().concat(BLACKTOWN_TO_HARRIS_PARK, SOUTH, TO_GLENFIELD, LEPPINGTON) },
  { name: "T6 Bankstown", group: "t6", routeIdMatch: ["T6_"], stations: ["Lidcombe", "Berala", "Regents Park", "Birrong", "Yagoona", "Bankstown"] },
  { name: "T7 Olympic Park", group: "t7", routeIdMatch: ["OLY_"], stations: ["Olympic Park", ...TO_BLACKTOWN.slice(TO_BLACKTOWN.indexOf("Lidcombe"))] },
  { name: "T8 Airport to Macarthur", group: "t8", routeIdMatch: ["APS_"], stations: [...CIRCLE, ...AIRPORT, ...EAST_HILLS, ...MACARTHUR], track: CIRCLE_TRACK },
  { name: "T8 Airport to Leppington", group: "t8", routeIdMatch: ["APS_"], stations: [...CIRCLE, ...AIRPORT, ...EAST_HILLS, ...LEPPINGTON], track: CIRCLE_TRACK },
  { name: "T8 Sydenham to Macarthur", group: "t8", routeIdMatch: ["APS_"], stations: [...CIRCLE, ...SYDENHAM, ...EAST_HILLS, ...MACARTHUR], track: CIRCLE_TRACK },
  { name: "T8 Sydenham to Leppington", group: "t8", routeIdMatch: ["APS_"], stations: [...CIRCLE, ...SYDENHAM, ...EAST_HILLS, ...LEPPINGTON], track: CIRCLE_TRACK },
  { name: "T9 Northern", group: "t9", routeIdMatch: ["NTH_"], stations: [...NORTH_SHORE.slice(0, 14)].reverse().concat(INNER_WEST.slice(0, 11), NORTHERN, BEROWRA) },
  // Some T9 trains carry on from Gordon to Hornsby.
  { name: "T9 Gordon to Hornsby", group: "t9", routeIdMatch: ["NTH_"], stations: NORTH_SHORE.slice(13) },
  {
    name: "L1 Dulwich Hill",
    group: "l1",
    mode: "light-rail",
    prefix: "lr-",
    routeIdMatch: ["IWLR-"],
    stations: [
      "Central Grand Concourse", "Capitol Square", "Paddy's Markets", "Exhibition Centre", "Convention Centre", "Pyrmont Bay", "The Star",
      "John Street Square", "Bank Street", "Wentworth Park", "Glebe", "Jubilee Park", "Rozelle Bay", "Lilyfield", "Leichhardt North",
      "Hawthorne", "Marion", "Taverners Hill", "Lewisham West", "Waratah Mills", "Arlington", "Dulwich Grove", "Dulwich Hill",
    ],
  },
  {
    name: "L2 Randwick",
    group: "l2",
    mode: "light-rail",
    prefix: "lr-",
    routeIdMatch: ["_L2"],
    stations: ["Circular Quay", "Bridge Street", "Wynyard", "QVB", "Town Hall", "Chinatown", "Haymarket", "Central Chalmers Street", "Surry Hills", "Moore Park", "Royal Randwick", "Wansey Road", "UNSW High Street", "Randwick"],
  },
  {
    name: "L3 Kingsford",
    group: "l3",
    mode: "light-rail",
    prefix: "lr-",
    routeIdMatch: ["_L3"],
    stations: ["Circular Quay", "Bridge Street", "Wynyard", "QVB", "Town Hall", "Chinatown", "Haymarket", "Central Chalmers Street", "Surry Hills", "Moore Park", "ES Marks", "Kensington", "UNSW Anzac Parade", "Kingsford", "Juniors Kingsford"],
  },
  {
    name: "L4 Westmead & Carlingford",
    group: "l4",
    mode: "light-rail",
    prefix: "lr-",
    routeIdMatch: ["_L4"],
    stations: [
      "Westmead", "Westmead Hospital", "Childrens Hospital", "Ngara", "Benaud Oval", "Fennell Street", "Prince Alfred Square", "Church Street",
      "Parramatta Square", "Robin Thomas", "Tramway Avenue", "Rosehill Gardens", "Yallamundi", "Dundas", "Telopea", "Carlingford",
    ],
  },
];

export const LINES: LineConfig[] = layout.lines(
  "sydney",
  LINE_DEFS.map((def) => ({
    ...def,
    id: def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    mode: def.mode ?? "train",
    switchId: def.group,
  })),
  GROUPS,
);

export const LINE_BY_ID: Record<string, LineConfig> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** Every station and stop on the map, by id. */
export const STATIONS: Record<string, Omit<SchematicStation, "via">> = layout.places;
