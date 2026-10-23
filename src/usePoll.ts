import { useEffect, useState } from "react";

/** Fetches `url` every `intervalMs`, pausing while the tab is hidden. */
export function usePoll<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function tick() {
      clearTimeout(timer);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as T;
        if (!cancelled) {
          setData(body);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled && !document.hidden) timer = setTimeout(tick, intervalMs);
    }

    function onVisibility() {
      if (document.hidden) clearTimeout(timer);
      else tick();
    }

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, intervalMs]);

  return { data, error };
}

/** Current time in unix seconds, refreshed every `intervalMs`. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
