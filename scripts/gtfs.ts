/** Reading GTFS Schedule zips, shared by the build-gtfs scripts. */
import { readFileSync } from "node:fs";
import { strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";

export type Row = Record<string, string>;
export type Files = Record<string, Uint8Array>;

export async function load(source: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  if (!/^https?:/.test(source)) return readFileSync(source);
  console.log(`Downloading ${source}`);
  const res = await fetch(source, { headers });
  if (!res.ok) throw new Error(`${source} returned ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function csv(files: Files, name: string): Row[] {
  const file = files[name];
  if (!file) throw new Error(`${name} missing from feed`);
  return parse(strFromU8(file), { columns: true, skip_empty_lines: true, bom: true });
}

/**
 * Calls `row` with each stop_times.txt row's trip id, stop id, stop sequence and time (departure, else
 * arrival, in seconds after midnight; null when neither is given). The file is large, so it's gone through
 * a line at a time instead of parsed all at once.
 */
export function eachStopTime(files: Files, row: (tripId: string, stopId: string, seq: number, time: number | null) => void) {
  const text = strFromU8(files["stop_times.txt"]);
  let at = text.indexOf("\n") + 1;
  const header = text
    .slice(0, at)
    .replace(/^﻿/, "")
    .trim()
    .split(",")
    .map((c) => c.replace(/"/g, ""));
  const [ti, si, qi, ai, di] = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"].map((c) =>
    header.indexOf(c),
  );
  const unquote = (v: string | undefined) => v?.replace(/"/g, "");
  const seconds = (hms: string) => hms.split(":").reduce((t, part) => t * 60 + Number(part), 0);
  while (at < text.length) {
    let next = text.indexOf("\n", at);
    if (next < 0) next = text.length;
    const cols = text.slice(at, next).replace(/\r$/, "").split(",");
    at = next + 1;
    const tripId = unquote(cols[ti]);
    if (!tripId) continue;
    const time = unquote(cols[di]) || unquote(cols[ai]);
    row(tripId, unquote(cols[si])!.trim(), Number(unquote(cols[qi])), time ? seconds(time.trim()) : null);
  }
}
