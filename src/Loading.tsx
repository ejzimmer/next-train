const CAR = 104;

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
const WIDTH = 2 * SET + 4;

/** How wide a train of `cars` cars is drawn. */
export const trainWidth = (cars: number) =>
  cars % 3 === 0 ? (cars / 3) * (SET + 4) - 4 : cars * (CAR + 3) - 3;

/** A train of `cars` cars: three-car sets coupled together, or one unit with a driving car at each end. */
export function Train({ cars }: { cars: number }) {
  if (cars % 3 === 0) return <>{Array.from({ length: cars / 3 }, (_, i) => <Set key={i} x={i * (SET + 4)} />)}</>;
  return (
    <>
      {Array.from({ length: cars }, (_, i) => (
        <Car key={i} x={i * (CAR + 3)} cab={i === 0 || i === cars - 1} flip={i === 0} />
      ))}
    </>
  );
}

/** Shown until the first train positions arrive: a cartoon six-car X'Trapolis running across the screen. */
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading trains">
      <div className="loading-track">
        <svg className="xt" viewBox={`0 0 ${WIDTH} 58`} width={WIDTH} height={58} aria-hidden>
          <Train cars={6} />
        </svg>
      </div>
      <p className="muted">Finding trains…</p>
    </div>
  );
}
