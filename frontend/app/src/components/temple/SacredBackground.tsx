/* Sacred SVG symbols — Om (ॐ), Dhanush (Bow), Trishul, Lotus, Chakra
   Rendered as inline SVGs for golden stroke styling and animation. */
import "./SacredBackground.css";

/* reusable SVGs rendered at very low opacity as decorative elements */
function OmSymbol({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--gold, #d4a017)" }}>
      <path d="M35 75c-8-4-14-12-14-22 0-14 12-24 26-24 10 0 18 5 22 13" />
      <path d="M69 42c3 5 4 10 3 16-2 14-16 22-30 18" />
      <path d="M50 25c0-8 6-14 12-14s10 5 10 10c0 4-3 7-7 7" />
      <path d="M72 20c2-3 5-5 8-5 4 0 7 4 7 8 0 3-1 5-3 7" />
      <circle cx="78" cy="12" r="3" fill="currentColor" stroke="none" />
      <path d="M30 80c-2 3-3 7-2 10 1 4 6 7 12 4" />
    </svg>
  );
}

function DhanushSymbol({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--gold, #d4a017)" }}>
      {/* bow arc */}
      <path d="M20 85 C10 60, 15 30, 50 10 C85 30, 90 60, 80 85" />
      {/* bowstring */}
      <path d="M20 85 L80 85" strokeDasharray="3 3" />
      {/* arrow */}
      <path d="M50 85 L50 5" />
      <path d="M45 12 L50 2 L55 12" />
      {/* feather fletching */}
      <path d="M47 78 Q43 72 47 68" />
      <path d="M53 78 Q57 72 53 68" />
    </svg>
  );
}

function TrishulSymbol({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--gold, #d4a017)" }}>
      {/* shaft */}
      <path d="M50 95 L50 25" />
      {/* center prong */}
      <path d="M50 25 L50 5" />
      <path d="M46 10 L50 2 L54 10" />
      {/* left prong */}
      <path d="M50 30 C40 28, 28 20, 25 8" />
      <path d="M22 14 L25 5 L29 13" />
      {/* right prong */}
      <path d="M50 30 C60 28, 72 20, 75 8" />
      <path d="M71 13 L75 5 L78 14" />
      {/* damru decoration */}
      <ellipse cx="50" cy="38" rx="6" ry="3" />
    </svg>
  );
}

function LotusSymbol({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--gold, #d4a017)" }}>
      {/* center petals */}
      <path d="M50 35 Q55 20 50 8 Q45 20 50 35" />
      <path d="M50 35 Q65 25 72 12 Q58 22 50 35" />
      <path d="M50 35 Q35 25 28 12 Q42 22 50 35" />
      {/* side petals */}
      <path d="M50 40 Q70 32 82 22 Q68 35 50 40" />
      <path d="M50 40 Q30 32 18 22 Q32 35 50 40" />
      {/* base */}
      <path d="M30 50 Q40 42 50 42 Q60 42 70 50" />
      <path d="M25 55 Q38 46 50 46 Q62 46 75 55" />
    </svg>
  );
}

function ChakraSymbol({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color: "var(--gold, #d4a017)" }}>
      <circle cx="50" cy="50" r="30" />
      <circle cx="50" cy="50" r="20" />
      <circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" opacity="0.3" />
      {/* spokes */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={50 + 20 * Math.cos(a)}
            y1={50 + 20 * Math.sin(a)}
            x2={50 + 30 * Math.cos(a)}
            y2={50 + 30 * Math.sin(a)}
          />
        );
      })}
    </svg>
  );
}

function MandalaWatermark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.5" style={{ color: "var(--gold, #d4a017)" }}>
      <circle cx="100" cy="100" r="90" />
      <circle cx="100" cy="100" r="70" />
      <circle cx="100" cy="100" r="50" />
      <circle cx="100" cy="100" r="30" />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        return <line key={i} x1={100} y1={100} x2={100 + 90 * Math.cos(a)} y2={100 + 90 * Math.sin(a)} />;
      })}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const cx = 100 + 60 * Math.cos(a);
        const cy = 100 + 60 * Math.sin(a);
        return <circle key={`o${i}`} cx={cx} cy={cy} r="8" />;
      })}
    </svg>
  );
}

/** Golden particles — small glowing dots that drift upward */
function Particles() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className="sacred-particle" />
      ))}
    </>
  );
}

export function SacredBackground() {
  return (
    <div className="sacred-bg" aria-hidden="true">
      <MandalaWatermark className="sacred-mandala sacred-mandala--tl" />
      <MandalaWatermark className="sacred-mandala sacred-mandala--br" />
      <OmSymbol className="sacred-symbol sacred-symbol--om-1" />
      <OmSymbol className="sacred-symbol sacred-symbol--om-2" />
      <DhanushSymbol className="sacred-symbol sacred-symbol--dhanush" />
      <TrishulSymbol className="sacred-symbol sacred-symbol--trishul" />
      <LotusSymbol className="sacred-symbol sacred-symbol--lotus" />
      <ChakraSymbol className="sacred-symbol sacred-symbol--chakra" />
      <Particles />
    </div>
  );
}
