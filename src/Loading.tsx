/** One cartoon X'Trapolis car: silver body, dark window band, blue doors, with the sloped cab on the lead car. */
function Car({ x, cab }: { x: number; cab?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {cab ? (
        <path d="M0,8 H92 Q108,8 116,30 L120,46 Q120,52 114,52 H0 Z" className="xt-body" />
      ) : (
        <rect x={0} y={8} width={108} height={44} rx={5} className="xt-body" />
      )}
      <rect x={4} y={16} width={cab ? 84 : 100} height={13} rx={3} className="xt-windows" />
      {cab && <path d="M94,16 H100 Q108,18 112,29 H94 Z" className="xt-windows" />}
      {[14, 62].map((dx) => (
        <rect key={dx} x={dx} y={14} width={16} height={34} rx={2} className="xt-door" />
      ))}
      <rect x={0} y={41} width={cab ? 118 : 108} height={4} className="xt-stripe" />
      {cab && <circle cx={113} cy={47} r={2.5} className="xt-light" />}
      {[18, 32, 76, 90].map((cx) => (
        <g key={cx} className="xt-wheel" style={{ transformOrigin: `${cx}px 56px` }}>
          <circle cx={cx} cy={56} r={6} />
          <line x1={cx - 4} x2={cx + 4} y1={56} y2={56} />
        </g>
      ))}
    </g>
  );
}

/** Shown until the first train positions arrive: a cartoon X'Trapolis running across the screen. */
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading trains">
      <div className="loading-track">
        <svg className="xt" viewBox="0 0 360 64" width={360} height={64} aria-hidden>
          <Car x={0} />
          <Car x={112} />
          <Car x={224} cab />
        </svg>
      </div>
      <p className="muted">Finding trains…</p>
    </div>
  );
}
