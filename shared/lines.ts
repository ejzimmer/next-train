import hurstbridge from "../lines/hurstbridge.json";
import hurstbridgeStations from "../data/hurstbridge.stations.json";
import hurstbridgeTrips from "../data/hurstbridge.trips.json";
import hurstbridgeTimes from "../data/hurstbridge.times.json";
import type { LineConfig, LineData, LineTimes } from "./types";

export const lines: Record<string, { config: LineConfig; data: LineData }> = {
  hurstbridge: {
    config: hurstbridge as LineConfig,
    data: {
      ...(hurstbridgeStations as Omit<LineData, "trips">),
      trips: hurstbridgeTrips as LineData["trips"],
      times: hurstbridgeTimes as unknown as LineTimes,
    },
  },
};
