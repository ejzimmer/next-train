import type GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { consistOf } from "./tfnsw";
import type { LineConfig } from "./types";

export type TrainType = "HCMT" | "X'Trapolis 100" | "Siemens Nexas" | "Comeng";

/**
 * The feed has no train type, but vehicle.id lists the car numbers ("1403T-1686T-205M-206M-971M-972M"),
 * and each fleet has its own number ranges. Returns null for numbers outside the known ranges
 * (e.g. X'Trapolis 2.0, whose numbering we haven't seen in the feed yet).
 */
export function trainType(vehicleId: string): { type: TrainType | null; cars: number } {
  const cars = vehicleId.split("-").filter((c) => /^\d+[MT]$/.test(c));
  const num = (c: string) => Number(c.slice(0, -1));
  const t = cars.filter((c) => c.endsWith("T")).map(num);
  const m = cars.filter((c) => c.endsWith("M")).map(num);
  let type: TrainType | null = null;
  if (m.some((n) => n >= 9001 && n <= 9999)) type = "HCMT";
  else if (t.some((n) => n >= 2500 && n < 2600) || (!t.length && m.some((n) => n >= 701 && n <= 850))) type = "Siemens Nexas";
  else if (t.some((n) => n >= 1000 && n < 1200) || (!t.length && m.some((n) => n >= 301 && n <= 700))) type = "Comeng";
  else if (t.some((n) => (n >= 1300 && n < 1500) || (n >= 1600 && n < 1700)) || (!t.length && m.some((n) => n <= 300 || (n > 850 && n < 1000))))
    type = "X'Trapolis 100";
  // HCMT ids list only the two driving cars, but every HCMT set is seven cars long.
  return { type, cars: type === "HCMT" ? 7 : cars.length };
}

/** Sydney Trains' vehicle models, from vehicle_categories.txt in its GTFS. */
const SYDNEY_MODELS: Record<string, string> = {
  A: "Waratah",
  B: "Waratah Series 2",
  C: "C-set",
  D: "Mariyung",
  H: "Oscar",
  K: "K-set",
  M: "Millennium",
  T: "Tangara",
  V: "V-set",
};

/** Each light rail line's trams. */
const TRAMS: Record<string, string> = { l2: "Citadis X05", l3: "Citadis X05", l4: "Urbos 100" };

/**
 * A Sydney train's model and car count, from Transport for NSW's extension to the feed, or else from the
 * trip id, which ends with them (724E.1417.150.2.B.8.91973687 is an 8-car Waratah Series 2). Sydney Trains'
 * vehicle ids aren't car numbers, but the trams' are (X01-X55 is trams X01 and X55 coupled together).
 */
export function sydneyTrainType(
  entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity,
  line: LineConfig,
): { type: string | null; cars: number; carNumbers: string[] | null } {
  if (line.mode === "light-rail") {
    const id = entity.vehicle?.vehicle?.id ?? "";
    const numbers = /^[A-Z]?\d{2,4}(-[A-Z]?\d{2,4})*$/.test(id) && line.group !== "l1" ? id.split("-") : null;
    return { type: TRAMS[line.group] ?? null, cars: numbers?.length ?? 1, carNumbers: numbers };
  }
  const consist = consistOf(entity);
  const fromTrip = /\.([A-Z])\.(\d+)\.\d+$/.exec(entity.vehicle?.trip?.tripId ?? "");
  const model = consist?.model ?? fromTrip?.[1] ?? null;
  return {
    type: (model && SYDNEY_MODELS[model]) ?? null,
    cars: consist?.cars || Number(fromTrip?.[2] ?? 0),
    carNumbers: null,
  };
}
