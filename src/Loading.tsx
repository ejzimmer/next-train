import { useNetwork } from "./networks";

const CAR = 104;

/** Which cartoon train a city's screens show. */
export type Cartoon = "xtrapolis" | "waratah";

/**
 * One cartoon X'Trapolis 100 car in Metro livery. Driving cars (`cab`) have the yellow cab on the right;
 * pass `flip` to put it on the left.
 */
export function Car({ x, cab, flip }: { x: number; cab?: boolean; flip?: boolean }) {
  const body = cab ? "M0,8 H88 Q97,8 99,15 L101,45 Q101,48 98,48 H0 Z" : "M0,8 H104 V48 H0 Z";
  const end = cab ? 88 : CAR;
  return (
    <g transform={flip ? `translate(${x + CAR} 0) scale(-1 1)` : `translate(${x} 0)`}>
      <path d={body} className="xt-body" />
      <rect x={0} y={8} width={end} height={3} className="xt-roof" />
      {/* Blue lower band, sweeping up to full height behind the cab with paler triangles. */}
      <rect x={0} y={36} width={end} height={12} className="xt-blue" />
      {cab && (
        <>
          <polygon points={`52,48 70,11 ${end},11 ${end},48`} className="xt-blue" />
          <polygon points="62,48 74,26 80,48" className="xt-blue-light" />
          <polygon points="74,26 84,11 88,30" className="xt-blue-light" />
        </>
      )}
      {[16, cab ? 42 : 62].map((dx) => (
        <g key={dx}>
          <rect x={dx} y={13} width={14} height={34} rx={1.5} className="xt-door" />
          <rect x={dx + 2.5} y={16} width={9} height={13} rx={1} className="xt-windows" />
        </g>
      ))}
      {(cab ? [[4, 10], [32, 8]] : [[4, 10], [32, 28], [78, 10]]).map(([wx, w]) => (
        <rect key={wx} x={wx} y={16} width={w} height={13} rx={1.5} className="xt-windows" />
      ))}
      {cab && (
        <>
          <path d="M88,8 Q97,8 99,15 L101,45 Q101,48 98,48 H88 Z" className="xt-cab" />
          <path d="M89.5,12 H96 Q98,13 98.5,17 L99.5,28 H89.5 Z" className="xt-windows" />
          <circle cx={96} cy={41} r={1.8} className="xt-light" />
        </>
      )}
      {[16, CAR - 16].map((bx) => (
        <g key={bx}>
          {[-6, 6].map((dx) => (
            <g key={dx} className="xt-wheel" style={{ transformOrigin: `${bx + dx}px 52px` }}>
              <circle cx={bx + dx} cy={52} r={4.5} />
              <line x1={bx + dx - 3} x2={bx + dx + 3} y1={52} y2={52} />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * One cartoon Waratah car: double-deck, stainless steel, with doors at each end's vestibule. Driving cars
 * (`cab`) have the yellow nose on the right; pass `flip` to put it on the left.
 */
export function WaratahCar({ x, cab, flip }: { x: number; cab?: boolean; flip?: boolean }) {
  const body = cab ? "M0,2 H84 Q94,2 98,12 L102,42 Q102,48 97,48 H0 Z" : "M0,2 H104 V48 H0 Z";
  const end = cab ? 84 : CAR;
  // Doors over each bogie, the two decks between them.
  const doors = cab ? [12, 66] : [12, 78];
  const decks: [number, number] = cab ? [30, 64] : [30, 76];
  return (
    <g transform={flip ? `translate(${x + CAR} 0) scale(-1 1)` : `translate(${x} 0)`}>
      <path d={body} className="wt-body" />
      <rect x={0} y={2} width={end} height={3} className="xt-roof" />
      {[9, 27].map((y) => (
        <rect key={y} x={decks[0] + 2} y={y} width={decks[1] - decks[0] - 4} height={11} rx={2} className="xt-windows" />
      ))}
      {doors.map((dx) => (
        <g key={dx}>
          <rect x={dx} y={14} width={14} height={33} rx={1} className="wt-door" />
          <line x1={dx + 7} x2={dx + 7} y1={14} y2={47} className="wt-door-gap" />
          <rect x={dx + 2} y={17} width={4} height={11} rx={1} className="xt-windows" />
          <rect x={dx + 8} y={17} width={4} height={11} rx={1} className="xt-windows" />
        </g>
      ))}
      <rect x={3} y={15} width={6} height={11} rx={1} className="xt-windows" />
      {!cab && <rect x={95} y={15} width={6} height={11} rx={1} className="xt-windows" />}
      {cab && (
        <>
          <path d="M84,2 Q94,2 98,12 L102,42 Q102,48 97,48 H84 Z" className="xt-cab" />
          <path d="M85.5,7 H93 Q95.5,8 96.5,13 L99,27 H85.5 Z" className="xt-windows" />
          <circle cx={97.5} cy={41} r={1.8} className="xt-light" />
        </>
      )}
      {[16, CAR - 16].map((bx) => (
        <g key={bx}>
          {[-6, 6].map((dx) => (
            <g key={dx} className="xt-wheel" style={{ transformOrigin: `${bx + dx}px 52px` }}>
              <circle cx={bx + dx} cy={52} r={4.5} />
              <line x1={bx + dx - 3} x2={bx + dx + 3} y1={52} y2={52} />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

/** A three-car set: a driving car at each end with a trailer between. */
export function Set({ x }: { x: number }) {
  return (
    <>
      <Car x={x} cab flip />
      <Car x={x + CAR + 3} />
      <Car x={x + 2 * (CAR + 3)} cab />
    </>
  );
}

const SET = 3 * CAR + 6;

/** X'Trapolis trains are three-car sets coupled together; a Waratah is one eight-car unit. */
const inSets = (cars: number, model: Cartoon) => model === "xtrapolis" && cars % 3 === 0;

/** How wide a train of `cars` cars is drawn. */
export const trainWidth = (cars: number, model: Cartoon = "xtrapolis") =>
  inSets(cars, model) ? (cars / 3) * (SET + 4) - 4 : cars * (CAR + 3) - 3;

/** A train of `cars` cars: three-car sets coupled together, or one unit with a driving car at each end. */
export function Train({ cars, model = "xtrapolis" }: { cars: number; model?: Cartoon }) {
  if (inSets(cars, model)) return <>{Array.from({ length: cars / 3 }, (_, i) => <Set key={i} x={i * (SET + 4)} />)}</>;
  const Unit = model === "waratah" ? WaratahCar : Car;
  return (
    <>
      {Array.from({ length: cars }, (_, i) => (
        <Unit key={i} x={i * (CAR + 3)} cab={i === 0 || i === cars - 1} flip={i === 0} />
      ))}
    </>
  );
}

/** Shown until the first train positions arrive: the city's cartoon train running across the screen. */
export function Loading() {
  const { cartoon } = useNetwork();
  const width = trainWidth(cartoon.cars, cartoon.model);
  return (
    <div className="loading" role="status" aria-label="Loading trains">
      <div className="loading-track">
        <svg className="xt" viewBox={`0 0 ${width} 58`} width={width} height={58} aria-hidden>
          <Train cars={cartoon.cars} model={cartoon.model} />
        </svg>
      </div>
      <p className="muted">Finding trains…</p>
    </div>
  );
}
