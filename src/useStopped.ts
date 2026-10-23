import { useMemo, useRef } from "react";
import type { VehicleDto } from "../shared/types";

/** Less than this far along the line between two reports (in station gaps, so roughly 20–40 m) counts as stopped. */
const STILL = 0.02;

/**
 * The feed has no stopped/moving flag or speed, so compare each train with its previous report:
 * a newer report in the same place means it's stopped.
 */
export function useStopped(vehicles: VehicleDto[]): Set<string> {
  const last = useRef(new Map<string, { at: number; timestamp: number; stopped: boolean }>());
  return useMemo(() => {
    const stopped = new Set<string>();
    const next = new Map<string, { at: number; timestamp: number; stopped: boolean }>();
    for (const v of vehicles) {
      const at = v.segment + v.fraction;
      const prev = last.current.get(v.id);
      let isStopped = prev?.stopped ?? false;
      if (prev && v.timestamp > prev.timestamp) isStopped = Math.abs(at - prev.at) < STILL;
      next.set(v.id, prev && v.timestamp === prev.timestamp ? prev : { at, timestamp: v.timestamp, stopped: isStopped });
      if (isStopped) stopped.add(v.id);
    }
    last.current = next;
    return stopped;
  }, [vehicles]);
}
