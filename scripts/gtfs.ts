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

/** How many bytes of a file are decoded to text at once. */
const CHUNK_BYTES = 16 * 1024 * 1024;

export type StopTimeRow = (tripId: string, stopId: string, seq: number, time: number | null) => void;

/**
 * Calls `row` with each stop_times.txt row's trip id, stop id, stop sequence and time (departure, else
 * arrival, in seconds after midnight; null when neither is given).
 */
export function eachStopTime(files: Files, row: StopTimeRow) {
  createStopTimeReader(row)(files["stop_times.txt"], true);
}

/** Like eachStopTime, for stop_times.txt's bytes in as many pieces as they come (see createLineReader). */
export function createStopTimeReader(row: StopTimeRow) {
  const seconds = (hms: string) => hms.split(":").reduce((t, part) => t * 60 + Number(part), 0);
  const unquote = (v: string | undefined) => (v ?? "").replace(/"/g, "").trim();
  let columns: number[] | null = null;
  const readLine = (line: string) => {
    const cells = line.replace(/\r$/, "").split(",");
    if (!columns) {
      const header = cells.map((c) => unquote(c).replace(/^\uFEFF/, ""));
      columns = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"].map((c) => header.indexOf(c));
      return;
    }
    const [ti, si, qi, ai, di] = columns;
    const tripId = unquote(cells[ti]);
    if (!tripId) return;
    const time = unquote(cells[di]) || unquote(cells[ai]);
    row(tripId, unquote(cells[si]), Number(unquote(cells[qi])), time ? seconds(time) : null);
  };
  return createLineReader(readLine);
}

/**
 * Returns a function that takes a text file's bytes, in as many pieces as they come, and calls `onLine` with
 * each non-empty line. The text is decoded a slice at a time, because a whole GTFS file can be longer than a
 * string is allowed to be.
 */
export function createLineReader(onLine: (line: string) => void) {
  const decoder = new TextDecoder();
  let partLine = "";
  return (bytes: Uint8Array, final: boolean) => {
    for (let start = 0; start < bytes.length || (final && start === 0); start += CHUNK_BYTES) {
      const last = final && start + CHUNK_BYTES >= bytes.length;
      const lines = (partLine + decoder.decode(bytes.subarray(start, start + CHUNK_BYTES), { stream: !last })).split("\n");
      partLine = last ? "" : lines.pop()!;
      for (const line of lines) if (line) onLine(line);
    }
  };
}
