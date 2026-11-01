import { useEffect, useRef, useState } from "react";

type Place = { lat: number; lon: number };

/** Great-circle distance in metres. */
export function distance(a: Place, b: Place) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function nearest(here: Place, stations: Record<string, Place | undefined>) {
  let best: { id: string; metres: number } | null = null;
  for (const [id, place] of Object.entries(stations)) {
    if (!place) continue;
    const metres = distance(here, place);
    if (!best || metres < best.metres) best = { id, metres };
  }
  return best;
}

export type NearestState =
  | { status: "off" | "locating" | "unavailable" | "denied" }
  /** `id` is the nearest of all; `ids` the nearest on each line, the nearest of all first. */
  | { status: "found"; id: string; metres: number; ids: string[] };

/** The nearest station on each line (each a set of stations), and the nearest of all. */
export function nearestPerLine(here: Place, lines: Record<string, Place | undefined>[]) {
  const found = lines
    .map((stations) => nearest(here, stations))
    .filter((f): f is { id: string; metres: number } => !!f)
    .sort((a, b) => a.metres - b.metres);
  if (!found.length) return null;
  return { ...found[0], ids: [...new Set(found.map((f) => f.id))] };
}

/**
 * The station nearest the device on each of `lines`, while `enabled`. Location is only asked for once enabled.
 * Watches for movement with low accuracy (wifi and cell towers rather than GPS, which is plenty
 * for picking a station and much easier on the battery), and stops while the tab is hidden.
 */
export function useNearestStation(enabled: boolean, stations: Record<string, Place | undefined>[]): NearestState {
  const [state, setState] = useState<NearestState>({ status: "off" });
  // Read when the position comes in, so a change of stations doesn't restart the watch.
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const last = useRef<Place | null>(null);

  useEffect(() => {
    if (!enabled) {
      last.current = null;
      setState({ status: "off" });
      return;
    }
    if (!("geolocation" in navigator)) {
      setState({ status: "unavailable" });
      return;
    }
    setState((s) => (s.status === "found" ? s : { status: "locating" }));
    let watch: number | null = null;
    const start = () => {
      if (watch != null) return;
      watch = navigator.geolocation.watchPosition(
        ({ coords }) => {
          last.current = { lat: coords.latitude, lon: coords.longitude };
          const found = nearestPerLine(last.current, stationsRef.current);
          if (found) setState({ status: "found", ...found });
        },
        (err) => setState({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
      );
    };
    const stop = () => {
      if (watch != null) navigator.geolocation.clearWatch(watch);
      watch = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  // The stations changed: pick again from the last position.
  useEffect(() => {
    if (!enabled || !last.current) return;
    const found = nearestPerLine(last.current, stations);
    setState(found ? { status: "found", ...found } : { status: "locating" });
  }, [enabled, stations]);

  return state;
}
