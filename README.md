# next-train: Metro trains live map

A schematic map of Melbourne's Metro train lines showing where each train is right now, with next departures for
any station you click. Each line can be switched on and off; lines sharing track are drawn side by side, as on
Metro's network map. Data comes from Transport Victoria's GTFS Realtime feeds.

## How it works

- `netlify/functions/vehicles.ts`, `departures.ts` and `alerts.ts` fetch the Metro GTFS-R feeds with the API key,
  decode them and return small JSON: every line's trains and alerts, and one station's departures. Responses are cached on Netlify's CDN for 30 s, so the key never
  reaches the browser and repeat loads don't spend the API's 24 calls / minute limit.
- `shared/network.ts` is the hand-written network: each line's stations in order, city end first, and where every
  station sits on the schematic.
- `data/stations.json` and `data/<line>.*.json` are generated from the GTFS Schedule zip: station coordinates,
  stop IDs, platform numbers, and each timetabled trip's direction, destination and stopping times.
- The browser polls both functions every 60 s (paused while the tab is hidden) and places each train between
  stations by snapping its GPS position onto the line.

## Setup

1. Get a GTFS Realtime API key from the Transport Victoria Open Data Portal. It's a UUID-style KeyID.
2. In Netlify, set the environment variable `PTV_OPENDATA_KEY` to that key. Use the Functions scope; it
   doesn't need to be available to the build.
3. Generate station data: `npm run gtfs` (downloads the GTFS Schedule zip), or
   `npm run gtfs -- path/to/gtfs.zip`. Commit the files it writes in `data/`. Re-run when the timetable changes.

## Development

```
npm install
npm test          # unit tests against saved feed snapshots in test/fixtures
npx netlify dev   # site + functions locally; needs PTV_OPENDATA_KEY in .env
```

Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.
Not affiliated with PTV.
