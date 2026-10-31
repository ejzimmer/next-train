# next-train: live train map

A schematic map of Melbourne's Metro train lines, and of Sydney Trains and Sydney light rail, showing where each
train is right now, with next departures for any station you click. Each city has its own tab. Each line can be
switched on and off; lines sharing track are drawn side by side, as on the network maps. Data comes from Transport
Victoria's and Transport for NSW's GTFS Realtime feeds.

## How it works

- `netlify/functions/vehicles.ts`, `departures.ts`, `trip.ts` and `alerts.ts` fetch a city's GTFS-R feeds
  (`?city=melbourne` or `?city=sydney`) with the API key, decode them and return small JSON: every line's trains and alerts, and one station's departures. Responses are cached on Netlify's CDN for 30 s, so the key never
  reaches the browser and repeat loads don't spend the API's 24 calls / minute limit.
- `shared/network.ts` (Melbourne) and `shared/sydney.ts` are the hand-written networks: each line's stations in
  order, city end first, and where every station sits on the schematic.
- `data/stations.json` and `data/<line>.*.json` (Melbourne) and `data/sydney/` are generated from the GTFS
  Schedule zips: station coordinates, stop IDs, platform numbers, and each timetabled trip's direction,
  destination and stopping times. Sydney Trains' realtime feed only gives delays, so its times come from these.
- The browser polls both functions every 60 s (paused while the tab is hidden) and places each train between
  stations by snapping its GPS position onto the line.

## Setup

1. Get a GTFS Realtime API key from the Transport Victoria Open Data Portal (a UUID-style KeyID) and one from
   the Transport for NSW Open Data Hub.
2. In Netlify, set the environment variables `PTV_OPENDATA_KEY` and `TFNSW_OPENDATA_KEY` to those keys. Use the
   Functions scope; they don't need to be available to the build.
3. Generate Melbourne's station data: `npm run gtfs:melbourne` (downloads the GTFS Schedule zip), or
   `npm run gtfs:melbourne -- path/to/gtfs.zip`. Commit the files it writes in `data/`. Re-run when the timetable changes.
4. Add `TFNSW_OPENDATA_KEY` as a GitHub Actions secret too. `.github/workflows/sydney-timetable.yml` runs
   `npm run gtfs:sydney` every week and commits `data/sydney/`, because Sydney Trains' timetable only runs about a
   month ahead and its trip ids change with each version.

## Development

```
npm install
npm test          # unit tests against saved feed snapshots in test/fixtures
npx netlify dev   # site + functions locally; needs PTV_OPENDATA_KEY and TFNSW_OPENDATA_KEY in .env
```

Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.
Not affiliated with PTV. Sydney data: Transport for NSW Open Data, under a Creative Commons Attribution 4.0
International Licence. Not affiliated with Transport for NSW.
