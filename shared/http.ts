import type { City } from "./types";

/** Cached on Netlify's CDN so repeat requests within a few seconds don't reach the Open Data API. */
export const CACHE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=15, stale-while-revalidate=15",
};

/** The request's ?city=, Melbourne when it's left out. Null for a city we don't have. */
export function cityOf(req: Request): City | null {
  const city = new URL(req.url).searchParams.get("city") ?? "melbourne";
  return city === "melbourne" || city === "sydney" || city === "brisbane" ? city : null;
}

export function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
