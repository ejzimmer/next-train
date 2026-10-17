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
