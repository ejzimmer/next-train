import { useEffect, useState } from "react";
import type { City, TripDto, VehicleDto } from "../shared/types";
import { useNetwork } from "./networks";
import { formatTime } from "./StationBoard";
import { usePoll } from "./usePoll";

interface Props {
  vehicle: VehicleDto;
  destination: string | null;
  now: number;
  pollMs: number;
  boarded: boolean;
  onBoard: (on: boolean) => void;
  onClose: () => void;
}

/** Melbourne's links leave the city out, as they did before there were others. */
export const shareUrl = (tripId: string, city: City) =>
  `https://next-train.ez.codes?trainid=${encodeURIComponent(tripId)}${city === "melbourne" ? "" : `&city=${city}`}`;

function delayText(delay: number) {
  const mins = Math.round(Math.abs(delay) / 60);
  return mins < 1 ? "On time" : `${mins} min ${delay > 0 ? "late" : "early"}`;
}

function ago(secs: number) {
  return secs < 60 ? `${Math.max(0, Math.round(secs))} s ago` : `${Math.floor(secs / 60)} min ago`;
}

/** Details of one train, with buttons to board it (circle it on the map) and share it. */
export function TrainCard({ vehicle, destination, now, pollMs, boarded, onBoard, onClose }: Props) {
  const { city, lineById, stations, timeZone } = useNetwork();
  const line = lineById[vehicle.line];
  const tram = line?.mode === "tram";
  const name = (id: string | null) => stations[id ?? ""]?.name ?? id ?? "";
  const trip = usePoll<TripDto>(
    `/api/trip?id=${encodeURIComponent(vehicle.tripId)}&line=${encodeURIComponent(vehicle.line)}&city=${city}`,
    pollMs,
  ).data;
  const dest = trip?.destination ?? destination;
  const via = trip?.viaLoop == null ? "" : trip.viaLoop ? " via City Loop" : " direct";
  const [next, ...rest] = trip?.stops ?? [];
  const [showCars, setShowCars] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(vehicle.tripId, city));
      setCopied(true);
    } catch {
      // No clipboard (e.g. an insecure page); nothing to show.
    }
  };

  return (
    <div className="pid train-card" role="dialog" aria-label={tram ? "Tram details" : "Train details"} style={{ borderTopColor: line?.colour }}>
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2 className="pid-station">{dest ? name(dest) + via : line?.name}</h2>
      <div className="train-meta">
        <span className="cars">
          {/* The type, with the car numbers behind it when the feed has real ones. */}
          {vehicle.carNumbers ? (
            <button className="type-button" aria-expanded={showCars} onClick={() => setShowCars(!showCars)}>
              {vehicle.trainType ?? "Car numbers"}
            </button>
          ) : (
            vehicle.trainType && <span className="train-type">{vehicle.trainType}</span>
          )}
          {showCars && vehicle.carNumbers && <span className="cars-pop">{vehicle.carNumbers.join(" ")}</span>}
        </span>
        <span className="pid-detail">{vehicle.scheduled ? "Timetabled" : `Updated ${ago(now - vehicle.timestamp)}`}</span>
      </div>
      {next && (
        // The next stop; clicking it shows or hides the rest.
        <button
          className="pid-row next-stop"
          style={{ borderLeftColor: line?.colour }}
          aria-expanded={rest.length ? showStops : undefined}
          disabled={!rest.length}
          onClick={() => setShowStops(!showStops)}
        >
          <span className="pid-time">{formatTime(next.time, timeZone)}</span>
          <span className="pid-dest">{name(next.station)}</span>
          {next.platform && <span className="pid-detail">Plat {next.platform}</span>}
          {trip!.delay != null && <span className="pid-mins">{delayText(trip!.delay)}</span>}
        </button>
      )}
      {showStops &&
        rest.map((s) => (
          <div key={s.station + s.time} className="stop-row">
            <span className="pid-time">{formatTime(s.time, timeZone)}</span>
            <span className="pid-dest">{name(s.station)}</span>
            {s.platform && <span className="pid-detail">Plat {s.platform}</span>}
          </div>
        ))}
      <div className="train-card-buttons">
        <button
          className="card-button primary"
          style={{ ["--line" as string]: line?.colour, ["--line-text" as string]: line?.textColour }}
          onClick={() => onBoard(!boarded)}
        >
          {tram ? (boarded ? "Alight" : "Board tram") : boarded ? "Detrain" : "Board train"}
        </button>
        <span className="share">
          <button className="card-button" onClick={share}>
            Share
          </button>
          {copied && (
            <span className="copied" role="status">
              Copied
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
