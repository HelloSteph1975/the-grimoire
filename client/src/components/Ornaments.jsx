// Original line ornaments. Colors come from CSS (currentColor).
export function CornerFlourish({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <path d="M4 76 V20 Q4 4 20 4 H76" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 76 V24 Q10 10 24 10 H76" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path d="M22 22 q10 -2 14 6 q-8 4 -14 -6 z M22 22 q-2 10 6 14 q4 -8 -6 -14 z" fill="currentColor" opacity="0.7" />
      <circle cx="22" cy="22" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function MarigoldCorner({ className = '' }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <g transform="translate(26 26)">
        {petals.map(a => <ellipse key={a} rx="4" ry="11" transform={`rotate(${a}) translate(0 -10)`} fill="var(--marigold)" opacity="0.85" />)}
        <circle r="6" fill="var(--candle)" />
      </g>
      <path d="M26 40 Q30 60 60 74" fill="none" stroke="var(--leaf)" strokeWidth="2" />
      <path d="M58 64 l4 -12 l4 12 q-4 4 -8 0 z" fill="var(--candle)" />
    </svg>
  );
}

// A band of cut-paper flags along the top of the page (Book & Folk only).
export function PapelPicado() {
  const colors = ['var(--rosa)', 'var(--marigold)', 'var(--turquesa)', 'var(--candle)', 'var(--oxblood)'];
  return (
    <svg className="papel-picado" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 2 H600" stroke="var(--ink-soft)" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} transform={`translate(${i * 50 + 3} 2)`}>
          <path d="M0 0 H44 V30 L38 36 L32 30 L26 36 L22 30 L16 36 L10 30 L6 36 L0 30 Z" fill={colors[i % colors.length]} opacity="0.85" />
          <circle cx="22" cy="14" r="5" fill="var(--parchment)" />
          <path d="M10 8 l4 4 M34 8 l-4 4 M10 22 l4 -4 M34 22 l-4 -4" stroke="var(--parchment)" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
