import { useLayoutEffect, useRef, useState } from "react";
import { useNetwork } from "./networks";

interface Props {
  on: string[];
  onToggle: (id: string) => void;
  /** Which buttons show, where a city has trams as well as trains. */
  mode: "train" | "tram";
  onMode: (mode: "train" | "tram") => void;
}

const GAP = 6;

/** How many rows buttons of these widths take when laid out left to right within `width`. */
function rowsAt(widths: number[], width: number) {
  let rows = 1;
  let used = 0;
  for (const w of widths) {
    if (used && used + GAP + w > width) {
      rows++;
      used = w;
    } else used += (used ? GAP : 0) + w;
  }
  return rows;
}

/**
 * A button per line, filled in the line's colour while it's on the map. When they wrap, the row is
 * narrowed as far as it goes without adding a row, so the rows come out about the same length.
 */
export function LineSwitches({ on, onToggle, mode, onMode }: Props) {
  const network = useNetwork();
  const hasTrams = network.switches.some((s) => s.mode === "tram");
  const switches = network.switches.filter((s) => (s.mode ?? "train") === (hasTrams ? mode : "train"));
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState<number>();

  useLayoutEffect(() => {
    const balance = () => {
      if (!outer.current || !inner.current) return;
      const available = outer.current.clientWidth;
      const widths = [...inner.current.children].map((b) => (b as HTMLElement).offsetWidth);
      const rows = rowsAt(widths, available);
      let [lo, hi] = [Math.max(...widths), available];
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (rowsAt(widths, mid) > rows) lo = mid;
        else hi = mid;
      }
      // A px to spare for widths offsetWidth rounds down.
      setMaxWidth(rows > 1 ? hi + 1 : undefined);
    };
    balance();
    const observer = new ResizeObserver(balance);
    if (outer.current) observer.observe(outer.current);
    return () => observer.disconnect();
  }, [switches.length, mode]);

  return (
    <div ref={outer}>
      {hasTrams && (
        <div className="mode-switch" role="tablist" aria-label="Show buttons for">
          {(["train", "tram"] as const).map((m) => (
            <button key={m} className="mode-tab" role="tab" aria-selected={mode === m} onClick={() => onMode(m)}>
              {m === "train" ? "Trains" : "Trams"}
            </button>
          ))}
        </div>
      )}
      <div className={`line-switches${hasTrams && mode === "tram" ? " trams" : ""}`} ref={inner} style={{ maxWidth }}>
        {switches.map((line) => {
          const pressed = on.includes(line.id);
          return (
            <button
              key={line.id}
              className="line-switch"
              aria-pressed={pressed}
              onClick={() => onToggle(line.id)}
              title={line.title === `${line.name} line` ? undefined : line.title}
              style={{ ["--line" as string]: line.colour, ["--line-text" as string]: line.textColour }}
            >
              {line.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
