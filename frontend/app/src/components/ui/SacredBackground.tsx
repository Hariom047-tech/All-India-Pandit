export function SacredBackground() {
  return (
    <div className="hp-sacred-bg" aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <svg className="hp-sacred-mandala hp-sacred-mandala--l" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.5" style={{ color: "var(--gold)" }}>
        <circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="70" /><circle cx="100" cy="100" r="50" /><circle cx="100" cy="100" r="30" />
        {Array.from({ length: 12 }).map((_, i) => { const a = (i * 30 * Math.PI) / 180; return <line key={i} x1={100} y1={100} x2={100 + 90 * Math.cos(a)} y2={100 + 90 * Math.sin(a)} />; })}
      </svg>
      <svg className="hp-sacred-mandala hp-sacred-mandala--r" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.5" style={{ color: "var(--gold)" }}>
        <circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="70" /><circle cx="100" cy="100" r="50" /><circle cx="100" cy="100" r="30" />
        {Array.from({ length: 12 }).map((_, i) => { const a = (i * 30 * Math.PI) / 180; return <line key={i} x1={100} y1={100} x2={100 + 90 * Math.cos(a)} y2={100 + 90 * Math.sin(a)} />; })}
      </svg>
      {/* floating particles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="hp-particle" style={{ left: `${10 + i * 12}%`, animationDelay: `${i * 1.5}s`, animationDuration: `${10 + i * 2}s` }} />
      ))}
    </div>
  );
}
