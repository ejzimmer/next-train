import { useEffect, useState } from "react";
import { LINE_BY_ID, STATIONS } from "../shared/network";
import type { VehicleDto } from "../shared/types";

interface Props {
  vehicle: VehicleDto;
  destination: string | null;
  boarded: boolean;
  onBoard: (on: boolean) => void;
  onClose: () => void;
}

export const shareUrl = (tripId: string) => `https://next-train.ez.codes?trainid=${encodeURIComponent(tripId)}`;

/** Details of one train, with buttons to board it (circle it on the map) and share it. */
export function TrainCard({ vehicle, destination, boarded, onBoard, onClose }: Props) {
  const line = LINE_BY_ID[vehicle.line];
  const name = (id: string | null) => STATIONS[id ?? ""]?.name ?? id ?? "";
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
      <h2 className="pid-station">{destination ? name(destination) : line?.name}</h2>
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
