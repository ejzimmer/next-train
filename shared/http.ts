import { lines } from "./lines";

/** Cached on Netlify's CDN so repeat requests within a few seconds don't reach the Open Data API. */
export const CACHE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=15, stale-while-revalidate=15",
};

export function lineFromRequest(req: Request) {
  const id = new URL(req.url).searchParams.get("line") ?? "hurstbridge";
  return lines[id] ?? null;
}

export function apiKey(): string {
  const key = process.env.PTV_OPENDATA_KEY;
  if (!key) throw new Error("PTV_OPENDATA_KEY is not set");
  return key;
}

export function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
