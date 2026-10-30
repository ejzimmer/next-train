import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { decodeFeed } from "./shared/feed";
import { lines } from "./shared/lines";
import { buildVehicles } from "./shared/vehicles";
const feed = (f: string) => decodeFeed(readFileSync(`test/fixtures/${f}`));
export default defineConfig({
  plugins: [react(), { name: "mock", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url!, "http://x");
      if (!url.pathname.startsWith("/api/")) return next();
      const now = Date.now() / 1000;
      let body: unknown = { feedTimestamp: now, lines: {}, departures: [] };
      if (url.pathname === "/api/vehicles") {
        const f = feed("vehicle-positions-2026-10-23.pb"); const ts = Number(f.header.timestamp);
        const vehicles = [...new Map(Object.values(lines).flatMap(({ config, data }) => buildVehicles(f, config, data).vehicles).map((v) => [v.id, v])).values()].map((v) => ({ ...v, timestamp: now - (ts - v.timestamp) }));
        body = { feedTimestamp: now, vehicles };
      }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body));
    });
  } }],
});
