// A drawn moon disc. The lit share is `lit` (0..1); it sits on the right while the moon waxes
// and on the left while it wanes (Northern view).
export function MoonIcon({ lit, waxing, size = 64, title }) {
  const r = 30;
  const f = Math.min(1, Math.max(0, Number(lit) || 0));
  // The terminator is half an ellipse as wide as |1 - 2f| of the radius. A crescent bulges
  // toward the lit limb, a gibbous moon away from it.
  const rx = (r * Math.abs(1 - 2 * f)).toFixed(2);
  const gibbous = f > 0.5;
  const path = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${gibbous ? 1 : 0} 0 ${-r} Z`;
  let shape = null;
  if (f >= 0.995) shape = <circle className="moon-lit" r={r} />;
  else if (f > 0.005) shape = <path className="moon-lit" d={path} />;
  return (
    <svg className="moon-icon" viewBox="-34 -34 68 68" width={size} height={size} role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      <circle className="moon-dark" r={r} />
      <g data-side={waxing ? 'right' : 'left'} transform={waxing ? undefined : 'scale(-1 1)'}>{shape}</g>
      <circle className="moon-rim" r={r} />
    </svg>
  );
}
