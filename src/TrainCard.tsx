import { useEffect, useState } from "react";
import { LINE_BY_ID, STATIONS } from "../shared/network";
import type { TripDto, VehicleDto } from "../shared/types";
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

export const shareUrl = (tripId: string) => `https://next-train.ez.codes?trainid=${encodeURIComponent(tripId)}`;

function delayText(delay: number) {
  const mins = Math.round(Math.abs(delay) / 60);
  return mins < 1 ? "On time" : `${mins} min ${delay > 0 ? "late" : "early"}`;
}

function ago(secs: number) {
  return secs < 60 ? `${Math.max(0, Math.round(secs))} s ago` : `${Math.floor(secs / 60)} min ago`;
}

/** Details of one train, with buttons to board it (circle it on the map) and share it. */
export function TrainCard({ vehicle, destination, now, pollMs, boarded, onBoard, onClose }: Props) {
  const line = LINE_BY_ID[vehicle.line];
  const name = (id: string | null) => STATIONS[id ?? ""]?.name ?? id ?? "";
  const trip = usePoll<TripDto>(
    `/api/trip?id=${encodeURIComponent(vehicle.tripId)}&line=${encodeURIComponent(vehicle.line)}`,
    pollMs,
  ).data;
  const dest = trip?.destination ?? destination;
  const via = trip?.viaLoop == null ? "" : trip.viaLoop ? " via City Loop" : " direct";
  const [next, ...rest] = trip?.stops ?? [];
  const [showCars, setShowCars] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(vehicle.tripId));
      setCopied(true);
    } catch {
      // No clipboard (e.g. an insecure page); nothing to show.
    }
  };

  return (
    <div className="pid train-card" role="dialog" aria-label="Train details" style={{ borderTopColor: line?.colour }}>
      <button className="pid-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2 className="pid-station">{dest ? name(dest) + via : line?.name}</h2>
      <div className="train-meta">
        <span className="cars">
          <button className="type-button" aria-expanded={showCars} onClick={() => setShowCars(!showCars)}>
            {vehicle.trainType ?? "Car numbers"}
          </button>
          {showCars && <span className="cars-pop">{vehicle.id.split("-").join(" ")}</span>}
        </span>
        <span className="pid-detail">Updated {ago(now - vehicle.timestamp)}</span>
      </div>
      {next && (
        <div className="pid-row" style={{ borderLeftColor: line?.colour }}>
          <span className="pid-time">{formatTime(next.time)}</span>
          <span className="pid-dest">{name(next.station)}</span>
          {next.platform && <span className="pid-detail">Plat {next.platform}</span>}
          {trip!.delay != null && <span className="pid-mins">{delayText(trip!.delay)}</span>}
        </div>
      )}
      {rest.length > 0 && (
        <details className="stops">
          <summary>Remaining stops</summary>
          {rest.map((s) => (
            <div key={s.station + s.time} className="stop-row">
              <span className="pid-time">{formatTime(s.time)}</span>
              <span className="pid-dest">{name(s.station)}</span>
              {s.platform && <span className="pid-detail">Plat {s.platform}</span>}
            </div>
          ))}
        </details>
      )}
      <div className="train-card-buttons">
        <button className="card-button" onClick={() => onBoard(!boarded)}>
          {boarded ? "Detrain" : "Board train"}
        </button>
        {boarded && (
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
        )}
      </div>
    </div>
  );
}
