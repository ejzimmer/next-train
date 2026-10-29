import { useEffect, useState } from "react";

type Place = { lat: number; lon: number };

/** Great-circle distance in metres. */
export function distance(a: Place, b: Place) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function nearest(here: Place, stations: Record<string, Place>) {
  let best: { id: string; metres: number } | null = null;
  for (const [id, place] of Object.entries(stations)) {
    const metres = distance(here, place);
    if (!best || metres < best.metres) best = { id, metres };
  }
  return best;
}

export type NearestState =
  | { status: "off" | "locating" | "unavailable" | "denied" }
  | { status: "found"; id: string; metres: number };

/**
 * The station nearest the device, while `enabled`. Location is only asked for once enabled.
 * Watches for movement with low accuracy (wifi and cell towers rather than GPS, which is plenty
 * for picking a station and much easier on the battery), and stops while the tab is hidden.
 */
export function useNearestStation(enabled: boolean, stations: Record<string, Place>): NearestState {
  const [state, setState] = useState<NearestState>({ status: "off" });

  useEffect(() => {
    if (!enabled) {
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
          const found = nearest({ lat: coords.latitude, lon: coords.longitude }, stations);
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
  }, [enabled, stations]);

  return state;
}
