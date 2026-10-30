import { LINES } from "../shared/network";

interface Props {
  on: string[];
  onToggle: (id: string) => void;
}

/** A button per line, filled in the line's colour while it's on the map. */
export function LineSwitches({ on, onToggle }: Props) {
  return (
    <div className="line-switches">
      {LINES.map((line) => {
        const pressed = on.includes(line.id);
        return (
          <button
            key={line.id}
            className="line-switch"
            aria-pressed={pressed}
            onClick={() => onToggle(line.id)}
            style={{ ["--line" as string]: line.colour, ["--line-text" as string]: line.textColour }}
          >
            {line.name}
          </button>
        );
      })}
    </div>
  );
}
